// tests/__mocks__/bcryptjs.js
// Mock bcryptjs — returns real bcrypt-like format so tests can verify structure
const MOCK_HASH_PREFIX = "$2b$10$mockedsalthash000000"
module.exports = {
  hash: jest.fn((str) => Promise.resolve(`${MOCK_HASH_PREFIX}${str.slice(0, 4)}`)),
  compare: jest.fn((str, hash) => Promise.resolve(hash && hash.includes(MOCK_HASH_PREFIX))),
  genSalt: jest.fn(() => Promise.resolve("$2b$10$salt")),
}