/**
 * File:        apps/backend/src/modules/admin/controllers/admin-deployment.controller.ts
 * Module:      admin
 * Purpose:     REST controller for deployment management and visibility.
 *              Exposes deployment status, deploy trigger, history, and live logs
 *              to broker admins.
 *
 * Exports:
 *   - AdminDeploymentController   — NestJS REST controller
 *
 * Depends on:
 *   - AdminDeploymentService      — deployment management logic
 *   - BrokerAdminGuard            — broker-scoped auth
 *   - JwtAuthGuard                — JWT authentication
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - All endpoints require BrokerAdminGuard.
 *   - triggerDeploy is non-blocking — HTTP response returns immediately while
 *     deploy runs asynchronously; clients poll getDeployHistory to track progress.
 *   - getDeployHistory maps internal 'running|success|failed' → PUBLIC 'IN_PROGRESS|SUCCESS|FAILED'.
 *
 * Read order:
 *   1. AdminDeploymentController — route definitions
 *   2. AdminDeploymentService     — implementation
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { BrokerAdminGuard } from '../../rbac/guards/broker-admin.guard';
import { AdminDeploymentService } from '../services/admin-deployment.service';

type BrokerAdminRequest = Request & { tenantId?: string };

@ApiTags('Admin — Deployment')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, BrokerAdminGuard)
@Controller('admin/deployment')
export class AdminDeploymentController {
  constructor(private readonly deploymentService: AdminDeploymentService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get current deployment status and health checks' })
  @ApiResponse({ status: 200, description: 'Deployment status' })
  async getDeploymentStatus(@Req() _req: BrokerAdminRequest) {
    return this.deploymentService.getDeploymentStatus();
  }

  @Post('deploy')
  @ApiOperation({ summary: 'Trigger a new deployment (simulated)' })
  @ApiResponse({ status: 202, description: 'Deploy triggered — poll /admin/deployment/history for status' })
  async triggerDeploy(
    @Req() _req: BrokerAdminRequest,
    @Body() body: { version?: string },
  ) {
    return this.deploymentService.triggerDeploy(body.version);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get deployment history' })
  @ApiResponse({ status: 200, description: 'List of past deploys' })
  async getDeployHistory(@Req() _req: BrokerAdminRequest, @Query('limit') limit?: string) {
    const parsed = limit ? Math.min(parseInt(limit, 10) || 20, 100) : 20;
    const records = await this.deploymentService.getDeployHistory(parsed);
    // Map internal status to the PUBLIC-facing shape expected by broker-admin
    return records.map((r) => ({
      id:          r.id,
      version:     r.version,
      timestamp:   r.timestamp,
      status:      r.status === 'running' ? 'IN_PROGRESS' : r.status === 'failed' ? 'FAILED' : 'SUCCESS',
      triggeredBy: r.triggeredBy,
      durationMs:  r.durationMs ?? null,
      commitSha:   r.commitSha ?? null,
    }));
  }

  @Get('logs')
  @ApiOperation({ summary: 'Get logs for a specific deploy or the latest deploy' })
  @ApiResponse({ status: 200, description: 'Deploy log entries' })
  async getDeployLogs(@Req() _req: BrokerAdminRequest, @Query('deployId') deployId?: string) {
    return this.deploymentService.getDeployLogs(deployId);
  }
}