/**
 * @file src/shared/logger.ts
 * @module shared
 * @description Pino-based LoggerService with requestId correlation and environment-aware transports
 * @author BharatERP
 * @created 2025-09-18
 */

import pino, { Logger as PinoLogger, LoggerOptions } from 'pino';
import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import { getRequestContext } from './request-context';

function buildOptions(env: string): LoggerOptions {
  const isDev = env !== 'production';
  return {
    level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
    transport: isDev
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'IST yyyy-mm-dd HH:MM:ss.l o',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  } as LoggerOptions;
}

export function createRootLogger(): PinoLogger {
  const env = process.env.NODE_ENV || 'development';
  return pino(buildOptions(env));
}

@Injectable()
export class AppLoggerService implements NestLoggerService {
  private readonly logger: PinoLogger;
  private context?: string;

  constructor() {
    this.logger = createRootLogger();
  }

  setContext(context: string): void {
    this.context = context;
  }

  private child() {
    const ctx = getRequestContext();
    return this.logger.child({
      context: this.context,
      requestId: ctx?.requestId,
      tenantId: ctx?.tenantId,
    });
  }

  log(message: any, ...optionalParams: any[]): void {
    this.child().info({ msg: message, extra: optionalParams });
  }

  error(message: any, trace?: string, context?: string): void {
    this.child().error({ msg: message, trace, context });
  }

  warn(message: any, ...optionalParams: any[]): void {
    this.child().warn({ msg: message, extra: optionalParams });
  }

  debug(message: any, ...optionalParams: any[]): void {
    this.child().debug({ msg: message, extra: optionalParams });
  }

  verbose(message: any, ...optionalParams: any[]): void {
    this.child().trace({ msg: message, extra: optionalParams });
  }
}
