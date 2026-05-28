/**
 * @file src/modules/execution-gateway/connectors/crypto-cex/crypto-cex.connector.ts
 * @module execution-gateway
 * @description Crypto centralized exchange connector pack scaffold
 * @author BharatERP
 * @created 2026-02-17
 */

import { Injectable } from '@nestjs/common';
import { AppLoggerService } from '../../../../shared/logger';
import { BaseExecutionConnector } from '../base/base-execution.connector';
import { ConnectorFamily } from '../contracts/execution-gateway.contract';

@Injectable()
export class CryptoCexConnector extends BaseExecutionConnector {
  readonly family: ConnectorFamily = 'CRYPTO_CEX';

  constructor(logger: AppLoggerService) {
    super(logger);
  }
}
