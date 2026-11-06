This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Better Auth database setup

The app needs the `user`, `session`, `account`, and `verification` tables in the **same PostgreSQL database and schema used by the deployment**. The initial SQL migration is in `better-auth_migrations/`.

Check a configured environment:

```bash
npm run db:check:auth
```

For a Vercel production deployment, pull its environment variables into an ignored local file, inspect the reported database host and schema, then apply the initial migration if the tables are absent:

```bash
npx vercel env pull .env.production.local --environment=production
FARMHACK_ENV_FILE=.env.production.local npm run db:check:auth
FARMHACK_ENV_FILE=.env.production.local npm run db:migrate:auth
FARMHACK_ENV_FILE=.env.production.local npm run db:check:auth
```

Run those commands from a linked Vercel project with permission to read its production environment. Do not paste the database URL into chat or commit the environment file. The migration command creates the initial auth tables only when none exist and stops if it finds a partial schema. It is safe to rerun after the tables exist. If the check reports a different host, database, or schema from your expected target, correct the deployment's `DATABASE_URL` instead of migrating the wrong database. Also configure `BETTER_AUTH_SECRET` and set `BETTER_AUTH_URL` to the deployed app origin in Vercel, then redeploy.

## Provision an admin

Only farmers can register in the app. To create an admin, register the person's account normally, verify the target database, then promote that existing account through the trusted local CLI:

```bash
FARMHACK_ENV_FILE=.env.production.local npm run db:check:auth
FARMHACK_ENV_FILE=.env.production.local npm run auth:provision-admin -- admin@example.com
```

The script accepts a single email, changes only an existing farmer account, and revokes its sessions. The person signs in again to reach `/admin/dashboard`. Run it only with a database URL obtained through your trusted deployment environment; public registration never accepts the admin role.

## Data layer

Farm data (conversations, messages, images, assessments, guidance) lives in PostgreSQL and is accessed through Drizzle ORM. The data layer is split into two folders under `lib/data/`:

- `lib/data/dal/` — Drizzle schema, queries, and database connection. Data access logic lives here.
- `lib/data/actions/` — Server actions that call the DAL and run mutations/queries from Server and Client components.

Route handlers (`app/api/`) are **not** used for the app's data endpoints. The only route handler present is `app/api/auth/[...all]/route.ts`, which is owned by Better Auth for authentication (signup, login, logout, session). All other data operations go through server actions instead of route handlers.

Validation schemas for incoming data belong in `lib/data/validation/`. These folders are currently placeholders to be filled as Phase 2 (persistence and authorization) is implemented.
