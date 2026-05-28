/**
 * @file src/modules/market/controllers/watchlists.controller.ts
 * @module market
 * @description Watchlists controller for CRUD and item management
 * @author BharatERP
 * @created 2025-09-19
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { WatchlistsService } from '../services/watchlists.service';
import { AppLoggerService } from '../../../shared/logger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Tenant } from '../../rbac/decorators/tenant.decorator';
import {
  AddWatchlistItemDto,
  CreateWatchlistDto,
  RenameWatchlistDto,
} from '../dto/watchlist.dto';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

@UseGuards(JwtAuthGuard)
@ApiTags('Watchlists')
@ApiBearerAuth('JWT')
@Controller('market/watchlists')
export class WatchlistsController {
  constructor(
    private readonly svc: WatchlistsService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(WatchlistsController.name);
  }

  @Post()
  @ApiOperation({ summary: 'Create watchlist' })
  @ApiBody({
    type: CreateWatchlistDto,
    examples: {
      default: { value: { name: 'My Watchlist' } },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Created',
    schema: {
      example: { id: 'w-uuid', name: 'My Watchlist', createdAt: '2025-09-24T00:00:00Z' },
    },
  })
  create(
    @Tenant() tenantId: string,
    @Body() body: CreateWatchlistDto,
    @Req() req: any,
  ) {
    this.logger.debug('POST /market/watchlists', body);
    return this.svc.create(tenantId, req.user.userId, body.name);
  }

  @Get()
  @ApiOperation({ summary: 'List my watchlists' })
  @ApiResponse({
    status: 200,
    description: 'List of watchlists',
    schema: {
      example: [
        { id: 'w1', name: 'Indices' },
        { id: 'w2', name: 'Tech' },
      ],
    },
  })
  list(@Tenant() tenantId: string, @Req() req: any) {
    this.logger.debug('GET /market/watchlists');
    return this.svc.list(tenantId, req.user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a watchlist by id' })
  @ApiParam({ name: 'id', description: 'Watchlist id' })
  @ApiResponse({
    status: 200,
    description: 'Watchlist detail',
    schema: {
      example: { id: 'w1', name: 'Indices', items: [{ id: 'i1', instrumentId: 'NSE:NIFTY50' }] },
    },
  })
  get(@Tenant() tenantId: string, @Param('id') id: string, @Req() req: any) {
    this.logger.debug('GET /market/watchlists/:id', { id });
    return this.svc.get(tenantId, req.user.userId, id);
  }

  @Get(':id/items')
  @ApiOperation({ summary: 'List items in a watchlist' })
  @ApiParam({ name: 'id', description: 'Watchlist id' })
  @ApiResponse({
    status: 200,
    description: 'Watchlist items',
    schema: { example: [{ id: 'i1', instrumentId: 'NSE:NIFTY50' }] },
  })
  listItems(@Param('id') id: string) {
    this.logger.debug('GET /market/watchlists/:id/items', { id });
    return this.svc.listItems(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename watchlist' })
  @ApiParam({ name: 'id', description: 'Watchlist id' })
  @ApiBody({
    type: RenameWatchlistDto,
    examples: { default: { value: { name: 'New Name' } } },
  })
  @ApiResponse({
    status: 200,
    description: 'Renamed',
    schema: { example: { id: 'w1', name: 'New Name' } },
  })
  rename(
    @Tenant() tenantId: string,
    @Param('id') id: string,
    @Body() body: RenameWatchlistDto,
    @Req() req: any,
  ) {
    this.logger.debug('PATCH /market/watchlists/:id', { id, name: body.name });
    return this.svc.rename(tenantId, req.user.userId, id, body.name);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete watchlist' })
  @ApiParam({ name: 'id', description: 'Watchlist id' })
  @ApiResponse({ status: 200, description: 'Deleted', schema: { example: { success: true } } })
  remove(@Tenant() tenantId: string, @Param('id') id: string, @Req() req: any) {
    this.logger.debug('DELETE /market/watchlists/:id', { id });
    return this.svc.remove(tenantId, req.user.userId, id);
  }

  @Post(':id/items')
  @ApiOperation({ summary: 'Add instrument to watchlist' })
  @ApiParam({ name: 'id', description: 'Watchlist id' })
  @ApiBody({
    schema: {
      properties: { instrumentId: { type: 'string', example: 'NSE:RELIANCE' } },
      required: ['instrumentId'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Item added',
    schema: { example: { id: 'item-uuid', instrumentId: 'NSE:RELIANCE' } },
  })
  addItem(@Param('id') id: string, @Body() body: AddWatchlistItemDto) {
    this.logger.debug('POST /market/watchlists/:id/items', {
      id,
      instrumentId: body.instrumentId,
    });
    return this.svc.addItem(id, body.instrumentId);
  }

  @Delete(':id/items/:itemId')
  @ApiOperation({ summary: 'Remove instrument from watchlist' })
  @ApiParam({ name: 'id', description: 'Watchlist id' })
  @ApiParam({ name: 'itemId', description: 'Item id' })
  @ApiResponse({ status: 200, description: 'Item removed', schema: { example: { success: true } } })
  removeItem(@Param('id') id: string, @Param('itemId') itemId: string) {
    this.logger.debug('DELETE /market/watchlists/:id/items/:itemId', {
      id,
      itemId,
    });
    return this.svc.removeItem(id, itemId);
  }
}
