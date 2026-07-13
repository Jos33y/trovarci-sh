// IndexNow one-time setup. Generates a random key, writes the verification file to public/,
// and prints the INDEXNOW_KEY line to add to .env and .env.production.
// Safe to re-run; each run generates a fresh key (old file must be removed manually).

import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';

const KEY_LENGTH_BYTES = 16;
const HOST = 'trovarci.sh';
const PUBLIC_DIR = path.join(process.cwd(), 'public');

async function main() {
  try {
    await fs.access(PUBLIC_DIR);
  } catch {
    console.error(`[FAIL] public/ directory not found at ${PUBLIC_DIR}`);
    console.error('       Run this script from the repo root.');
    process.exit(1);
  }

  const key = crypto.randomBytes(KEY_LENGTH_BYTES).toString('hex');
  const filename = `${key}.txt`;
  const filepath = path.join(PUBLIC_DIR, filename);

  await fs.writeFile(filepath, key, 'utf-8');

  console.log('\n[OK] IndexNow key generated and verification file written.\n');
  console.log(`     Key:       ${key}`);
  console.log(`     File:      public/${filename}`);
  console.log(`     Public at: https://${HOST}/${filename}\n`);
  console.log('Next steps:');
  console.log('  1. Add to .env AND .env.production:');
  console.log(`       INDEXNOW_KEY=${key}\n`);
  console.log(`  2. Commit both: git add public/${filename} .env.production && git commit -m "chore: add IndexNow key"`);
  console.log('  3. Push and deploy so the key file is publicly accessible.');
  console.log(`  4. Verify by opening https://${HOST}/${filename} in a browser (should show only the key).`);
  console.log('  5. Preview the initial submission:');
  console.log('       node --env-file=.env scripts/indexnowPing.mjs --all --dry-run');
  console.log('  6. Send the initial submission for real:');
  console.log('       node --env-file=.env scripts/indexnowPing.mjs --all\n');
  process.exit(0);
}

main().catch(err => {
  console.error('[FAIL]', err.message);
  process.exit(1);
});
