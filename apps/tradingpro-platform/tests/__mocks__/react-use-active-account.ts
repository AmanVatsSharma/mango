/**
 * File:        tests/__mocks__/react-use-active-account.ts
 * Module:      test-mocks
 * Purpose:     Re-export from @testing-library/react for backward compatibility.
 *              Existing test files import { renderHook, act } from this path.
 *              Once all tests are migrated, delete this file and update imports to:
 *                `import { renderHook, act } from "@testing-library/react"`
 *
 * Exports:     re-exports renderHook and act from @testing-library/react
 *
 * Depends on:
 *   - @testing-library/react — real renderHook implementation
 *
 * Side-effects: none
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-15
 */

// @testing-library/react v16 is already installed.
// This file exists so existing test imports continue to work.
// Update imports to "@testing-library/react" directly when convenient.
const { renderHook, act } = require("@testing-library/react")
module.exports = { renderHook, act }