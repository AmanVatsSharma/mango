/**
 * @file src/modules/users/tests/users.controller.spec.ts
 * @module users
 * @description Unit tests for UsersController
 * @author BharatERP
 * @created 2025-09-24
 */

import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from '../users.controller';
import { UsersService } from '../users.service';
import { CreateUserDto } from '../dto/create-user.dto';

describe('UsersController', () => {
  let controller: UsersController;
  let service: { create: jest.Mock; findByMobile: jest.Mock };

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      findByMobile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  describe('create', () => {
    it('delegates to service.create', async () => {
      const dto: CreateUserDto = {
        tenantId: 't1',
        mobileE164: '+911234567890',
        email: 'a@b.com',
        password: 'secret',
      };
      const created = { id: 'id-1', ...dto, passwordHash: 'hashed' } as any;
      service.create.mockResolvedValue(created);

      const result = await controller.create(dto);
      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result).toBe(created);
    });
  });

  describe('findByMobile', () => {
    it('delegates to service.findByMobile', async () => {
      const user = { id: 'id-2', tenantId: 't1', mobileE164: '+911234567890' };
      service.findByMobile.mockResolvedValue(user);

      const result = await controller.findByMobile('t1', '+911234567890');
      expect(service.findByMobile).toHaveBeenCalledWith('t1', '+911234567890');
      expect(result).toBe(user);
    });
  });
});


