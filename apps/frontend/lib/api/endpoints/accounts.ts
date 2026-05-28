/**
 * File:        apps/frontend/lib/api/endpoints/accounts.ts
 * Module:      Accounts API — balance, deposits, withdrawals, statements, bank accounts
 * Purpose:     All account-related HTTP calls to NestJS backend
 *
 * Depends on:
 *   - lib/api/client.ts — Axios instance
 *   - lib/types/auth.ts — User type (imported from auth)
 *
 * Author:      Mango Nx Workspace
 * Last-updated: 2026-05-17
 */

import apiClient from '../client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Balance {
  available: number;
  locked: number;
  total: number;
  currency: string;
  accountId: string;
}

export interface Deposit {
  id: string;
  amount: number;
  currency: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  method: 'UPI' | 'BANK_TRANSFER' | 'CRYPTO' | 'CASH' | 'CHEQUE' | 'EXTERNAL_PAY' | 'INTL_WIRE';
  utrRef?: string;
  createdAt: string;
  completedAt?: string;
}

export interface Withdrawal {
  id: string;
  amount: number;
  currency: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  method: 'UPI' | 'BANK_TRANSFER' | 'CRYPTO';
  accountNumber?: string;
  upiId?: string;
  createdAt: string;
  processedAt?: string;
}

export interface Statement {
  id: string;
  date: string;
  description: string;
  type: 'CREDIT' | 'DEBIT';
  amount: number;
  balance: number;
  category: string;
  referenceId?: string;
}

export interface BankAccount {
  id: string;
  bankName: string;
  accountNumber: string; // masked
  ifscCode: string;
  isPrimary: boolean;
  status: 'ACTIVE' | 'PENDING' | 'REJECTED';
  verifiedAt?: string;
}

export interface AddBankAccountData {
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  isPrimary?: boolean;
}

// ─── API Functions ────────────────────────────────────────────────────────────

export const accountsApi = {
  // GET /accounts/balance
  getBalance: async (accountId?: string): Promise<Balance> => {
    const params = accountId ? { accountId } : {};
    const response = await apiClient.get<Balance>('/accounts/balance', { params });
    return response.data;
  },

  // GET /balances
  getAllBalances: async (): Promise<Balance[]> => {
    const response = await apiClient.get<Balance[]>('/balances');
    return response.data;
  },

  // GET /accounts/deposits
  getDeposits: async (params?: { page?: number; limit?: number; status?: string }): Promise<{ data: Deposit[]; total: number }> => {
    const response = await apiClient.get<{ data: Deposit[]; total: number }>('/accounts/deposits', { params });
    return response.data;
  },

  // GET /accounts/withdrawals
  getWithdrawals: async (params?: { page?: number; limit?: number; status?: string }): Promise<{ data: Withdrawal[]; total: number }> => {
    const response = await apiClient.get<{ data: Withdrawal[]; total: number }>('/accounts/withdrawals', { params });
    return response.data;
  },

  // POST /accounts/deposits
  createDeposit: async (data: { amount: number; method: Deposit['method']; utrRef?: string }): Promise<Deposit> => {
    const response = await apiClient.post<Deposit>('/accounts/deposits', data);
    return response.data;
  },

  // POST /accounts/withdrawals
  createWithdrawal: async (data: { amount: number; method: Withdrawal['method']; accountId?: string; mpin?: string }): Promise<Withdrawal> => {
    const response = await apiClient.post<Withdrawal>('/accounts/withdrawals', data);
    return response.data;
  },

  // GET /accounts/statements
  getStatements: async (params?: {
    from?: string;
    to?: string;
    category?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: Statement[]; total: number }> => {
    const response = await apiClient.get<{ data: Statement[]; total: number }>('/accounts/statements', { params });
    return response.data;
  },

  // GET /accounts/bank-accounts
  getBankAccounts: async (): Promise<BankAccount[]> => {
    const response = await apiClient.get<BankAccount[]>('/accounts/bank-accounts');
    return response.data;
  },

  // POST /accounts/bank-accounts
  addBankAccount: async (data: AddBankAccountData): Promise<BankAccount> => {
    const response = await apiClient.post<BankAccount>('/accounts/bank-accounts', data);
    return response.data;
  },

  // DELETE /accounts/bank-accounts/:id
  removeBankAccount: async (id: string): Promise<void> => {
    await apiClient.delete(`/accounts/bank-accounts/${id}`);
  },

  // PUT /accounts/bank-accounts/:id (set primary)
  setPrimaryBankAccount: async (id: string): Promise<BankAccount> => {
    const response = await apiClient.put<BankAccount>(`/accounts/bank-accounts/${id}`, { isPrimary: true });
    return response.data;
  },
};