-- AlterTable
ALTER TABLE "conversations" ADD COLUMN "thread_id" VARCHAR(100);

-- CreateIndex
CREATE UNIQUE INDEX "conversations_thread_id_key" ON "conversations"("thread_id");
