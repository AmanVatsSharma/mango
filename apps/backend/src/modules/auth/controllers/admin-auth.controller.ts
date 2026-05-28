/**
 * @file src/modules/auth/controllers/admin-auth.controller.ts
 * @module auth
 * @description Admin endpoints to manage user sessions (list and revoke)
 * @author BharatERP
 * @created 2025-09-24
 */

import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from '../auth.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { Permissions } from '../../rbac/decorators/permissions.decorator';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { TenantGuard } from '../../rbac/guards/tenant.guard';
import { ListSessionsDto } from '../dto/list-sessions.dto';

@ApiTags('admin/auth')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('users/:userId/sessions')
  @Permissions('accounts:read')
  @ApiOperation({ summary: 'List sessions for a user' })
  @ApiParam({ name: 'userId', type: String })
  @ApiResponse({ status: 200, description: 'Sessions list' })
  @ApiQuery({ name: 'ipAddress', required: false })
  @ApiQuery({ name: 'userAgent', required: false })
  @ApiQuery({ name: 'deviceInfo', required: false })
  listUserSessions(@Param('userId') userId: string, @Query() q: ListSessionsDto) {
    return this.auth.listSessions(userId, q);
  }

  @Post('users/:userId/sessions/revoke')
  @Permissions('accounts:write')
  @ApiOperation({ summary: 'Revoke a session for a user' })
  @ApiParam({ name: 'userId', type: String })
  @ApiResponse({ status: 200, description: 'Revoked' })
  revokeUserSession(
    @Param('userId') userId: string,
    @Body() body: { tokenId: string },
  ) {
    return this.auth.revokeSession(userId, body.tokenId);
  }

  @Post('users/:userId/sessions/revoke-all')
  @Permissions('accounts:write')
  @ApiOperation({ summary: 'Revoke all sessions for a user' })
  @ApiParam({ name: 'userId', type: String })
  @ApiResponse({ status: 200, description: 'Revoked count' })
  revokeAllUserSessions(@Param('userId') userId: string) {
    return this.auth.revokeAllSessions(userId);
  }
}


