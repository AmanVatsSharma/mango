## MiniChart (Lightweight Charts)

Overview
- Compact area chart for watchlist items using `lightweight-charts`.
- Keeps existing API: `symbol`, `currentPrice`, `previousClose`, `height`, `className`.
- Auto-generates intraday mock data if external `data` is not provided; last point is pinned to `currentPrice`.
- Robust logs for debugging and safe cleanup on unmount/resizes.

Install
```bash
npm i lightweight-charts
```

Flow
```
[mount] -> [createChart + addAreaSeries] -> [setData (provided|mock)] -> [fitContent]
    |                                                  |
    |<----------------- window resize ---------------->|
    v                                                  v
[applyOptions(width)]                          [update data when inputs change]
    |
    v
[unmount] -> [remove chart + clear refs]
```

Usage
```tsx
<MiniChart
  symbol={item.symbol}
  currentPrice={ltp}
  previousClose={quote?.prev_close_price ?? item.close}
  height={100}
  className="w-full"
  // Optional: pass pre-fetched area-series points
  // data={[{ time: 1717042200, value: 254.2 }, ...]}
/>
```

Notes
- Area color switches green/red based on `currentPrice` vs `previousClose`.
- Percentage chip updates live; chart resizes to container.
- For real data, map your feed to `{ time: seconds, value: number }`.

