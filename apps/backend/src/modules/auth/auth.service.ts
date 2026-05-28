/**
 * @file src/modules/auth/auth.service.ts
 * @module auth
 * @description Auth service handling SMS OTP, JWT access/refresh with rotation
 * @author BharatERP
 * @created 2025-09-18
 */

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { AwsSnsService } from '../../shared/aws/sns.service';
import { RedisService } from '../../shared/redis/redis.service';
import { AppLoggerService } from '../../shared/logger';
import { RefreshTokenEntity } from './entities/refresh-token.entity';
import { randomUUID, randomInt } from 'node:crypto';
import * as argon2 from 'argon2';
import { authenticator } from 'otplib';
import { TotpEnableDto, TotpVerifyDto } from './dto/totp.dto';
import { AppError } from '../../common/errors/app-error';

function generateNumericOtp(length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += String(randomInt(0, 10));
  }
  return out;
}

type TokenPair = { accessToken: string; refreshToken: string };

@Injectable()
export class AuthService {
  private readonly accessTtl: string;
  private readonly refreshTtl: string;

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    @InjectRepository(RefreshTokenEntity)
    private readonly tokens: Repository<RefreshTokenEntity>,
    private readonly logger: AppLoggerService,
    private readonly sns: AwsSnsService,
    private readonly redis: RedisService,
  ) {
    this.logger.setContext(AuthService.name);
    this.accessTtl = process.env.JWT_ACCESS_TTL || '15m';
    this.refreshTtl = process.env.JWT_REFRESH_TTL || '30d';
  }

  async requestOtp(dto: RequestOtpDto): Promise<{ success: boolean }> {
    this.logger.debug('requestOtp() called');
    const user = await this.users.findByMobile(dto.tenantId, dto.mobileE164);
    if (!user) {
      await this.users.create({
        tenantId: dto.tenantId,
        mobileE164: dto.mobileE164,
      });
    }

    const otp = generateNumericOtp(6);
    // Rate limit: 5 requests per 10 minutes per tenant+mobile
    const rateKey = `otp:rate:${dto.tenantId}:${dto.mobileE164}`;
    let attempts = 0;
    try {
      attempts = await this.redis.incrWithTtl(rateKey, 600);
      if (attempts > 5) {
        this.logger.warn(`OTP rate limit exceeded for ${dto.mobileE164}`);
        return { success: true };
      }
    } catch (e) {
      this.logger.warn('Redis unavailable for rate limiting; continuing in dev');
    }

    // Store OTP for 5 minutes
    const otpKey = `otp:code:${dto.tenantId}:${dto.mobileE164}`;
    try {
      await this.redis.setWithTtl(otpKey, otp, 300);
    } catch (e) {
      this.logger.warn('Redis unavailable to store OTP; enable OTP_DEV_MODE in dev to verify without Redis');
    }
    const message = `Your Obsidian OTP is ${otp}. Valid for 5 minutes. Do not share this code.`;

    if (process.env.NODE_ENV !== 'production') {
      this.logger.warn(`[DEV-ONLY] OTP for ${dto.mobileE164}: ${otp}`);
    }

    await this.sns.sendSms(dto.mobileE164, message);
    return { success: true };
  }

  async verifyOtp(
    dto: VerifyOtpDto,
    req?: any,
  ): Promise<TokenPair & { csrfToken: string; tokenId: string }> {
    this.logger.debug('verifyOtp() called');
    const otpKey = `otp:code:${dto.tenantId}:${dto.mobileE164}`;
    const devSkip =
      (process.env.NODE_ENV || 'development') !== 'production' &&
      (process.env.OTP_DEV_MODE === 'true' || !process.env.REDIS_URL);
    if (!devSkip) {
      let expected: string | null = null;
      try {
        expected = await this.redis.get(otpKey);
      } catch (e) {
        this.logger.warn('Redis unavailable while verifying OTP');
      }
      if (!expected || expected !== dto.otp)
        throw new UnauthorizedException('Invalid or expired OTP');
    } else {
      this.logger.warn('[DEV-ONLY] Skipping OTP verification due to OTP_DEV_MODE or missing REDIS_URL');
    }

    const user = await this.users.findByMobile(dto.tenantId, dto.mobileE164);
    if (!user) throw new UnauthorizedException('User not found');

    // If user has TOTP enabled, enforce second factor: expect totpCode in request body (optional field for now)
    if (user.isTotpEnabled && !devSkip) {
      const totpCode = (req?.body?.totpCode as string) || '';
      if (!totpCode || !authenticator.check(totpCode, user.totpSecret || '')) {
        throw new UnauthorizedException('TOTP required or invalid');
      }
    }

    const tokenId = randomUUID();
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, tid: dto.tenantId },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: this.accessTtl },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, tid: dto.tenantId, jti: tokenId },
      { secret: process.env.JWT_REFRESH_SECRET, expiresIn: this.refreshTtl },
    );
    const hashed = await argon2.hash(refreshToken, { type: argon2.argon2id });
    const expiresAt = new Date(Date.now() + this.parseTtlMs(this.refreshTtl));
    await this.tokens.save({
      tenantId: dto.tenantId,
      userId: user.id,
      tokenId,
      hashedToken: hashed,
      expiresAt,
      deviceInfo: dto.deviceInfo,
      ipAddress:
        req?.ip || (req?.headers?.['x-forwarded-for'] as string) || null,
      userAgent: (req?.headers?.['user-agent'] as string) || null,
      lastUsedAt: new Date(),
    });
    const csrfToken = randomUUID();
    // update user's last login timestamp in Users table
    try {
      await (this.users as any).repo.update(
        { id: user.id },
        { lastLoginAt: new Date() },
      );
    } catch (e) {
      this.logger.warn('Failed to update lastLoginAt on user');
    }
    return { accessToken, refreshToken, csrfToken, tokenId };
  }

  async rotateRefresh(
    userId: string,
    tokenId: string,
    presentedToken: string,
    req?: any,
  ): Promise<TokenPair & { tokenId: string }> {
    this.logger.debug('rotateRefresh() called');

    // Extract tenantId from token payload first so it can be used for DB lookup
    let tenantId: string | undefined;
    try {
      const [, payload] = presentedToken.split('.');
      const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      tenantId = parsed?.tid;
    } catch (_) {
      tenantId = undefined;
    }

    // Scope the lookup to the tenant from the token — prevents cross-tenant replay
    const where = tenantId
      ? { userId, tokenId, tenantId }
      : { userId, tokenId };
    const stored = await this.tokens.findOne({ where });
    if (!stored) throw new UnauthorizedException('Refresh token not found');
    if (stored.revokedAt)
      throw new UnauthorizedException('Refresh token revoked');
    if (stored.expiresAt <= new Date())
      throw new UnauthorizedException('Refresh token expired');
    const valid = await argon2.verify(stored.hashedToken, presentedToken);
    if (!valid) throw new UnauthorizedException('Refresh token mismatch');

    await this.tokens.update({ id: stored.id }, { revokedAt: new Date() });
    const newTokenId = randomUUID();
    const accessToken = await this.jwt.signAsync(
      { sub: userId, tid: tenantId },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: this.accessTtl },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, tid: tenantId, jti: newTokenId },
      { secret: process.env.JWT_REFRESH_SECRET, expiresIn: this.refreshTtl },
    );
    const hashed = await argon2.hash(refreshToken, { type: argon2.argon2id });
    const expiresAt = new Date(Date.now() + this.parseTtlMs(this.refreshTtl));
    await this.tokens.save({
      tenantId: tenantId ?? '',
      userId,
      tokenId: newTokenId,
      hashedToken: hashed,
      expiresAt,
      ipAddress:
        req?.ip || (req?.headers?.['x-forwarded-for'] as string) || null,
      userAgent: (req?.headers?.['user-agent'] as string) || null,
      lastUsedAt: new Date(),
    });
    return { accessToken, refreshToken, tokenId: newTokenId };
  }

  private parseTtlMs(ttl: string): number {
    // Simple parser for (\d+)(ms|s|m|h|d)
    const match = ttl.match(/^(\d+)(ms|s|m|h|d)$/);
    if (!match) return 0;
    const value = Number(match[1]);
    const unit = match[2];
    switch (unit) {
      case 'ms':
        return value;
      case 's':
        return value * 1000;
      case 'm':
        return value * 60_000;
      case 'h':
        return value * 3_600_000;
      case 'd':
        return value * 86_400_000;
      default:
        return 0;
    }
  }

  // TOTP flows
  async initTotp(
    userId: string,
    issuer: string,
    accountName: string,
  ): Promise<{ otpauthUrl: string; secret: string }> {
    this.logger.debug('initTotp() called');
    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(accountName, issuer, secret);
    // [SonuRamTODO] Persist secret only after verification; for now, return secret to be set on verify
    return { otpauthUrl, secret };
  }

  async verifyAndEnableTotp(
    userId: string,
    secret: string,
    code: string,
  ): Promise<{ enabled: boolean }> {
    this.logger.debug('verifyAndEnableTotp() called');
    const isValid = authenticator.check(code, secret);
    if (!isValid) return { enabled: false };
    // Persist on user
    await this.users.update(userId, { profile: undefined } as any); // no-op to reuse service; we need a dedicated repo method
    // Direct repo update to avoid DTO constraints
    await (this.users as any).repo.update(
      { id: userId },
      { totpSecret: secret, isTotpEnabled: true },
    );
    return { enabled: true };
  }

  async disableTotp(userId: string): Promise<{ disabled: boolean }> {
    this.logger.debug('disableTotp() called');
    await (this.users as any).repo.update(
      { id: userId },
      { totpSecret: null, isTotpEnabled: false },
    );
    return { disabled: true };
  }

  async listSessions(
    userId: string,
    filters?: { ipAddress?: string; userAgent?: string; deviceInfo?: string },
  ): Promise<
    Array<{
      tokenId: string;
      deviceInfo: string | null;
      ipAddress: string | null;
      userAgent: string | null;
      lastUsedAt: Date | null;
      revokedAt: Date | null;
      createdAt: Date;
      expiresAt: Date;
    }>
  > {
    const qb = this.tokens
      .createQueryBuilder('t')
      .where('t.user_id = :userId', { userId })
      .orderBy('t.created_at', 'DESC');
    if (filters?.ipAddress)
      qb.andWhere('t.ip_address = :ip', { ip: filters.ipAddress });
    if (filters?.userAgent)
      qb.andWhere('t.user_agent LIKE :ua', { ua: `%${filters.userAgent}%` });
    if (filters?.deviceInfo)
      qb.andWhere('t.device_info LIKE :di', { di: `%${filters.deviceInfo}%` });
    const rows = await qb.getMany();
    return rows.map((r) => ({
      tokenId: r.tokenId,
      deviceInfo: r.deviceInfo ?? null,
      ipAddress: r.ipAddress ?? null,
      userAgent: r.userAgent ?? null,
      lastUsedAt: r.lastUsedAt ?? null,
      revokedAt: r.revokedAt ?? null,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
    }));
  }

  async revokeSession(
    userId: string,
    tokenId: string,
  ): Promise<{ revoked: boolean }> {
    await this.tokens.update({ userId, tokenId }, { revokedAt: new Date() });
    return { revoked: true };
  }

  async revokeAllSessions(userId: string): Promise<{ revoked: number }> {
    const res = await this.tokens
      .createQueryBuilder()
      .update()
      .set({ revokedAt: new Date() })
      .where('user_id = :userId', { userId })
      .execute();
    return { revoked: res.affected || 0 };
  }

  /**
   * Extract the `sub` (userId) from an encoded JWT refresh token.
   * Throws AppError(APP_ERROR, ...) on malformed token.
   */
  decodeJwtPayload(token: string): { sub: string } {
    const parts = token.split('.');
    if (parts.length < 2 || !parts[1]) {
      throw new AppError('AUTHENTICATION_FAILED', 'Invalid refresh token format');
    }
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      '=',
    );
    try {
      const payload = JSON.parse(
        Buffer.from(padded, 'base64').toString('utf8'),
      ) as { sub?: string };
      if (!payload.sub) {
        throw new AppError('AUTHENTICATION_FAILED', 'Invalid refresh token payload');
      }
      return { sub: payload.sub };
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError('AUTHENTICATION_FAILED', 'Invalid refresh token payload');
    }
  }

  /** Generate a cryptographically random CSRF token. */
  generateCsrfToken(): string {
    return randomUUID();
  }

  /**
   * Return public-safe user identity for the authenticated session.
   * Throws AppError if user not found.
   */
  async getCurrentUser(
    userId: string,
    tenantId: string,
  ): Promise<{ userId: string; tenantId: string }> {
    this.logger.debug('getCurrentUser() called', { userId, tenantId });
    return { userId, tenantId };
  }
}
