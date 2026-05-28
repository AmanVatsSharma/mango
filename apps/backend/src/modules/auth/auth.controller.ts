/**
 * @file src/modules/auth/auth.controller.ts
 * @module auth
 * @description Auth controller for OTP and token operations
 * @author BharatERP
 * @created 2025-09-18
 */

import {
  Body,
  Controller,
  Post,
  UseGuards,
  Req,
  Get,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RefreshDto } from './dto/refresh.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { TotpEnableDto, TotpVerifyDto } from './dto/totp.dto';
import { HistorySessionsDto } from './dto/list-sessions.dto';
import { AppError } from '../../common/errors/app-error';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('otp/request')
  @ApiOperation({ summary: 'Request OTP', description: 'Send login OTP to a mobile number. Include header x-tenant-id for multi-tenant environments (optional in dev).' })
  @ApiBody({ type: RequestOtpDto, examples: { default: { value: { tenantId: 'acme', mobileE164: '+911234567890' } } } })
  @ApiResponse({ status: 201, description: 'OTP sent', schema: { example: { success: true } } })
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.auth.requestOtp(dto);
  }

  @Post('otp/verify')
  @ApiOperation({ summary: 'Verify OTP', description: 'Verify OTP and receive access/refresh tokens. Refresh token issued as httpOnly cookie; CSRF token as non-httpOnly cookie.' })
  @ApiBody({ type: VerifyOtpDto, examples: { default: { value: { tenantId: 'acme', mobileE164: '+911234567890', otp: '123456', deviceInfo: 'web', totpCode: '123456' } } } })
  @ApiResponse({ status: 201, description: 'Access token response; refresh token/CSRF set as cookies', schema: { example: { accessToken: 'eyJ...', tokenId: 'jti-uuid' } } })
  async verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: any) {
    const res = await this.auth.verifyOtp(dto, req);
    const domain = undefined; // [SonuRamTODO] set cookie domain via env if needed
    const secure = (process.env.NODE_ENV || 'development') !== 'development';
    const refreshCookieName = process.env.REFRESH_COOKIE_NAME || 'rt';
    const csrfCookieName = process.env.CSRF_COOKIE_NAME || 'csrf';
    // Set httpOnly refresh token cookie
    req.res.cookie(refreshCookieName, res.refreshToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/auth',
      domain,
    });
    // Set non-httpOnly CSRF cookie
    req.res.cookie(csrfCookieName, res.csrfToken, {
      httpOnly: false,
      secure,
      sameSite: 'lax',
      path: '/auth',
      domain,
    });
    return { accessToken: res.accessToken, tokenId: res.tokenId };
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Rotate refresh token', description: 'Use httpOnly refresh cookie and CSRF header to get a new access token and rotate refresh. Send header x-csrf-token equal to csrf cookie.' })
  @ApiBody({ type: RefreshDto, examples: { default: { value: { tokenId: 'prev-token-id' } } } })
  @ApiCookieAuth()
  @ApiResponse({ status: 201, description: 'New access token issued; refresh rotated', schema: { example: { accessToken: 'eyJ...', tokenId: 'new-jti-uuid' } } })
  async refresh(@Body() dto: RefreshDto, @Req() req: any) {
    const refreshCookieName = process.env.REFRESH_COOKIE_NAME || 'rt';
    const csrfHeaderName = (
      process.env.CSRF_HEADER_NAME || 'x-csrf-token'
    ).toLowerCase();
    const csrfCookieName = process.env.CSRF_COOKIE_NAME || 'csrf';
    const refreshToken = req.cookies?.[refreshCookieName];
    const csrfHeader = (req.headers?.[csrfHeaderName] as string) || '';
    const csrfCookie = req.cookies?.[csrfCookieName];
    if (!refreshToken || !csrfHeader || csrfHeader !== csrfCookie) {
      throw new AppError('AUTHENTICATION_FAILED', 'CSRF or refresh token missing');
    }
    const payload = this.auth.decodeJwtPayload(refreshToken);
    const res = await this.auth.rotateRefresh(payload.sub, dto.tokenId, refreshToken, req);
    const domain = undefined; // [SonuRamTODO] set cookie domain via env if needed
    const secure = (process.env.NODE_ENV || 'development') !== 'development';
    // rotate cookies
    req.res.cookie(refreshCookieName, res.refreshToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/auth',
      domain,
    });
    const newCsrf = this.auth.generateCsrfToken();
    req.res.cookie(csrfCookieName, newCsrf, {
      httpOnly: false,
      secure,
      sameSite: 'lax',
      path: '/auth',
      domain,
    });
    return { accessToken: res.accessToken, tokenId: res.tokenId };
  }

  @UseGuards(JwtAuthGuard)
  @Post('sessions')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List sessions', description: 'List active refresh sessions for the current user' })
  listSessions(@Req() req: any) {
    return this.auth.listSessions(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('sessions/history')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Session history', description: 'List recent sessions with optional limit' })
  async history(@Req() req: any, @Query() q: HistorySessionsDto) {
    const limit = q.limit ? parseInt(q.limit, 10) : 10;
    const rows = await this.auth.listSessions(req.user.userId);
    return rows.slice(0, Math.max(1, Math.min(limit, 100)));
  }

  @UseGuards(JwtAuthGuard)
  @Post('sessions/revoke')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Revoke a session', description: 'Revoke a specific refresh session by token id' })
  revoke(@Req() req: any, @Body() body: { tokenId: string }) {
    return this.auth.revokeSession(req.user.userId, body.tokenId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('sessions/revoke-all')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Revoke all sessions', description: 'Revoke all refresh sessions for the current user' })
  revokeAll(@Req() req: any) {
    return this.auth.revokeAllSessions(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Current user', description: 'Return current user and tenant ids' })
  me(@Req() req: any) {
    return this.auth.getCurrentUser(req.user.userId, req.user.tenantId);
  }

  // TOTP flows (protected)
  @UseGuards(JwtAuthGuard)
  @Post('2fa/totp/init')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Init TOTP', description: 'Generate TOTP secret and QR provisioning uri' })
  initTotp(@Req() req: any, @Body() dto: TotpEnableDto) {
    return this.auth.initTotp(req.user.userId, dto.issuer, dto.accountName);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/totp/verify')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Verify TOTP', description: 'Verify and enable TOTP for user' })
  verifyTotp(@Req() req: any, @Body() dto: TotpVerifyDto & { secret: string }) {
    return this.auth.verifyAndEnableTotp(req.user.userId, dto.secret, dto.code);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/totp/disable')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Disable TOTP', description: 'Disable TOTP for user' })
  disableTotp(@Req() req: any) {
    return this.auth.disableTotp(req.user.userId);
  }
}
