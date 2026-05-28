/**
 * @file src/modules/execution-gateway/tests/fx-cfd.contract.spec.ts
 * @module execution-gateway
 * @description Contract test for FX/CFD connector pack
 * @author BharatERP
 * @created 2026-02-17
 */

import { AppLoggerService } from '../../../shared/logger';
import { FxCfdConnector } from '../connectors/fx-cfd/fx-cfd.connector';
import { assertConnectorContract } from './connector-contract.harness';

describe('FxCfdConnector contract', () => {
  it('satisfies canonical connector contract', async () => {
    const connector = new FxCfdConnector({ debug: jest.fn() } as unknown as AppLoggerService);
    await assertConnectorContract(connector);
  });
});
