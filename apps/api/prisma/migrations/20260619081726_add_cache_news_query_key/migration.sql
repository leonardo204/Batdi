-- AlterTable
ALTER TABLE "cache_news" ADD COLUMN     "query_key" VARCHAR(64);

-- CreateIndex
CREATE INDEX "idx_cache_news_query" ON "cache_news"("query_key", "expires_at");
