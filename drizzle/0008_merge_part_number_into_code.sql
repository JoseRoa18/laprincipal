-- The part number and the code (sku) are one field now: the code is the
-- manufacturer part number, or an internal LP-000001 when there is none.
-- The part_number column is NOT dropped here: the previous deployment keeps
-- reading it until this one is live. A later migration drops it.

-- 1. Deleted products free their part numbers (internal LP- codes are never reused).
UPDATE "products" SET "sku" = "sku" || '~' || left("id"::text, 8)
WHERE "deleted_at" IS NOT NULL AND "sku" !~ '^LP-[0-9]+$' AND position('~' in "sku") = 0;--> statement-breakpoint

-- 2. Products with an internal code take their part number as code, normalized like
--    the app does (trimmed, upper case, spaces to dashes), when it is valid and unique.
WITH "candidates" AS (
  SELECT "id", regexp_replace(upper(btrim("part_number")), '\s+', '-', 'g') AS "code"
  FROM "products"
  WHERE "deleted_at" IS NULL AND "sku" ~ '^LP-[0-9]+$' AND btrim(coalesce("part_number", '')) <> ''
), "usable" AS (
  SELECT c."id", c."code" FROM "candidates" c
  WHERE c."code" ~ '^[A-Z0-9][A-Z0-9._/-]{0,39}$'
    AND NOT EXISTS (SELECT 1 FROM "products" p WHERE p."sku" = c."code")
    AND (SELECT count(*) FROM "candidates" c2 WHERE c2."code" = c."code") = 1
)
UPDATE "products" p SET "sku" = u."code", "updated_at" = now()
FROM "usable" u WHERE p."id" = u."id";--> statement-breakpoint

-- 3. A part number that could not become the code (custom code already set, repeated
--    or invalid) is kept as an equivalent code: still searchable and editable.
INSERT INTO "product_equivalences" ("product_id", "code")
SELECT "id", btrim("part_number") FROM "products"
WHERE btrim(coalesce("part_number", '')) <> ''
  AND regexp_replace(upper(btrim("part_number")), '\s+', '-', 'g') <> "sku"
ON CONFLICT ("product_id", "code") DO NOTHING;--> statement-breakpoint

DROP INDEX IF EXISTS "products_part_number_idx";
