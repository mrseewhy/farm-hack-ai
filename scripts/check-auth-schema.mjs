import { config } from "dotenv";
config({ path: process.env.FARMHACK_ENV_FILE ?? ".env" });
import { Pool } from "pg";

const required = ["user", "session", "account", "verification"];
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const target = new URL(process.env.DATABASE_URL);
  const location = await pool.query("select current_database() as database, current_schema() as schema");
  const result = await pool.query(
    `select table_name from information_schema.tables
      where table_schema = current_schema() and table_name = any($1::text[])
      order by table_name`,
    [required],
  );
  const found = result.rows.map((row) => row.table_name);
  const missing = required.filter((name) => !found.includes(name));
  console.log(`Target: ${target.hostname}/${location.rows[0].database}, schema ${location.rows[0].schema}`);
  console.log(`Better Auth tables: ${found.join(", ") || "none"}`);
  if (missing.length) {
    console.error(`Missing: ${missing.join(", ")}`);
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
