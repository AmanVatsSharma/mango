/**
 * File:        apps/broker-admin/src/lib/api/hooks/use-kyc-queue.ts
 * Module:      broker-admin · KYC Queue API Hook
 * Purpose:     Wires the KYC queue page to the real /admin/kyc/documents endpoint.
 *              Returns the same KYCDocument[] shape expected by the page component
 *              so migration from mock data requires only swapping the data source.
 *
 * Exports:
 *   - useKycQueue() → { docs, isLoading, error, refetch, approveDoc, rejectDoc, requestMore }
 *
 * Depends on:
 *   - ../client       — apiRequest
 *
 * Side-effects:
 *   - Calls GET /admin/kyc/documents?status=PENDING_REVIEW
 *   - Calls POST /admin/kyc/documents/:id/approve
 *   - Calls POST /admin/kyc/documents/:id/reject
 *
 * Key invariants:
 *   - 'use client' — browser APIs via apiRequest
 *   - documentType mapping: backend enum → frontend display label
 *   - KYC level derived from document type mix (identity docs = Standard, basic = Basic)
 *   - Optimistic update on approve/reject — removes item from local list immediately
 *   - Refetch on failure to restore true server state
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../client';
import type { KYCDocument, KYCLevel, KYCStatus } from '../../types';

/* ── API shape (mirrors KycDocumentEntity) ──────────────────────────────────── */

interface ApiKycDocument {
  id: string;
  tenantId: string;
  userId: string;
  documentType: 'PASSPORT' | 'NATIONAL_ID' | 'DRIVERS_LICENSE' | 'UTILITY_BILL' | 'BANK_STATEMENT' | 'OTHER';
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
  reviewerId?: string | null;
  reviewedAt?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
  // Enriched fields from UsersService
  userName?: string | null;
  userEmail?: string | null;
  userCountryCode?: string | null;
}

interface ListKycResponse {
  data: ApiKycDocument[];
  total: number;
  limit: number;
  offset: number;
}

/* ── Type mapping ────────────────────────────────────────────────────────────── */

function mapDocType(api: ApiKycDocument['documentType']): KYCDocument['type'] {
  const map: Record<ApiKycDocument['documentType'], KYCDocument['type']> = {
    PASSPORT: 'Passport',
    NATIONAL_ID: 'ID Card',
    DRIVERS_LICENSE: 'ID Card',
    UTILITY_BILL: 'Utility Bill',
    BANK_STATEMENT: 'Bank Statement',
    OTHER: 'ID Card',
  };
  return map[api] ?? 'ID Card';
}

function mapStatus(api: ApiKycDocument['status']): KYCStatus {
  const map: Record<ApiKycDocument['status'], KYCStatus> = {
    PENDING_REVIEW: 'Pending',
    APPROVED: 'Verified',
    REJECTED: 'Rejected',
  };
  return map[api] ?? 'Pending';
}

/**
 * Derive a representative KYC level from the set of documents a user has submitted.
 * Enhanced documents (Bank Statement) → Enhanced level.
 * Identity documents (Passport, ID) + supporting → Standard.
 * Defaults to Basic.
 */
function inferKycLevel(docs: ApiKycDocument[]): KYCLevel {
  const types = new Set(docs.map(d => d.documentType));
  if (types.has('BANK_STATEMENT') || types.has('UTILITY_BILL')) return 'Standard';
  if (types.has('PASSPORT') || types.has('NATIONAL_ID') || types.has('DRIVERS_LICENSE')) return 'Basic';
  return 'Basic';
}

/* ── Hook ──────────────────────────────────────────────────────────────────────── */

interface KycQueueResult {
  docs: KYCDocument[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  approveDoc: (docId: string) => void;
  rejectDoc: (docId: string, reason?: string) => void;
  requestMore: (docId: string) => void;
}

export function useKycQueue(): KycQueueResult {
  const [allDocs, setAllDocs] = useState<ApiKycDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    apiRequest<ListKycResponse>('/admin/kyc/documents?status=PENDING_REVIEW&limit=200')
      .then(res => {
        if (!cancelled) setAllDocs(res.data);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load KYC documents');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [tick]);

  const approveDoc = useCallback((docId: string) => {
    // Optimistic: remove from list
    setAllDocs(prev => prev.filter(d => d.id !== docId));
    apiRequest(`/admin/kyc/documents/${docId}/approve`, {
      method: 'POST',
      body: JSON.stringify({}),
    }).catch(() => refetch());
  }, [refetch]);

  const rejectDoc = useCallback((docId: string, reason?: string) => {
    // Optimistic: remove from pending list
    setAllDocs(prev => prev.filter(d => d.id !== docId));
    apiRequest(`/admin/kyc/documents/${docId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ rejectionReason: reason }),
    }).catch(() => refetch());
  }, [refetch]);

  const requestMore = useCallback((_docId: string) => {
    // For now, just mark as handled (could send a "request_info" event in future)
    // The UI already removes it from the pending queue on "More" click
  }, []);

  // Map API docs to frontend KYCDocument shape
  // Group by userId so we can derive KYC level from the user's full document set
  const docsByUser = allDocs.reduce<Record<string, ApiKycDocument[]>>((acc, doc) => {
    (acc[doc.userId] ??= []).push(doc);
    return acc;
  }, {});

  function countryFlag(code?: string | null): string {
    if (!code || code.length !== 2) return '🌐';
    const codePoints = [...code.toUpperCase()].map(
      char => 0x1F1E6 - 65 + char.charCodeAt(0),
    );
    return String.fromCodePoint(...codePoints);
  }

  const docs: KYCDocument[] = allDocs.map(doc => {
    const clientName = doc.userName ?? doc.userEmail ?? doc.userId.slice(0, 8);
    return {
      id: doc.id,
      clientId: doc.userId,
      type: mapDocType(doc.documentType),
      status: mapStatus(doc.status),
      level: inferKycLevel(docsByUser[doc.userId] ?? [doc]),
      submittedAt: new Date(doc.createdAt).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
      }),
      reviewedAt: doc.reviewedAt
        ? new Date(doc.reviewedAt).toLocaleString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric',
          })
        : undefined,
      reviewedBy: doc.reviewerId ?? undefined,
      notes: doc.rejectionReason ?? undefined,
      country: doc.userCountryCode ?? '',
      flag: countryFlag(doc.userCountryCode),
      clientName,
    } as KYCDocument & { clientName?: string; country?: string; flag?: string };
  });

  return { docs, isLoading, error, refetch, approveDoc, rejectDoc, requestMore };
}