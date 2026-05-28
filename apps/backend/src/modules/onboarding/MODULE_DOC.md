---
title: Onboarding Module
created: 2026-02-17
maintainer: BharatERP
---

## Purpose
Scaffolds onboarding/KYC profile workflows and AML flag storage per tenant user.

## Entities
- OnboardingProfileEntity

## APIs
- POST /onboarding/profiles
- GET /onboarding/profiles?tenantId=...

## Dependencies
- Shared logger
- TypeORM profile repository

## Changelog
- 2026-02-17 IST: Added onboarding scaffold with DTO validation, profile entity, controller/service APIs, tests, exports, and docs.
