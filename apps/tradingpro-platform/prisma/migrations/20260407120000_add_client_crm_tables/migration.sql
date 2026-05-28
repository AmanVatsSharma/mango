-- CreateEnum
CREATE TYPE "ClientCrmNoteVisibility" AS ENUM ('TEAM', 'MANAGER_ONLY');

-- CreateEnum
CREATE TYPE "ClientCrmTaskKind" AS ENUM ('CALLBACK', 'FOLLOW_UP', 'DOCUMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ClientCrmTaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ClientCrmTaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH');

-- CreateEnum
CREATE TYPE "ClientCrmTaskDisposition" AS ENUM ('NO_ANSWER', 'CALLBACK_SCHEDULED', 'WRONG_NUMBER', 'SPOKE_FOLLOWUP', 'OTHER');

-- CreateTable
CREATE TABLE "client_crm_notes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "visibility" "ClientCrmNoteVisibility" NOT NULL DEFAULT 'TEAM',
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_crm_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_crm_tasks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" VARCHAR(512) NOT NULL,
    "description" TEXT,
    "kind" "ClientCrmTaskKind" NOT NULL,
    "status" "ClientCrmTaskStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "ClientCrmTaskPriority" NOT NULL DEFAULT 'NORMAL',
    "due_at" TIMESTAMP(3),
    "snooze_count" INTEGER NOT NULL DEFAULT 0,
    "disposition" "ClientCrmTaskDisposition",
    "outcome_note" TEXT,
    "created_by_id" TEXT NOT NULL,
    "completed_by_id" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_crm_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_crm_notes_user_id_created_at_idx" ON "client_crm_notes"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "client_crm_tasks_user_id_status_due_at_idx" ON "client_crm_tasks"("user_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "client_crm_tasks_user_id_due_at_idx" ON "client_crm_tasks"("user_id", "due_at");

-- AddForeignKey
ALTER TABLE "client_crm_notes" ADD CONSTRAINT "client_crm_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_crm_notes" ADD CONSTRAINT "client_crm_notes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_crm_tasks" ADD CONSTRAINT "client_crm_tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_crm_tasks" ADD CONSTRAINT "client_crm_tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_crm_tasks" ADD CONSTRAINT "client_crm_tasks_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
