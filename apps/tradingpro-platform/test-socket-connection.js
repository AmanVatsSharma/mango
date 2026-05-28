/**
 * @file test-socket-connection.js
 * @description Standalone test script for Socket.IO connection to Vedpragya Market Data API
 * 
 * PURPOSE:
 * - Test Socket.IO connection independently from React app
 * - Verify connection, authentication, and subscription functionality
 * - Debug connection issues
 * 
 * USAGE:
 * node test-socket-connection.js
 * 
 * REQUIRES:
 * npm install socket.io-client
 */

const { io } = require('socket.io-client');

// Configuration
const SOCKET_URL = 'https://marketdata.vedpragya.com/market-data';
const API_KEY = 'demo-key-1';
const TEST_INSTRUMENT = 26000; // Nifty 50

console.log('🚀 Starting Socket.IO Connection Test');
console.log('=====================================');
console.log(`URL: ${SOCKET_URL}`);
console.log(`API Key: ${API_KEY}`);
console.log(`Test Instrument: ${TEST_INSTRUMENT}`);
console.log('=====================================\n');

// Create Socket.IO connection
console.log('🔌 Connecting to Socket.IO server...');

const socket = io(SOCKET_URL, {
  query: {
    'api_key': API_KEY
  },
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5,
  timeout: 10000,
  // Debug options
  forceNew: true,
  // Don't use manual path - let Socket.IO handle it
});

// Connection events
let connectionStartTime = Date.now();

socket.on('connect', () => {
  const connectionTime = Date.now() - connectionStartTime;
  console.log('\n✅ ✅ ✅ CONNECTED SUCCESSFULLY! ✅ ✅ ✅');
  console.log(`Socket ID: ${socket.id}`);
  console.log(`Connection Time: ${connectionTime}ms`);
  console.log(`Transport: ${socket.io.engine.transport.name}`);
  console.log('\n');
  
  // Try subscribing after connection
  setTimeout(() => {
    console.log(`📡 Subscribing to instrument ${TEST_INSTRUMENT}...`);
    socket.emit('subscribe', {
      instruments: [TEST_INSTRUMENT],
      mode: 'ltp'
    });
  }, 1000);
});

socket.on('connected', (data) => {
  console.log('📥 Server confirmation received:');
  console.log('   Message:', data.message);
  console.log('   Client ID:', data.clientId);
  console.log('   Timestamp:', data.timestamp);
  console.log('\n');
});

socket.on('subscription_confirmed', (data) => {
  console.log('✅ Subscription Confirmed!');
  console.log('   Instruments:', data.instruments);
  console.log('   Mode:', data.mode);
  console.log('   Type:', data.type || 'N/A');
  console.log('\n');
});

socket.on('market_data', (data) => {
  console.log('📊 Market Data Received:');
  console.log('   Token:', data.instrumentToken);
  console.log('   Last Price:', data.data?.last_price);
  console.log('   Timestamp:', data.timestamp);
  if (data.data?.ohlc) {
    console.log('   OHLC:', data.data.ohlc);
  }
  console.log('\n');
});

socket.on('error', (error) => {
  console.error('❌ ERROR Event:');
  console.error('   Code:', error.code);
  console.error('   Message:', error.message);
  console.error('   Full Error:', JSON.stringify(error, null, 2));
  console.error('\n');
});

socket.on('connect_error', (error) => {
  console.error('❌ CONNECTION ERROR:');
  console.error('   Message:', error.message);
  console.error('   Type:', error.type);
  console.error('   Description:', error.description);
  console.error('   Full Error:', JSON.stringify(error, null, 2));
  console.error('\n');
});

socket.on('disconnect', (reason) => {
  console.log('⚠️ Disconnected:');
  console.log('   Reason:', reason);
  console.log('\n');
  
  if (reason === 'io server disconnect') {
    // Server disconnected, reconnect manually
    console.log('🔄 Server disconnected. Reconnecting...');
    socket.connect();
  }
});

socket.on('reconnect', (attemptNumber) => {
  console.log(`🔄 Reconnected after ${attemptNumber} attempts\n`);
});

socket.on('reconnect_attempt', (attemptNumber) => {
  console.log(`🔄 Reconnect attempt ${attemptNumber}...\n`);
});

socket.on('reconnect_error', (error) => {
  console.error(`❌ Reconnect error: ${error.message}\n`);
});

socket.on('reconnect_failed', () => {
  console.error('❌ Failed to reconnect after all attempts\n');
});

// Keep the script running
process.on('SIGINT', () => {
  console.log('\n\n👋 Disconnecting and exiting...');
  socket.disconnect();
  process.exit(0);
});

// Timeout after 30 seconds if no connection
setTimeout(() => {
  if (!socket.connected) {
    console.error('\n❌ Connection timeout after 30 seconds');
    console.error('   Socket State:', socket.connected ? 'connected' : 'disconnected');
    console.error('   Socket ID:', socket.id || 'none');
    console.error('\n');
    console.error('Debugging Information:');
    console.error('   - Check if URL is correct:', SOCKET_URL);
    console.error('   - Check if API key is valid:', API_KEY);
    console.error('   - Check network connection');
    console.error('   - Check browser console if running in browser');
    console.error('\n');
    socket.disconnect();
    process.exit(1);
  }
}, 30000);

console.log('⏳ Waiting for connection...');
console.log('   (Press Ctrl+C to exit)\n');

