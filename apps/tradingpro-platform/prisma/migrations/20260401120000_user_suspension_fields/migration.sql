-- AlterTable
ALTER TABLE "users" ADD COLUMN     "suspended_at" TIMESTAMP(3),
ADD COLUMN     "suspension_reason" VARCHAR(512),
ADD COLUMN     "suspended_by_id" TEXT;

-- CreateIndex
CREATE INDEX "users_suspended_by_id_idx" ON "users"("suspended_by_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_suspended_by_id_fkey" FOREIGN KEY ("suspended_by_id") REFERENCES "users"("id") ON DELETE SET ON UPDATE CASCADE;
