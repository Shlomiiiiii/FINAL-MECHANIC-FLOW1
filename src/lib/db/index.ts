import { PrismaClient } from "@prisma/client";

/**
 * Singleton Prisma client.
 *
 * In development, Next.js hot-reloading would otherwise create a new client on
 * every change and exhaust the database connection pool, so we cache it on the
 * global object.
 *
 * NOTE: `@prisma/client` is generated from prisma/schema.prisma. If you ever see
 * an error originating from `new PrismaClient(...)`, run `npm run db:generate`
 * (or just `npm install`, which now triggers it via the postinstall hook).
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  try {
    return new PrismaClient({
      log:
        process.env.NODE_ENV === "development"
          ? ["error", "warn"]
          : ["error"],
    });
  } catch (err) {
    // Surface a clear, actionable message instead of a cryptic init stack trace.
    console.error(
      "\n[MechanicFlow] Failed to initialize Prisma Client.\n" +
        "This almost always means the client hasn't been generated yet.\n" +
        "Fix: run `npm run db:generate` (or `npm install`).\n"
    );
    throw err;
  }
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
