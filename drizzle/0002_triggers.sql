-- Append-only tables: kardex and audit log can never be edited or deleted.
CREATE OR REPLACE FUNCTION prevent_modification() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % es de solo inserción', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER inventory_movements_append_only
  BEFORE UPDATE OR DELETE ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();
--> statement-breakpoint
CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();
--> statement-breakpoint
-- Keep stock_levels.updated_at fresh even for raw SQL updates.
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER stock_levels_touch
  BEFORE UPDATE ON stock_levels
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
--> statement-breakpoint
-- Accent-insensitive, lower-cased text for searches.
CREATE OR REPLACE FUNCTION normalize_text(input text) RETURNS text AS $$
  SELECT lower(unaccent(coalesce(input, '')));
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;
--> statement-breakpoint
-- Defense in depth for Supabase: enable RLS on every table with no policies,
-- so the anon/authenticated API roles can never read or write directly.
-- The application connects as the table owner, which bypasses RLS.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;
