/**
 * File:        apps/backend/src/modules/compliance/controllers/admin-aml.controller.ts
 * Module:      compliance · AML Monitor
 * Purpose:     Admin AML case management — list, inspect, flag, and clear cases.
 *
 * Exports:
 *   - AdminAmlController — REST endpoints under /admin/aml
 *
 * Depends on:
 *   - @obsidian/backend-auth        — JwtAuthGuard
 *   - @obsidian/backend-rbac        — TenantGuard, PermissionsGuard, Permissions
 *   - @/shared/logger               — AppLoggerService
 *   - @/common/errors/app-error     — AppError
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - All endpoints require JWT + tenant scope + oms:admin permission
 *   - No actual AML scoring engine — returns mock/in-memory data until AMLService is wired
 *
 * Read order:
 *   1. AdminAmlController — endpoint definitions
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-18
 */

import { Controller, Get, Post, Param, Query, UseGuards, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@obsidian/backend-auth';
import { TenantGuard } from '@obsidian/backend-rbac';
import { PermissionsGuard } from '@obsidian/backend-rbac';
import { Permissions } from '@obsidian/backend-rbac';
import { AppLoggerService } from '../../../shared/logger';
import { AppError } from '../../../common/errors/app-error';

/* ── DTOs ──────────────────────────────────────────────────────────────────────── */

export class AmlCaseResponseDto {
  id!: string;
  clientId!: string;
  clientName!: string;
  score!: number;
  triggers!: string[];
  status!: 'Clear' | 'Review' | 'Suspicious' | 'Reported';
  lastChecked!: string;
  flaggedTransactions!: string[];
  notes!: { author: string; time: string; text: string }[];
}

export class ListAmlCasesQueryDto {
  status?: 'Clear' | 'Review' | 'Suspicious' | 'Reported';
  severityMin?: string;
  limit?: string;
  offset?: string;
}

export class FlagAmlCaseBodyDto {
  reason?: string;
}

/* ── Mock store (replace with AmlService once wired) ──────────────────────────── */

const _MOCK_CASES: AmlCaseResponseDto[] = [
  {
    id: 'AML001', clientId: 'C1009', clientName: 'Yusuf Al-Mansouri',
    score: 87, triggers: ['Structuring', 'High-Risk Country'],
    status: 'Suspicious', lastChecked: '2024-01-14T09:22:00Z',
    flaggedTransactions: ['TXN-8821', 'TXN-8834'], notes: [],
  },
  {
    id: 'AML002', clientId: 'C1022', clientName: 'Carlos Mendez',
    score: 72, triggers: ['Round-Trip Funds'],
    status: 'Review', lastChecked: '2024-01-13T15:10:00Z',
    flaggedTransactions: ['TXN-9012'], notes: [],
  },
  {
    id: 'AML003', clientId: 'C1028', clientName: 'Ravi Krishnan',
    score: 64, triggers: ['Rapid Movement'],
    status: 'Review', lastChecked: '2024-01-12T11:45:00Z',
    flaggedTransactions: [], notes: [],
  },
  {
    id: 'AML004', clientId: 'C1031', clientName: 'James Okafor',
    score: 91, triggers: ['PEP Match'],
    status: 'Reported', lastChecked: '2024-01-14T08:00:00Z',
    flaggedTransactions: ['TXN-7701', 'TXN-7703', 'TXN-7710'], notes: [],
  },
  {
    id: 'AML005', clientId: 'C1015', clientName: 'Fatima Al-Rashidi',
    score: 55, triggers: ['Structuring'],
    status: 'Clear', lastChecked: '2024-01-10T14:30:00Z',
    flaggedTransactions: ['TXN-6640'], notes: [],
  },
];

/* ── Controller ──────────────────────────────────────────────────────────────── */

@ApiTags('admin/aml')
@Controller('admin/aml')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class AdminAmlController {
  constructor(private readonly logger: AppLoggerService) {
    this.logger.setContext(AdminAmlController.name);
  }

  @Get('cases')
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List AML cases with optional filters' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'severityMin', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  @ApiResponse({ status: 200, description: 'Paginated AML case list' })
  async listCases(@Query() query: ListAmlCasesQueryDto) {
    const limit = query.limit ? Math.min(parseInt(query.limit, 10) || 50, 200) : 50;
    const offset = query.offset ? parseInt(query.offset, 10) : 0;
    const minScore = query.severityMin ? parseInt(query.severityMin, 10) : 0;

    this.logger.debug('GET /admin/aml/cases', { query });

    let filtered = _MOCK_CASES;
    if (query.status) {
      filtered = filtered.filter(c => c.status === query.status);
    }
    if (minScore > 0) {
      filtered = filtered.filter(c => c.score >= minScore);
    }

    const total = filtered.length;
    const page = filtered.slice(offset, offset + limit);

    return { data: page, total, limit, offset };
  }

  @Get('cases/:id')
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get a single AML case by ID' })
  @ApiParam({ name: 'id', example: 'AML001' })
  @ApiResponse({ status: 200, description: 'AML case detail' })
  @ApiResponse({ status: 404, description: 'Case not found' })
  async getCase(@Param('id') id: string) {
    this.logger.debug('GET /admin/aml/cases/:id', { id });
    const found = _MOCK_CASES.find(c => c.id === id);
    if (!found) throw new AppError('RESOURCE_NOT_FOUND', `AML case ${id} not found`);
    return found;
  }

  @Post('cases/:id/flag')
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Flag an AML case for review / mark as suspicious' })
  @ApiParam({ name: 'id', example: 'AML001' })
  @ApiResponse({ status: 200, description: 'Case flagged' })
  @ApiResponse({ status: 404, description: 'Case not found' })
  async flagCase(@Param('id') id: string) {
    this.logger.debug('POST /admin/aml/cases/:id/flag', { id });
    const idx = _MOCK_CASES.findIndex(c => c.id === id);
    if (idx === -1) throw new AppError('RESOURCE_NOT_FOUND', `AML case ${id} not found`);
    _MOCK_CASES[idx] = { ..._MOCK_CASES[idx], status: 'Suspicious' };
    return { success: true, status: 'Suspicious' };
  }

  @Post('cases/:id/clear')
  @Permissions('oms:admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Clear an AML case — mark as resolved / clear' })
  @ApiParam({ name: 'id', example: 'AML001' })
  @ApiResponse({ status: 200, description: 'Case cleared' })
  @ApiResponse({ status: 404, description: 'Case not found' })
  async clearCase(@Param('id') id: string) {
    this.logger.debug('POST /admin/aml/cases/:id/clear', { id });
    const idx = _MOCK_CASES.findIndex(c => c.id === id);
    if (idx === -1) throw new AppError('RESOURCE_NOT_FOUND', `AML case ${id} not found`);
    _MOCK_CASES[idx] = { ..._MOCK_CASES[idx], status: 'Clear' };
    return { success: true, status: 'Clear' };
  }
}