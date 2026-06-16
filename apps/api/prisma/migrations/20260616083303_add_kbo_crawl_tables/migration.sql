-- CreateTable
CREATE TABLE "kbo_games" (
    "game_key" VARCHAR(32) NOT NULL,
    "season" INTEGER NOT NULL,
    "series_type" VARCHAR(16) NOT NULL,
    "date" DATE NOT NULL,
    "game_time" VARCHAR(5),
    "away_team" VARCHAR(10) NOT NULL,
    "home_team" VARCHAR(10) NOT NULL,
    "away_score" INTEGER,
    "home_score" INTEGER,
    "relay" VARCHAR(100),
    "stadium" VARCHAR(20),
    "game_status" VARCHAR(12) NOT NULL,
    "cancellation_reason" VARCHAR(20),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kbo_games_pkey" PRIMARY KEY ("game_key")
);

-- CreateTable
CREATE TABLE "team_season_records" (
    "season" INTEGER NOT NULL,
    "team" VARCHAR(10) NOT NULL,
    "team_rank" INTEGER NOT NULL,
    "games_played" INTEGER NOT NULL,
    "wins" INTEGER NOT NULL,
    "losses" INTEGER NOT NULL,
    "draws" INTEGER NOT NULL,
    "win_rate" DOUBLE PRECISION NOT NULL,
    "games_behind" DOUBLE PRECISION NOT NULL,
    "recent10_games" VARCHAR(20) NOT NULL,
    "streak" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_season_records_pkey" PRIMARY KEY ("season","team")
);

-- CreateIndex
CREATE INDEX "idx_kbo_games_date" ON "kbo_games"("date");

-- CreateIndex
CREATE INDEX "idx_kbo_games_season_home" ON "kbo_games"("season", "home_team");

-- CreateIndex
CREATE INDEX "idx_kbo_games_season_away" ON "kbo_games"("season", "away_team");
