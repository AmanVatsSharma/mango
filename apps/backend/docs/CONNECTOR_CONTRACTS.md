# Execution Connector Contracts

## Scope
Canonical connector interface used by `execution-gateway` and consumed by OMS through
`OmsExecutionGatewayAdapter`.

## Supported Families (Scaffold)
- `FX_CFD`
- `EQUITIES_FNO`
- `US_EQUITIES_OPTIONS`
- `CRYPTO_CEX`
- `COMMODITIES`

## Contract Responsibilities
- Order lifecycle:
  - `placeOrder`
  - `modifyOrder`
  - `cancelOrder`
- Market/account references:
  - `getPositions`
  - `getBalances`
  - `listSymbols`
- Session and webhooks:
  - `getSession`
  - `handleWebhook`

## Contract Test Harness
- Shared harness: `apps/backend/src/modules/execution-gateway/tests/connector-contract.harness.ts`
- Per-pack tests:
  - `fx-cfd.contract.spec.ts`
  - `equities-fno.contract.spec.ts`
  - `us-equities-options.contract.spec.ts`
  - `crypto-cex.contract.spec.ts`
  - `commodities.contract.spec.ts`

## CI Wiring
- Script: `npm run test:contracts`
- CI step: `Connector contract tests` in `.github/workflows/ci.yml`

## Integration Path
1. OMS constructs normalized order payloads.
2. `OmsExecutionGatewayAdapter` resolves connector family and calls `ExecutionGatewayService`.
3. Execution gateway routes to family-specific connector implementation.
4. Connector response maps back into OMS lifecycle and audit/realtime events.
