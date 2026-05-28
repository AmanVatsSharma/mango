/**
 * @file src/modules/execution-gateway/tests/commodities.contract.spec.ts
 * @module execution-gateway
 * @description Contract test for commodities connector pack
 * @author BharatERP
 * @created 2026-02-17
 */

import { AppLoggerService } from '../../../shared/logger';
import { CommoditiesConnector } from '../connectors/commodities/commodities.connector';
import { assertConnectorContract } from './connector-contract.harness';

describe('CommoditiesConnector contract', () => {
  it('satisfies canonical connector contract', async () => {
    const connector = new CommoditiesConnector({ debug: jest.fn() } as unknown as AppLoggerService);
    await assertConnectorContract(connector);
  });
});
