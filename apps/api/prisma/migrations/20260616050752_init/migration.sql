-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255),
    "display_name" VARCHAR(50),
    "auth_provider" VARCHAR(20),
    "auth_id" VARCHAR(255),
    "team_id" VARCHAR(20) NOT NULL,
    "persona_style" VARCHAR(20) NOT NULL DEFAULT 'passionate',
    "level" INTEGER NOT NULL DEFAULT 1,
    "xp_points" INTEGER NOT NULL DEFAULT 0,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_active" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "title" VARCHAR(100),
    "summary" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" SERIAL NOT NULL,
    "conversation_id" UUID NOT NULL,
    "role" VARCHAR(10),
    "content" TEXT NOT NULL,
    "a2ui_envelope" JSONB,
    "trace_id" UUID,
    "tokens_used" INTEGER,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personal_agent_state" (
    "user_id" UUID NOT NULL,
    "profile_summary" TEXT,
    "profile_data" JSONB NOT NULL DEFAULT '{}',
    "custom_persona" TEXT,
    "favorite_players" INTEGER[],
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "last_profile_update" TIMESTAMP(6),
    "last_active" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personal_agent_state_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "user_favorites" (
    "user_id" UUID NOT NULL,
    "player_id" INTEGER NOT NULL,
    "source" VARCHAR(20),
    "mention_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "user_favorites_pkey" PRIMARY KEY ("user_id","player_id")
);

-- CreateTable
CREATE TABLE "players" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(50),
    "team_id" VARCHAR(20),
    "position" VARCHAR(10),
    "birth_year" INTEGER,
    "throws" VARCHAR(5),
    "bats" VARCHAR(5),

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batting_stats" (
    "id" SERIAL NOT NULL,
    "player_id" INTEGER,
    "season" INTEGER,
    "team_id" VARCHAR(20),
    "games" INTEGER,
    "avg" DECIMAL(4,3),
    "obp" DECIMAL(4,3),
    "slg" DECIMAL(4,3),
    "ops" DECIMAL(4,3),
    "hr" INTEGER,
    "rbi" INTEGER,
    "war" DECIMAL(4,2),
    "wrc_plus" DECIMAL(5,1),
    "babip" DECIMAL(4,3),
    "raw_data" JSONB,
    "source" VARCHAR(20),
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batting_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pitching_stats" (
    "id" SERIAL NOT NULL,
    "player_id" INTEGER,
    "season" INTEGER,
    "team_id" VARCHAR(20),
    "games" INTEGER,
    "era" DECIMAL(4,2),
    "whip" DECIMAL(4,2),
    "fip" DECIMAL(4,2),
    "war" DECIMAL(4,2),
    "strikeouts" INTEGER,
    "raw_data" JSONB,
    "source" VARCHAR(20),
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pitching_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cache_ui_envelopes" (
    "cache_key" VARCHAR(128) NOT NULL,
    "intent" VARCHAR(32) NOT NULL,
    "params_hash" VARCHAR(64) NOT NULL,
    "team_id" VARCHAR(20),
    "persona_scope" VARCHAR(16) NOT NULL,
    "envelope_jsonl" TEXT NOT NULL,
    "data_snapshot" JSONB,
    "hit_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(6) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cache_ui_envelopes_pkey" PRIMARY KEY ("cache_key")
);

-- CreateTable
CREATE TABLE "a2ui_templates" (
    "template_id" VARCHAR(64) NOT NULL,
    "intent" VARCHAR(32) NOT NULL,
    "component_tree" JSONB NOT NULL,
    "bind_schema" JSONB NOT NULL,
    "variants" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "a2ui_templates_pkey" PRIMARY KEY ("template_id")
);

-- CreateTable
CREATE TABLE "cache_scores" (
    "game_id" VARCHAR(64) NOT NULL,
    "game_date" DATE NOT NULL,
    "home_team" VARCHAR(20),
    "away_team" VARCHAR(20),
    "payload" JSONB NOT NULL,
    "source" VARCHAR(20),
    "expires_at" TIMESTAMP(6) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cache_scores_pkey" PRIMARY KEY ("game_id")
);

-- CreateTable
CREATE TABLE "cache_news" (
    "id" SERIAL NOT NULL,
    "team_id" VARCHAR(20),
    "title" VARCHAR(255),
    "url" VARCHAR(512),
    "summary" TEXT,
    "published_at" TIMESTAMP(6),
    "source" VARCHAR(20),
    "expires_at" TIMESTAMP(6) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cache_news_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memes" (
    "id" SERIAL NOT NULL,
    "team_id" VARCHAR(20),
    "content" TEXT,
    "category" VARCHAR(32),
    "source" VARCHAR(20),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_traces" (
    "trace_id" UUID NOT NULL,
    "user_id" UUID,
    "conversation_id" UUID,
    "intent" VARCHAR(32),
    "complexity" VARCHAR(16),
    "cache_hit" VARCHAR(8),
    "llm_calls" INTEGER NOT NULL DEFAULT 0,
    "tokens_in" INTEGER NOT NULL DEFAULT 0,
    "tokens_out" INTEGER NOT NULL DEFAULT 0,
    "duration_ms" INTEGER,
    "error" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_traces_pkey" PRIMARY KEY ("trace_id")
);

-- CreateTable
CREATE TABLE "tool_call_logs" (
    "id" SERIAL NOT NULL,
    "trace_id" UUID,
    "action_name" VARCHAR(64),
    "params" JSONB,
    "result" JSONB,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tool_call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_users_team" ON "users"("team_id");

-- CreateIndex
CREATE INDEX "idx_users_last_active" ON "users"("last_active" DESC);

-- CreateIndex
CREATE INDEX "idx_conversations_user" ON "conversations"("user_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "idx_messages_conversation" ON "messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_personal_agent_last_active" ON "personal_agent_state"("last_active" DESC);

-- CreateIndex
CREATE INDEX "idx_players_team" ON "players"("team_id");

-- CreateIndex
CREATE INDEX "idx_players_name" ON "players"("name");

-- CreateIndex
CREATE INDEX "idx_batting_player_season" ON "batting_stats"("player_id", "season");

-- CreateIndex
CREATE INDEX "idx_pitching_player_season" ON "pitching_stats"("player_id", "season");

-- CreateIndex
CREATE INDEX "idx_cache_ui_expires" ON "cache_ui_envelopes"("expires_at");

-- CreateIndex
CREATE INDEX "idx_cache_scores_date" ON "cache_scores"("game_date");

-- CreateIndex
CREATE INDEX "idx_cache_news_team" ON "cache_news"("team_id", "published_at" DESC);

-- CreateIndex
CREATE INDEX "idx_memes_team" ON "memes"("team_id");

-- CreateIndex
CREATE INDEX "idx_traces_user_created" ON "agent_traces"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_traces_intent" ON "agent_traces"("intent");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_trace_id_fkey" FOREIGN KEY ("trace_id") REFERENCES "agent_traces"("trace_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_agent_state" ADD CONSTRAINT "personal_agent_state_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_favorites" ADD CONSTRAINT "user_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_favorites" ADD CONSTRAINT "user_favorites_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batting_stats" ADD CONSTRAINT "batting_stats_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pitching_stats" ADD CONSTRAINT "pitching_stats_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_traces" ADD CONSTRAINT "agent_traces_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_traces" ADD CONSTRAINT "agent_traces_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_call_logs" ADD CONSTRAINT "tool_call_logs_trace_id_fkey" FOREIGN KEY ("trace_id") REFERENCES "agent_traces"("trace_id") ON DELETE CASCADE ON UPDATE CASCADE;
