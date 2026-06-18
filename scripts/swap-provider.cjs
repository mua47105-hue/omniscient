/* eslint-disable @typescript-eslint/no-require-imports */
// Swaps Prisma provider based on DATABASE_URL.
// If DATABASE_URL starts with "postgresql://", sets provider to "postgresql".
// Otherwise keeps "sqlite" (for local dev).
// This runs before "prisma generate" in the build script.

const fs = require('fs');
const path = require('path');

const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma');
const dbUrl = process.env.DATABASE_URL || '';

let schema = fs.readFileSync(schemaPath, 'utf8');

if (dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://')) {
  // Switch to postgresql for Supabase/PostgreSQL
  schema = schema.replace(/provider\s*=\s*"sqlite"/g, 'provider = "postgresql"');
  console.log('[swap-provider] Switched Prisma provider to postgresql (DATABASE_URL is PostgreSQL)');
} else {
  // Keep sqlite for local dev
  console.log('[swap-provider] Keeping Prisma provider as sqlite (DATABASE_URL is not PostgreSQL)');
}

fs.writeFileSync(schemaPath, schema);
