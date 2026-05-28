-- CreateEnum
CREATE TYPE "UserSessionKind" AS ENUM ('WEB_JWT', 'MOBILE_SESSION_AUTH');

-- CreateEnum
CREATE TYPE "SecurityIncidentType" AS ENUM ('MULTI_USER_SAME_NETWORK', 'CONCURRENT_SESSIONS_EXCEEDED', 'SESSION_POLICY_BLOCK');

-- CreateEnum
CREATE TYPE "SecurityIncidentStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'FALSE_POSITIVE', 'CLOSED');

-- AlterEnum
ALTER TYPE "AuthEventType" ADD VALUE 'NETWORK_CLUSTER_ALERT';
ALTER TYPE "AuthEventType" ADD VALUE 'CONCURRENT_SESSION_REJECTED';

-- CreateTable
CREATE TABLE "user_session_records" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "UserSessionKind" NOT NULL,
    "jti" TEXT,
    "sessionAuthId" TEXT,
    "ipFingerprint" TEXT,
    "networkKey" TEXT,
    "userAgentHash" TEXT,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "user_session_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_incidents" (
    "id" TEXT NOT NULL,
    "type" "SecurityIncidentType" NOT NULL,
    "severity" "AuthEventSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "SecurityIncidentStatus" NOT NULL DEFAULT 'OPEN',
    "message" TEXT NOT NULL,
    "payload" JSONB,
    "networkKey" TEXT,
    "related_user_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "resolved_by_id" TEXT,

    CONSTRAINT "security_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_session_records_jti_key" ON "user_session_records"("jti");

-- CreateIndex
CREATE UNIQUE INDEX "user_session_records_sessionAuthId_key" ON "user_session_records"("sessionAuthId");

-- CreateIndex
CREATE INDEX "user_session_records_userId_revokedAt_idx" ON "user_session_records"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "user_session_records_networkKey_lastSeenAt_idx" ON "user_session_records"("networkKey", "lastSeenAt");

-- CreateIndex
CREATE INDEX "user_session_records_jti_idx" ON "user_session_records"("jti");

-- CreateIndex
CREATE INDEX "security_incidents_type_idx" ON "security_incidents"("type");

-- CreateIndex
CREATE INDEX "security_incidents_status_idx" ON "security_incidents"("status");

-- CreateIndex
CREATE INDEX "security_incidents_networkKey_idx" ON "security_incidents"("networkKey");

-- CreateIndex
CREATE INDEX "security_incidents_createdAt_idx" ON "security_incidents"("createdAt");

-- AddForeignKey
ALTER TABLE "user_session_records" ADD CONSTRAINT "user_session_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_session_records" ADD CONSTRAINT "user_session_records_sessionAuthId_fkey" FOREIGN KEY ("sessionAuthId") REFERENCES "session_auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_incidents" ADD CONSTRAINT "security_incidents_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
