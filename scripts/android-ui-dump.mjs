import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const deviceDumpPath = '/sdcard/window_dump.xml';
const localDumpPath = path.resolve(process.cwd(), 'tmp', 'android-ui.xml');

const run = (args) => execFileSync('adb', args, { encoding: 'utf8' });

try {
  const dumpStatus = run(['shell', 'uiautomator', 'dump', deviceDumpPath]).trim();
  const xml = run(['shell', 'cat', deviceDumpPath]);
  await mkdir(path.dirname(localDumpPath), { recursive: true });
  await writeFile(localDumpPath, xml, 'utf8');
  console.log(`[android-ui-dump] ${dumpStatus}`);
  console.log(`[android-ui-dump] wrote ${localDumpPath}`);
  console.log(xml);
} catch (error) {
  console.error(`[android-ui-dump] failed: ${error.message || error}`);
  process.exit(1);
}
