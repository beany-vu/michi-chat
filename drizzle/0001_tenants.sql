-- Multi-tenancy. Hand-edited after generation, because drizzle-kit emits a plain
-- `ADD COLUMN tenant_id uuid NOT NULL`, which cannot work against a table that already has
-- rows. The real sequence is: create tenants, seed one, backfill, THEN set not null.
--
-- The generated order also placed the composite foreign key before the UNIQUE constraint
-- it references, which Postgres rejects. Fixed below.

CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"persona" text NOT NULL,
	"model" text,
	"branding" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tool_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"allowed_origins" text[] DEFAULT '{}' NOT NULL,
	"daily_message_cap" integer DEFAULT 500 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text DEFAULT 'public' NOT NULL,
	"name" text NOT NULL,
	"public_key" text,
	"secret_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_keys_public_key_unique" UNIQUE("public_key"),
	CONSTRAINT "api_keys_secret_hash_unique" UNIQUE("secret_hash")
);
--> statement-breakpoint
CREATE TABLE "widget_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "widget_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "admin_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "rate_buckets" (
	"bucket_key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_buckets_bucket_key_window_start_pk" PRIMARY KEY("bucket_key","window_start")
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_sessions" ADD CONSTRAINT "widget_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_tenant_idx" ON "api_keys" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "widget_sessions_tenant_idx" ON "widget_sessions" USING btree ("tenant_id");--> statement-breakpoint
INSERT INTO "tenants" ("slug", "name", "persona", "branding", "tool_config", "allowed_origins")
VALUES (
	'mugshot',
	'Mugshot Artisan Cafe',
	'You are Michi, the warm, concise barista assistant for Mugshot Artisan Cafe in Manila. The cafe is open daily 10am to 10pm at Greenwoods Executive Village, Pasig, and delivers through FoodPanda. Prices are not published online, so for prices point people to the counter or to FoodPanda.',
	'{"title":"michi","subtitle":"Ask about the menu, the weather, or what to try. Answers come from live data.","greeting":"Chat with Mugshot","placeholder":"Message Mugshot","accent":"#c98a4b","suggestions":["What should I drink today?","What food do you have?","Do you deliver?","What is new this season?"]}'::jsonb,
	'{"get_weather":{"enabled":true,"baseUrl":"https://mugshotmnl.com"},"get_menu":{"enabled":true,"baseUrl":"https://mugshotmnl.com","priceNote":"Prices are not published online; for prices ask at the counter or order via FoodPanda: https://www.foodpanda.ph/restaurant/ymqk/mugshot-artisan-cafe-greenwoods"},"get_specials":{"enabled":true,"baseUrl":"https://mugshotmnl.com"}}'::jsonb,
	ARRAY['http://localhost:3001','https://mugshotmnl.com']
);
--> statement-breakpoint
INSERT INTO "api_keys" ("tenant_id", "kind", "name", "public_key")
SELECT "id", 'public', 'local development', 'pk_dev_mugshot_local_only'
FROM "tenants" WHERE "slug" = 'mugshot';
--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "anon_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "api_key_id" uuid;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "origin_host" text;--> statement-breakpoint
UPDATE "conversations" SET "tenant_id" = (SELECT "id" FROM "tenants" WHERE "slug" = 'mugshot') WHERE "tenant_id" IS NULL;--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tenant_id_key" UNIQUE("tenant_id","id");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_session_id_widget_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."widget_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_tenant_idx" ON "conversations" USING btree ("tenant_id","last_message_at" desc);--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT "messages_conversation_id_conversations_id_fk";--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
UPDATE "messages" SET "tenant_id" = "conversations"."tenant_id" FROM "conversations" WHERE "messages"."conversation_id" = "conversations"."id";--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_tenant_conversation_fk" FOREIGN KEY ("tenant_id","conversation_id") REFERENCES "public"."conversations"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_tenant_created_idx" ON "messages" USING btree ("tenant_id","created_at" desc);
