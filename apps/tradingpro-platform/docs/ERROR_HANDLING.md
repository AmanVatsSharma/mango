# Error Handling System Documentation

## Overview

This document describes the professional error handling system implemented for the MarketPulse360 trading platform. The system provides user-friendly error messages for trading clients while maintaining comprehensive error tracking and debugging capabilities.

## Architecture

### Components

1. **TradingErrorDisplay** (`components/trading/TradingErrorDisplay.tsx`)
   - Professional, trading-focused error UI component
   - User-friendly error messages based on error type
   - Multiple recovery options (Retry, Go Home, Contact Support)
   - Security assurance messaging
   - Collapsible technical details for debugging

2. **ErrorBoundary** (`components/error-boundary.tsx`)
   - React Error Boundary for catching component errors
   - Prevents entire app crashes
   - Integrates with TradingErrorDisplay
   - Logs errors and reports to tracking services

3. **GlobalErrorHandler** (`components/trading/GlobalErrorHandler.tsx`)
   - Wraps the entire application
   - Catches unhandled errors and promise rejections
   - Displays TradingErrorDisplay for global errors

4. **useGlobalErrorHandler** (`hooks/use-global-error-handler.ts`)
   - Custom hook for setting up global error handlers
   - Handles `window.onerror` and `unhandledrejection` events
   - Provides error reporting capabilities

## Error Types & Messages

The system categorizes errors and displays appropriate messages:

- **Network/Connection Errors**: "Connection Issue" - Guides users to check internet connection
- **Timeout Errors**: "Request Timeout" - Explains high market activity scenarios
- **Authentication Errors**: "Session Expired" - Prompts re-login
- **Permission Errors**: "Access Denied" - Suggests contacting support
- **Server Errors**: "Server Error" - Assures data security
- **Generic Errors**: "Application Error" - General fallback message

## Features

### User Experience
- ✅ Professional, trading-focused UI design
- ✅ Clear, non-technical error messages
- ✅ Security assurance (data safety messaging)
- ✅ Multiple recovery options
- ✅ Responsive design

### Developer Experience
- ✅ Comprehensive error logging
- ✅ Error categorization
- ✅ Technical details in development mode
- ✅ Error reporting hooks for tracking services
- ✅ TypeScript support

### Security
- ✅ User data safety assurance
- ✅ No sensitive data exposure in error messages
- ✅ Secure error reporting

## Integration

### Root Layout
The `GlobalErrorHandler` is integrated at the root layout level to catch all unhandled errors:

```tsx
<GlobalErrorHandler>
  <SessionProvider>
    {/* ... rest of app */}
  </SessionProvider>
</GlobalErrorHandler>
```

### Dashboard Page
The dashboard is wrapped with `ErrorBoundary` for component-level error handling:

```tsx
<ErrorBoundary showTechnicalDetails={process.env.NODE_ENV === 'development'}>
  <TradingDashboard />
</ErrorBoundary>
```

## Error Flow

```
┌─────────────────────────────────────┐
│   Client-Side Error Occurs          │
└──────────────┬──────────────────────┘
               │
               ├─── React Component Error
               │    └─── ErrorBoundary catches
               │         └─── TradingErrorDisplay shows
               │
               ├─── Unhandled Promise Rejection
               │    └─── GlobalErrorHandler catches
               │         └─── TradingErrorDisplay shows
               │
               └─── Synchronous Error (window.onerror)
                    └─── GlobalErrorHandler catches
                         └─── TradingErrorDisplay shows
```

## Error Reporting

Errors are logged to:
1. Browser console (with detailed context)
2. Custom error tracking service (if `window.reportError` is available)
3. TODO: Integration with Sentry/LogRocket/etc.

## Usage Examples

### Basic Error Boundary
```tsx
<ErrorBoundary>
  <YourComponent />
</ErrorBoundary>
```

### Custom Error Handler
```tsx
<ErrorBoundary
  onError={(error, errorInfo) => {
    // Custom error handling
    trackError(error, errorInfo)
  }}
>
  <YourComponent />
</ErrorBoundary>
```

### Global Error Handler Hook
```tsx
useGlobalErrorHandler({
  onError: (error, context) => {
    setError(error)
  },
  reportError: (error, context) => {
    Sentry.captureException(error, { extra: { context } })
  }
})
```

## Configuration

### Environment Variables
- `NODE_ENV`: Controls whether technical details are shown
  - `development`: Shows full error details
  - `production`: Shows user-friendly messages only

### Customization
- Error messages can be customized via `customMessage` prop
- Error reporting can be integrated via `reportError` callback
- UI can be customized by modifying `TradingErrorDisplay` component

## Best Practices

1. **Always wrap critical components** with ErrorBoundary
2. **Use GlobalErrorHandler** at the root level
3. **Provide meaningful error messages** for different error types
4. **Log errors** for debugging but don't expose sensitive data
5. **Assure users** that their data is safe
6. **Provide recovery options** (retry, go home, contact support)

## Future Enhancements

- [ ] Integrate with error tracking service (Sentry, LogRocket)
- [ ] Add error analytics dashboard
- [ ] Implement error recovery strategies
- [ ] Add offline error handling
- [ ] Create error notification system

## Changelog

### 2024-12-19
- Initial implementation of professional error handling system
- Created TradingErrorDisplay component
- Added GlobalErrorHandler wrapper
- Updated ErrorBoundary to use TradingErrorDisplay
- Integrated error handlers in root layout and dashboard
