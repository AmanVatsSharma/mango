# Console Flow Diagrams

## Table of Contents

1. [User Authentication Flow](#user-authentication-flow)
2. [Console Data Loading Flow](#console-data-loading-flow)
3. [Bank Account Management Flow](#bank-account-management-flow)
4. [Deposit Request Flow](#deposit-request-flow)
5. [Withdrawal Request Flow](#withdrawal-request-flow)
6. [Profile Update Flow](#profile-update-flow)
7. [Transaction Atomic Flow](#transaction-atomic-flow)
8. [Mobile Navigation Flow](#mobile-navigation-flow)
9. [Error Handling Flow](#error-handling-flow)
10. [Real-time Data Refresh Flow](#real-time-data-refresh-flow)
11. [Responsive Desktop Workspace Flow](#11-responsive-desktop-workspace-flow)

---

## 1. User Authentication Flow

```mermaid
graph TD
    A[User Visits /console] --> B{Session Valid?}
    B -->|No| C[Redirect to Login]
    B -->|Yes| D{User ID Available?}
    D -->|No| E[Show Sign In Message]
    D -->|Yes| F[Load Console Layout]
    F --> G[Initialize useConsoleData Hook]
    G --> H[Fetch Console Data]
    H --> I[Render Console UI]
    
    style A fill:#e1f5ff
    style I fill:#c8e6c9
    style C fill:#ffcdd2
    style E fill:#fff9c4
```

**Detailed Steps:**

1. **User Navigation**
   - User navigates to `/console`
   - Console page component loads
   - Log: `📥 [CONSOLE-PAGE] Page loaded`

2. **Session Validation**
   - NextAuth checks session cookie
   - Validates session expiry
   - Log: `🔐 [AUTH] Session check: { status, userId }`

3. **User ID Extraction**
   - Extract userId from session
   - Verify user is active
   - Log: `👤 [CONSOLE-PAGE] User ID: ${userId}`

4. **Console Initialization**
   - Mount ConsoleLayout
   - Initialize hooks
   - Load initial data
   - Log: `🎨 [CONSOLE-LAYOUT] Initializing...`

---

## 2. Console Data Loading Flow

```mermaid
sequenceDiagram
    participant U as User
    participant C as Component
    participant H as useConsoleData Hook
    participant S as ConsoleService
    participant P as Prisma
    participant DB as Database

    U->>C: Load Console Page
    C->>H: useConsoleData(userId)
    activate H
    H->>H: useEffect triggered
    H->>S: getConsoleData(userId)
    activate S
    
    par Parallel Queries
        S->>P: findUnique(user + kyc)
        S->>P: findUnique(tradingAccount)
        S->>P: findMany(bankAccounts)
        S->>P: findMany(deposits)
        S->>P: findMany(withdrawals)
        S->>P: findMany(transactions)
        S->>P: findMany(positions)
        S->>P: findMany(orders)
        S->>P: findUnique(userProfile)
    end
    
    P->>DB: Execute Queries
    DB-->>P: Return Data
    P-->>S: Return Results
    
    S->>S: Format & Calculate Summary
    S-->>H: Return ConsoleData
    deactivate S
    
    H->>H: setConsoleData(data)
    H-->>C: Update State
    deactivate H
    
    C->>U: Display Dashboard
```

**Key Performance Optimizations:**

- ✅ All queries run in parallel using `Promise.all`
- ✅ Data limits prevent excessive loading
- ✅ Only active positions loaded
- ✅ Summary calculated server-side

**Logging Flow:**

```
📊 [CONSOLE-SERVICE] Fetching console data for user: abc123
✅ [CONSOLE-SERVICE] Data fetched successfully {
  userFound: true,
  bankAccountsCount: 2,
  depositsCount: 15,
  withdrawalsCount: 8,
  transactionsCount: 45,
  positionsCount: 3,
  ordersCount: 12
}
📈 [CONSOLE-SERVICE] Summary calculated: {
  totalDeposits: 150000,
  totalWithdrawals: 50000,
  pendingDeposits: 1,
  pendingWithdrawals: 0
}
✅ [CONSOLE-SERVICE] Console data prepared successfully
```

---

## 3. Bank Account Management Flow

### Add Bank Account Flow

```mermaid
graph TD
    A[User Clicks 'Add Bank Account'] --> B[Open Dialog]
    B --> C[User Fills Form]
    C --> D{Validation Pass?}
    D -->|No| E[Show Errors]
    E --> C
    D -->|Yes| F[Submit Form]
    F --> G[Call addBankAccount Hook]
    G --> H[Call Service Layer]
    H --> I[Start Transaction]
    I --> J{isDefault = true?}
    J -->|Yes| K[Unset Other Defaults]
    J -->|No| L[Skip]
    K --> M[Create New Account]
    L --> M
    M --> N{Transaction Success?}
    N -->|Yes| O[Commit Transaction]
    N -->|No| P[Rollback]
    O --> Q[Refetch All Data]
    Q --> R[Show Success Toast]
    R --> S[Close Dialog]
    P --> T[Show Error Toast]
    
    style A fill:#e1f5ff
    style S fill:#c8e6c9
    style T fill:#ffcdd2
```

**Transaction Details:**

```typescript
// Atomic Transaction
executeInTransaction(async (tx) => {
  console.log('🔄 [CONSOLE-SERVICE] Starting add bank account transaction')
  
  // Step 1: Unset other defaults if needed
  if (bankData.isDefault) {
    console.log('🔄 [CONSOLE-SERVICE] Unsetting other default accounts')
    await tx.bankAccount.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false }
    })
  }
  
  // Step 2: Create new account
  console.log('🔄 [CONSOLE-SERVICE] Creating new bank account')
  const account = await tx.bankAccount.create({
    data: { userId, ...bankData }
  })
  
  console.log('✅ [CONSOLE-SERVICE] Bank account created:', account.id)
  return account.id
})
```

### Update Bank Account Flow

```mermaid
graph TD
    A[User Clicks Edit] --> B[Load Account Data]
    B --> C[Open Edit Dialog]
    C --> D[User Updates Fields]
    D --> E{Validation Pass?}
    E -->|No| F[Show Errors]
    F --> D
    E -->|Yes| G[Submit Changes]
    G --> H[Start Transaction]
    H --> I{Verify Ownership}
    I -->|Failed| J[Show Error]
    I -->|Success| K{isDefault Changed?}
    K -->|Yes| L[Update Other Accounts]
    K -->|No| M[Skip]
    L --> N[Update This Account]
    M --> N
    N --> O[Commit Transaction]
    O --> P[Refetch Data]
    P --> Q[Show Success]
    J --> R[Show Error Toast]
    
    style A fill:#e1f5ff
    style Q fill:#c8e6c9
    style R fill:#ffcdd2
```

### Delete Bank Account Flow

```mermaid
graph TD
    A[User Clicks Delete] --> B[Show Confirmation]
    B --> C{User Confirms?}
    C -->|No| D[Cancel]
    C -->|Yes| E[Start Transaction]
    E --> F{Verify Ownership}
    F -->|Failed| G[Show Error]
    F -->|Success| H{Check Pending Withdrawals}
    H -->|Has Pending| I[Show Warning]
    H -->|None| J[Soft Delete Account]
    J --> K[Set isActive = false]
    K --> L[Set isDefault = false]
    L --> M[Commit Transaction]
    M --> N[Refetch Data]
    N --> O[Show Success]
    I --> P[Cannot Delete]
    
    style A fill:#e1f5ff
    style O fill:#c8e6c9
    style P fill:#ffcdd2
```

**Soft Delete Logic:**

```typescript
// Check for pending withdrawals
const pendingWithdrawals = await tx.withdrawal.count({
  where: {
    bankAccountId: accountId,
    status: { in: [WithdrawalStatus.PENDING, WithdrawalStatus.PROCESSING] }
  }
})

if (pendingWithdrawals > 0) {
  throw new Error('Cannot delete bank account with pending withdrawals')
}

// Soft delete
await tx.bankAccount.update({
  where: { id: accountId },
  data: { 
    isActive: false,
    isDefault: false,
    updatedAt: new Date()
  }
})
```

---

## 4. Deposit Request Flow

```mermaid
graph TD
    A[User Opens Deposits Section] --> B[View Deposit Form]
    B --> C[Select Payment Method]
    C --> D{Method?}
    D -->|UPI| E[Show UPI Modal]
    D -->|Bank/Cash| F[Direct Submit]
    
    E --> G[User Makes Payment]
    G --> H[Enter UTR Number]
    H --> I[Submit Deposit Request]
    
    F --> I
    I --> J[Start Transaction]
    J --> K{Get Trading Account}
    K -->|Not Found| L[Show Error]
    K -->|Found| M[Create Deposit Record]
    M --> N[Set Status: PENDING]
    N --> O[Save UTR/Reference]
    O --> P[Commit Transaction]
    P --> Q[Refetch Data]
    Q --> R[Show Success Toast]
    Q --> S[Update Deposit List]
    
    style A fill:#e1f5ff
    style R fill:#c8e6c9
    style L fill:#ffcdd2
```

**UPI Payment Sub-Flow:**

```mermaid
sequenceDiagram
    participant U as User
    participant M as UPI Modal
    participant P as Payment App
    participant S as Server

    U->>M: Click Pay with UPI
    M->>M: Generate QR Code
    M->>U: Display QR + Amount
    U->>P: Scan QR Code
    P->>P: Make Payment
    P-->>U: Payment Success
    U->>M: Enter UTR Number
    M->>S: Create Deposit Request
    S->>S: Save with PENDING status
    S-->>M: Success Response
    M->>U: Show Success Message
```

**Logging Flow:**

```
💰 [CONSOLE-SERVICE] Creating deposit request: { userId, amount: 10000, method: 'upi' }
🔄 [CONSOLE-SERVICE] Starting create deposit transaction
🔄 [CONSOLE-SERVICE] Creating deposit record
✅ [CONSOLE-SERVICE] Deposit record created: dep_abc123
✅ [CONSOLE-SERVICE] Deposit request created successfully
```

---

## 5. Withdrawal Request Flow

```mermaid
graph TD
    A[User Opens Withdrawals Section] --> B[View Available Balance]
    B --> C[Click Request Withdrawal]
    C --> D[Select Bank Account]
    D --> E[Enter Amount]
    E --> F{Validate Amount}
    F -->|Too High| G[Show Error: Insufficient Balance]
    F -->|Invalid| H[Show Error: Invalid Amount]
    F -->|Valid| I[Start Transaction]
    
    I --> J{Get Trading Account}
    J -->|Not Found| K[Show Error]
    J -->|Found| L{Check Available Balance}
    
    L -->|Insufficient| M[Show Error]
    L -->|Sufficient| N{Verify Bank Account}
    
    N -->|Not Found| O[Show Error]
    N -->|Inactive| P[Show Error]
    N -->|Valid| Q[Calculate Total with Charges]
    
    Q --> R{Final Balance Check}
    R -->|Failed| S[Show Error]
    R -->|Passed| T[Create Withdrawal Record]
    
    T --> U[Set Status: PENDING]
    U --> V[Save Reference]
    V --> W[Commit Transaction]
    W --> X[Refetch Data]
    X --> Y[Show Success]
    
    style A fill:#e1f5ff
    style Y fill:#c8e6c9
    style G fill:#ffcdd2
    style M fill:#ffcdd2
    style S fill:#ffcdd2
```

**Validation Logic:**

```typescript
// Get trading account
const tradingAccount = await tx.tradingAccount.findUnique({
  where: { userId }
})

if (!tradingAccount) {
  throw new Error('Trading account not found')
}

// Validate available balance
const totalAmount = withdrawalData.amount + (withdrawalData.charges || 0)
if (tradingAccount.availableMargin < totalAmount) {
  throw new Error('Insufficient available balance for withdrawal')
}

// Verify bank account
const bankAccount = await tx.bankAccount.findFirst({
  where: { 
    id: withdrawalData.bankAccountId,
    userId,
    isActive: true
  }
})

if (!bankAccount) {
  throw new Error('Bank account not found or inactive')
}

// Create withdrawal
const withdrawal = await tx.withdrawal.create({
  data: {
    userId,
    tradingAccountId: tradingAccount.id,
    bankAccountId: withdrawalData.bankAccountId,
    amount: withdrawalData.amount,
    charges: withdrawalData.charges || 0,
    status: WithdrawalStatus.PENDING,
    reference: withdrawalData.reference,
    remarks: withdrawalData.remarks
  }
})
```

**Logging Flow:**

```
💸 [CONSOLE-SERVICE] Creating withdrawal request: { userId, amount: 5000 }
🔄 [CONSOLE-SERVICE] Starting create withdrawal transaction
✅ [CONSOLE-SERVICE] Withdrawal record created: wdl_xyz789
✅ [CONSOLE-SERVICE] Withdrawal request created successfully
```

---

## 6. Profile Update Flow

```mermaid
graph TD
    A[User Opens Profile Section] --> B[View Current Profile]
    B --> C[Click Edit Profile]
    C --> D[Edit Fields]
    D --> E{Validation}
    E -->|Failed| F[Show Errors]
    F --> D
    E -->|Passed| G[Submit Changes]
    G --> H[Start Transaction]
    H --> I{Profile Exists?}
    I -->|Yes| J[Update Existing]
    I -->|No| K[Create New]
    J --> L[Commit Transaction]
    K --> L
    L --> M[Refetch Data]
    M --> N[Show Success]
    
    style A fill:#e1f5ff
    style N fill:#c8e6c9
    style F fill:#fff9c4
```

**Transaction Details:**

```typescript
await executeInTransaction(async (tx) => {
  console.log('🔄 [CONSOLE-SERVICE] Starting profile update transaction')
  
  const existingProfile = await tx.userProfile.findUnique({
    where: { userId }
  })
  
  if (existingProfile) {
    console.log('🔄 [CONSOLE-SERVICE] Updating existing profile')
    await tx.userProfile.update({
      where: { userId },
      data: {
        ...profileData,
        updatedAt: new Date()
      }
    })
  } else {
    console.log('🔄 [CONSOLE-SERVICE] Creating new profile')
    await tx.userProfile.create({
      data: {
        userId,
        ...profileData
      }
    })
  }
  
  console.log('✅ [CONSOLE-SERVICE] Profile update transaction completed')
})
```

---

## 7. Transaction Atomic Flow

```mermaid
graph TD
    A[Operation Started] --> B[executeInTransaction Called]
    B --> C[Begin Transaction]
    C --> D[Set Isolation Level]
    D --> E{Execute Operations}
    
    E --> F[Operation 1]
    F --> G{Success?}
    G -->|No| H[Catch Error]
    G -->|Yes| I[Operation 2]
    I --> J{Success?}
    J -->|No| H
    J -->|Yes| K[Operation 3]
    K --> L{Success?}
    L -->|No| H
    L -->|Yes| M[All Operations Complete]
    
    M --> N[Commit Transaction]
    N --> O[Return Success]
    
    H --> P{Retry Available?}
    P -->|Yes| Q[Wait with Backoff]
    Q --> E
    P -->|No| R[Rollback Transaction]
    R --> S[Return Error]
    
    style A fill:#e1f5ff
    style O fill:#c8e6c9
    style S fill:#ffcdd2
```

**Retry Logic:**

```typescript
async function executeInTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options: {
    maxRetries?: number
    timeout?: number
    isolationLevel?: Prisma.TransactionIsolationLevel
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    timeout = 10000,
    isolationLevel = Prisma.TransactionIsolationLevel.ReadCommitted,
  } = options

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          console.log('💼 [PRISMA-TRANSACTION] Transaction started')
          const res = await fn(tx)
          console.log('✅ [PRISMA-TRANSACTION] Transaction completed')
          return res
        },
        {
          maxWait: 5000,
          timeout,
          isolationLevel,
        }
      )
      
      console.log('🎉 [PRISMA-TRANSACTION] Transaction committed')
      return result
    } catch (error) {
      console.error(`❌ [PRISMA-TRANSACTION] Attempt ${attempt} failed`)
      
      if (attempt < maxRetries) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000)
        console.log(`⏳ [PRISMA-TRANSACTION] Retrying after ${backoffMs}ms...`)
        await new Promise(resolve => setTimeout(resolve, backoffMs))
      } else {
        throw error
      }
    }
  }
  
  throw new Error('Max retries exceeded')
}
```

---

## 8. Mobile Navigation Flow

```mermaid
graph TD
    A[User on Mobile Device] --> B[Console Page Loads]
    B --> C[Sidebar Closed by Default]
    C --> D[User Taps Hamburger Menu]
    D --> E[Sidebar Slides In]
    E --> F{User Action?}
    
    F -->|Tap Section| G[Navigate to Section]
    F -->|Tap Backdrop| H[Close Sidebar]
    F -->|Tap Logout| I[Logout User]
    
    G --> J[Close Sidebar Auto]
    J --> K[Unlock Body Scroll]
    K --> L[Render Section]
    
    H --> K
    
    I --> M[Sign Out]
    M --> N[Redirect to Login]
    
    style A fill:#e1f5ff
    style L fill:#c8e6c9
```

**Mobile Layout Behaviors:**

1. **Sidebar State Management**
   ```typescript
   const [sidebarOpen, setSidebarOpen] = useState(false) // Closed by default
   
   // Close on section change
   useEffect(() => {
     setSidebarOpen(false)
   }, [activeSection])
   
   // Lock body scroll when open
   useEffect(() => {
     if (sidebarOpen) {
       document.body.style.overflow = 'hidden'
     } else {
       document.body.style.overflow = 'unset'
     }
   }, [sidebarOpen])
   ```

2. **Touch Interactions**
   - Spring animations for smooth drawer
   - Backdrop closes sidebar
   - Touch-manipulation CSS for better response
   - No hover effects on mobile

3. **Responsive Breakpoints**
   - Mobile: < 640px (full width, single column)
   - Tablet: 640px - 1024px (2 columns)
   - Desktop: > 1024px (multi-column, persistent sidebar)

---

## 9. Error Handling Flow

```mermaid
graph TD
    A[Operation Initiated] --> B{Try Block}
    B --> C[Execute Operation]
    C --> D{Success?}
    
    D -->|Yes| E[Log Success]
    E --> F[Return Success Response]
    
    D -->|No| G[Catch Block]
    G --> H[Log Error Details]
    H --> I{Error Type?}
    
    I -->|Validation| J[Return Validation Error]
    I -->|Database| K[Return Database Error]
    I -->|Network| L[Return Network Error]
    I -->|Unknown| M[Return Generic Error]
    
    J --> N[Show User-Friendly Message]
    K --> N
    L --> N
    M --> N
    
    N --> O[Component Error State]
    O --> P[Display Error UI]
    
    style A fill:#e1f5ff
    style F fill:#c8e6c9
    style P fill:#ffcdd2
```

**Error Handling Patterns:**

1. **Service Layer**
   ```typescript
   try {
     console.log('🔄 [SERVICE] Starting operation')
     // ... operation
     console.log('✅ [SERVICE] Operation successful')
     return { success: true, message: 'Success' }
   } catch (error) {
     console.error('❌ [SERVICE] Operation failed:', error)
     console.error('🔍 [SERVICE] Error details:', {
       message: error instanceof Error ? error.message : 'Unknown',
       stack: error instanceof Error ? error.stack : undefined
     })
     return { success: false, message: 'User-friendly error' }
   }
   ```

2. **Component Layer**
   ```typescript
   if (isLoading) {
     return (
       <div className="flex h-64 items-center justify-center">
         <div className="text-muted-foreground">Loading...</div>
       </div>
     )
   }
   
   if (error) {
     return (
       <div className="flex h-64 items-center justify-center">
         <div className="text-center space-y-2">
           <div className="text-xl font-semibold text-destructive">
             Error loading data
           </div>
           <div className="text-sm text-muted-foreground">{error}</div>
         </div>
       </div>
     )
   }
   ```

3. **API Layer**
   ```typescript
   try {
     // ... operation
     return NextResponse.json(result)
   } catch (error) {
     console.error('❌ [API] Error:', error)
     return NextResponse.json(
       { error: 'Internal server error' },
       { status: 500 }
     )
   }
   ```

---

## 10. Real-time Data Refresh Flow

```mermaid
graph TD
    A[User Clicks Refresh] --> B[Set isRefreshing = true]
    B --> C[Call refetch Function]
    C --> D[Fetch Fresh Data]
    D --> E{Success?}
    
    E -->|Yes| F[Update State]
    E -->|No| G[Log Error]
    
    F --> H[Update Last Updated Time]
    G --> I[Keep Old Data]
    
    H --> J[Set isRefreshing = false]
    I --> J
    
    J --> K[Re-render UI]
    
    style A fill:#e1f5ff
    style K fill:#c8e6c9
```

**Auto-Refresh Pattern:**

```typescript
// Auto-refresh every 30 seconds
useEffect(() => {
  const interval = setInterval(() => {
    console.log('🔄 [AUTO-REFRESH] Refreshing data')
    refetch()
    setLastUpdated(new Date())
  }, 30000) // 30 seconds

  return () => clearInterval(interval)
}, [refetch])

// Manual refresh
const handleRefresh = async () => {
  console.log('🔄 [MANUAL-REFRESH] User triggered refresh')
  setIsRefreshing(true)
  try {
    await refetch()
    setLastUpdated(new Date())
    console.log('✅ [MANUAL-REFRESH] Refresh completed')
  } catch (error) {
    console.error('❌ [MANUAL-REFRESH] Refresh failed:', error)
  } finally {
    setIsRefreshing(false)
  }
}
```

---

## Summary

These flow diagrams provide a comprehensive view of all major operations in the Console module:

1. ✅ **Authentication** - Session-based access control
2. ✅ **Data Loading** - Parallel fetching for performance
3. ✅ **Bank Accounts** - CRUD with atomic transactions
4. ✅ **Deposits** - UPI and bank transfer flows
5. ✅ **Withdrawals** - Balance validation and atomic operations
6. ✅ **Profile** - Upsert pattern for user data
7. ✅ **Transactions** - Atomic, retry-enabled operations
8. ✅ **Mobile Nav** - Touch-optimized sidebar
9. ✅ **Errors** - Comprehensive error handling
10. ✅ **Refresh** - Auto and manual data updates

All flows include:
- 📝 Comprehensive logging
- 🔒 Atomic transactions
- ⚡ Performance optimizations
- 📱 Mobile responsiveness
- ❌ Error handling
- ✅ Success feedback

---

## 11. Responsive Desktop Workspace Flow

```mermaid
graph TD
    A[User loads /console] --> B{Viewport >= lg?}
    B -->|No| C[Mobile shell]
    B -->|Yes| D[Desktop workspace shell]

    C --> E[Drawer sidebar + compact topbar]
    D --> F[Fixed desktop rail + expanded topbar]

    E --> G[Render sections in single flow]
    F --> H[Render elevated content canvas]

    H --> I[Desktop context chips and sticky table headers]
    G --> J[Touch-first cards and compact controls]

    I --> K[Consistent data operations]
    J --> K

    style A fill:#e1f5ff
    style D fill:#c8e6c9
    style C fill:#fff9c4
    style K fill:#d1c4e9
```

**Desktop-specific UX outcomes:**

1. **Wider content rhythm**
   - Uses expanded max-width containers with additional `xl` spacing.
   - Section content is rendered inside a framed surface for hierarchy clarity.

2. **Navigation ergonomics**
   - Desktop retains persistent left rail for faster section switching.
   - Topbar introduces context signals (market status + IST chip).

3. **Data table readability**
   - Statements, deposits, withdrawals, and bank tables use sticky headers in desktop bounded surfaces.
   - Long text fields are truncated safely to reduce visual noise.

4. **State recovery clarity**
   - Loading, unauthenticated, and error states show actionable card-based recovery UI instead of plain text.