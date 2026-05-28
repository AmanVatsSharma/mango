/**
 * @file MaintenanceMode.tsx
 * @module maintenance-ui
 * @description Public maintenance landing UI; message and end time from GET /api/maintenance/status (DB-backed) with env fallback
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-04-03
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Clock, Wrench, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { LiquidBackground, GlowingText } from '@/components/404';
import { BRAND_IDENTITY, mailtoSupport } from '@/Branding';
import type { MaintenanceStatus } from '@/lib/maintenance';

const DEFAULT_MESSAGE =
  "We're performing scheduled maintenance to improve your experience. We'll be back shortly!";

type StatusResponse = {
  success: boolean;
  data?: MaintenanceStatus;
  error?: string;
};

function envFallbackMessage(): string {
  return process.env.MAINTENANCE_MESSAGE || DEFAULT_MESSAGE;
}

function envFallbackEndTime(): string | undefined {
  return process.env.MAINTENANCE_END_TIME;
}

/** True when `endTime` can drive a live HH:MM:SS countdown (ISO or Date-parsable). */
function isParsableCountdownEnd(endTime: string | undefined): boolean {
  if (!endTime?.trim()) return false;
  return Number.isFinite(Date.parse(endTime));
}

export default function MaintenanceMode() {
  const [status, setStatus] = useState<MaintenanceStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastChecked, setLastChecked] = useState(() => new Date());

  const fetchStatus = useCallback(async (): Promise<MaintenanceStatus> => {
    const res = await fetch('/api/maintenance/status', { cache: 'no-store' });
    const json = (await res.json()) as StatusResponse;
    if (!res.ok || !json.success || !json.data) {
      throw new Error(json.error || 'Failed to load maintenance status');
    }
    return json.data;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setLoading(true);
        setLoadError(null);
        const data = await fetchStatus();
        if (!cancelled) {
          setStatus(data);
          setLastChecked(new Date());
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'Unknown error');
          setStatus(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchStatus]);

  const maintenanceMessage = status?.message?.trim() || envFallbackMessage();

  const rawEndTime = status?.endTime?.trim() || envFallbackEndTime();
  const showCountdown = Boolean(rawEndTime && isParsableCountdownEnd(rawEndTime));
  const operational = status != null && !status.isMaintenanceMode;

  useEffect(() => {
    if (!showCountdown || !rawEndTime) {
      setTimeLeft('');
      return;
    }

    const tick = () => {
      const now = Date.now();
      const endMs = Date.parse(rawEndTime);
      const difference = endMs - now;
      if (difference > 0) {
        const hours = Math.floor(difference / (1000 * 60 * 60));
        const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((difference % (1000 * 60)) / 1000);
        setTimeLeft(
          `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`,
        );
      } else {
        setTimeLeft('00:00:00');
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [showCountdown, rawEndTime]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setLastChecked(new Date());
    try {
      const data = await fetchStatus();
      setStatus(data);
      setLoadError(null);
      if (!data.isMaintenanceMode) {
        window.location.assign('/');
      }
    } catch {
      setLoadError('Could not refresh status');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleAdminBypass = () => {
    window.alert(
      'Admin bypass is available for ADMIN and SUPER_ADMIN roles. Please log in with appropriate credentials to access the system during maintenance.',
    );
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black">
      <LiquidBackground />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-8">

        <div className="mb-6 text-center">
          <GlowingText size="large">MAINTENANCE</GlowingText>
        </div>

        <div className="mb-8 text-center">
          <h2 className="mb-4 text-2xl font-semibold text-cyan-300 sm:text-3xl lg:text-4xl">
            System Under Maintenance
          </h2>
          <p className="mx-auto max-w-md text-base text-slate-400 sm:text-lg">
            {maintenanceMessage}
            <br className="hidden sm:block" />
            We&apos;ll be back online shortly.
          </p>
          {loadError && (
            <p className="mt-2 text-xs text-amber-400/90">
              Live status unavailable; showing fallback message. ({loadError})
            </p>
          )}
        </div>

        <div className="relative z-10 w-full max-w-2xl">
          <Card className="bg-slate-900/90 backdrop-blur-sm border-slate-700/50 shadow-2xl ring-1 ring-cyan-500/20">
            <CardContent className="space-y-6 p-6">
              {loading && (
                <div className="flex justify-center text-sm text-slate-400">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading current maintenance status…
                </div>
              )}

              <div className="flex justify-center">
                <Badge 
                  className="px-4 py-2 text-sm font-medium bg-orange-500/20 text-orange-300 border-orange-500/50 ring-1 ring-orange-500/30"
                  style={{
                    boxShadow: '0 0 20px rgba(251, 146, 60, 0.3)',
                  }}
                >
                  <AlertCircle className="w-4 h-4 mr-2" />
                  Maintenance in Progress
                </Badge>
              </div>

              {showCountdown && rawEndTime && (
                <div className="text-center">
                  <div className="inline-flex items-center gap-2 text-cyan-300 mb-2">
                    <Clock className="w-5 h-5" />
                    <span className="text-sm font-medium">Estimated completion time:</span>
                  </div>
                  <div 
                    className="text-4xl font-mono font-bold text-cyan-400 mb-2"
                    style={{
                      textShadow: '0 0 10px rgba(0, 217, 255, 0.5), 0 0 20px rgba(0, 217, 255, 0.3)',
                    }}
                  >
                    {timeLeft}
                  </div>
                  <div className="text-sm text-slate-400">
                    {new Date(rawEndTime).toLocaleString()}
                  </div>
                </div>
              )}

              {rawEndTime && !showCountdown && (
                <div className="text-center text-sm text-slate-400">
                  <div className="inline-flex items-center justify-center gap-2 text-cyan-300/90">
                    <Clock className="w-4 h-4 shrink-0" />
                    <span>Estimated completion: {rawEndTime}</span>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <CheckCircle className="w-4 h-4 text-green-400" style={{ filter: 'drop-shadow(0 0 4px rgba(34, 197, 94, 0.5))' }} />
                  <span className="text-slate-300">Database optimization</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <CheckCircle className="w-4 h-4 text-green-400" style={{ filter: 'drop-shadow(0 0 4px rgba(34, 197, 94, 0.5))' }} />
                  <span className="text-slate-300">Security updates</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" style={{ filter: 'drop-shadow(0 0 4px rgba(0, 217, 255, 0.5))' }} />
                  <span className="text-slate-300">Performance improvements</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-4 h-4 rounded-full border-2 border-slate-600"></div>
                  <span className="text-slate-400">Final testing</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <Button
                  onClick={() => void handleRefresh()}
                  disabled={isRefreshing}
                  className="group relative flex-1 min-w-[200px] overflow-hidden rounded-lg bg-transparent px-8 py-3 text-base font-semibold text-cyan-300 ring-2 ring-cyan-500/50 transition-all duration-300 hover:bg-cyan-500/10 hover:ring-cyan-400/70"
                  style={{
                    boxShadow: '0 0 20px rgba(0, 217, 255, 0.3)',
                  }}
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    {isRefreshing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Checking...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        Check Status
                      </>
                    )}
                  </span>
                  <span className="absolute inset-0 -z-10 bg-cyan-500/20 blur-xl transition-opacity duration-300 group-hover:opacity-100"></span>
                </Button>
                
                <Button
                  onClick={handleAdminBypass}
                  variant="outline"
                  className="flex-1 min-w-[200px] border-slate-600 bg-slate-900/50 px-8 py-3 text-base font-semibold text-slate-300 backdrop-blur-sm transition-all duration-300 hover:bg-slate-800/70 hover:text-white"
                >
                  <span className="flex items-center justify-center gap-2">
                    <Wrench className="w-4 h-4" />
                    Admin Access
                  </span>
                </Button>
              </div>

              <div className="text-center text-xs text-slate-500 pt-2">
                Last checked: {lastChecked.toLocaleTimeString()}
              </div>

              <div className="text-center text-sm text-slate-400 pt-4 border-t border-slate-700/50">
                <p>
                  Need immediate assistance?{' '}
                  <a 
                    href={mailtoSupport()} 
                    className="text-cyan-400 hover:text-cyan-300 underline transition-colors"
                  >
                    {`Contact ${BRAND_IDENTITY.names.short} Support`}
                  </a>
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="mt-12 text-center">
            <p className="text-sm text-slate-500">
              System Status:{' '}
              <span className={`font-medium ${operational ? 'text-green-400' : 'text-orange-400'}`}>
                {loading ? 'Checking…' : operational ? 'Operational' : 'Under Maintenance'}
              </span>
            </p>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="absolute h-1 w-1 rounded-full bg-cyan-400/40 animate-pulse"
              style={{
                left: `${10 + i * 12}%`,
                top: `${15 + i * 8}%`,
                animationDelay: `${i * 0.7}s`,
                animationDuration: `${2.5 + i * 0.4}s`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
