/**
 * @file src/modules/accounts/controllers/statements.controller.ts
 * @module accounts
 * @description Statements endpoints: daily statements listing
 * @author BharatERP
 * @created 2025-09-19
 */

import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Permissions } from '../../rbac/decorators/permissions.decorator';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { TenantGuard } from '../../rbac/guards/tenant.guard';
import { GetStatementsDto } from '../dtos/get-statements.dto';
import { StatementsService } from '../services/statements.service';
import { AppLoggerService } from '../../../shared/logger';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Accounts')
@Controller('accounts/:id/statements')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class StatementsController {
  constructor(
    private readonly service: StatementsService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(StatementsController.name);
  }

  @Get()
  @Permissions('statements:read')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List daily statements' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiResponse({ status: 200, description: 'Statements', schema: { example: [ { id: 'stmt-uuid', date: '2025-09-24', cashDelta: '100.00', pnl: '25.00' } ] } })
  listStatements(
    @Param('id') accountId: string,
    @Query() query: GetStatementsDto,
  ) {
    this.logger.debug('listStatements called', { accountId, query });
    return this.service.listStatements(accountId, query);
  }

  @Get(':date/download')
  @Permissions('statements:read')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Download daily statement', description: 'Download statement as PDF or CSV' })
  @ApiQuery({ name: 'format', required: false, example: 'pdf' })
  async download(
    @Param('id') accountId: string,
    @Param('date') date: string,
    @Query('format') format?: 'pdf' | 'csv',
    @Res() res: any = null,
  ) {
    this.logger.debug('download statement', { accountId, date, format });
    const result = await this.service.exportStatement(accountId, date, format === 'csv' ? 'csv' : 'pdf');
    if (res) {
      res.setHeader('Content-Type', result.mime);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.send(result.buffer);
      return;
    }
    return result;
  }
}
