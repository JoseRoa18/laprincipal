-- Extensions required by the schema (trigram search, accent-insensitive text)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "unaccent";
