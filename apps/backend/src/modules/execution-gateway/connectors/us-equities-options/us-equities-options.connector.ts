/**
 * @file src/modules/execution-gateway/connectors/us-equities-options/us-equities-options.connector.ts
 * @module execution-gateway
 * @description US equities and options connector pack scaffold
 * @author BharatERP
 * @created 2026-02-17
 */

import { Injectable } from '@nestjs/common';
import { AppLoggerService } from '../../../../shared/logger';
import { BaseExecutionConnector } from '../base/base-execution.connector';
import { ConnectorFamily } from '../contracts/execution-gateway.contract';

@Injectable()
export class UsEquitiesOptionsConnector extends BaseExecutionConnector {
  readonly family: ConnectorFamily = 'US_EQUITIES_OPTIONS';

  constructor(logger: AppLoggerService) {
    super(logger);
  }
}
