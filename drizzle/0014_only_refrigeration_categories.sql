-- For now the store only offers refrigeration and air conditioning (asked on 2026-10-26).
-- The other default groups are switched off, not deleted: their subcategories hide with them,
-- products keep their category, and "Categorías y marcas" turns any of them back on.
UPDATE "categories" SET "is_active" = false
WHERE "parent_id" IS NULL AND "slug" IN ('lavadoras', 'cocinas-y-hornos', 'microondas', 'secadoras', 'herramientas-y-consumibles', 'otros');
