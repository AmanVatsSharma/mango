// components/queue-monitor.tsx
"use client";
import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Activity, 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  Trash2,
  RefreshCw,
  Loader2
} from 'lucide-react';

interface QueueStatus {
  queueLength: number;
  isProcessing: boolean;
  requestCount: number;
  requestsPerMinute: number;
  lastRequestTime: number;
  timeSinceLastRequest: number;
  recommendations: {
    isHealthy: boolean;
    shouldSlowDown: boolean;
    critical: boolean;
  };
}

export default function QueueMonitor() {
  const [status, setStatus] = useState<QueueStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/admin/queue-status');
      const data = await response.json();
      
      if (data.success) {
        setStatus(data.data);
      } else {
        setError(data.error || 'Failed to fetch queue status');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  const clearQueue = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/admin/queue-status', { method: 'DELETE' });
      const data = await response.json();
      
      if (data.success) {
        await fetchStatus(); // Refresh status
      } else {
        setError(data.error || 'Failed to clear queue');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000); // Update every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = () => {
    if (!status) return 'text-gray-500';
    if (status.recommendations.critical) return 'text-red-500';
    if (status.recommendations.shouldSlowDown) return 'text-yellow-500';
    if (status.recommendations.isHealthy) return 'text-green-500';
    return 'text-gray-500';
  };

  const getStatusIcon = () => {
    if (!status) return Clock;
    if (status.recommendations.critical) return AlertTriangle;
    if (status.recommendations.shouldSlowDown) return AlertTriangle;
    if (status.recommendations.isHealthy) return CheckCircle;
    return Activity;
  };

  const StatusIcon = getStatusIcon();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center space-x-2">
              <StatusIcon className={`h-5 w-5 ${getStatusColor()}`} />
              <span>Request Queue Monitor</span>
            </CardTitle>
            <CardDescription>
              Rate limiting and request queue status
            </CardDescription>
          </div>
          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchStatus}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={clearQueue}
              disabled={isLoading || !status?.queueLength}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {status ? (
          <>
            {/* Status Overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{status.queueLength}</p>
                <p className="text-sm text-gray-500">Queued Requests</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{status.requestCount}</p>
                <p className="text-sm text-gray-500">Total Requests</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-orange-600">{status.requestsPerMinute}</p>
                <p className="text-sm text-gray-500">Requests/Min</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-purple-600">
                  {Math.round(status.timeSinceLastRequest / 1000)}s
                </p>
                <p className="text-sm text-gray-500">Last Request</p>
              </div>
            </div>

            {/* Status Indicators */}
            <div className="flex flex-wrap gap-2">
              <Badge variant={status.isProcessing ? "default" : "secondary"}>
                {status.isProcessing ? "Processing" : "Idle"}
              </Badge>
              
              <Badge variant={status.recommendations.isHealthy ? "default" : "destructive"}>
                {status.recommendations.isHealthy ? "Healthy" : "Issues Detected"}
              </Badge>
              
              {status.recommendations.shouldSlowDown && (
                <Badge variant="destructive">Slow Down</Badge>
              )}
              
              {status.recommendations.critical && (
                <Badge variant="destructive">Critical</Badge>
              )}
            </div>

            {/* Recommendations */}
            {!status.recommendations.isHealthy && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {status.recommendations.critical 
                    ? "Critical: Too many requests per minute. Consider reducing API calls."
                    : "Warning: Approaching rate limits. Consider slowing down requests."
                  }
                </AlertDescription>
              </Alert>
            )}

            {/* Queue Details */}
            <div className="bg-gray-50 p-4 rounded-md">
              <h4 className="font-semibold mb-2">Queue Details</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Queue Length:</span>
                  <span className="ml-2 font-medium">{status.queueLength}</span>
                </div>
                <div>
                  <span className="text-gray-500">Processing:</span>
                  <span className="ml-2 font-medium">{status.isProcessing ? "Yes" : "No"}</span>
                </div>
                <div>
                  <span className="text-gray-500">Requests/Minute:</span>
                  <span className="ml-2 font-medium">{status.requestsPerMinute}/30</span>
                </div>
                <div>
                  <span className="text-gray-500">Time Since Last:</span>
                  <span className="ml-2 font-medium">
                    {Math.round(status.timeSinceLastRequest / 1000)}s ago
                  </span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Loading queue status...</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
