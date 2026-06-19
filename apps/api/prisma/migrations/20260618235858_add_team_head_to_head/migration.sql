-- CreateTable
CREATE TABLE "team_head_to_head" (
    "id" SERIAL NOT NULL,
    "season" INTEGER NOT NULL,
    "team_id" VARCHAR(10) NOT NULL,
    "opponent_id" VARCHAR(10),
    "opponent_name" VARCHAR(20) NOT NULL,
    "wins" INTEGER NOT NULL,
    "losses" INTEGER NOT NULL,
    "draws" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_head_to_head_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_h2h_season_team" ON "team_head_to_head"("season", "team_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_h2h_season_team_opp" ON "team_head_to_head"("season", "team_id", "opponent_id");
