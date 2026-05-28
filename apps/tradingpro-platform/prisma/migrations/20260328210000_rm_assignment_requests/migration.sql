-- CreateTable
CREATE TABLE "rm_assignment_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "dismiss_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "resolved_by_id" TEXT,

    CONSTRAINT "rm_assignment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rm_assignment_requests_user_id_idx" ON "rm_assignment_requests"("user_id");

-- CreateIndex
CREATE INDEX "rm_assignment_requests_status_idx" ON "rm_assignment_requests"("status");

-- CreateIndex
CREATE INDEX "rm_assignment_requests_created_at_idx" ON "rm_assignment_requests"("created_at");

-- AddForeignKey
ALTER TABLE "rm_assignment_requests" ADD CONSTRAINT "rm_assignment_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rm_assignment_requests" ADD CONSTRAINT "rm_assignment_requests_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
