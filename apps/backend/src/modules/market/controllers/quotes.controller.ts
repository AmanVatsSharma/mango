/**
 * @file src/modules/market/controllers/quotes.controller.ts
 * @module market
 * @description Quotes controller exposes snapshots and subscription endpoints
 * @author BharatERP
 * @created 2025-09-19
 */

import { Body, Controller, Post, Sse, UseGuards } from '@nestjs/common';
import { PriceFeedService } from '../services/price-feed.service';
import { AppLoggerService } from '../../../shared/logger';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Tenant } from '../../rbac/decorators/tenant.decorator';
import { WatchlistsService } from '../services/watchlists.service';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@Controller('market/quotes')
@ApiTags('Quotes')
export class QuotesController {
  constructor(
    private readonly priceFeed: PriceFeedService,
    private readonly watchlists: WatchlistsService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(QuotesController.name);
  }

  @Post('snapshot')
  @ApiOperation({ summary: 'Snapshot quotes for symbols' })
  @ApiBody({
    schema: {
      properties: {
        symbols: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              exchange: { type: 'string', example: 'NSE' },
              symbol: { type: 'string', example: 'RELIANCE' },
            },
            required: ['exchange', 'symbol'],
          },
          example: [
            { exchange: 'NSE', symbol: 'RELIANCE' },
            { exchange: 'NSE', symbol: 'TCS' },
          ],
        },
      },
      required: ['symbols'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Map of symbol to quote',
    schema: {
      example: {
        'NSE:RELIANCE': { ltp: 2710.5, change: 0.45, asOf: '2025-09-24T00:00:00Z' },
        'NSE:TCS': { ltp: 3950.0, change: -0.12, asOf: '2025-09-24T00:00:00Z' },
      },
    },
  })
  snapshot(
    @Body()
    body: {
      symbols: Array<{ exchange: string; symbol: string }>;
    },
  ) {
    this.logger.debug('POST /market/quotes/snapshot', body);
    return this.priceFeed.getSnapshot(body.symbols);
  }

  @Post('subscribe')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 10_000, limit: 10 } })
  subscribe(
    @Body()
    body: {
      subscriberId: string;
      symbols: Array<{ exchange: string; symbol: string }>;
    },
  ) {
    this.logger.debug('POST /market/quotes/subscribe', {
      subscriberId: body.subscriberId,
      count: body.symbols.length,
    });
    this.priceFeed.subscribe(body.subscriberId, body.symbols);
    return { subscribed: true };
  }

  @Post('unsubscribe')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 10_000, limit: 10 } })
  unsubscribe(
    @Body()
    body: {
      subscriberId: string;
      symbols?: Array<{ exchange: string; symbol: string }>;
    },
  ) {
    this.logger.debug('POST /market/quotes/unsubscribe', {
      subscriberId: body.subscriberId,
      count: body.symbols?.length ?? 'all',
    });
    this.priceFeed.unsubscribe(body.subscriberId, body.symbols);
    return { unsubscribed: true };
  }

  @Sse('stream')
  @UseGuards(JwtAuthGuard)
  async stream(
    @Tenant() tenantId: string,
    req: any,
  ): Promise<Observable<{ data: unknown }>> {
    const userId = req.user.userId as string;
    this.logger.debug('SSE stream connected; auto-subscribing watchlists', {
      userId,
    });
    const lists = await this.watchlists.list(tenantId, userId);
    const allItems = (
      await Promise.all(lists.map((wl) => this.watchlists.listItems(wl.id)))
    ).flat();
    // Assuming instrumentId maps to InstrumentEntity.id and we can derive exchange/symbol via a lookup later.
    // For now, we expect client to subscribe explicitly with exchange/symbol mapping after initial snapshot.
    // If we had a mapping, we would call priceFeed.subscribe(userId, mappedSymbols) here.
    return this.priceFeed.onQuotes$().pipe(map((data) => ({ data })));
  }
}
