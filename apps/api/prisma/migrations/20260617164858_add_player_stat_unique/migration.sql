-- CreateIndex
CREATE UNIQUE INDEX "uq_batting_player_season" ON "batting_stats"("player_id", "season");

-- CreateIndex
CREATE UNIQUE INDEX "uq_pitching_player_season" ON "pitching_stats"("player_id", "season");

