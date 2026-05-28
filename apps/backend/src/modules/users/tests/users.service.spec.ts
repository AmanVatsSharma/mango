/**
 * @file src/modules/users/tests/users.service.spec.ts
 * @module users
 * @description Unit tests for UsersService
 * @author BharatERP
 * @created 2025-09-24
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../users.service';
import { UserEntity } from '../entities/user.entity';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { AppLoggerService } from '../../../shared/logger';
import { z } from 'zod';

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('hashed123'),
}));

describe('UsersService', () => {
  let service: UsersService;
  let repo: jest.Mocked<Partial<Repository<UserEntity>>>;

  beforeEach(async () => {
    repo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      findOneByOrFail: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(UserEntity),
          useValue: repo,
        },
        {
          provide: AppLoggerService,
          useValue: {
            setContext: jest.fn(),
            debug: jest.fn(),
            log: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            verbose: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('DTO shape (zod)', () => {
    it('CreateUserDto accepts valid shape', () => {
      const schema = z.object({
        tenantId: z.string().max(64),
        mobileE164: z.string().regex(/^\+[1-9]\d{1,14}$/),
        email: z.string().max(320).optional(),
        password: z.string().max(128).optional(),
      });
      const dto: CreateUserDto = {
        tenantId: 'TENANT_1',
        mobileE164: '+911234567890',
        email: 'test@example.com',
        password: 's3cr3t',
      };
      expect(() => schema.parse(dto)).not.toThrow();
    });

    it('UpdateUserDto accepts partial flags and email', () => {
      const schema = z.object({
        email: z.string().max(320).optional(),
        isMobileVerified: z.boolean().optional(),
        isEmailVerified: z.boolean().optional(),
        profile: z.record(z.string(), z.any()).optional(),
      });
      const dto: UpdateUserDto = {
        email: 'new@example.com',
        isMobileVerified: true,
        isEmailVerified: false,
        profile: { k: 'v' },
      };
      expect(() => schema.parse(dto)).not.toThrow();
    });
  });

  describe('create', () => {
    it('hashes password and saves user', async () => {
      const dto: CreateUserDto = {
        tenantId: 't1',
        mobileE164: '+911234567890',
        email: 'a@b.com',
        password: 'secret',
      };

      (repo.create as jest.Mock).mockImplementation((obj: Partial<UserEntity>) => ({
        ...obj,
      }));
      (repo.save as jest.Mock).mockImplementation(async (entity: Partial<UserEntity>) => ({
        id: 'uuid-1',
        isMobileVerified: false,
        isEmailVerified: false,
        isTotpEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...(entity as object),
      }));

      const result = await service.create(dto);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 't1',
          mobileE164: '+911234567890',
          email: 'a@b.com',
          passwordHash: 'hashed123',
        }),
      );
      expect(repo.save).toHaveBeenCalled();
      expect(result).toHaveProperty('passwordHash', 'hashed123');
      expect(result).toHaveProperty('id', 'uuid-1');
    });
  });

  describe('findByMobile', () => {
    it('returns a user when found', async () => {
      const user: Partial<UserEntity> = {
        id: 'id-2',
        tenantId: 't2',
        mobileE164: '+911112223334',
        passwordHash: 'hashed',
      };
      (repo.findOne as jest.Mock).mockResolvedValue(user);

      const result = await service.findByMobile('t2', '+911112223334');
      expect(repo.findOne).toHaveBeenCalledWith({ where: { tenantId: 't2', mobileE164: '+911112223334' } });
      expect(result).toEqual(user);
    });
  });

  describe('update', () => {
    it('updates provided fields and returns updated entity', async () => {
      (repo.update as jest.Mock).mockResolvedValue(undefined);
      (repo.findOneByOrFail as jest.Mock).mockResolvedValue({
        id: 'id-3',
        tenantId: 't3',
        mobileE164: '+919999999999',
        email: 'updated@example.com',
        isMobileVerified: true,
        isEmailVerified: false,
      });

      const updated = await service.update('id-3', {
        email: 'updated@example.com',
        isMobileVerified: true,
      });

      expect(repo.update).toHaveBeenCalledWith({ id: 'id-3' }, expect.any(Object));
      expect(repo.findOneByOrFail).toHaveBeenCalledWith({ id: 'id-3' });
      expect(updated).toMatchObject({ id: 'id-3', email: 'updated@example.com', isMobileVerified: true });
    });
  });
});


