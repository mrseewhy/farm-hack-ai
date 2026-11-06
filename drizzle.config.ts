import "dotenv/config";
import type { Config } from "drizzle-kit";

export default {
  schema: "./lib/data/dal/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
