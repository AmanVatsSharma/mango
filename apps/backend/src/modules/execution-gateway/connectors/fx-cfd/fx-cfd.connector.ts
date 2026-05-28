/**
 * @file src/modules/execution-gateway/connectors/fx-cfd/fx-cfd.connector.ts
 * @module execution-gateway
 * @description FX/CFD connector pack scaffold
 * @author BharatERP
 * @created 2026-02-17
 */

import { Injectable } from '@nestjs/common';
import { AppLoggerService } from '../../../../shared/logger';
import { BaseExecutionConnector } from '../base/base-execution.connector';
import { ConnectorFamily } from '../contracts/execution-gateway.contract';

@Injectable()
export class FxCfdConnector extends BaseExecutionConnector {
  readonly family: ConnectorFamily = 'FX_CFD';

  constructor(logger: AppLoggerService) {
    super(logger);
  }
}
