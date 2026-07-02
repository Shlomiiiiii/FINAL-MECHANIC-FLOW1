import path from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  earlyAccess: true,
  schema: path.join(import.meta.dirname, "prisma/schema.prisma"),
  datasources: {
    db: {
      url: process.env.DATABASE_URL!,
      // directUrl bypasses PgBouncer for migrations/introspection (Supabase requirement)
      directUrl: process.env.DIRECT_URL,
    },
  },
});
