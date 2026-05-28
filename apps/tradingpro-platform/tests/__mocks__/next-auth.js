// tests/__mocks__/next-auth.js
// Stub for next-auth and @auth/core in Jest test environment (ESM-only packages)
//
// auth.ts imports as:
//   import NextAuth from "next-auth"
//   import CredentialsProvider from "next-auth/providers/credentials"
//   import { PrismaAdapter } from "@auth/prisma-adapter"
//   import { CredentialsSignin } from "next-auth"
// So module.exports must be callable (NextAuth), and also carry named exports.

function CredentialsSignin() {
  this.code = "unknown"
  this.message = ""
}
CredentialsSignin.prototype = Object.create(Error.prototype)
CredentialsSignin.prototype.constructor = CredentialsSignin

function PrismaAdapter() {}
PrismaAdapter.prototype.getAdapter = jest.fn()

const namedExports = {
  Auth: jest.fn(),
  customFetch: jest.fn(),
  signIn: jest.fn(),
  signOut: jest.fn(),
  auth: jest.fn(),
  CredentialsSignin,
  PrismaAdapter,
  decode: jest.fn(), // used by /api/account/demo route
}

// Make the module callable — NextAuth(authOptions) pattern
function NextAuth(...args) {
  return namedExports
}
NextAuth.prototype = Object.create(Function.prototype)
NextAuth.auth = namedExports.auth
NextAuth.signIn = namedExports.signIn
NextAuth.signOut = namedExports.signOut
NextAuth.Auth = namedExports.Auth

module.exports = Object.assign(NextAuth, namedExports)
module.exports.default = NextAuth