-- CreateTable
CREATE TABLE "game_lineups" (
    "game_key" VARCHAR(32) NOT NULL,
    "game_date" DATE NOT NULL,
    "home_team_id" VARCHAR(10),
    "away_team_id" VARCHAR(10),
    "home_team_name" VARCHAR(20) NOT NULL,
    "away_team_name" VARCHAR(20) NOT NULL,
    "home_starter" VARCHAR(40),
    "away_starter" VARCHAR(40),
    "stadium" VARCHAR(20),
    "game_time" VARCHAR(5),
    "status" VARCHAR(16) NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_lineups_pkey" PRIMARY KEY ("game_key")
);

-- CreateIndex
CREATE INDEX "idx_game_lineups_date" ON "game_lineups"("game_date");
