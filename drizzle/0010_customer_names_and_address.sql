ALTER TABLE "customers" ADD COLUMN "first_name" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "last_name" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "state" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "municipality" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "parish" text;--> statement-breakpoint
-- Existing people: first word as first name, the rest as last name (editable later).
UPDATE "customers"
SET "first_name" = split_part(btrim("name"), ' ', 1),
    "last_name" = nullif(btrim(substr(btrim("name"), length(split_part(btrim("name"), ' ', 1)) + 1)), '')
WHERE "doc_type" NOT IN ('J', 'G') AND "first_name" IS NULL;--> statement-breakpoint
-- The kind follows the document: J and G are companies.
UPDATE "customers" SET "kind" = CASE WHEN "doc_type" IN ('J', 'G') THEN 'company'::customer_kind ELSE 'person'::customer_kind END;
