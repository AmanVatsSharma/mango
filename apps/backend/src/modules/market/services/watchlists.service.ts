/**
 * @file src/modules/market/services/watchlists.service.ts
 * @module market
 * @description Service for user watchlists CRUD
 * @author BharatERP
 * @created 2025-09-19
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WatchlistEntity } from '../entities/watchlist.entity';
import { WatchlistItemEntity } from '../entities/watchlist-item.entity';
import { AppLoggerService } from '../../../shared/logger';
import { In } from 'typeorm';

@Injectable()
export class WatchlistsService {
  constructor(
    @InjectRepository(WatchlistEntity)
    private readonly watchlists: Repository<WatchlistEntity>,
    @InjectRepository(WatchlistItemEntity)
    private readonly items: Repository<WatchlistItemEntity>,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(WatchlistsService.name);
  }

  create(
    tenantId: string,
    userId: string,
    name: string,
  ): Promise<WatchlistEntity> {
    this.logger.debug('create watchlist', { name });
    return this.watchlists.save({ tenantId, userId, name });
  }

  list(tenantId: string, userId: string): Promise<WatchlistEntity[]> {
    this.logger.debug('list watchlists');
    return this.watchlists.find({ where: { tenantId, userId } });
  }

  async get(
    tenantId: string,
    userId: string,
    id: string,
  ): Promise<WatchlistEntity> {
    const wl = await this.watchlists.findOne({
      where: { tenantId, userId, id },
    });
    if (!wl) throw new NotFoundException('Watchlist not found');
    return wl;
  }

  async rename(
    tenantId: string,
    userId: string,
    id: string,
    name: string,
  ): Promise<WatchlistEntity> {
    const wl = await this.get(tenantId, userId, id);
    wl.name = name;
    return this.watchlists.save(wl);
  }

  async remove(tenantId: string, userId: string, id: string): Promise<void> {
    await this.items.delete({ watchlistId: id } as any);
    await this.watchlists.delete({ tenantId, userId, id } as any);
  }

  async addItem(
    watchlistId: string,
    instrumentId: string,
  ): Promise<WatchlistItemEntity> {
    this.logger.debug('add item', { watchlistId, instrumentId });
    return this.items.save({ watchlistId, instrumentId });
  }

  async removeItem(watchlistId: string, itemId: string): Promise<void> {
    await this.items.delete({ id: itemId, watchlistId } as any);
  }

  async listItems(watchlistId: string): Promise<WatchlistItemEntity[]> {
    return this.items.find({ where: { watchlistId } });
  }
}
