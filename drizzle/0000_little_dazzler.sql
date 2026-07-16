CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp,
	"refreshTokenExpiresAt" timestamp,
	"scope" text,
	"password" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"employeeId" integer NOT NULL,
	"dayOfWeek" integer NOT NULL,
	"categoryId" integer NOT NULL,
	"isMandatory" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_role_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"employeeId" integer NOT NULL,
	"roleId" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_titles" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"working_time_pattern" text DEFAULT 'shift' NOT NULL,
	"custom_days" text DEFAULT '' NOT NULL,
	"rest_on_holiday" boolean DEFAULT false NOT NULL,
	"must_work_all_available" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"maxHoursPerWeek" integer DEFAULT 40 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"employee_type" text DEFAULT 'Type2',
	"titleId" integer
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"name" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "holidays_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#2563eb' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "shift_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"startTime" text NOT NULL,
	"endTime" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"locationId" integer NOT NULL,
	"roleId" integer NOT NULL,
	"dayOfWeek" integer NOT NULL,
	"categoryId" integer NOT NULL,
	"requiredCount" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"locationId" integer NOT NULL,
	"roleId" integer NOT NULL,
	"employeeId" integer,
	"date" text NOT NULL,
	"categoryId" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "title_allowed_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"titleId" integer NOT NULL,
	"categoryId" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "title_compatible_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"titleId" integer NOT NULL,
	"roleId" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "title_compatible_titles" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"titleId" integer NOT NULL,
	"compatibleTitleId" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "title_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"titleId" integer NOT NULL,
	"roleId" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability" ADD CONSTRAINT "availability_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability" ADD CONSTRAINT "availability_categoryId_shift_categories_id_fk" FOREIGN KEY ("categoryId") REFERENCES "public"."shift_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_role_overrides" ADD CONSTRAINT "employee_role_overrides_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_role_overrides" ADD CONSTRAINT "employee_role_overrides_employeeId_employees_id_fk" FOREIGN KEY ("employeeId") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_role_overrides" ADD CONSTRAINT "employee_role_overrides_roleId_roles_id_fk" FOREIGN KEY ("roleId") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_titles" ADD CONSTRAINT "employee_titles_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_titleId_employee_titles_id_fk" FOREIGN KEY ("titleId") REFERENCES "public"."employee_titles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_categories" ADD CONSTRAINT "shift_categories_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_categoryId_shift_categories_id_fk" FOREIGN KEY ("categoryId") REFERENCES "public"."shift_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_categoryId_shift_categories_id_fk" FOREIGN KEY ("categoryId") REFERENCES "public"."shift_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_allowed_categories" ADD CONSTRAINT "title_allowed_categories_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_allowed_categories" ADD CONSTRAINT "title_allowed_categories_titleId_employee_titles_id_fk" FOREIGN KEY ("titleId") REFERENCES "public"."employee_titles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_allowed_categories" ADD CONSTRAINT "title_allowed_categories_categoryId_shift_categories_id_fk" FOREIGN KEY ("categoryId") REFERENCES "public"."shift_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_compatible_roles" ADD CONSTRAINT "title_compatible_roles_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_compatible_roles" ADD CONSTRAINT "title_compatible_roles_titleId_employee_titles_id_fk" FOREIGN KEY ("titleId") REFERENCES "public"."employee_titles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_compatible_roles" ADD CONSTRAINT "title_compatible_roles_roleId_roles_id_fk" FOREIGN KEY ("roleId") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_compatible_titles" ADD CONSTRAINT "title_compatible_titles_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_compatible_titles" ADD CONSTRAINT "title_compatible_titles_titleId_employee_titles_id_fk" FOREIGN KEY ("titleId") REFERENCES "public"."employee_titles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_compatible_titles" ADD CONSTRAINT "title_compatible_titles_compatibleTitleId_employee_titles_id_fk" FOREIGN KEY ("compatibleTitleId") REFERENCES "public"."employee_titles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_permissions" ADD CONSTRAINT "title_permissions_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_permissions" ADD CONSTRAINT "title_permissions_titleId_employee_titles_id_fk" FOREIGN KEY ("titleId") REFERENCES "public"."employee_titles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_permissions" ADD CONSTRAINT "title_permissions_roleId_roles_id_fk" FOREIGN KEY ("roleId") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;