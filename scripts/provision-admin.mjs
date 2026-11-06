import { config } from "dotenv";
import { Pool } from "pg";

config({ path: process.env.FARMHACK_ENV_FILE ?? ".env" });

const email = process.argv[2]?.trim().toLowerCase();
if (!process.env.DATABASE_URL || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Usage: npm run auth:provision-admin -- admin@example.com (with DATABASE_URL configured)");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query("begin");
  const result = await client.query(
    `update "user" set "role" = 'admin', "updatedAt" = now()
     where lower("email") = $1 and coalesce("role", 'farmer') = 'farmer'
     returning "id", "email"`,
    [email],
  );
  if (result.rowCount !== 1) {
    console.error("No existing farmer account was promoted. Confirm the email and target database; an existing admin needs no change.");
    await client.query("rollback");
    process.exitCode = 1;
  } else {
    await client.query('delete from "session" where "userId" = $1', [result.rows[0].id]);
    await client.query("commit");
    console.log(`Promoted ${result.rows[0].email} to admin and revoked existing sessions.`);
  }
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  client.release();
  await pool.end();
}
