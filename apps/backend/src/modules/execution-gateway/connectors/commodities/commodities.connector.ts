/**
 * @file src/modules/execution-gateway/connectors/commodities/commodities.connector.ts
 * @module execution-gateway
 * @description Commodities connector pack scaffold
 * @author BharatERP
 * @created 2026-02-17
 */

import { Injectable } from '@nestjs/common';
import { AppLoggerService } from '../../../../shared/logger';
import { BaseExecutionConnector } from '../base/base-execution.connector';
import { ConnectorFamily } from '../contracts/execution-gateway.contract';

@Injectable()
export class CommoditiesConnector extends BaseExecutionConnector {
  readonly family: ConnectorFamily = 'COMMODITIES';

  constructor(logger: AppLoggerService) {
    super(logger);
  }
}
