/**
 * File:        scripts/test-ws-uir.mjs
 * Purpose:     Live smoke-test for marketdata.vedpragya.com WS — subscribe Nifty & BankNifty
 *              via multiple key formats (canonical, exchange-token, numeric) and print raw ticks.
 *
 * Run:  node scripts/test-ws-uir.mjs
 */

import { io } from 'socket.io-client';

const WS_URL = 'https://marketdata.vedpragya.com/market-data';
const API_KEY = 'demo-key-1';
const TIMEOUT_MS = 20_000;

// Three key formats we want to verify
const SUBSCRIBE_PAYLOAD = {
  mode: 'ltp',
  // Canonical UIR format — "EXCHANGE:SYMBOL" — the format watchlist now uses
  symbols: ['NSE:NIFTY 50', 'NSE:NIFTY BANK'],
  // Exchange-token format — what positions currently use
  instruments: ['NSE_EQ-26000', 'NSE_EQ-26009'],
};

console.log('\n══════════════════════════════════════════════════════');
console.log('  WS UIR smoke-test  →  marketdata.vedpragya.com');
console.log('══════════════════════════════════════════════════════');
console.log('URL     :', WS_URL);
console.log('Payload :', JSON.stringify(SUBSCRIBE_PAYLOAD, null, 2));
console.log('──────────────────────────────────────────────────────\n');

const receivedTicks = [];
let confirmed = false;

const socket = io(WS_URL, {
  query: { api_key: API_KEY },
  transports: ['websocket', 'polling'],
  reconnection: false,
  timeout: 10_000,
});

socket.on('connect', () => {
  console.log('✅ connected  socketId =', socket.id);
  socket.emit('subscribe', SUBSCRIBE_PAYLOAD);
  console.log('📡 subscribe emitted');
});

socket.on('connected', (data) => {
  console.log('📨 connected event from server:', JSON.stringify(data, null, 2));
});

socket.on('subscription_confirmed', (data) => {
  confirmed = true;
  console.log('\n📋 subscription_confirmed:');
  console.log(JSON.stringify(data, null, 2));
});

socket.on('market_data', (data) => {
  receivedTicks.push(data);
  const idx = receivedTicks.length;
  console.log(`\n📊 tick #${idx}:`);
  console.log(JSON.stringify(data, null, 2));

  // After 6 ticks (3 per instrument × 2) stop and summarise
  if (idx >= 6) finish();
});

socket.on('error', (err) => {
  console.error('❌ error event:', err);
});

socket.on('connect_error', (err) => {
  console.error('❌ connect_error:', err.message);
  finish();
});

socket.on('disconnect', (reason) => {
  console.log('🔌 disconnected:', reason);
});

function finish() {
  socket.disconnect();

  console.log('\n══════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('══════════════════════════════════════════════════════');
  console.log('subscription_confirmed:', confirmed);
  console.log('ticks received        :', receivedTicks.length);

  // Show unique keys present on the tick objects
  const allKeys = new Set(receivedTicks.flatMap(Object.keys));
  console.log('\nTop-level keys on tick:', [...allKeys]);

  // Show the keys present inside data.data (if any)
  const dataKeys = new Set(receivedTicks.flatMap(t => t.data ? Object.keys(t.data) : []));
  if (dataKeys.size) console.log('Keys inside tick.data  :', [...dataKeys]);

  // Per-tick: instrumentToken + uirId alignment check
  console.log('\nToken / UIR alignment:');
  for (const t of receivedTicks) {
    console.log(`  instrumentToken=${t.instrumentToken}  uirId=${t.uirId}  same=${t.instrumentToken === t.uirId}  ltp=${t.data?.last_price ?? t.last_price ?? '?'}`);
  }

  console.log('\n──────────────────────────────────────────────────────');
  process.exit(0);
}

setTimeout(() => {
  console.log('\n⏱  timeout — forcing finish');
  finish();
}, TIMEOUT_MS);
