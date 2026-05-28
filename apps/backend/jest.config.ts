/**
 * @file apps/backend/jest.config.ts
 * @module backend
 * @description Jest configuration for backend application tests
 * @author BharatERP
 * @created 2026-02-17
 */

import type { Config } from 'jest';

const config: Config = {
  displayName: 'backend',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  rootDir: '.',
  moduleFileExtensions: ['ts', 'js', 'json'],
  testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/test/**/*.spec.ts'],
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  collectCoverageFrom: ['<rootDir>/src/**/*.(t|j)s'],
  coverageDirectory: '../../coverage/apps/backend',
};

export default config;
