/**
 * @file src/modules/users/controllers/profile.controller.ts
 * @module users
 * @description Self-service profile and verification endpoints
 * @author BharatERP
 * @created 2025-01-09
 */

import { Body, Controller, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../rbac/guards/tenant.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { UsersService } from '../users.service';
import { AppLoggerService } from '../../../shared/logger';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { RequestEmailVerificationDto, ConfirmEmailVerificationDto } from '../dto/verify-email.dto';
import { RequestMobileVerificationDto, ConfirmMobileVerificationDto } from '../dto/verify-mobile.dto';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class ProfileController {
  constructor(
    private readonly users: UsersService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(ProfileController.name);
  }

  @Patch('profile')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Update profile', description: 'Allows authenticated user to update profile fields and preferences' })
  @ApiBody({ type: UpdateProfileDto })
  @ApiResponse({ status: 200, description: 'Updated profile' })
  async updateProfile(@Body() dto: UpdateProfileDto, @Req() req: any) {
    this.logger.debug('PATCH /users/profile', { userId: req.user.userId });
    return this.users.updateProfileSelf(req.user.userId, dto);
  }

  @Post('verify/email/request')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Request email verification' })
  @ApiBody({ type: RequestEmailVerificationDto })
  async requestEmail(@Body() dto: RequestEmailVerificationDto, @Req() req: any) {
    this.logger.debug('POST /users/verify/email/request', { userId: req.user.userId });
    return this.users.requestEmailVerification(req.user.userId, dto.email);
  }

  @Post('verify/email/confirm')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Confirm email verification' })
  @ApiBody({ type: ConfirmEmailVerificationDto })
  async confirmEmail(@Body() dto: ConfirmEmailVerificationDto, @Req() req: any) {
    this.logger.debug('POST /users/verify/email/confirm', { userId: req.user.userId });
    return this.users.confirmEmailVerification(req.user.userId, dto.email, dto.code);
  }

  @Post('verify/mobile/request')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Request mobile verification' })
  @ApiBody({ type: RequestMobileVerificationDto })
  async requestMobile(@Body() dto: RequestMobileVerificationDto, @Req() req: any) {
    this.logger.debug('POST /users/verify/mobile/request', { userId: req.user.userId });
    return this.users.requestMobileVerification(req.user.userId, dto.mobileE164);
  }

  @Post('verify/mobile/confirm')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Confirm mobile verification' })
  @ApiBody({ type: ConfirmMobileVerificationDto })
  async confirmMobile(@Body() dto: ConfirmMobileVerificationDto, @Req() req: any) {
    this.logger.debug('POST /users/verify/mobile/confirm', { userId: req.user.userId });
    return this.users.confirmMobileVerification(req.user.userId, dto.mobileE164, dto.code);
  }
}

