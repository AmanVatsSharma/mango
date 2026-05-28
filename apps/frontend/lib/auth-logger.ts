// lib/auth-logger.ts
import { prisma } from "@/lib/prisma";
import { getTrustedClientIp, headersFromIncoming } from "@/lib/server/trusted-client-ip";

export type AuthEventType = 
  | 'REGISTRATION_ATTEMPT'
  | 'REGISTRATION_SUCCESS'
  | 'REGISTRATION_FAILED'
  | 'LOGIN_ATTEMPT'
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'OTP_SENT'
  | 'OTP_VERIFIED'
  | 'OTP_FAILED'
  | 'OTP_RESEND'
  | 'MPIN_SETUP_ATTEMPT'
  | 'MPIN_SETUP_SUCCESS'
  | 'MPIN_SETUP_FAILED'
  | 'MPIN_VERIFY_ATTEMPT'
  | 'MPIN_VERIFY_SUCCESS'
  | 'MPIN_VERIFY_FAILED'
  | 'MPIN_RESET_ATTEMPT'
  | 'MPIN_RESET_SUCCESS'
  | 'MPIN_RESET_FAILED'
  | 'SESSION_CREATED'
  | 'SESSION_EXPIRED'
  | 'SESSION_INVALIDATED'
  | 'PHONE_VERIFIED'
  | 'KYC_SUBMITTED'
  | 'KYC_APPROVED'
  | 'KYC_REJECTED'
  | 'SECURITY_VIOLATION'
  | 'RATE_LIMIT_EXCEEDED'
  | 'ACCOUNT_LOCKED'
  | 'ACCOUNT_UNLOCKED'
  | 'NETWORK_CLUSTER_ALERT'
  | 'CONCURRENT_SESSION_REJECTED';

export type AuthEventSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface AuthEvent {
  id?: string;
  userId?: string;
  eventType: AuthEventType;
  severity: AuthEventSeverity;
  message: string;
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
    deviceId?: string;
    sessionToken?: string;
    phoneNumber?: string;
    email?: string;
    clientId?: string;
    errorCode?: string;
    errorMessage?: string;
    retryCount?: number;
    otpPurpose?: string;
    mpinLength?: number;
    kycStatus?: string;
    tradingAccountId?: string;
    [key: string]: any;
  };
  timestamp: Date;
  createdAt?: Date;
}

export class AuthLogger {
  private static instance: AuthLogger;
  private eventQueue: AuthEvent[] = [];
  private isProcessing = false;

  private constructor() {}

  static getInstance(): AuthLogger {
    if (!AuthLogger.instance) {
      AuthLogger.instance = new AuthLogger();
    }
    return AuthLogger.instance;
  }

  /**
   * Log an authentication event
   */
  async logEvent(event: Omit<AuthEvent, 'timestamp' | 'createdAt'>): Promise<void> {
    const authEvent: AuthEvent = {
      ...event,
      timestamp: new Date(),
      createdAt: new Date(),
    };

    // Add to queue for batch processing
    this.eventQueue.push(authEvent);

    // Log to console for immediate visibility
    this.logToConsole(authEvent);

    // Process queue if not already processing
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * Log critical security events immediately
   */
  async logSecurityEvent(
    eventType: AuthEventType,
    message: string,
    metadata?: AuthEvent['metadata']
  ): Promise<void> {
    await this.logEvent({
      eventType,
      severity: 'CRITICAL',
      message,
      metadata,
    });
  }

  /**
   * Log user registration events
   */
  async logRegistration(
    eventType: 'REGISTRATION_ATTEMPT' | 'REGISTRATION_SUCCESS' | 'REGISTRATION_FAILED',
    userId: string,
    email: string,
    phone: string,
    metadata?: AuthEvent['metadata']
  ): Promise<void> {
    const severity: AuthEventSeverity = eventType === 'REGISTRATION_FAILED' ? 'HIGH' : 'MEDIUM';
    
    await this.logEvent({
      userId,
      eventType,
      severity,
      message: `User registration ${eventType.toLowerCase().replace('_', ' ')}`,
      metadata: {
        email,
        phone,
        ...metadata,
      },
    });
  }

  /**
   * Log login events
   */
  async logLogin(
    eventType: 'LOGIN_ATTEMPT' | 'LOGIN_SUCCESS' | 'LOGIN_FAILED',
    userId: string,
    identifier: string,
    metadata?: AuthEvent['metadata']
  ): Promise<void> {
    const severity: AuthEventSeverity = eventType === 'LOGIN_FAILED' ? 'HIGH' : 'MEDIUM';
    
    await this.logEvent({
      userId,
      eventType,
      severity,
      message: `User login ${eventType.toLowerCase().replace('_', ' ')}`,
      metadata: {
        identifier,
        ...metadata,
      },
    });
  }

  /**
   * Log OTP events
   */
  async logOtpEvent(
    eventType: 'OTP_SENT' | 'OTP_VERIFIED' | 'OTP_FAILED' | 'OTP_RESEND',
    userId: string,
    phone: string,
    purpose: string,
    metadata?: AuthEvent['metadata']
  ): Promise<void> {
    const severity: AuthEventSeverity = eventType === 'OTP_FAILED' ? 'HIGH' : 'LOW';
    
    await this.logEvent({
      userId,
      eventType,
      severity,
      message: `OTP ${eventType.toLowerCase().replace('_', ' ')} for ${purpose}`,
      metadata: {
        phone,
        otpPurpose: purpose,
        ...metadata,
      },
    });
  }

  /**
   * Log mPin events
   */
  async logMpinEvent(
    eventType: 'MPIN_SETUP_ATTEMPT' | 'MPIN_SETUP_SUCCESS' | 'MPIN_SETUP_FAILED' | 
              'MPIN_VERIFY_ATTEMPT' | 'MPIN_VERIFY_SUCCESS' | 'MPIN_VERIFY_FAILED' |
              'MPIN_RESET_ATTEMPT' | 'MPIN_RESET_SUCCESS' | 'MPIN_RESET_FAILED',
    userId: string,
    metadata?: AuthEvent['metadata']
  ): Promise<void> {
    const severity: AuthEventSeverity = 
      eventType.includes('FAILED') ? 'HIGH' : 
      eventType.includes('SUCCESS') ? 'MEDIUM' : 'LOW';
    
    await this.logEvent({
      userId,
      eventType,
      severity,
      message: `mPin ${eventType.toLowerCase().replace('_', ' ')}`,
      metadata,
    });
  }

  /**
   * Log session events
   */
  async logSessionEvent(
    eventType: 'SESSION_CREATED' | 'SESSION_EXPIRED' | 'SESSION_INVALIDATED',
    userId: string,
    sessionToken: string,
    metadata?: AuthEvent['metadata']
  ): Promise<void> {
    await this.logEvent({
      userId,
      eventType,
      severity: 'MEDIUM',
      message: `Session ${eventType.toLowerCase().replace('_', ' ')}`,
      metadata: {
        sessionToken,
        ...metadata,
      },
    });
  }

  /**
   * Log security violations
   */
  async logSecurityViolation(
    violationType: string,
    userId: string,
    metadata?: AuthEvent['metadata']
  ): Promise<void> {
    await this.logEvent({
      userId,
      eventType: 'SECURITY_VIOLATION',
      severity: 'CRITICAL',
      message: `Security violation: ${violationType}`,
      metadata,
    });
  }

  /**
   * Log rate limiting events
   */
  async logRateLimitExceeded(
    userId: string,
    action: string,
    metadata?: AuthEvent['metadata']
  ): Promise<void> {
    await this.logEvent({
      userId,
      eventType: 'RATE_LIMIT_EXCEEDED',
      severity: 'HIGH',
      message: `Rate limit exceeded for ${action}`,
      metadata,
    });
  }

  /**
   * Log account lockout events
   */
  async logAccountLockout(
    eventType: 'ACCOUNT_LOCKED' | 'ACCOUNT_UNLOCKED',
    userId: string,
    reason: string,
    metadata?: AuthEvent['metadata']
  ): Promise<void> {
    await this.logEvent({
      userId,
      eventType,
      severity: 'CRITICAL',
      message: `Account ${eventType.toLowerCase().replace('_', ' ')}: ${reason}`,
      metadata,
    });
  }

  /**
   * Process the event queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.eventQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      const events = [...this.eventQueue];
      this.eventQueue = [];

      // Batch insert events to database
      await this.batchInsertEvents(events);
    } catch (error) {
      console.error('Failed to process auth event queue:', error);
      // Re-queue events for retry
      this.eventQueue.unshift(...this.eventQueue);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Batch insert events to database
   */
  private async batchInsertEvents(events: AuthEvent[]): Promise<void> {
    try {
      // Filter out events with invalid userIds and set null for unknown users
      const validEvents = events.map(event => ({
        userId: event.userId && event.userId !== 'unknown' ? event.userId : null,
        eventType: event.eventType,
        severity: event.severity,
        message: event.message,
        metadata: event.metadata ? JSON.stringify(event.metadata) : null,
        timestamp: event.timestamp,
      }));

      // Create auth events in database
      await prisma.authEvent.createMany({
        data: validEvents,
        skipDuplicates: true,
      });

      console.log(`📊 Logged ${events.length} authentication events`);
    } catch (error) {
      console.error('Failed to insert auth events:', error);
      // Don't throw error to prevent breaking the auth flow
      console.error('Continuing without logging to prevent auth flow disruption');
    }
  }

  /**
   * Log to console for immediate visibility
   */
  private logToConsole(event: AuthEvent): void {
    const emoji = this.getSeverityEmoji(event.severity);
    const timestamp = event.timestamp.toISOString();
    
    console.log(`${emoji} [${timestamp}] ${event.eventType}: ${event.message}`);
    
    if (event.metadata) {
      console.log(`   Metadata:`, JSON.stringify(event.metadata, null, 2));
    }
  }

  /**
   * Get emoji for severity level
   */
  private getSeverityEmoji(severity: AuthEventSeverity): string {
    switch (severity) {
      case 'LOW': return 'ℹ️';
      case 'MEDIUM': return '⚠️';
      case 'HIGH': return '🚨';
      case 'CRITICAL': return '🔥';
      default: return '📝';
    }
  }

  /**
   * Get authentication events for a user
   */
  async getUserAuthEvents(
    userId: string,
    limit: number = 50,
    eventTypes?: AuthEventType[]
  ): Promise<AuthEvent[]> {
    try {
      const events = await prisma.authEvent.findMany({
        where: {
          userId,
          ...(eventTypes && { eventType: { in: eventTypes } }),
        },
        orderBy: { timestamp: 'desc' },
        take: limit,
      });

      return events.map(event => ({
        id: event.id,
        userId: event.userId,
        eventType: event.eventType as AuthEventType,
        severity: event.severity as AuthEventSeverity,
        message: event.message,
        metadata: event.metadata ? JSON.parse(event.metadata) : undefined,
        timestamp: event.timestamp,
        createdAt: event.createdAt,
      }));
    } catch (error) {
      console.error('Failed to get user auth events:', error);
      return [];
    }
  }

  /**
   * Get security events (HIGH and CRITICAL severity)
   */
  async getSecurityEvents(limit: number = 100): Promise<AuthEvent[]> {
    try {
      const events = await prisma.authEvent.findMany({
        where: {
          severity: { in: ['HIGH', 'CRITICAL'] },
        },
        orderBy: { timestamp: 'desc' },
        take: limit,
      });

      return events.map(event => ({
        id: event.id,
        userId: event.userId,
        eventType: event.eventType as AuthEventType,
        severity: event.severity as AuthEventSeverity,
        message: event.message,
        metadata: event.metadata ? JSON.parse(event.metadata) : undefined,
        timestamp: event.timestamp,
        createdAt: event.createdAt,
      }));
    } catch (error) {
      console.error('Failed to get security events:', error);
      return [];
    }
  }

  /**
   * Clean up old events (older than 90 days)
   */
  async cleanupOldEvents(): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 90);

      const deletedCount = await prisma.authEvent.deleteMany({
        where: {
          timestamp: { lt: cutoffDate },
        },
      });

      console.log(`🧹 Cleaned up ${deletedCount.count} old authentication events`);
    } catch (error) {
      console.error('Failed to cleanup old events:', error);
    }
  }
}

// Export singleton instance
export const authLogger = AuthLogger.getInstance();

// Helper function to extract IP address from request
export const extractClientInfo = (req?: any) => {
  if (!req) {
    return {
      ipAddress: 'unknown',
      userAgent: 'unknown',
    };
  }

  const ua =
    req.headers?.["user-agent"] ??
    (typeof req.headers?.get === "function" ? req.headers.get("user-agent") : undefined) ??
    "unknown";

  try {
    const ip = getTrustedClientIp(headersFromIncoming(req));
    return { ipAddress: ip, userAgent: typeof ua === "string" ? ua : "unknown" };
  } catch {
    return {
      ipAddress:
        req.headers?.["x-forwarded-for"] ||
        req.headers?.["x-real-ip"] ||
        req.connection?.remoteAddress ||
        req.socket?.remoteAddress ||
        "unknown",
      userAgent: typeof ua === "string" ? ua : "unknown",
    };
  }
};

// Helper function to mask sensitive data in logs
export const maskSensitiveData = (data: any): any => {
  if (typeof data !== 'object' || data === null) {
    return data;
  }

  const masked = { ...data };
  const sensitiveFields = ['password', 'mpin', 'otp', 'sessionToken', 'accessToken'];

  for (const field of sensitiveFields) {
    if (masked[field]) {
      masked[field] = '***MASKED***';
    }
  }

  return masked;
};
