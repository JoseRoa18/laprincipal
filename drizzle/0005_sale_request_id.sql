ALTER TABLE "sales" ADD COLUMN "client_request_id" uuid;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_client_request_id_unique" UNIQUE("client_request_id");