# Console Architecture Documentation

## Overview

The Console module is a comprehensive trading dashboard that provides users with complete control over their trading account, deposits, withdrawals, bank accounts, and profile management. It has been fully optimized for both mobile and desktop devices with Prisma atomic transactions replacing all RPC calls.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INTERFACE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Topbar     │  │   Sidebar    │  │   Sections   │          │
│  │ (Navigation) │  │    (Menu)    │  │  (Content)   │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                  │                   │
│         └─────────────────┴──────────────────┘                   │
│                          │                                       │
│                  ┌───────▼────────┐                              │
│                  │ Console Layout  │                              │
│                  └───────┬────────┘                              │
└──────────────────────────┼──────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
┌───────▼─────┐   ┌────────▼────────┐   ┌────▼────────┐
│   Hooks     │   │   API Routes    │   │  Services   │
│             │   │                 │   │             │
│ - useConsole│   │ /api/console    │   │ Console     │
│   Data      │   │   - GET         │   │ Service     │
│             │   │   - POST        │   │             │
└──────┬──────┘   └────────┬────────┘   └─────┬───────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                ┌──────────▼──────────┐
                │   Prisma Client     │
                │  (with Transactions)│
                └──────────┬──────────┘
                           │
                ┌──────────▼──────────┐
                │   PostgreSQL DB     │
                │                     │
                │ - users             │
                │ - trading_accounts  │
                │ - bank_accounts     │
                │ - deposits          │
                │ - withdrawals       │
                │ - user_profiles     │
                │ - transactions      │
                │ - positions         │
                │ - orders            │
                └─────────────────────┘
```

## Component Structure

### 1. Layout Components

#### **ConsoleLayout** (`components/console/console-layout.tsx`)
- **Purpose**: Main layout wrapper for the console
- **Features**:
  - Mobile-first responsive design
  - Desktop workspace canvas with widened max width and elevated content surface
  - Sidebar drawer for mobile
  - Body scroll lock when sidebar open
  - Smooth animations
- **Mobile Optimizations**:
  - Sidebar closed by default on mobile
  - Touch-friendly backdrop
  - Spring animations for drawer
  - Responsive padding
  - Preserves compact mobile spacing while desktop uses larger visual hierarchy

#### **Topbar** (`components/console/topbar.tsx`)
- **Purpose**: Top navigation and user menu
- **Features**:
  - Real user data from session
  - Market status indicator
  - Notifications
  - Theme toggle
  - User menu with logout
- **Mobile Optimizations**:
  - Compact design on mobile
  - Hamburger menu toggle
  - Responsive text sizing
  - Touch-friendly buttons

#### **SidebarMenu** (`components/console/sidebar-menu.tsx`)
- **Purpose**: Navigation menu for console sections
- **Features**:
  - 6 main sections
  - Active state indication
  - Hover effects
  - Logout button
- **Mobile Optimizations**:
  - Larger touch targets (h-12 on mobile)
  - Section descriptions
  - Touch manipulation CSS
  - Auto-close on section change

### 2. Section Components

#### **Account Section** (`components/console/sections/account-section.tsx`)
- **Features**:
  - Balance visibility toggle
  - Account summary grid
  - Balance trend chart
  - Exposure pie chart
  - P&L trend chart
  - Quick actions menu
- **Mobile Optimizations**:
  - Responsive grid layouts
  - Chart height optimization (200px mobile, 250px desktop)
  - Compact headers
  - Touch-friendly buttons

#### **Deposits Section** (`components/console/sections/deposits-section.tsx`)
- **Features**:
  - Deposit form (UPI, Bank, Cash)
  - Deposit history table
  - Summary statistics
  - UPI payment modal
- **Mobile Optimizations**:
  - Full-width buttons on mobile
  - Responsive summary cards (1 col mobile, 2 col tablet, 3 col desktop)
  - Touch-optimized forms

#### **Withdrawals Section** (`components/console/sections/withdrawals-section.tsx`)
- **Features**:
  - Withdrawal request form
  - Withdrawal history
  - Available balance display
  - Bank account selection
- **Mobile Optimizations**:
  - Responsive grid (1 → 2 → 4 columns)
  - Touch-friendly forms
  - Mobile-optimized list view

#### **Bank Accounts Section** (`components/console/sections/bank-accounts-section.tsx`)
- **Features**:
  - Bank accounts list
  - Add/Edit/Delete accounts
  - Set default account
  - Account type indicators
- **Mobile Optimizations**:
  - Full-width "Add Account" button on mobile
  - Responsive dialogs
  - Touch-optimized list actions

#### **Profile Section** (`components/console/sections/profile-section.tsx`)
- **Features**:
  - Personal information display
  - Client ID with copy button
  - KYC status
  - Security settings
  - MPIN change
- **Mobile Optimizations**:
  - Responsive 3-column grid
  - Full-width buttons on mobile
  - Compact card spacing

#### **Statements Section** (`components/console/sections/statements-section.tsx`)
- **Features**:
  - Transaction history table
  - Filter bar
  - Export functionality
  - Summary statistics
- **Mobile Optimizations**:
  - Responsive table (horizontal scroll on mobile)
  - Touch-friendly filters
  - Mobile-optimized export dialog

## Data Flow Architecture

### Data Fetching Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User Loads Console Page                                  │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│ 2. useConsoleData Hook Initialized                          │
│    - Gets userId from session                               │
│    - Calls fetchConsoleData()                               │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│ 3. ConsoleDataService.getConsoleData(userId)                │
│    - Wrapper service for backward compatibility             │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│ 4. ConsoleService.getConsoleData(userId)                    │
│    - Fetches all data in parallel using Promise.all         │
│    - User + KYC                                             │
│    - Trading Account                                         │
│    - Bank Accounts                                          │
│    - Deposits (last 50)                                     │
│    - Withdrawals (last 50)                                  │
│    - Transactions (last 100)                                │
│    - Positions (active only)                                │
│    - Orders (last 50)                                       │
│    - User Profile                                           │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│ 5. Prisma Client Queries Database                           │
│    - Direct Prisma queries (no RPCs)                        │
│    - Optimized with includes and selects                    │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│ 6. Data Formatted and Returned                              │
│    - Numbers converted from Decimal                         │
│    - Dates converted to ISO strings                         │
│    - Summary statistics calculated                          │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│ 7. Hook Updates State                                       │
│    - setConsoleData(data)                                   │
│    - Components re-render with new data                     │
└─────────────────────────────────────────────────────────────┘
```

### Data Mutation Flow (e.g., Add Bank Account)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User Submits Form                                        │
│    - Click "Add Bank Account"                               │
│    - Fill form with bank details                            │
│    - Submit                                                 │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│ 2. Component Calls Hook Method                              │
│    addBankAccount(bankData)                                 │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│ 3. Hook Calls Service Method                                │
│    ConsoleDataService.addBankAccount(userId, bankData)      │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│ 4. Service Calls Core ConsoleService                        │
│    ConsoleService.addBankAccount(userId, bankData)          │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│ 5. Atomic Transaction Started                               │
│    executeInTransaction(async (tx) => { ... })              │
│                                                             │
│    a. If isDefault=true:                                    │
│       - Unset other default accounts                        │
│                                                             │
│    b. Create new bank account:                              │
│       - tx.bankAccount.create({ ... })                      │
│                                                             │
│    c. Transaction commits if all succeed                    │
│    d. Transaction rolls back if any fail                    │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│ 6. Response Returned                                        │
│    { success: true, message: "...", accountId: "..." }      │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│ 7. Hook Refetches All Data                                 │
│    fetchConsoleData()                                       │
│    - Ensures UI is in sync with database                    │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│ 8. UI Updates with New Data                                │
│    - Toast notification shown                               │
│    - Dialog closed                                          │
│    - List updated with new account                          │
└─────────────────────────────────────────────────────────────┘
```

## Service Layer Architecture

### ConsoleService (New Prisma-Based)

**Location**: `lib/services/console/ConsoleService.ts`

**Key Features**:
- ✅ Direct Prisma queries (no RPCs)
- ✅ Atomic transactions for all mutations
- ✅ Comprehensive error handling
- ✅ Detailed logging
- ✅ Type-safe operations

**Methods**:

1. **getConsoleData(userId)**
   - Fetches all user data in parallel
   - Returns complete ConsoleData object
   - Includes summary statistics

2. **updateUserProfile(userId, profileData)**
   - Updates or creates user profile
   - Uses atomic transaction
   - Returns success/failure response

3. **addBankAccount(userId, bankData)**
   - Adds new bank account
   - Handles default account logic
   - Atomic transaction ensures consistency

4. **updateBankAccount(userId, accountId, bankData)**
   - Updates existing bank account
   - Verifies ownership
   - Manages default account switching

5. **deleteBankAccount(userId, accountId)**
   - Soft delete (sets isActive=false)
   - Checks for pending withdrawals
   - Prevents deletion if in use

6. **createDepositRequest(userId, depositData)**
   - Creates deposit record
   - Status: PENDING
   - Links to bank account if provided

7. **createWithdrawalRequest(userId, withdrawalData)**
   - Creates withdrawal record
   - Validates available balance
   - Verifies bank account ownership
   - Status: PENDING

### ConsoleDataService (Wrapper)

**Location**: `lib/console-data-service.ts`

**Purpose**: Backward compatibility wrapper around new ConsoleService

**Features**:
- ✅ Maintains same interface as before
- ✅ Adds logging for debugging
- ✅ Delegates to ConsoleService
- ✅ No breaking changes for consumers

## API Routes

### GET /api/console

**Purpose**: Fetch all console data for authenticated user

**Flow**:
```
1. Verify session authentication
2. Get userId from session
3. Call ConsoleDataService.getConsoleData(userId)
4. Return data or error
```

**Response**:
```typescript
{
  user: { ... },
  tradingAccount: { ... },
  bankAccounts: [ ... ],
  deposits: [ ... ],
  withdrawals: [ ... ],
  transactions: [ ... ],
  positions: [ ... ],
  orders: [ ... ],
  userProfile: { ... },
  summary: { ... }
}
```

### POST /api/console

**Purpose**: Handle console data mutations

**Actions**:
- `updateProfile`
- `addBankAccount`
- `updateBankAccount`
- `deleteBankAccount`
- `createDepositRequest`
- `createWithdrawalRequest`

**Request**:
```typescript
{
  action: string,
  data: { ... }
}
```

**Response**:
```typescript
{
  success: boolean,
  message: string,
  [key]: any  // Optional additional data
}
```

## Database Models

### Core Models Used

1. **User** (`users`)
   - id, name, email, phone
   - clientId, role, isActive
   - Relations: kyc, tradingAccount, bankAccounts, deposits, withdrawals, userProfile

2. **TradingAccount** (`trading_accounts`)
   - id, userId, balance
   - availableMargin, usedMargin
   - Relations: deposits, withdrawals, transactions, positions, orders

3. **BankAccount** (`bank_accounts`)
   - id, userId, bankName
   - accountNumber, ifscCode
   - accountHolderName, accountType
   - isDefault, isActive

4. **Deposit** (`deposits`)
   - id, userId, tradingAccountId
   - amount, method, status
   - utr, reference, remarks
   - bankAccountId (optional)

5. **Withdrawal** (`withdrawals`)
   - id, userId, tradingAccountId
   - amount, status, charges
   - reference, remarks
   - bankAccountId (required)

6. **UserProfile** (`user_profiles`)
   - id, userId
   - firstName, lastName, dateOfBirth
   - gender, address, city, state, pincode
   - panNumber, aadhaarNumber
   - occupation, annualIncome
   - riskProfile, investmentExperience

7. **Transaction** (`transactions`)
   - id, tradingAccountId
   - amount, type (CREDIT/DEBIT)
   - description

8. **Position** (`positions`)
   - id, tradingAccountId, symbol
   - quantity, averagePrice
   - unrealizedPnL, dayPnL
   - stopLoss, target

9. **Order** (`orders`)
   - id, tradingAccountId, symbol
   - quantity, orderType, orderSide
   - price, filledQuantity
   - status, productType

## Mobile Optimization Strategy

### Responsive Design Principles

1. **Mobile-First Approach**
   - Base styles target mobile
   - Progressive enhancement for larger screens
   - Tailwind breakpoints: sm (640px), md (768px), lg (1024px)

2. **Touch-Friendly Targets**
   - Minimum button height: 48px (h-12)
   - Class: `touch-manipulation` for better touch response
   - Increased spacing between clickable elements

3. **Responsive Typography**
   - Mobile: text-xs, text-sm, text-base
   - Desktop: text-sm, text-base, text-lg, text-xl
   - Truncation for long text

4. **Adaptive Layouts**
   - Single column on mobile
   - Multi-column grids on tablet/desktop
   - Collapsible sections
   - Bottom sheets for modals

5. **Performance**
   - Lazy loading for images
   - Optimized chart rendering
   - Debounced search/filter
   - Pagination for long lists

### Mobile Breakpoint Strategy

```css
/* Mobile First (default) */
.element {
  /* Mobile styles */
}

/* Tablet (sm: 640px) */
@media (min-width: 640px) {
  .element {
    /* Tablet styles */
  }
}

/* Desktop (lg: 1024px) */
@media (min-width: 1024px) {
  .element {
    /* Desktop styles */
  }
}
```

## Logging Strategy

Every component and service includes comprehensive logging:

### Console Prefixes

- 🎨 `[CONSOLE-LAYOUT]` - Layout component logs
- 🎯 `[TOPBAR]` - Topbar component logs
- 📱 `[SIDEBAR-MENU]` - Sidebar menu logs
- 📊 `[CONSOLE-SERVICE]` - Service layer logs
- 🔄 `[CONSOLE-DATA-SERVICE]` - Data service wrapper logs
- 📥 `[CONSOLE-API]` - API route logs
- 👤 `[ACCOUNT-SECTION]` - Account section logs
- 💰 `[DEPOSITS]` - Deposits section logs
- 💸 `[WITHDRAWALS]` - Withdrawals section logs
- 🏦 `[BANK-ACCOUNTS]` - Bank accounts section logs
- 📋 `[STATEMENTS]` - Statements section logs

### Log Levels

- `console.log()` - Info and state changes
- `console.warn()` - Warnings and potential issues
- `console.error()` - Errors and failures

## Error Handling

### Service Layer

```typescript
try {
  // Operation
  console.log('✅ Success message')
  return { success: true, message: 'Success' }
} catch (error) {
  console.error('❌ Error message:', error)
  console.error('🔍 Error details:', {
    message: error instanceof Error ? error.message : 'Unknown',
    stack: error instanceof Error ? error.stack : undefined
  })
  return { success: false, message: 'Error message' }
}
```

### Component Layer

```typescript
if (isLoading) {
  return <LoadingState />
}

if (error) {
  return <ErrorState message={error} />
}

// Render normal state
```

## Security Considerations

1. **Authentication**
   - Session validation on every request
   - User ID verification
   - CSRF protection

2. **Authorization**
   - User can only access their own data
   - Ownership verification in mutations
   - Role-based access control

3. **Data Validation**
   - Input validation on client and server
   - Type safety with TypeScript
   - Prisma schema validation

4. **Transaction Safety**
   - Atomic operations prevent partial updates
   - Rollback on failure
   - Race condition prevention

## Performance Optimizations

1. **Parallel Data Fetching**
   - All data fetched with Promise.all
   - Reduces total fetch time

2. **Data Limits**
   - Deposits: Last 50
   - Withdrawals: Last 50
   - Transactions: Last 100
   - Orders: Last 50
   - Positions: Active only

3. **Optimized Queries**
   - Select only needed fields
   - Include relations efficiently
   - Indexed database queries

4. **Client-Side Caching**
   - React state management
   - Memoization with useMemo
   - Optimistic UI updates

## Testing Checklist

### Mobile Testing
- [ ] Test on iPhone (Safari)
- [ ] Test on Android (Chrome)
- [ ] Test landscape and portrait
- [ ] Test touch interactions
- [ ] Test form inputs
- [ ] Test modals and dialogs
- [ ] Test navigation
- [ ] Test charts responsiveness

### Functional Testing
- [ ] Account summary displays correctly
- [ ] Deposits create successfully
- [ ] Withdrawals create successfully
- [ ] Bank accounts CRUD operations
- [ ] Profile updates
- [ ] Statements filter and export
- [ ] Real-time balance updates
- [ ] Transaction history

### Transaction Testing
- [ ] Add bank account (default logic)
- [ ] Update bank account
- [ ] Delete bank account (with pending check)
- [ ] Create deposit
- [ ] Create withdrawal (balance check)
- [ ] Update profile
- [ ] All rollback scenarios

## Future Enhancements

1. **Real-time Updates**
   - WebSocket integration
   - Live balance updates
   - Notification system

2. **Advanced Features**
   - Recurring deposits
   - Scheduled withdrawals
   - Multi-currency support
   - Tax reporting

3. **Analytics**
   - Advanced charts
   - Performance metrics
   - Trading insights
   - Risk analysis

4. **Mobile App**
   - React Native app
   - Native mobile experience
   - Push notifications
   - Biometric authentication

## Conclusion

The Console module is now fully optimized for mobile devices with Prisma atomic transactions providing robust data consistency. All RPC calls have been removed and replaced with direct Prisma queries, improving performance and maintainability.

The comprehensive logging system makes debugging easy, and the mobile-first design ensures a great user experience across all devices.

## 2026-02-16 Desktop UX Upgrade Notes

Recent desktop-focused upgrades layered on top of the existing mobile-first foundation:

- Workspace shell refinements:
  - wider desktop canvas with elevated content surface
  - improved topbar sizing and spacing
  - desktop IST context chip in topbar
- State clarity refinements:
  - polished loading/unauthenticated/error cards for desktop visibility
  - direct login recovery CTA in unauthenticated console state
- Data density improvements:
  - sticky-header framed desktop surfaces for statements, deposits, withdrawals, and bank account tables
  - improved scroll affordance with compact scrollbar styling
- Dialog usability improvements:
  - wider desktop widths for UPI payment, export, bank add/edit, and MPIN dialogs

These upgrades preserve all existing business/data flows while improving large-screen ergonomics.