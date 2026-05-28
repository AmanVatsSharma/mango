/**
 * File:        apps/backend/src/modules/oms/services/order-events.service.ts
 * Module:      oms
 * Purpose:     Shared event bus for order lifecycle events; breaks the circular dep between
 *              OmsModule (OrderService publishes) and PositionsModule (PositionsController subscribes).
 *
 * Exports:
 *   - OrderEventsService — provides publish() and onEvents$()
 *
 * Depends on:
 *   - rxjs Subject — lightweight in-process pub/sub
 *
 * Side-effects:
 *   - none (in-memory only; no DB/network I/O)
 *
 * Key invariants:
 *   - Registered in both OmsModule and PositionsModule so that both get the same singleton
 *     via the shared OmsModule export chain (PositionsModule is imported by OmsModule which exports it)
 *
 * Read order:
 *   1. OrderEventsService — the only symbol
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-09
 */

import { Injectable } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';

@Injectable()
export class OrderEventsService {
  private readonly subject = new Subject<{ type: string; payload: any }>();

  publish(event: { type: string; payload: any }): void {
    this.subject.next(event);
  }

  onEvents$(): Observable<{ type: string; payload: any }> {
    return this.subject.asObservable();
  }
}
