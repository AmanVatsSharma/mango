# Market Timing - Segment-Aware Implementation

## Overview
The trading platform now correctly handles different market timings based on the instrument segment:
- **MCX (Commodities)**: 09:00 AM - 11:55 PM IST (Mon-Fri)
- **NSE (Equity, Futures, Options)**: 09:15 AM - 3:30 PM IST (Mon-Fri)
  - Pre-Open: 09:00 AM - 09:15 AM IST (orders blocked)

## Implementation

### Server-Side (API Validation)
**File**: `lib/server/market-timing.ts`

The `getSegmentTradingSession()` function:
- Checks segment (MCX vs NSE)
- Validates market hours accordingly
- Returns session status and reason

**Usage in API**: `app/api/trading/orders/route.ts`
- Validates orders before processing
- Blocks orders outside trading hours
- Returns appropriate error messages

### Client-Side (UI Validation)
**File**: `lib/hooks/market-timing.ts`

New function `getSegmentMarketSession()`:
- Client-side segment-aware market session check
- Matches server-side logic
- Used in OrderDialog for instant validation

**Usage in UI**: `components/OrderDialog.tsx`
- Shows segment-specific error messages
- Blocks order placement outside trading hours
- Displays correct market hours in banners

## Market Timings

### MCX (Commodities)
- **Trading Hours**: 09:00 AM - 11:55 PM IST
- **Days**: Monday - Friday
- **Segments**: MCX, MCX_FO, MCXFO

### NSE (Equity, Futures, Options)
- **Trading Hours**: 09:15 AM - 3:30 PM IST
- **Pre-Open**: 09:00 AM - 09:15 AM IST (orders blocked)
- **Days**: Monday - Friday
- **Segments**: NSE, NSE_EQ, NSE_FO, NFO, EQ

## Error Messages

### MCX Orders
- **Outside Hours**: "MCX orders are accepted between 09:00–23:55 IST"
- **UI Banner**: "Market Closed: MCX orders are allowed between 09:00–23:55 IST."

### NSE Orders
- **Outside Hours**: "NSE trading hours are 09:15–15:30 IST"
- **Pre-Open**: "NSE pre-open window 09:00–09:15 IST"
- **UI Banner**: "Market Closed: NSE orders are allowed between 09:15–15:30 IST."

## Testing Checklist

- [x] MCX orders allowed 09:00-23:55 IST
- [x] MCX orders blocked outside 09:00-23:55 IST
- [x] NSE orders allowed 09:15-15:30 IST
- [x] NSE orders blocked 09:00-09:15 IST (pre-open)
- [x] NSE orders blocked outside 09:15-15:30 IST
- [x] Weekend orders blocked for all segments
- [x] Error messages show correct timings per segment
- [x] Server-side validation matches client-side

## Code Changes

### Added
- `getSegmentMarketSession()` in `lib/hooks/market-timing.ts`
- Segment-aware validation in `components/OrderDialog.tsx`

### Modified
- OrderDialog now uses segment-aware market timing
- Error messages are segment-specific
- Market status banners show correct hours per segment

### Existing (Already Working)
- Server-side `getSegmentTradingSession()` in `lib/server/market-timing.ts`
- API validation in `app/api/trading/orders/route.ts`

## Notes

- Force-closed setting overrides all market timings
- NSE holidays apply to NSE segments only
- MCX segments don't check NSE holidays
- Weekend check applies to all segments
- All times are in IST (Asia/Kolkata timezone)
