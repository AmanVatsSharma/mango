// tests/__mocks__/credentials-provider.js
// Stub for next-auth/providers/credentials in Jest test environment
// auth.ts imports as: `import C from "next-auth/providers/credentials"; C({...})`
// Must be callable AND have a .default for transpiler interop.
function CredentialsProvider(opts) {
  return {
    id: opts?.id || "credentials",
    name: opts?.name || "credentials",
    credentials: opts?.credentials || {},
    authorize: opts?.authorize || jest.fn(),
  }
}
// Allow C.default() pattern too
CredentialsProvider.default = CredentialsProvider

module.exports = CredentialsProvider