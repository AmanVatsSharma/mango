// app/(main)/auth/kyc/page.tsx
// @ts-nocheck
'use client'

/**
 * @file kyc/page.tsx
 * @module app/(main)/auth
 * @description KYC submission route with status-aware verification form and desktop-enhanced shell.
 * @author StockTrade
 * @created 2026-02-16
 */

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { LogOut, User, Settings, ChevronDown } from "lucide-react";
import { getAppRoute, getAuthRoute } from "@/lib/branding-routes";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface KYCData {
  aadhaarNumber: string;
  panNumber: string;
  bankProofUrl?: string;
  bankProofKey?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

const MAX_KYC_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_KYC_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/jpg", "image/webp"];

export default function KYC() {
  const router = useRouter();
  const loginRoute = getAuthRoute("login");
  const dashboardRoute = getAppRoute("dashboard");
  const { data: session, status } = useSession();
  const [aadhaar, setAadhaar] = useState("");
  const [pan, setPan] = useState("");
  const [bankProof, setBankProof] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [existingKYC, setExistingKYC] = useState<KYCData | null>(null);
  const [isLoadingKYC, setIsLoadingKYC] = useState(true);

  // Check authentication status
  useEffect(() => {
    if (status === 'unauthenticated') {
      console.log('KYC: User unauthenticated, redirecting to login');
      router.push(loginRoute);
    }
  }, [status, router, loginRoute]);

  // Add a timeout to handle cases where session loading takes too long
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (status === 'loading' && !session) {
        console.log('Session loading timeout - will retry fetching session');
        // Don't redirect immediately, let the session retry
        // Refresh the page to force session reload
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
      }
    }, 15000); // 15 second timeout (increased)

    return () => clearTimeout(timeout);
  }, [status, session, router]);

  // Fetch existing KYC data
  useEffect(() => {
    const fetchKYCData = async () => {
      if (!session?.user?.id) {
        // If session is loading, wait for it
        if (status === 'loading') {
          return;
        }
        setIsLoadingKYC(false);
        return;
      }

      setIsLoadingKYC(true);
      setError("");

      try {
        const response = await fetch('/api/kyc', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
        });

        if (!response.ok) {
          if (response.status === 401) {
            console.log('KYC API returned 401, session may not be ready. Retrying in 2s...');
            // Wait a bit and retry once
            await new Promise(resolve => setTimeout(resolve, 2000));
            const retryResponse = await fetch('/api/kyc', {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
              },
              cache: 'no-store',
            });
            
            if (!retryResponse.ok) {
              setError("Session expired. Please login again.");
              setTimeout(() => router.push(loginRoute), 2000);
              return;
            }
            
            const retryData = await retryResponse.json();
            if (retryData.kyc) {
              setExistingKYC(retryData.kyc);
              setAadhaar(retryData.kyc.aadhaarNumber || "");
              setPan(retryData.kyc.panNumber || "");
            }
            return;
          }
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.kyc) {
          setExistingKYC(data.kyc);
          setAadhaar(data.kyc.aadhaarNumber || "");
          setPan(data.kyc.panNumber || "");
        }
      } catch (err) {
        console.error('Error fetching KYC data:', err);
        setError("Failed to load KYC data. Please refresh the page.");
      } finally {
        setIsLoadingKYC(false);
      }
    };

    if (session?.user?.id) {
      fetchKYCData();
    } else if (status !== 'loading') {
      setIsLoadingKYC(false);
    }
  }, [session, status, router]);

  const uploadToBankProofStorage = async (file: File): Promise<{ key: string; url: string }> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/kyc/upload', {
      method: 'POST',
      body: formData
    });

    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.success || !data?.key || !data?.url) {
      throw new Error(data?.error || 'Failed to upload KYC document.');
    }

    return { key: data.key, url: data.url };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!session?.user?.id) {
      setError("Session expired. Please login again.");
      setTimeout(() => router.push(loginRoute), 2000);
      return;
    }

    // Validate required fields
    if (!aadhaar || !pan) {
      setError("All fields are required. Please fill in Aadhaar and PAN.");
      return;
    }

    // Validate Aadhaar number format
    if (!/^\d{12}$/.test(aadhaar)) {
      setError("Invalid Aadhaar number. Please enter exactly 12 digits.");
      return;
    }

    // Validate PAN number format
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan)) {
      setError("Invalid PAN format. Use format: ABCDE1234F (5 letters, 4 numbers, 1 letter)");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      let bankProofUrl = "";
      let bankProofKey = "";

      if (bankProof) {
        if (!ALLOWED_KYC_IMAGE_MIME_TYPES.includes(bankProof.type)) {
          setError("Invalid file type. Only JPEG, JPG, PNG, and WEBP images are allowed.");
          setLoading(false);
          return;
        }

        if (bankProof.size > MAX_KYC_IMAGE_SIZE_BYTES) {
          setError("File size too large. Maximum allowed size is 5MB.");
          setLoading(false);
          return;
        }

        try {
          const uploaded = await uploadToBankProofStorage(bankProof);
          bankProofUrl = uploaded.url;
          bankProofKey = uploaded.key;
        } catch (uploadError) {
          setError(uploadError instanceof Error ? uploadError.message : "Failed to upload bank proof. Please try again.");
          setLoading(false);
          return;
        }
      } else if (existingKYC?.bankProofUrl || existingKYC?.bankProofKey) {
        bankProofUrl = existingKYC.bankProofUrl;
        bankProofKey = existingKYC.bankProofKey || "";
      } else {
        setError("Bank proof image is required. Please upload a cancelled cheque or passbook image.");
        setLoading(false);
        return;
      }

      const response = await fetch("/api/kyc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aadhaarNumber: aadhaar,
          panNumber: pan,
          bankProofUrl,
          bankProofKey,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          setError("Session expired. Please login again.");
          setTimeout(() => router.push(loginRoute), 2000);
          return;
        }
        throw new Error(data.error || 'Failed to submit KYC');
      }

      setSuccess("✅ KYC submitted successfully! Your documents are being reviewed by our team. You will be notified once approved.");
      
      // Redirect to dashboard after 3 seconds
      setTimeout(() => router.push(dashboardRoute), 3000);

    } catch (err: any) {
      console.error("KYC submission error:", err);
      if (err.message.includes("network") || err.message.includes("fetch")) {
        setError("Network error. Please check your internet connection and try again.");
      } else {
        setError(err.message || "Failed to submit KYC. Please try again or contact support.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (status === 'loading' || isLoadingKYC) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-orange-100 px-4">
        <div className="w-full max-w-md rounded-2xl border border-orange-100 bg-white/85 p-6 text-center shadow-sm backdrop-blur-md">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-700 font-medium">Loading KYC information...</p>
          <p className="mt-1 text-xs text-gray-500">Preparing your verification workspace.</p>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return null; // Will redirect via useEffect
  }

  // Show error state with retry option
  if (error && !isLoadingKYC && !existingKYC) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-orange-100 px-4">
        <div className="w-full max-w-md bg-white/85 backdrop-blur-md rounded-2xl shadow-lg p-8 border border-slate-100 text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">Error Loading KYC</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <div className="space-y-3">
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-primary hover:opacity-90 text-white font-medium py-3 rounded-lg shadow-lg transition"
            >
              Retry
            </button>
            <button
              onClick={() => router.push(loginRoute)}
              className="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-3 rounded-lg transition"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-orange-100 px-4 sm:px-6 lg:px-8 py-6">
      {/* Desktop User Dropdown - shown on lg+ screens */}
      <div className="fixed top-4 right-4 hidden lg:flex items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 h-auto py-1.5 px-3 rounded-full bg-white/80 hover:bg-white/90 shadow-lg backdrop-blur-md">
              <Avatar className="h-8 w-8">
                <AvatarImage src={session?.user?.image} alt={session?.user?.name || 'User'} />
                <AvatarFallback className="bg-gradient-to-br from-orange-500 to-amber-500 text-white text-sm">
                  {session?.user?.name?.charAt(0) || session?.user?.email?.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-start">
                <span className="text-sm font-medium text-gray-700 max-w-[150px] truncate">
                  {session?.user?.name || session?.user?.email?.split('@')[0] || 'User'}
                </span>
                <span className="text-xs text-gray-500 truncate max-w-[150px]">{session?.user?.email}</span>
              </div>
              <ChevronDown className="h-4 w-4 text-gray-500 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{session?.user?.name || 'User'}</p>
                <p className="text-xs leading-none text-muted-foreground">
                  {session?.user?.email || 'No email'}
                </p>
                {session?.user?.clientId && (
                  <p className="text-xs leading-none text-muted-foreground">
                    ID: {session.user.clientId}
                  </p>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push(dashboardRoute)}>
              <User className="mr-2 h-4 w-4" />
              <span>Dashboard</span>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut({ callbackUrl: getAuthRoute("login") })}>
              <LogOut className="mr-2 h-4 w-4" />
              <span>Switch Account</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => signOut({ callbackUrl: getAuthRoute("login") })} className="text-red-600 focus:text-red-600">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log Out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Mobile Logout Button - shown only on mobile */}
      <Button
        onClick={() => signOut({ callbackUrl: loginRoute })}
        className="fixed top-4 right-4 lg:hidden bg-white/80 hover:bg-white/90 text-gray-700 shadow-lg rounded-full p-2 backdrop-blur-md"
        size="icon"
        variant="ghost"
      >
        <LogOut className="h-5 w-5" />
      </Button>
      <div className="w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
        <div className="hidden lg:flex min-h-[620px] rounded-3xl border border-orange-100 bg-gradient-to-br from-orange-900 via-orange-800 to-amber-900 p-8 text-white shadow-2xl">
          <div className="flex flex-col justify-between">
            <div className="space-y-4">
              <h2 className="text-3xl font-bold leading-tight">Complete KYC once, unlock full trading access.</h2>
              <p className="text-sm text-orange-100/90">
                Submit your identity and bank proof documents securely. Our team reviews submissions quickly and updates your account status.
              </p>
            </div>
            <div className="space-y-2 text-sm text-orange-100/90">
              <p>• Bank-grade secure document handling</p>
              <p>• Fast review workflow with clear status updates</p>
              <p>• Required for complete trading feature access</p>
            </div>
          </div>
        </div>

        <div className="w-full bg-white/80 backdrop-blur-md rounded-2xl shadow-2xl p-6 sm:p-8 border border-slate-100">
          <h2 className="text-3xl font-semibold text-gray-900 text-center mb-6">
            KYC Verification
          </h2>
          <p className="text-gray-500 text-center mb-8">
            Please provide your details to complete verification.
          </p>

          {existingKYC && (
            <div className={`mb-6 p-4 rounded-lg ${existingKYC.status === 'PENDING' ? 'bg-yellow-50 text-yellow-700' :
                existingKYC.status === 'APPROVED' ? 'bg-green-50 text-green-700' :
                  'bg-red-50 text-red-700'
              }`}>
              <p className="font-medium">
                Current Status: {existingKYC.status}
              </p>
              {existingKYC.status === 'PENDING' && (
                <p className="text-sm mt-1">Your KYC is under review.</p>
              )}
              {existingKYC.status === 'APPROVED' && (
                <>
                  <p className="text-sm mt-1">Your KYC has been approved!</p>
                  <Button variant="outline" className="mt-2" onClick={() => router.push(dashboardRoute)}>Go to Dashboard</Button>
                </>
              )}
              {existingKYC.status === 'REJECTED' && (
                <p className="text-sm mt-1">Please resubmit your KYC with correct details.</p>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block mb-2 text-sm font-medium text-gray-700">
                  Aadhaar Number
                </label>
                <input
                  type="text"
                  value={aadhaar}
                  onChange={e => setAadhaar(e.target.value)}
                  required
                  placeholder="Enter Aadhaar Number"
                  pattern="[0-9]{12}"
                  maxLength={12}
                  className="w-full border border-slate-300 focus:ring-2 focus:ring-primary focus:border-primary rounded-lg px-4 py-2 transition shadow-sm"
                />
              </div>

              <div>
                <label className="block mb-2 text-sm font-medium text-gray-700">
                  PAN Number
                </label>
                <input
                  type="text"
                  value={pan}
                  onChange={e => setPan(e.target.value.toUpperCase())}
                  required
                  placeholder="Enter PAN Number"
                  pattern="[A-Z]{5}[0-9]{4}[A-Z]{1}"
                  maxLength={10}
                  className="w-full border border-slate-300 focus:ring-2 focus:ring-primary focus:border-primary rounded-lg px-4 py-2 transition shadow-sm"
                />
              </div>
            </div>

            <div>
              <label className="block mb-2 text-sm font-medium text-gray-700">
                Bank Cancelled Cheque Photo
              </label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/jpg,image/webp"
                onChange={e => setBankProof(e.target.files?.[0] || null)}
                required={!existingKYC?.bankProofUrl && !existingKYC?.bankProofKey}
                className="w-full border border-slate-300 focus:ring-2 focus:ring-primary focus:border-primary rounded-lg px-4 py-2 transition file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 shadow-sm"
              />
              <p className="text-xs text-gray-500 mt-1">Allowed: JPG, JPEG, PNG, WEBP. Max size: 5MB.</p>
              {(existingKYC?.bankProofUrl || existingKYC?.bankProofKey) && (
                <p className="text-sm text-gray-500 mt-1">
                  Current file uploaded. Choose a new file to replace it.
                </p>
              )}
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="p-3 rounded-lg bg-green-50 text-green-600 text-sm">
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:opacity-90 disabled:opacity-70 text-white font-medium py-3 rounded-lg shadow-lg transition"
            >
              {loading ? "Submitting..." : existingKYC ? "Update KYC" : "Submit KYC"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}