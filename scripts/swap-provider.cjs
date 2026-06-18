/* eslint-disable @typescript-eslint/no-require-imports */
// Swaps Prisma provider based on DATABASE_URL.
// If DATABASE_URL starts with "postgresql://", sets provider to "postgresql".
// If DATABASE_URL starts with "file:", sets provider to "sqlite".
// This runs before "prisma generate" in the build script.

const fs = require('fs');
const path = require('path');

const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma');
const dbUrl = process.env.DATABASE_URL || '';

let schema = fs.readFileSync(schemaPath, 'utf8');

// Determine the correct provider
const wantProvider = (dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://'))
  ? 'postgresql'
  : 'sqlite';

// Replace whatever provider is currently set
schema = schema.replace(
  /provider\s*=\s*"(sqlite|postgresql)"/g,
  `provider = "${wantProvider}"`
);

console.log(`[swap-provider] DATABASE_URL starts with: ${dbUrl.slice(0, 15)}...`);
console.log(`[swap-provider] Set Prisma provider to: ${wantProvider}`);

fs.writeFileSync(schemaPath, schema);
