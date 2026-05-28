/**
 * @file src/modules/oms/services/order.service.ts
 * @module oms
 * @description Order placement/cancellation with pre-trade risk and Accounts holds integration
 * @author BharatERP
 * @created 2025-09-19
 */

import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { OrderEntity } from '../entities/order.entity';
import { ExecutionEntity } from '../entities/execution.entity';
import { OrderAuditEntity } from '../entities/order-audit.entity';
import { PlaceOrderDto, CancelOrderDto } from '../dtos/order.dto';
import { ModifyOrderDto } from '../dtos/order.dto';
import { AddExecutionDto } from '../dtos/execution.dto';
import { NotificationService } from '../../notifications/services/notification.service';
import { AppLoggerService } from '../../../shared/logger';
import { getRequestContext } from '../../../shared/request-context';
import { RiskConfigService } from '../services/risk-config.service';
import { LedgerService } from '../../accounts/services/ledger.service';
import {
  CancelOrderRequest,
  ExchangeAdapter,
  EXCHANGE_ADAPTER,
  ModifyOrderRequest,
  PlaceOrderRequest,
} from '../adapters/exchange-adapter';
import { DEMO_EXCHANGE_ADAPTER } from '../adapters/demo-exchange.adapter';
import { AppError } from '../../../common/errors/app-error';
import { MarginEngineService } from './margin-engine.service';
import { RealtimePublisherService } from '../../realtime/prana-stream/services/realtime-publisher.service';
import { AccountsService } from '../../accounts/services/accounts.service';
import { RiskPolicyService } from '../../risk-policy/services/risk-policy.service';
import { LimitsAndControlsService } from '../../limits-and-controls/services/limits-and-controls.service';
import { BrokerExchangeConfigService } from '../../broker-hierarchy/services/broker-exchange-config.service';
import { OrderEventsService } from './order-events.service';

@Injectable()
export class OrderService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(OrderEntity) private readonly orders: Repository<OrderEntity>,
    @InjectRepository(ExecutionEntity) private readonly executions: Repository<ExecutionEntity>,
    @InjectRepository(OrderAuditEntity) private readonly audits: Repository<OrderAuditEntity>,
    private readonly risk: RiskConfigService,
    private readonly ledger: LedgerService,
    private readonly logger: AppLoggerService,
    private readonly marginEngine: MarginEngineService,
    private readonly realtime: RealtimePublisherService,
    @Inject(EXCHANGE_ADAPTER) private readonly exchange: ExchangeAdapter,
    @Inject(DEMO_EXCHANGE_ADAPTER) private readonly demoExchange: ExchangeAdapter,
    private readonly accountsService: AccountsService,
    private readonly notifications: NotificationService,
    private readonly riskPolicy: RiskPolicyService,
    private readonly limitsControls: LimitsAndControlsService,
    private readonly brokerExchangeConfig: BrokerExchangeConfigService,
    private readonly orderEvents: OrderEventsService,
  ) {
    this.logger.setContext(OrderService.name);
  }

  onEvents$() {
    return this.orderEvents.onEvents$();
  }

  /**
   * Admin: list all orders across the tenant with optional filters.
   * Joins account to resolve client/user name for the broker admin UI.
   */
  async listAll(opts: {
    status?: string;
    side?: 'BUY' | 'SELL';
    accountId?: string;
    symbol?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }) {
    const ctx = getRequestContext();
    const { status, side, accountId, from, to, limit = 50, offset = 0 } = opts;
    this.logger.debug('listAll()', { ctx, opts });

    const qb = this.orders
      .createQueryBuilder('o')
      .leftJoin('o.account', 'a')
      .select([
        'o.id', 'o.accountId', 'o.instrumentId', 'o.side', 'o.type',
        'o.quantity', 'o.price', 'o.status', 'o.clientOrderId', 'o.createdAt',
        'a.id', 'a.accountType',
      ])
      .where('o.tenant_id = :tenantId', { tenantId: ctx.tenantId });

    if (status) qb.andWhere('o.status = :status', { status });
    if (side) qb.andWhere('o.side = :side', { side });
    if (accountId) qb.andWhere('o.account_id = :accountId', { accountId });
    if (from) qb.andWhere('o.created_at >= :from', { from });
    if (to) qb.andWhere('o.created_at <= :to', { to });

    const [rows, total] = await Promise.all([
      qb.orderBy('o.created_at', 'DESC').skip(offset).take(limit).getManyAndCount(),
      qb.clone().select('COUNT(*)', 'cnt').getRawOne(),
    ]);

    return {
      data: rows as unknown as OrderEntity[],
      total: typeof total === 'object' && total !== null ? Number((total).cnt) : total,
      limit,
      offset,
    };
  }

  async place(dto: PlaceOrderDto): Promise<OrderEntity> {
    const ctx = getRequestContext();
    this.logger.debug('place()', dto);

    // Per-account advisory lock to avoid race conditions across concurrent placements
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1)', [
        this.lockKey(ctx.tenantId, dto.accountId),
      ]);

      // Idempotency check by externalRefId
      const existing = await manager.getRepository(OrderEntity).findOne({
        where: { tenantId: ctx.tenantId, externalRefId: dto.externalRefId },
      });
      if (existing) {
        // If payload mismatches, throw duplicate error
        if (
          existing.accountId !== dto.accountId ||
          existing.instrumentId !== dto.instrumentId ||
          existing.side !== dto.side ||
          existing.type !== dto.type ||
          existing.quantity !== dto.quantity ||
          (existing.price ?? null) !== (dto.price ?? null)
        ) {
          throw new AppError('DUPLICATE_ORDER', 'externalRefId already used with different payload');
        }
        return existing;
      }

      // Exchange access guard: instrumentId format is EXCHANGE:SYMBOL (e.g. NSE:INFY)
      const exchangeCode = dto.instrumentId.split(':')[0]?.toUpperCase();
      if (exchangeCode) {
        const allowed = await this.brokerExchangeConfig.isExchangeEnabledForTenant(
          ctx.tenantId,
          exchangeCode,
        );
        if (!allowed) {
          throw new AppError('EXCHANGE_NOT_ENABLED', `Exchange ${exchangeCode} is not enabled for this broker`);
        }
      }

      // Pre-trade margin estimation
      const estimate = await this.marginEngine.estimate({
        accountId: dto.accountId,
        instrumentId: dto.instrumentId,
        side: dto.side,
        type: dto.type,
        quantity: dto.quantity,
        price: dto.price ?? null,
        positionType: 'INTRADAY',
      });
      this.logger.debug('margin estimate', estimate);
      const required = estimate.totalRequired;

      // Pre-trade risk policy and limits enforcement
      const tenantId = ctx.tenantId;
      const qty = Number(dto.quantity);
      const px = dto.price != null ? Number(dto.price) : null;
      const notional = qty * (px ?? 0);
      const openOrderCount = await this.orders.count({
        where: { tenantId, accountId: dto.accountId, status: 'PLACED' },
      });
      await this.riskPolicy.enforcePreTrade({
        tenantId,
        instrumentId: dto.instrumentId,
        quantity: qty,
        price: px,
      });
      await this.limitsControls.enforcePreTrade({
        tenantId,
        accountId: dto.accountId,
        instrumentId: dto.instrumentId,
        notional,
        openOrderCount,
      });

      // Create hold if needed (idempotent via ref)
      let holdRef: string | undefined;
      if (Number(required) > 0) {
        const refId = `ord:${dto.externalRefId}`;
        await this.ledger.createHold(dto.accountId, {
          amount: required,
          currency: 'INR',
          reason: 'ORDER',
          externalRefId: refId,
        });
        holdRef = refId;
      }

      const toSave = manager.getRepository(OrderEntity).create({
        tenantId: ctx.tenantId,
        accountId: dto.accountId,
        instrumentId: dto.instrumentId,
        side: dto.side,
        type: dto.type,
        quantity: dto.quantity,
        price: dto.price ?? null,
        clientOrderId: dto.clientOrderId ?? `cli-${Date.now()}`,
        externalRefId: dto.externalRefId,
        status: 'PLACED',
        holdRef: holdRef ?? null,
      });
      const saved = await manager.getRepository(OrderEntity).save(toSave);

      const placePayload: PlaceOrderRequest = {
        tenantId: ctx.tenantId,
        accountId: dto.accountId,
        instrumentId: dto.instrumentId,
        side: dto.side,
        type: dto.type,
        quantity: dto.quantity,
        price: dto.price ?? null,
        clientOrderId: saved.clientOrderId,
        timeInForce: dto.timeInForce,
      };
      const account = await this.accountsService.getById(dto.accountId);
      const adapter = account?.accountType === 'DEMO' ? this.demoExchange : this.exchange;
      const resp = await adapter.placeOrder(placePayload);
      this.logger.debug('exchange placeOrder resp', resp);
      if (resp.status === 'REJECTED') {
        saved.status = 'REJECTED';
        if (saved.holdRef) {
          await this.ledger.releaseHold(saved.accountId, { externalRefId: saved.holdRef });
        }
      } else {
        saved.status = 'PLACED';
      }
      saved.meta = { ...(saved.meta ?? {}), providerOrderId: resp.providerOrderId };
      await manager.getRepository(OrderEntity).save(saved);
      await manager.getRepository(OrderAuditEntity).save(
        manager.getRepository(OrderAuditEntity).create({ tenantId: ctx.tenantId, orderId: saved.id, action: 'PLACE', data: dto as any }),
      );
      this.orderEvents.publish({ type: 'order.placed', payload: saved });
      this.realtime.publishOrderUpdate(ctx.userId ?? saved.accountId, {
        order: saved,
      });
      return saved;
    });
  }

  private lockKey(tenantId: string, accountId: string): number {
    let hash = 0;
    const input = `${tenantId}:${accountId}`;
    for (let i = 0; i < input.length; i++) {
      hash = (hash * 31 + input.charCodeAt(i)) | 0;
    }
    return hash;
  }

  async cancel(dto: CancelOrderDto): Promise<OrderEntity | null> {
    const ctx = getRequestContext();
    const order = await this.orders.findOne({ where: { id: dto.orderId, tenantId: ctx.tenantId } });
    if (!order) return null;
    const account = await this.accountsService.getById(order.accountId);
    const adapter = account?.accountType === 'DEMO' ? this.demoExchange : this.exchange;
    const providerOrderId =
      (order.meta as any)?.providerOrderId || order.clientOrderId || order.id;
    await adapter.cancelOrder({ providerOrderId } as CancelOrderRequest);
    order.status = 'CANCELLED';
    await this.orders.save(order);
    if (order.holdRef) {
      await this.ledger.releaseHold(order.accountId, { externalRefId: order.holdRef });
    }
    await this.audits.save(this.audits.create({ tenantId: ctx.tenantId, orderId: order.id, action: 'CANCEL', data: dto as any }));
    this.orderEvents.publish({ type: 'order.cancelled', payload: order });
    this.realtime.publishOrderUpdate(ctx.userId ?? order.accountId, { order });
    return order;
  }

  async modify(dto: ModifyOrderDto): Promise<OrderEntity | null> {
    const ctx = getRequestContext();
    const order = await this.orders.findOne({
      where: { id: dto.orderId, tenantId: ctx.tenantId },
    });
    if (!order) return null;
    const account = await this.accountsService.getById(order.accountId);
    const adapter = account?.accountType === 'DEMO' ? this.demoExchange : this.exchange;
    const providerOrderId =
      (order.meta as any)?.providerOrderId || order.clientOrderId || order.id;
    const payload: ModifyOrderRequest = {
      providerOrderId,
      price: dto.price ?? order.price ?? null,
      quantity: dto.quantity ?? order.quantity,
      timeInForce: dto.timeInForce ?? order.timeInForce,
    };
    const resp = await adapter.modifyOrder(payload);
    this.logger.debug('exchange modifyOrder resp', resp);
    if (dto.price !== undefined) order.price = dto.price;
    if (dto.quantity !== undefined) order.quantity = dto.quantity;
    if (dto.timeInForce !== undefined) order.timeInForce = dto.timeInForce;
    order.status = resp.status === 'REJECTED' ? 'REJECTED' : 'PLACED';
    await this.orders.save(order);
    await this.audits.save(
      this.audits.create({
        tenantId: ctx.tenantId,
        orderId: order.id,
        action: 'MODIFY',
        data: dto as any,
      }),
    );
    this.orderEvents.publish({ type: 'order.modified', payload: order });
    this.realtime.publishOrderUpdate(ctx.userId ?? order.accountId, { order });
    return order;
  }

  async addExecution(dto: AddExecutionDto): Promise<ExecutionEntity> {
    const ctx = getRequestContext();
    this.logger.debug('addExecution()', dto);
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      const execRepo = manager.getRepository(ExecutionEntity);
      const existing = await execRepo.findOne({ where: { tenantId: ctx.tenantId, externalRefId: dto.externalRefId } });
      if (existing) return existing;

      const exec = execRepo.create({
        tenantId: ctx.tenantId,
        orderId: dto.orderId,
        accountId: dto.accountId,
        instrumentId: dto.instrumentId,
        quantity: dto.quantity,
        price: dto.price,
        fees: dto.fees,
        externalRefId: dto.externalRefId,
      });
      const saved = await execRepo.save(exec);

      // Post position ledger and fees to Accounts
      await this.ledger.postPosition(dto.accountId, {
        instrumentId: dto.instrumentId,
        quantityDelta: dto.quantity,
        price: dto.price,
        fees: dto.fees,
        side: 'BUY',
        externalRefId: `pos:${dto.externalRefId}`,
      });
      if (Number(dto.fees) > 0) {
        await this.ledger.postCash(dto.accountId, {
          amount: dto.fees,
          currency: 'INR',
          direction: 'debit',
          kind: 'fee',
          externalRefId: `fee:${dto.externalRefId}`,
        } as any);
      }

      // Update order status basic heuristic
      const order = await manager.getRepository(OrderEntity).findOne({ where: { id: dto.orderId, tenantId: ctx.tenantId } });
      if (order) {
        order.status = 'PARTIALLY_FILLED';
        await manager.getRepository(OrderEntity).save(order);
        await manager.getRepository(OrderAuditEntity).save(manager.getRepository(OrderAuditEntity).create({ tenantId: ctx.tenantId, orderId: order.id, action: 'EXECUTION', data: dto as any }));
      }
      this.orderEvents.publish({ type: 'execution.added', payload: { execution: saved, orderId: dto.orderId } });
      if (order) {
        this.realtime.publishOrderUpdate(ctx.userId ?? order.accountId, {
          order,
          execution: saved,
        });
      }
      if (order && order.status !== 'REJECTED') {
        await this.notifications.send({
          userId: ctx.userId ?? order.accountId, // fallback
          type: 'order.execution',
          title: 'Order filled',
          bodyTemplate: 'Your order {{orderId}} received a fill of {{qty}} @ {{price}}',
          vars: { orderId: order.id, qty: dto.quantity, price: dto.price },
          channels: ['in-app', 'email'],
          category: 'orders',
        });
      }
      return saved;
    });
  }
}


