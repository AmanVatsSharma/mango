-- Session security Phase-2: registration sighting kind + step-up challenges
ALTER TYPE "UserSessionKind" ADD VALUE IF NOT EXISTS 'REGISTRATION_SIGHTING';

CREATE TABLE "session_security_step_up_challenges" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "network_key" TEXT NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_security_step_up_challenges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "session_security_step_up_challenges_user_id_consumed_at_idx" ON "session_security_step_up_challenges"("user_id", "consumed_at");

CREATE INDEX "session_security_step_up_challenges_expires_at_idx" ON "session_security_step_up_challenges"("expires_at");

ALTER TABLE "session_security_step_up_challenges" ADD CONSTRAINT "session_security_step_up_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
