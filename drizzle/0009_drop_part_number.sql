-- 0008 merged the part number into the code (sku) and the deployment that reads
-- it is gone: the column is no longer used.
ALTER TABLE "products" DROP COLUMN IF EXISTS "part_number";
