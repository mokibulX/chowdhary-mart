import { defineConfig } from "drizzle-kit";
import { getDatabaseUrl, loadEnv } from "./src/env";

loadEnv();

export default defineConfig({
  schema: "./src/schema/*.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: getDatabaseUrl({ direct: true, required: true })!,
  },
});
