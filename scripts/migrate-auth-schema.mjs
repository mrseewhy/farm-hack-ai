import { config } from "dotenv";
config({ path: process.env.FARMHACK_ENV_FILE ?? ".env" });
import { readFile } from "node:fs/promises";
import { Pool } from "pg";

const required = ["user", "session", "account", "verification"];
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const target = new URL(process.env.DATABASE_URL);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query("begin");
  const result = await client.query(
    `select table_name from information_schema.tables
      where table_schema = current_schema() and table_name = any($1::text[])`,
    [required],
  );
  const found = result.rows.map((row) => row.table_name);
  if (found.length === required.length) {
    console.log(`Better Auth tables already exist on ${target.hostname}, schema ${await currentSchema()}.`);
  } else if (found.length) {
    throw new Error(`Partial auth schema found: ${found.join(", ")}. Review manually before migrating.`);
  } else {
    const sql = await readFile(new URL("../better-auth_migrations/2026-11-05T15-54-27.261Z.sql", import.meta.url), "utf8");
    await client.query(sql);
    console.log(`Created Better Auth tables on ${target.hostname}, schema ${await currentSchema()}.`);
  }
  await client.query("commit");
} catch (error) {
  await client.query("rollback");
  console.error(error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
async function currentSchema() {
  const result = await client.query("select current_schema() as schema");
  return result.rows[0].schema;
}
