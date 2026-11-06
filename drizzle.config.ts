import type { Config } from "drizzle-kit";

export default {
  schema: "./lib/data/dal/schema.ts",
  dialect: "postgresql",
} satisfies Config;
