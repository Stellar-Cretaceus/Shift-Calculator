CREATE TABLE "title_allowed_locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"titleId" integer NOT NULL,
	"locationId" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "title_allowed_locations" ADD CONSTRAINT "title_allowed_locations_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_allowed_locations" ADD CONSTRAINT "title_allowed_locations_titleId_employee_titles_id_fk" FOREIGN KEY ("titleId") REFERENCES "public"."employee_titles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_allowed_locations" ADD CONSTRAINT "title_allowed_locations_locationId_locations_id_fk" FOREIGN KEY ("locationId") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;