import { defineConfig } from "drizzle-kit";
import path from "path";
import { getDatabaseUrl, loadEnv } from "./src/env";

loadEnv();

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: getDatabaseUrl({ direct: true, required: true })!,
  },
});
