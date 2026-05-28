/**
 * @file src/modules/execution-gateway/tests/crypto-cex.contract.spec.ts
 * @module execution-gateway
 * @description Contract test for crypto CEX connector pack
 * @author BharatERP
 * @created 2026-02-17
 */

import { AppLoggerService } from '../../../shared/logger';
import { CryptoCexConnector } from '../connectors/crypto-cex/crypto-cex.connector';
import { assertConnectorContract } from './connector-contract.harness';

describe('CryptoCexConnector contract', () => {
  it('satisfies canonical connector contract', async () => {
    const connector = new CryptoCexConnector({ debug: jest.fn() } as unknown as AppLoggerService);
    await assertConnectorContract(connector);
  });
});
