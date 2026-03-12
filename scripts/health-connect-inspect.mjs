/**
 * health-connect-inspect.mjs
 *
 * ADB-based diagnostic script to inspect Health Connect data availability.
 * Queries the device for record types and checks whether resting HR, HRV,
 * blood pressure, and other vitals actually have data in Health Connect.
 *
 * Usage:  node scripts/health-connect-inspect.mjs [--days 30]
 * Requires: ADB connected to device with Health Connect installed.
 */
import { execFileSync } from 'node:child_process';

const DAYS = (() => {
  const idx = process.argv.indexOf('--days');
  return idx >= 0 && process.argv[idx + 1] ? Number(process.argv[idx + 1]) : 30;
})();

const adb = (...args) => {
  try {
    return execFileSync('adb', args, { encoding: 'utf8', timeout: 15_000 }).trim();
  } catch (err) {
    return `[error] ${err.message || err}`;
  }
};

const logcat = (tag, lines = 200) =>
  adb('logcat', '-d', '-s', `${tag}:*`, '-t', String(lines));

const section = (title) => console.log(`\n${'='.repeat(60)}\n  ${title}\n${'='.repeat(60)}`);

// ── 1. Device info ──────────────────────────────────────────
section('Device');
console.log(adb('shell', 'getprop', 'ro.product.model'));
console.log('Android', adb('shell', 'getprop', 'ro.build.version.release'));

// ── 2. Health Connect installed? ─────────────────────────────
section('Health Connect package');
const hcPackage = adb('shell', 'pm', 'list', 'packages', 'com.google.android.apps.healthdata');
console.log(hcPackage || 'Health Connect NOT found');

// ── 3. Samsung Health installed? ─────────────────────────────
section('Samsung Health package');
const shPackage = adb('shell', 'pm', 'list', 'packages', 'com.sec.android.app.shealth');
console.log(shPackage || 'Samsung Health NOT found');

// ── 4. App permissions granted ──────────────────────────────
section('App health permissions (nutrisporthub)');
const appPerms = adb('shell', 'dumpsys', 'package', 'com.guibizet.nutrisporthub');
const healthPerms = appPerms
  .split('\n')
  .filter((line) => /health/i.test(line) && /permission/i.test(line))
  .map((l) => l.trim());
if (healthPerms.length) {
  healthPerms.forEach((p) => console.log(p));
} else {
  console.log('No health permissions found in dumpsys output');
}

// ── 5. Health Connect data providers ─────────────────────────
section('Health Connect data providers');
const hcDumpsys = adb('shell', 'dumpsys', 'activity', 'provider', 'com.google.android.apps.healthdata');
const providerLines = hcDumpsys
  .split('\n')
  .filter((line) => /record|data.*type|source|package/i.test(line))
  .slice(0, 40);
if (providerLines.length) {
  providerLines.forEach((l) => console.log(l.trim()));
} else {
  console.log('No provider data found (Health Connect may manage access differently)');
}

// ── 6. HealthBridgePlugin logcat ─────────────────────────────
section(`HealthBridgePlugin logs (last import, ${DAYS}d window)`);
const bridgeLogs = logcat('HealthBridgePlugin', 500);
const relevantLogs = bridgeLogs
  .split('\n')
  .filter((line) =>
    /resting|hrv|heart.*variab|blood.*pressure|vitals.*detail|vitals.*skip|record.*count/i.test(line),
  );
if (relevantLogs.length) {
  relevantLogs.forEach((l) => console.log(l));
} else {
  console.log('No resting HR / HRV / BP specific logs found.');
  console.log('Tip: trigger a health import in the app, then re-run this script.');
}

// ── 7. Full vitals logcat excerpt ────────────────────────────
section('All HealthBridgePlugin logs (last 30 lines)');
const allBridgeLogs = bridgeLogs.split('\n').slice(-30);
allBridgeLogs.forEach((l) => console.log(l));

// ── 8. Samsung Health data check ─────────────────────────────
section('Samsung Health content providers');
const shDumpsys = adb('shell', 'dumpsys', 'activity', 'provider', 'com.sec.android.app.shealth');
const shDataLines = shDumpsys
  .split('\n')
  .filter((line) => /heart.*rate|resting|hrv|variab|blood.*pressure/i.test(line))
  .slice(0, 20);
if (shDataLines.length) {
  shDataLines.forEach((l) => console.log(l.trim()));
} else {
  console.log('No resting HR / HRV data references in Samsung Health provider dump.');
}

// ── Summary ──────────────────────────────────────────────────
section('Summary');
console.log(`
Checked ${DAYS}-day window on device.

What to look for:
  - If HealthBridgePlugin logs show "restingRecords=0" or "hrvRecords=0",
    Samsung Health is NOT publishing these to Health Connect.
  - If Samsung Health dumpsys shows resting HR / HRV fields,
    the data exists but needs Samsung SDK reading (not HC).
  - Blood pressure data should appear if measured via watch or Withings.

Next steps if data is missing from HC:
  1. Open Samsung Health app → Settings → Data permissions → Health Connect
  2. Verify "Resting heart rate" and "Heart rate variability" are toggled ON
  3. If toggles don't exist, Samsung Health on this device doesn't support
     publishing these records to Health Connect.
  4. Alternative: add Samsung Health SDK reads for these types in
     HealthBridgePlugin.kt (readSamsungVitalsRows).
`);
