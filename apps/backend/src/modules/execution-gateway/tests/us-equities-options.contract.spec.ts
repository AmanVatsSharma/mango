/**
 * @file src/modules/execution-gateway/tests/us-equities-options.contract.spec.ts
 * @module execution-gateway
 * @description Contract test for US equities/options connector pack
 * @author BharatERP
 * @created 2026-02-17
 */

import { AppLoggerService } from '../../../shared/logger';
import { UsEquitiesOptionsConnector } from '../connectors/us-equities-options/us-equities-options.connector';
import { assertConnectorContract } from './connector-contract.harness';

describe('UsEquitiesOptionsConnector contract', () => {
  it('satisfies canonical connector contract', async () => {
    const connector = new UsEquitiesOptionsConnector({
      debug: jest.fn(),
    } as unknown as AppLoggerService);
    await assertConnectorContract(connector);
  });
});
