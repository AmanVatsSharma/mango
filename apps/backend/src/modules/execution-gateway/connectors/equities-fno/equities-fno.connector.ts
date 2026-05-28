/**
 * @file src/modules/execution-gateway/connectors/equities-fno/equities-fno.connector.ts
 * @module execution-gateway
 * @description Equities and F&O connector pack scaffold
 * @author BharatERP
 * @created 2026-02-17
 */

import { Injectable } from '@nestjs/common';
import { AppLoggerService } from '../../../../shared/logger';
import { BaseExecutionConnector } from '../base/base-execution.connector';
import { ConnectorFamily } from '../contracts/execution-gateway.contract';

@Injectable()
export class EquitiesFnoConnector extends BaseExecutionConnector {
  readonly family: ConnectorFamily = 'EQUITIES_FNO';

  constructor(logger: AppLoggerService) {
    super(logger);
  }
}
