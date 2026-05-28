/**
 * @file src/modules/users/users.service.ts
 * @module users
 * @description Users service with basic CRUD and hashing via argon2
 * @author BharatERP
 * @created 2025-09-18
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { UserEntity } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import * as argon2 from 'argon2';
import { AppLoggerService } from '../../shared/logger';
import { ListUsersDto } from './dto/list-users.dto';
import { UserNotFoundError } from '../../common/errors/domain.errors';
import { getRequestContext } from '../../shared/request-context';
import { AppError } from '../../common/errors/app-error';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity) private readonly repo: Repository<UserEntity>,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(UsersService.name);
  }

  async create(dto: CreateUserDto): Promise<UserEntity> {
    this.logger.debug('create() called');
    const passwordHash = dto.password
      ? await argon2.hash(dto.password, { type: argon2.argon2id })
      : await argon2.hash('temp', { type: argon2.argon2id });
    const entity = this.repo.create({
      tenantId: dto.tenantId,
      mobileE164: dto.mobileE164,
      email: dto.email ?? null,
      passwordHash,
    });
    return this.repo.save(entity);
  }

  findByMobile(
    tenantId: string,
    mobileE164: string,
  ): Promise<UserEntity | null> {
    this.logger.debug('findByMobile() called');
    return this.repo.findOne({ where: { tenantId, mobileE164 } });
  }

  async findAll(
    tenantId: string,
    dto: ListUsersDto,
  ): Promise<{ data: UserEntity[]; page: number; limit: number; total: number }> {
    this.logger.debug('findAll() called');
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const qb = this.repo.createQueryBuilder('u').where('u.tenantId = :tenantId', {
      tenantId,
    });
    if (dto.search) {
      qb.andWhere(
        '(LOWER(u.mobileE164) LIKE :q OR LOWER(u.email) LIKE :q)',
        { q: `%${dto.search.toLowerCase()}%` },
      );
    }
    qb.orderBy('u.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [rows, total] = await qb.getManyAndCount();
    return { data: rows, page, limit, total };
  }

  async findOneOrThrow(tenantId: string, id: string): Promise<UserEntity> {
    this.logger.debug('findOneOrThrow() called');
    const user = await this.repo.findOne({ where: { id, tenantId } });
    if (!user) throw new UserNotFoundError('User not found for tenant');
    return user;
  }

  /**
   * Lightweight user lookup by ID — used by cross-module enrichment
   * (e.g. KYC document list needs userName, email, countryCode).
   * Does NOT throw; returns null if user not found.
   */
  async findById(id: string): Promise<UserEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserEntity> {
    this.logger.debug('update() called');
    const toUpdate: QueryDeepPartialEntity<UserEntity> = {} as any;
    if (dto.email !== undefined) (toUpdate as any).email = dto.email ?? null;
    if (dto.isMobileVerified !== undefined)
      (toUpdate as any).isMobileVerified = dto.isMobileVerified;
    if (dto.isEmailVerified !== undefined)
      (toUpdate as any).isEmailVerified = dto.isEmailVerified;
    if (dto.profile !== undefined)
      (toUpdate as any).profile = dto.profile as any;
    if (dto.kycStatus !== undefined)
      (toUpdate as any).kycStatus = dto.kycStatus;
    await this.repo.update({ id }, toUpdate);
    const updated = await this.repo.findOneByOrFail({ id });
    return updated;
  }

  async updateProfileSelf(userId: string, dto: UpdateProfileDto): Promise<UserEntity> {
    const ctx = getRequestContext();
    if (!ctx?.tenantId) {
      throw new AppError('VALIDATION_ERROR', 'Tenant context missing');
    }
    this.logger.debug('updateProfileSelf() called', { userId, tenantId: ctx.tenantId });
    const partial: QueryDeepPartialEntity<UserEntity> = {} as any;
    if (dto.name !== undefined) (partial as any).name = dto.name ?? null;
    if (dto.address !== undefined) (partial as any).address = dto.address as any;
    if (dto.preferences !== undefined) (partial as any).preferences = dto.preferences as any;
    if (dto.marketingOptIn !== undefined)
      (partial as any).marketingOptIn = dto.marketingOptIn;
    if (dto.countryCode !== undefined) (partial as any).countryCode = dto.countryCode ?? null;
    if (dto.taxResidencyCountry !== undefined)
      (partial as any).taxResidencyCountry = dto.taxResidencyCountry ?? null;
    if (dto.referralSource !== undefined)
      (partial as any).referralSource = dto.referralSource ?? null;

    await this.repo.update({ id: userId, tenantId: ctx.tenantId }, partial);
    const updated = await this.repo.findOne({ where: { id: userId, tenantId: ctx.tenantId } });
    if (!updated) throw new UserNotFoundError('User not found for tenant');
    return updated;
  }

  async requestEmailVerification(userId: string, email: string): Promise<{ requested: boolean }> {
    const ctx = getRequestContext();
    if (!ctx?.tenantId) {
      throw new AppError('VALIDATION_ERROR', 'Tenant context missing');
    }
    this.logger.debug('requestEmailVerification()', { userId, email });
    await this.repo.update(
      { id: userId, tenantId: ctx.tenantId },
      { email, isEmailVerified: false },
    );
    return { requested: true };
  }

  async confirmEmailVerification(
    userId: string,
    email: string,
    code: string,
  ): Promise<{ verified: boolean }> {
    const ctx = getRequestContext();
    if (!ctx?.tenantId) {
      throw new AppError('VALIDATION_ERROR', 'Tenant context missing');
    }
    const devBypass = (process.env.NODE_ENV || 'development') !== 'production';
    if (!devBypass && code !== '000000') {
      throw new AppError('AUTHENTICATION_FAILED', 'Invalid verification code');
    }
    await this.repo.update(
      { id: userId, tenantId: ctx.tenantId },
      { email, isEmailVerified: true },
    );
    return { verified: true };
  }

  async requestMobileVerification(
    userId: string,
    mobileE164: string,
  ): Promise<{ requested: boolean }> {
    const ctx = getRequestContext();
    if (!ctx?.tenantId) {
      throw new AppError('VALIDATION_ERROR', 'Tenant context missing');
    }
    const existing = await this.repo.findOne({
      where: { tenantId: ctx.tenantId, mobileE164 },
    });
    if (existing && existing.id !== userId) {
      throw new AppError('DUPLICATE_RESOURCE', 'Mobile already in use for tenant');
    }
    await this.repo.update(
      { id: userId, tenantId: ctx.tenantId },
      { mobileE164, isMobileVerified: false },
    );
    return { requested: true };
  }

  async confirmMobileVerification(
    userId: string,
    mobileE164: string,
    code: string,
  ): Promise<{ verified: boolean }> {
    const ctx = getRequestContext();
    if (!ctx?.tenantId) {
      throw new AppError('VALIDATION_ERROR', 'Tenant context missing');
    }
    const devBypass = (process.env.NODE_ENV || 'development') !== 'production';
    if (!devBypass && code !== '000000') {
      throw new AppError('AUTHENTICATION_FAILED', 'Invalid verification code');
    }
    await this.repo.update(
      { id: userId, tenantId: ctx.tenantId },
      { mobileE164, isMobileVerified: true },
    );
    return { verified: true };
  }

  async deactivate(
    tenantId: string,
    id: string,
    reason?: string,
  ): Promise<UserEntity> {
    this.logger.debug('deactivate() called');
    const user = await this.findOneOrThrow(tenantId, id);
    await this.repo.update(
      { id: user.id },
      { isActive: false, deactivatedAt: new Date(), deactivatedReason: reason ?? null },
    );
    return this.findOneOrThrow(tenantId, id);
  }

  async reactivate(tenantId: string, id: string): Promise<UserEntity> {
    this.logger.debug('reactactivate() called');
    const user = await this.findOneOrThrow(tenantId, id);
    await this.repo.update(
      { id: user.id },
      { isActive: true, deactivatedAt: null, deactivatedReason: null },
    );
    return this.findOneOrThrow(tenantId, id);
  }

  /**
   * Counts active, non-locked users for a tenant. Used by BrokerMetricsService to
   * report "clients" per broker without loading full user rows.
   */
  async countActiveByTenant(tenantId: string): Promise<number> {
    return this.repo.count({
      where: { tenantId, isActive: true, isLocked: false },
    });
  }
}
