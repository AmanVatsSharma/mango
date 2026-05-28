/**
 * @file src/modules/support/tests/support.service.spec.ts
 * @module support
 * @description Unit tests for support service scaffold
 * @author BharatERP
 * @created 2026-02-19
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppLoggerService } from '../../../shared/logger';
import { SupportTicketEntity } from '../entities/support-ticket.entity';
import { SupportService } from '../services/support.service';

describe('SupportService', () => {
  let service: SupportService;
  const repo = { save: jest.fn(), create: jest.fn(), find: jest.fn(), findOne: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupportService,
        { provide: getRepositoryToken(SupportTicketEntity), useValue: repo },
        { provide: AppLoggerService, useValue: { setContext: jest.fn(), debug: jest.fn(), warn: jest.fn() } },
      ],
    }).compile();
    service = module.get<SupportService>(SupportService);
    jest.clearAllMocks();
  });

  it('creates ticket', async () => {
    repo.create.mockReturnValue({});
    repo.save.mockResolvedValue({ id: 'ticket-1' });
    const result = await service.createTicket({
      tenantId: '1916f594-f8ba-4e63-b8dc-7ff0e9f3c6c0',
      userId: '2aab63b0-a89a-43f6-a17a-ab2726a2f295',
      subject: 'Reset leverage',
      description: 'Need leverage reset for desk account',
      priority: 'HIGH',
      metadata: '{}',
    });
    expect(result.id).toBe('ticket-1');
  });
});
