import { URL } from "node:url";

/**
 * Safety gate for the end-to-end suite.
 *
 * The suite writes real accounts, conversations, assessments, and review rows.
 * It must never do that against a shared or production database by accident, so
 * it refuses to start unless DATABASE_URL points at loopback. Remote databases
 * are allowed only with an explicit E2E_ALLOW_REMOTE_DB=1 opt-in (for a
 * disposable preview branch).
 */
export default function globalSetup() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "E2E requires DATABASE_URL. Point it at a disposable local PostgreSQL database."
    );
  }

  const host = new URL(databaseUrl).hostname;
  const loopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);

  if (!loopback && process.env.E2E_ALLOW_REMOTE_DB !== "1") {
    throw new Error(
      `Refusing to run E2E against non-loopback database host "${host}". ` +
        "Use a local database, or set E2E_ALLOW_REMOTE_DB=1 for a disposable branch."
    );
  }
}
