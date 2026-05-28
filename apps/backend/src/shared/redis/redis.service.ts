/**
 * @file src/shared/redis/redis.service.ts
 * @module shared
 * @description Redis wrapper service using ioredis
 * @author BharatERP
 * @created 2025-09-19
 */

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { AppLoggerService } from '../logger';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private client?: Redis;

  constructor(private readonly logger: AppLoggerService) {
    this.logger.setContext(RedisService.name);
    const url = process.env.REDIS_URL;
    if (url) {
      this.client = new Redis(url, { lazyConnect: true });
      this.client.on('error', (err) =>
        this.logger.error('Redis error', err?.stack),
      );
      this.client
        .connect()
        .catch((e) => this.logger.error('Redis connect failed', e?.stack));
    } else {
      this.logger.warn('REDIS_URL not set; OTP throttling disabled');
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) await this.client.quit();
  }

  getClient(): Redis | undefined {
    return this.client;
  }

  async setWithTtl(key: string, value: string, seconds: number): Promise<void> {
    if (!this.client) return;
    await this.client.set(key, value, 'EX', seconds);
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    return this.client.get(key);
  }

  async incrWithTtl(key: string, seconds: number): Promise<number> {
    if (!this.client) return 1;
    const multi = this.client.multi();
    multi.incr(key);
    multi.expire(key, seconds, 'NX');
    const res = await multi.exec();
    const incrVal = (res?.[0]?.[1] as number) || 1;
    return incrVal;
  }
}
