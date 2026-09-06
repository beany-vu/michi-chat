CREATE TABLE "admin_user_tenants" (
	"user_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	CONSTRAINT "admin_user_tenants_user_id_tenant_id_pk" PRIMARY KEY("user_id","tenant_id")
);
--> statement-breakpoint
ALTER TABLE "admin_user_tenants" ADD CONSTRAINT "admin_user_tenants_user_id_admin_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_user_tenants" ADD CONSTRAINT "admin_user_tenants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;