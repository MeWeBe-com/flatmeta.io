// Prints the repo-root .env as `export KEY='value'` lines so shell scripts can load it safely
// (the same parser Node uses for --env-file: quotes, spaces and inline # comments all work).
//   eval "$(node scripts/print-env.mjs)"            # or: node scripts/print-env.mjs /path/to/.env
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// AD2: an explicit file (the auto-deploy's shared/.env) or the repo-root .env.
const file = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
if (!existsSync(file)) process.exit(0);
for (const [k, v] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) console.log(`export ${k}='${String(v).replaceAll("'", `'\\''`)}'`);
}
