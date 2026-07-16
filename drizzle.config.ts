import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema.ts", // Points to the file you just edited
  dialect: "postgresql",        // Tells it you are using Neon/Postgres
  dbCredentials: {
    url: process.env.DATABASE_URL!, // Automatically grabs your .env password
  },
});