DROP TABLE "title_compatible_roles" CASCADE;--> statement-breakpoint
ALTER TABLE "shift_categories" ADD COLUMN "type" text DEFAULT 'regular' NOT NULL;