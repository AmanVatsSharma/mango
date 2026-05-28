# 🎯 Admin Console - Complete Implementation Guide

## 📋 **Table of Contents**
1. [Overview](#overview)
2. [Features Implemented](#features-implemented)
3. [Authentication & Security](#authentication--security)
4. [AWS S3 Integration](#aws-s3-integration)
5. [API Endpoints](#api-endpoints)
6. [Components](#components)
7. [Database Schema](#database-schema)
8. [Environment Variables](#environment-variables)
9. [Usage Guide](#usage-guide)
10. [Troubleshooting](#troubleshooting)

---

## 🎭 **Overview**

The Admin Console is a comprehensive dashboard for platform administrators to manage users, funds, system settings, and monitor platform activity.

**Location:** `/admin-console`

**Access Level:** ADMIN, MODERATOR, SUPER_ADMIN roles

---

## ✨ **Features Implemented**

### ✅ **1. Authentication & Security**
- [x] Fixed NextAuth v5 integration
- [x] Proper admin role verification
- [x] Protected `/admin-console` route via middleware
- [x] Admin API routes use `requireAdminPermissions` with permission keys
- [x] Session-based authentication
- [x] Real-time admin user data in header

### ✅ **2. Dashboard**
- [x] Real-time platform statistics
- [x] User analytics
- [x] Trading activity monitoring
- [x] Recent activity feed
- [x] Top traders leaderboard
- [x] System alerts

### ✅ **3. User Management** (ENHANCED)
- [x] View all users with pagination
- [x] Search users by name, email, clientId
- [x] **Advanced Filters** (NEW)
  - Filter by status (active/inactive)
  - Filter by KYC status (pending/approved/rejected/not submitted)
  - Filter by role (user/moderator/admin/super admin)
  - Filter by date range (registration date)
- [x] **Bulk Operations** (NEW)
  - Select multiple users
  - Bulk activate/deactivate users
  - Clear selection
- [x] **Edit User Profile** (NEW)
  - Edit name, email, phone, client ID
  - Change user role
  - Update account status
  - Edit bio
- [x] **Credential Management** (NEW)
  - Reset user password
  - Reset user MPIN
- [x] **KYC Management** (NEW)
  - View KYC documents
  - Approve/reject KYC with reason
  - View KYC submission details
- [x] **User Activity Log** (NEW)
  - View comprehensive activity timeline
  - Auth events, orders, trades, deposits, withdrawals
  - Filterable and searchable
- [x] User details and statistics
- [x] Activate/deactivate users
- [x] View user trading account
- [x] User statement dialog
- [x] **Account Freeze/Unfreeze** (NEW)
- [x] **Manual Contact Verification** (NEW)

### ✅ **4. Fund Management**
- [x] Approve/reject deposit requests
- [x] Approve/reject withdrawal requests
- [x] Manual fund addition to users
- [x] Manual fund withdrawal from users
- [x] Transaction history
- [x] Real-time fund status updates

### ✅ **5. Settings**
- [x] Upload payment QR code
- [x] Set UPI ID for payments
- [x] AWS S3 integration for image storage
- [x] System-wide configuration
- [x] Profile image upload
- [x] Real admin data in header
- [x] **Maintenance Mode Control** (NEW)
  - [x] Enable/disable maintenance mode from admin console
  - [x] Custom maintenance message
  - [x] Set expected end time
  - [x] Admin bypass toggle
  - [x] Database-backed configuration (replaces environment variables)
- [x] **Market Controls** (FIXED)
  - [x] Force market closed toggle (now properly respected)
  - [x] NSE holidays management
  - [x] Real-time market session display
  - [x] Database-backed force closed setting

### ✅ **6. AWS S3 Integration**
- [x] S3 client configuration
- [x] File upload with validation
- [x] Public/private file access
- [x] Presigned URL generation
- [x] Image optimization
- [x] File deletion

### ✅ **7. Logs & Terminal**
- [x] Real-time logs viewing
- [x] Filter by category
- [x] Log level filtering
- [x] Search functionality

### ✅ **8. Access Control (RBAC)**
- [x] Permission catalog + role defaults
- [x] Access Control UI for SUPER_ADMIN
- [x] Permission-based enforcement for admin APIs

---

## 🔐 **Authentication & Security**

### Fixed Issues

#### 1. **Auth Configuration**
```typescript
// ✅ FIXED: auth.ts now exports authOptions
export const authOptions = {
  // ... configuration
}

export const { handlers, signIn, signOut, auth } = NextAuth(authOptions)
```

#### 2. **API Route Authentication**
```typescript
// ❌ BEFORE (BROKEN)
import { getServerSession } from "next-auth"
const session = await getServerSession() // No config!

// ✅ AFTER (FIXED)
import { auth } from "@/auth"
const session = await auth() // Properly configured
```

#### 3. **Middleware Protection**
```typescript
// ✅ FIXED: /admin-console is now protected
const adminRoutes = [
  "/admin",
  "/admin-console"  // Added!
]

const isAdminRoute = 
  nextUrl.pathname === "/admin" || 
  nextUrl.pathname.startsWith("/admin/") ||
  nextUrl.pathname === "/admin-console" ||  // Added!
  nextUrl.pathname.startsWith("/admin-console/")  // Added!
```

### Security Features
- ✅ Role-based access control with permissions (ADMIN/MODERATOR/SUPER_ADMIN)
- ✅ Session validation on every request
- ✅ Protected API endpoints
- ✅ CSRF protection via NextAuth
- ✅ Secure file uploads with validation
- ✅ Permission-based RBAC with Access Control UI

---

## ☁️ **AWS S3 Integration**

### Setup

1. **Install Dependencies**
```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner --legacy-peer-deps
```

2. **Environment Variables**
```env
# AWS S3 Configuration
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-bucket-name
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
```

### Usage

```typescript
// Upload file
import { getS3Service } from "@/lib/aws-s3"

const s3Service = getS3Service()
const result = await s3Service.uploadFile(buffer, {
  folder: 'payment-qr-codes',
  fileName: 'qr-code.png',
  contentType: 'image/png',
  isPublic: true
})

console.log("File uploaded:", result.url)
```

### Features
- ✅ Automatic file validation (type, size)
- ✅ Public/private file access
- ✅ Presigned URLs for private files
- ✅ File metadata tracking
- ✅ Error handling with detailed logging

---

## 🔌 **API Endpoints**

### Admin Authentication
All admin endpoints require ADMIN role authentication.

### 1. **Upload API**
```typescript
POST /api/admin/upload
```
**Body:** FormData with `file`, `folder`, `isPublic`
**Response:** `{ success, url, key, bucket }`

### 2. **Settings API**
```typescript
GET /api/admin/settings?key=payment_qr_code
POST /api/admin/settings
DELETE /api/admin/settings?key=payment_qr_code
```

### 3. **Admin Profile API**
```typescript
GET /api/admin/me
PATCH /api/admin/me
```

### 4. **Maintenance Mode API** (NEW)
```typescript
GET /api/maintenance/status
POST /api/maintenance/toggle
GET /api/maintenance/config
```
**Toggle Request Body:**
```json
{
  "enabled": true,
  "message": "Custom maintenance message",
  "endTime": "2025-01-27T18:00:00Z",
  "allowAdminBypass": true
}
```

### 5. **Market Status API** (NEW)
```typescript
GET /api/market/status
```
**Response:**
```json
{
  "success": true,
  "data": {
    "forceClosed": false,
    "session": "open",
    "isOpen": true
  }
}
```

### 6. **Enhanced User Management APIs** (NEW)
```typescript
// Get user details
GET /api/admin/users/[userId]

// Update user profile
PUT /api/admin/users/[userId]
Body: { name?, email?, phone?, role?, isActive?, clientId?, bio? }

// Reset password
POST /api/admin/users/[userId]/reset-password
Body: { password: string }

// Reset MPIN
POST /api/admin/users/[userId]/reset-mpin
Body: { mpin: string }

// Manage KYC
POST /api/admin/users/[userId]/kyc
Body: { status: 'APPROVED' | 'REJECTED' | 'PENDING', reason?: string }

// Freeze/Unfreeze account
POST /api/admin/users/[userId]/freeze
Body: { freeze: boolean, reason?: string }

// Get user activity log
GET /api/admin/users/[userId]/activity?limit=100

// Verify contact manually
POST /api/admin/users/[userId]/verify-contact
Body: { type: 'email' | 'phone' }

// Bulk operations
POST /api/admin/users/bulk
Body: { userIds: string[], action: 'updateStatus', isActive: boolean }
```

### 7. **Existing APIs (Fixed)**
```typescript
GET /api/admin/stats
GET /api/admin/users (now supports advanced filters)
PATCH /api/admin/users
GET /api/admin/deposits
POST /api/admin/deposits
GET /api/admin/withdrawals
POST /api/admin/withdrawals
GET /api/admin/activity
```

---

## 🧩 **Components**

### Admin Console Components

1. **`<Settings />`** - UPDATED
   - Payment QR code upload
   - UPI ID configuration
   - Profile image upload
   - System settings management
   - **Maintenance Mode Tab** (NEW)
     - Enable/disable maintenance mode
     - Custom message and end time
     - Admin bypass control
   - **Market Controls Tab** (FIXED)
     - Force market closed toggle
     - NSE holidays management
     - Real-time session display

2. **`<Header />`** - UPDATED
   - Real admin user data
   - Profile image display
   - Dynamic role display
   - Search functionality

3. **`<Sidebar />`** - UPDATED
   - Added Settings tab
   - Real-time system status

4. **`<Dashboard />`**
   - Real-time stats
   - Activity monitoring

5. **`<UserManagement />`** - ENHANCED
   - User list with pagination
   - Advanced filters (status, KYC, role, date range)
   - Bulk operations (select multiple, activate/deactivate)
   - User actions (edit, KYC management, activity log, etc.)
   - Real-time data updates

6. **`<EditUserDialog />`** - NEW
   - Full profile editing
   - Credential management (password/MPIN reset)
   - Role and status management

7. **`<KYCManagementDialog />`** - NEW
   - View KYC documents
   - Approve/reject KYC
   - Add rejection reasons

8. **`<UserActivityDialog />`** - NEW
   - Comprehensive activity timeline
   - Auth events, orders, trades, transactions
   - Real-time updates

6. **`<FundManagement />`**
   - Deposit/withdrawal management
   - Transaction approvals

7. **`<LogsTerminal />`**
   - Real-time logs
   - Filtering and search

---

## 🗄️ **Database Schema**

### New Table: `SystemSettings`

```prisma
model SystemSettings {
  id          String   @id @default(uuid())
  key         String   @unique
  value       String
  description String?
  category    String   @default("GENERAL")
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@index([key])
  @@index([category])
  @@map("system_settings")
}
```

### Migration

```bash
# Push schema changes
npx prisma db push

# Generate Prisma client
npx prisma generate
```

---

## ⚙️ **Environment Variables**

### Required Variables

```env
# Database
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."  # For Prisma migrations

# NextAuth
NEXTAUTH_SECRET="your-secret-key"
NEXTAUTH_URL="http://localhost:3000"

# AWS S3 (NEW)
AWS_REGION="us-east-1"
AWS_S3_BUCKET="your-bucket-name"
AWS_ACCESS_KEY_ID="your-access-key"
AWS_SECRET_ACCESS_KEY="your-secret-key"
```

### Optional Variables

```env
# AWS Alternative
AWS_S3_REGION="us-east-1"  # Alternative to AWS_REGION
```

---

## 📖 **Usage Guide**

### For Administrators

#### 1. **Accessing Admin Console**
1. Navigate to `/admin-console`
2. Login with ADMIN credentials
3. Dashboard loads with real-time data

#### 2. **Managing Payment Settings**
1. Click "Settings" in sidebar
2. Go to "Payment Settings" tab
3. Upload QR code image
4. Enter UPI ID
5. Click "Save Settings"

#### 3. **Updating Profile**
1. Click on profile in header
2. Upload profile image in Settings
3. Update name if needed
4. Changes reflect immediately in header

#### 4. **Managing Users**
1. Click "User Management"
2. Search/filter users
3. View user details
4. Activate/deactivate accounts

#### 5. **Processing Fund Requests**
1. Click "Fund Management"
2. View pending requests
3. Review details
4. Approve/reject with reason

---

## 🐛 **Troubleshooting**

### Issue 1: "Unauthorized" on admin routes

**Solution:**
- Ensure user has ADMIN role in database
- Check session is valid
- Verify middleware is protecting routes

```sql
-- Check user role
SELECT id, email, role FROM users WHERE email = 'admin@example.com';

-- Update user role to ADMIN
UPDATE users SET role = 'ADMIN' WHERE email = 'admin@example.com';
```

### Issue 2: S3 upload fails

**Solution:**
- Verify AWS credentials
- Check bucket permissions
- Ensure bucket exists
- Validate file size/type

```typescript
// Check S3 configuration
console.log("AWS_REGION:", process.env.AWS_REGION)
console.log("AWS_S3_BUCKET:", process.env.AWS_S3_BUCKET)
// Never log credentials!
```

### Issue 3: Settings not loading

**Solution:**
- Run database migration
- Check SystemSettings table exists
- Verify API endpoint responds

```bash
# Push schema
npx prisma db push

# Check table
npx prisma studio
```

### Issue 4: Profile image not showing

**Solution:**
- Ensure image uploaded to S3
- Check image URL is public or has presigned URL
- Verify Next.js Image domains configured

```javascript
// next.config.mjs
export default {
  images: {
    domains: [
      'your-bucket.s3.amazonaws.com',
      'your-bucket.s3.us-east-1.amazonaws.com'
    ]
  }
}
```

---

## 📊 **Flow Diagrams**

### Admin Console Authentication Flow
```
User → /admin-console
  ↓
Middleware checks auth
  ↓
If not logged in → Redirect to /auth/login
  ↓
If logged in, check role
  ↓
If not ADMIN → Redirect to /dashboard
  ↓
If ADMIN → Load admin console
  ↓
Fetch admin user data from /api/admin/me
  ↓
Render dashboard with real data
```

### Payment QR Code Upload Flow
```
Admin → Settings → Payment Settings
  ↓
Select QR code image
  ↓
Validate file (type, size)
  ↓
Preview image locally
  ↓
Click "Save Settings"
  ↓
Upload to S3 via /api/admin/upload
  ↓
Save URL to SystemSettings table
  ↓
Update UI with new QR code
  ↓
QR code now available for users in deposit flow
```

### Deposit Approval Flow
```
User submits deposit request
  ↓
Admin views in Fund Management
  ↓
Admin clicks "Approve"
  ↓
POST /api/admin/deposits
  ↓
Validate request
  ↓
Update TradingAccount balance
  ↓
Create Transaction record
  ↓
Update Deposit status to COMPLETED
  ↓
User sees updated balance
```

---

## 🎨 **Best Practices**

### 1. Error Handling
```typescript
// ✅ Good: Comprehensive error handling
try {
  const result = await uploadFile()
  if (!result.success) {
    toast({
      title: "Upload Failed",
      description: result.message,
      variant: "destructive"
    })
    return
  }
  // Continue processing
} catch (error) {
  console.error("Upload error:", error)
  toast({
    title: "Error",
    description: "An unexpected error occurred",
    variant: "destructive"
  })
}
```

### 2. Logging
```typescript
// ✅ Good: Detailed logging
console.log("📤 [UPLOAD] Starting upload...")
console.log("📋 [UPLOAD] File:", file.name, file.size)
console.log("✅ [UPLOAD] Upload successful")
console.error("❌ [UPLOAD] Upload failed:", error)
```

### 3. Validation
```typescript
// ✅ Good: Client and server-side validation
// Client-side
if (!file.type.startsWith('image/')) {
  return toast({ title: "Invalid file type" })
}

// Server-side
if (!allowedTypes.includes(file.type)) {
  return NextResponse.json({ error: "Invalid type" }, { status: 400 })
}
```

---

## 🚀 **Future Enhancements**

- [ ] API Management interface (API keys, webhooks)
- [ ] User Segmentation and Groups management
- [ ] Advanced Search & Export functionality
- [ ] Compliance & Reporting tools
- [ ] Two-factor authentication for admins
- [ ] Role-based permissions (fine-grained)
- [ ] Real-time WebSocket updates for all dashboards
- [ ] Scheduled reports and email notifications
- [ ] Custom dashboard widgets
- [ ] Data visualization enhancements

---

## 🏢 **Enterprise Features**

### ✅ **1. Advanced Analytics Dashboard**
- **Location:** `/admin-console?tab=analytics`
- **Features:**
  - Real-time KPIs (Revenue, Trades, Active Users, Avg Order Value)
  - Conversion rate and churn rate tracking
  - Revenue trend visualization
  - Top performing users leaderboard
  - Trading volume by instrument
  - Time range filters (24h, 7d, 30d, 90d, 1y)
  - Export functionality
- **API:** `GET /api/admin/analytics?range={range}`

### ✅ **2. Audit Trail System**
- **Location:** `/admin-console?tab=audit`
- **Features:**
  - Comprehensive activity logging
  - Search functionality
  - Filter by severity (LOW, MEDIUM, HIGH, CRITICAL)
  - Filter by status (SUCCESS, FAILED, PENDING)
  - Filter by action type
  - Date range filtering
  - Pagination support
  - Export audit logs
- **API:** `GET /api/admin/audit?page={page}&limit={limit}&search={search}&severity={severity}&status={status}&action={action}&dateFrom={dateFrom}&dateTo={dateTo}`

### ✅ **3. Risk Management Dashboard**
- **Location:** `/admin-console?tab=risk`
- **Features:**
  - Risk limit management (daily loss, position size, leverage, daily trades)
  - Real-time risk alerts
  - Alert severity levels (LOW, MEDIUM, HIGH, CRITICAL)
  - Alert resolution tracking
  - User-specific risk limits
  - Risk overview cards (Active Limits, Active Alerts, Critical Alerts, Users at Risk)
- **APIs:**
  - `GET /api/admin/risk/limits` - Get all risk limits
  - `POST /api/admin/risk/limits` - Create risk limit
  - `PUT /api/admin/risk/limits/{id}` - Update risk limit
  - `GET /api/admin/risk/alerts` - Get risk alerts
  - `POST /api/admin/risk/alerts/{id}/resolve` - Resolve alert

### ✅ **4. System Health Monitoring**
- **Location:** `/admin-console?tab=system-health`
- **Features:**
  - Real-time system metrics (CPU, Memory, Disk, Network)
  - Service status monitoring (API Server, Database, WebSocket, Cache)
  - Uptime tracking
  - Response time monitoring
  - Auto-refresh every 30 seconds
  - Visual health indicators
- **API:** `GET /api/admin/system/health`

### ✅ **5. Financial Reports**
- **Location:** `/admin-console?tab=financial-reports`
- **Features:**
  - Revenue, expenses, profit, and commission tracking
  - Period-based reporting (Daily, Weekly, Monthly, Quarterly, Yearly)
  - Date range filtering
  - Summary cards with totals
  - Detailed reports table
  - PDF export functionality
- **API:** `GET /api/admin/financial/reports?period={period}&dateFrom={dateFrom}&dateTo={dateTo}`

### ✅ **6. Notification Center**
- **Location:** `/admin-console?tab=notifications`
- **Features:**
  - Create system-wide notifications
  - Notification types (INFO, WARNING, ERROR, SUCCESS)
  - Priority levels (LOW, MEDIUM, HIGH, URGENT)
  - Target audience selection (ALL, ADMINS, USERS, SPECIFIC)
  - Notification management
  - Read/unread status tracking
- **APIs:**
  - `GET /api/admin/notifications` - Get all notifications
  - `POST /api/admin/notifications` - Create notification

---

## 📝 **Change Log**

### v4.0 - 2025-01-27 - Enterprise Platform Features
- ✅ **Advanced Analytics Dashboard**: Comprehensive analytics with KPIs, charts, and metrics
  - Real-time revenue, trades, and user metrics
  - Revenue trend visualization
  - Top performing users leaderboard
  - Trading volume analysis
  - Time range filters and export functionality
- ✅ **Audit Trail System**: Complete activity logging and compliance tracking
  - Comprehensive search and filtering
  - Severity and status filtering
  - Date range filtering
  - Pagination and export support
- ✅ **Risk Management Dashboard**: Enterprise-grade risk monitoring and control
  - Risk limit management (daily loss, position size, leverage, daily trades)
  - Real-time risk alerts with severity levels
  - Alert resolution tracking
  - User-specific risk limits
- ✅ **System Health Monitoring**: Real-time system diagnostics and monitoring
  - CPU, Memory, Disk, Network metrics
  - Service status monitoring (API, Database, WebSocket, Cache)
  - Uptime and response time tracking
  - Auto-refresh capabilities
- ✅ **Financial Reports**: Comprehensive financial reporting and analysis
  - Revenue, expenses, profit, and commission tracking
  - Period-based reporting (Daily, Weekly, Monthly, Quarterly, Yearly)
  - Date range filtering
  - PDF export functionality
- ✅ **Notification Center**: System-wide announcement and alert management
  - Create and manage notifications
  - Multiple notification types and priority levels
  - Target audience selection
  - Read/unread status tracking
- ✅ **New API Endpoints**: 10+ new enterprise API endpoints
- ✅ **New Components**: 6 new enterprise-grade components
- ✅ **Enhanced UI**: Modern, responsive design with comprehensive features

### v3.0 - 2025-01-27 - Enhanced User Management System
- ✅ **Comprehensive User Management**: Complete overhaul of user management with advanced features
  - Advanced filtering (status, KYC, role, date range)
  - Bulk operations (activate/deactivate multiple users)
  - Full profile editing (name, email, phone, role, status, bio)
  - Credential management (password and MPIN reset)
  - KYC management (approve/reject with reasons)
  - User activity log (comprehensive timeline of all activities)
  - Account freeze/unfreeze functionality
  - Manual contact verification
- ✅ **New API Endpoints**: 7 new endpoints for comprehensive user management
- ✅ **New Components**: 3 new dialog components for enhanced user management
- ✅ **Enhanced Service Layer**: AdminUserService expanded with 8 new methods
- ✅ **Better UX**: Improved UI with filters, bulk actions, and comprehensive dialogs

### v2.1 - 2025-01-27 - Maintenance Mode & Market Controls Update
- ✅ **Maintenance Mode Migration**: Migrated from environment variables to database-backed configuration
  - Added Maintenance Mode tab in admin console settings
  - Database storage in `SystemSettings` table (category: `MAINTENANCE`)
  - Caching mechanism (5-second TTL) for performance
  - Backward compatibility with environment variable fallback
  - Edge runtime compatibility via API route wrapper
- ✅ **Market Controls Fix**: Fixed force closed toggle to properly work
  - Updated market timing functions to check `market_force_closed` first
  - Created server-side market timing helpers with DB access
  - Added client-side cache for force closed status
  - Market controls now work correctly in UI and order processing
- ✅ **New APIs**: Added maintenance and market status endpoints
- ✅ **Documentation**: Updated with new features and APIs

### v2.0 - Current Release
- ✅ Fixed authentication issues
- ✅ Added AWS S3 integration
- ✅ Implemented payment QR code upload
- ✅ Added profile image upload
- ✅ Real admin data in header
- ✅ System settings management
- ✅ Comprehensive documentation

### v1.0 - Initial Release
- Dashboard with mock data
- User management
- Fund management
- Logs terminal

---

## 👥 **Support**

For issues or questions:
1. Check this documentation
2. Review console logs (browser & server)
3. Check environment variables
4. Verify database schema
5. Test API endpoints directly

---

**Last Updated:** January 27, 2025
**Version:** 4.0
**Status:** ✅ Production Ready - Enterprise Platform