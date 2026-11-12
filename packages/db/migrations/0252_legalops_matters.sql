CREATE TABLE "legal_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"matter_id" uuid NOT NULL,
	"request_key" uuid NOT NULL,
	"revision" integer NOT NULL,
	"requested_by" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"snapshot" jsonb NOT NULL,
	"outputs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"step" integer DEFAULT 0 NOT NULL,
	"claim" uuid,
	"error" text,
	"decision_note" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legal_analyses_orgId_matterId_requestKey_unique" UNIQUE("org_id","matter_id","request_key")
);
--> statement-breakpoint
CREATE TABLE "legal_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"matter_id" uuid NOT NULL,
	"document_key" uuid NOT NULL,
	"version" integer NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"content" text NOT NULL,
	"digest" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legal_documents_orgId_matterId_documentKey_version_unique" UNIQUE("org_id","matter_id","document_key","version")
);
--> statement-breakpoint
CREATE TABLE "legal_matters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"client" text DEFAULT '' NOT NULL,
	"brief" text NOT NULL,
	"owner_id" text NOT NULL,
	"member_ids" text[] NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legal_matters_orgId_id_unique" UNIQUE("org_id","id")
);
--> statement-breakpoint
ALTER TABLE "legal_analyses" ADD CONSTRAINT "legal_analyses_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_analyses" ADD CONSTRAINT "legal_analyses_org_id_matter_id_legal_matters_org_id_id_fk" FOREIGN KEY ("org_id","matter_id") REFERENCES "public"."legal_matters"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_documents" ADD CONSTRAINT "legal_documents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_documents" ADD CONSTRAINT "legal_documents_org_id_matter_id_legal_matters_org_id_id_fk" FOREIGN KEY ("org_id","matter_id") REFERENCES "public"."legal_matters"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_matters" ADD CONSTRAINT "legal_matters_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "legal_analyses_active" ON "legal_analyses" USING btree ("org_id","matter_id") WHERE "legal_analyses"."status" in ('queued', 'running', 'review');--> statement-breakpoint
CREATE INDEX "legal_analyses_org_id_matter_id_created_at_index" ON "legal_analyses" USING btree ("org_id","matter_id","created_at");--> statement-breakpoint
CREATE INDEX "legal_documents_org_id_matter_id_index" ON "legal_documents" USING btree ("org_id","matter_id");--> statement-breakpoint
CREATE INDEX "legal_matters_org_id_created_at_index" ON "legal_matters" USING btree ("org_id","created_at");