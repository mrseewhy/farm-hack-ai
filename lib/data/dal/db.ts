import { drizzle } from "drizzle-orm/node-postgres";
import { pool } from "@/lib/auth";

export const db = drizzle(pool);
