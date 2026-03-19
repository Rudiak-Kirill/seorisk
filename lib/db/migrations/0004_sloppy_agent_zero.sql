CREATE TABLE "clusters" (
	"id" uuid PRIMARY KEY NOT NULL,
	"research_id" uuid NOT NULL,
	"main_query" text NOT NULL,
	"total_frequency" integer DEFAULT 0 NOT NULL,
	"queries_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_plan" (
	"id" uuid PRIMARY KEY NOT NULL,
	"research_id" uuid NOT NULL,
	"cluster_id" uuid,
	"source_url" text NOT NULL,
	"target_url" text NOT NULL,
	"content_type" varchar(20) NOT NULL,
	"title" text NOT NULL,
	"meta_description" text,
	"main_query" text NOT NULL,
	"article_preview" text,
	"planned_date" date,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"is_approved" boolean DEFAULT false NOT NULL,
	"approved_at" timestamp,
	"published_at" timestamp,
	"published_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "queries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"research_id" uuid NOT NULL,
	"query" text NOT NULL,
	"frequency" integer DEFAULT 0 NOT NULL,
	"type" varchar(30),
	"destination" varchar(20),
	"relevance" integer,
	"reason" text,
	"cluster_id" uuid,
	"source" varchar(30) DEFAULT 'seed' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_research" (
	"id" uuid PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"h1" text,
	"description" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clusters" ADD CONSTRAINT "clusters_research_id_seo_research_id_fk" FOREIGN KEY ("research_id") REFERENCES "public"."seo_research"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_plan" ADD CONSTRAINT "content_plan_research_id_seo_research_id_fk" FOREIGN KEY ("research_id") REFERENCES "public"."seo_research"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_plan" ADD CONSTRAINT "content_plan_cluster_id_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."clusters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queries" ADD CONSTRAINT "queries_research_id_seo_research_id_fk" FOREIGN KEY ("research_id") REFERENCES "public"."seo_research"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queries" ADD CONSTRAINT "queries_cluster_id_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."clusters"("id") ON DELETE set null ON UPDATE no action;
