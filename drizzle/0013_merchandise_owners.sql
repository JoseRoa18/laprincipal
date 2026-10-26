CREATE TABLE "merchandise_owners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchandise_owners_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_owner_id_merchandise_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."merchandise_owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_owner_idx" ON "products" USING btree ("owner_id");--> statement-breakpoint
-- The partners who bring merchandise today; more can be added later.
INSERT INTO "merchandise_owners" ("name", "sort_order") VALUES ('Teo', 1), ('José/Juan', 2) ON CONFLICT ("name") DO NOTHING;--> statement-breakpoint
-- What was already loaded, as the owner asked on 2026-10-26: the products entered on 2026-10-25
-- (Venezuela time) are Teo's; the ones entered before (the compressors) are José/Juan's.
-- Anything newer stays "Sin dueño" until someone says whose it is.
UPDATE "products" SET "owner_id" = (SELECT "id" FROM "merchandise_owners" WHERE "name" = 'Teo')
WHERE "owner_id" IS NULL AND ("created_at" AT TIME ZONE 'America/Caracas')::date = DATE '2026-10-25';--> statement-breakpoint
UPDATE "products" SET "owner_id" = (SELECT "id" FROM "merchandise_owners" WHERE "name" = 'José/Juan')
WHERE "owner_id" IS NULL AND ("created_at" AT TIME ZONE 'America/Caracas')::date < DATE '2026-10-25';
