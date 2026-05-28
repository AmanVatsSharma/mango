/**
 * @file src/modules/execution-gateway/tests/equities-fno.contract.spec.ts
 * @module execution-gateway
 * @description Contract test for equities and F&O connector pack
 * @author BharatERP
 * @created 2026-02-17
 */

import { AppLoggerService } from '../../../shared/logger';
import { EquitiesFnoConnector } from '../connectors/equities-fno/equities-fno.connector';
import { assertConnectorContract } from './connector-contract.harness';

describe('EquitiesFnoConnector contract', () => {
  it('satisfies canonical connector contract', async () => {
    const connector = new EquitiesFnoConnector({ debug: jest.fn() } as unknown as AppLoggerService);
    await assertConnectorContract(connector);
  });
});
