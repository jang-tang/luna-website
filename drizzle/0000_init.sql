CREATE TYPE "public"."content_status" AS ENUM('published', 'hidden', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."sync_run_status" AS ENUM('running', 'success', 'partial', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "awards" (
	"id" serial PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"name" text NOT NULL,
	"prize" text DEFAULT '' NOT NULL,
	"team" text DEFAULT '' NOT NULL,
	"members" text DEFAULT '' NOT NULL,
	"date_text" text DEFAULT '' NOT NULL,
	"image_id" text,
	"image_source_key" text,
	"notion_page_id" text NOT NULL,
	"sort_order" double precision DEFAULT 0 NOT NULL,
	"status" "content_status" DEFAULT 'published' NOT NULL,
	"notion_last_edited_at" timestamp with time zone,
	"content_hash" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "awards_notion_page_id_unique" UNIQUE("notion_page_id")
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" text PRIMARY KEY NOT NULL,
	"source_key" text NOT NULL,
	"content_type" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"byte_size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_groups" (
	"name" text PRIMARY KEY NOT NULL,
	"sort_order" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"generation" text NOT NULL,
	"position" text DEFAULT '' NOT NULL,
	"class_name" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"image_id" text,
	"image_source_key" text,
	"notion_page_id" text NOT NULL,
	"sort_order" double precision DEFAULT 0 NOT NULL,
	"status" "content_status" DEFAULT 'published' NOT NULL,
	"notion_last_edited_at" timestamp with time zone,
	"content_hash" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_notion_page_id_unique" UNIQUE("notion_page_id")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"awards" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"image_id" text,
	"image_source_key" text,
	"notion_page_id" text NOT NULL,
	"sort_order" double precision DEFAULT 0 NOT NULL,
	"status" "content_status" DEFAULT 'published' NOT NULL,
	"notion_last_edited_at" timestamp with time zone,
	"content_hash" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_notion_page_id_unique" UNIQUE("notion_page_id")
);
--> statement-breakpoint
CREATE TABLE "qnas" (
	"id" serial PRIMARY KEY NOT NULL,
	"question" text NOT NULL,
	"answer" text DEFAULT '' NOT NULL,
	"notion_page_id" text NOT NULL,
	"sort_order" double precision DEFAULT 0 NOT NULL,
	"status" "content_status" DEFAULT 'published' NOT NULL,
	"notion_last_edited_at" timestamp with time zone,
	"content_hash" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qnas_notion_page_id_unique" UNIQUE("notion_page_id")
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" text DEFAULT '' NOT NULL,
	"notion_page_id" text NOT NULL,
	"sort_order" double precision DEFAULT 0 NOT NULL,
	"status" "content_status" DEFAULT 'published' NOT NULL,
	"notion_last_edited_at" timestamp with time zone,
	"content_hash" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_settings_notion_page_id_unique" UNIQUE("notion_page_id")
);
--> statement-breakpoint
CREATE TABLE "sync_locks" (
	"name" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"locked_until" timestamp with time zone NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"trigger" text NOT NULL,
	"mode" text NOT NULL,
	"status" "sync_run_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"collection" text PRIMARY KEY NOT NULL,
	"cursor" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_full_sync_at" timestamp with time zone,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "awards" ADD CONSTRAINT "awards_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "awards_list_idx" ON "awards" USING btree ("status","year","sort_order");--> statement-breakpoint
CREATE INDEX "media_source_key_idx" ON "media" USING btree ("source_key");--> statement-breakpoint
CREATE INDEX "members_list_idx" ON "members" USING btree ("status","generation","sort_order");--> statement-breakpoint
CREATE INDEX "projects_list_idx" ON "projects" USING btree ("status","year","sort_order");--> statement-breakpoint
CREATE INDEX "qnas_list_idx" ON "qnas" USING btree ("status","sort_order");--> statement-breakpoint
CREATE INDEX "site_settings_key_idx" ON "site_settings" USING btree ("status","key");--> statement-breakpoint
CREATE INDEX "sync_runs_started_at_idx" ON "sync_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "sync_runs_status_idx" ON "sync_runs" USING btree ("status","started_at");