import { defineConfig } from "drizzle-kit";
import path from "path";
import { getDatabaseUrlFor, loadEnv } from "./src/env";

loadEnv();

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: getDatabaseUrlFor("marketplace", { direct: true, required: true })!,
  },
});
