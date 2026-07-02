# MechanicFlow — Local Setup

## First-time setup (one command)

```bash
npm run setup
```

This runs `npm install` → `prisma generate` → `prisma db push`.

## Or step by step

```bash
npm install            # installs deps AND auto-generates the Prisma client (postinstall hook)
npm run db:generate    # (only needed if you skip install or change schema.prisma)
npm run db:push        # syncs your schema to the database
npm run dev            # start the dev server
```

## The #1 gotcha: "Failed to initialize Prisma Client" / 500 on every API route

`@prisma/client` is a generated package. Until you run `prisma generate`, it's an
empty stub and `new PrismaClient()` throws at import time — which 500s every route
that touches the database (register, login, everything).

**Fix:** `npm run db:generate` — or just `npm install`, which now does it automatically.

## The #2 gotcha: "Environment variable not found: DATABASE_URL"

The **Prisma CLI** reads `.env`, NOT `.env.local`. Your app config lives in
`.env.local`; the database URLs are duplicated into `.env` so the CLI can find
them. Both files are gitignored. If you rotate the database password, update it
in **both** files.

## After changing prisma/schema.prisma

```bash
npm run db:generate    # regenerate the typed client
npm run db:push        # push schema changes to the DB (dev)
# — or, to create a migration —
npm run db:migrate
```

## Production build

`npm run build` now runs `prisma generate` first, so deploys never ship a stale
or missing client.
