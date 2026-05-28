/**
 * @file src/modules/users/users.controller.ts
 * @module users
 * @description Users controller exposing basic endpoints
 * @author BharatERP
 * @created 2025-09-18
 */

import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { UsersService } from './users.service';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateUserDto } from './dto/create-user.dto';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'Create user (public/tenant provided in body)' })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get(':tenantId/:mobile')
  @ApiOperation({ summary: 'Find user by tenant and mobile' })
  findByMobile(
    @Param('tenantId') tenantId: string,
    @Param('mobile') mobile: string,
  ) {
    return this.usersService.findByMobile(tenantId, mobile);
  }
}
