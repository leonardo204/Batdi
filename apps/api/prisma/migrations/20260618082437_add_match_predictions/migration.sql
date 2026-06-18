-- CreateTable
CREATE TABLE "match_predictions" (
    "id" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "game_key" VARCHAR(32) NOT NULL,
    "predicted_winner" VARCHAR(8) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_predictions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_match_predictions_user" ON "match_predictions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_match_predictions_user_game" ON "match_predictions"("user_id", "game_key");

-- AddForeignKey
ALTER TABLE "match_predictions" ADD CONSTRAINT "match_predictions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
