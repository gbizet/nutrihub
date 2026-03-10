import { readFile } from 'node:fs/promises';
import path from 'node:path';

const target = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.resolve(process.cwd(), 'data', 'dashboard-state.json');

try {
  const raw = await readFile(target, 'utf8');
  const parsed = JSON.parse(raw);
  const entries = Array.isArray(parsed?.healthSync?.debugEntries) ? parsed.healthSync.debugEntries : [];

  if (!entries.length) {
    console.log(`[health-debug] no entries in ${target}`);
    process.exit(0);
  }

  console.log(`[health-debug] ${entries.length} entries from ${target}`);
  entries.forEach((entry) => {
    const payload = entry?.payload ? ` ${JSON.stringify(entry.payload)}` : '';
    console.log(`${entry?.at || '-'} ${entry?.message || ''}${payload}`);
  });
} catch (error) {
  console.error(`[health-debug] failed to read ${target}: ${error.message || error}`);
  process.exit(1);
}
