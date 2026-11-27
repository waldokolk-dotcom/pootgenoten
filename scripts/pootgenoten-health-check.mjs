import fs from 'node:fs';

const configured = process.env.POOTGENOTEN_PRODUCTION_URL || 'https://waldokolk-dotcom.github.io/whatsup-dog/';
const base = new URL(configured);
const expectedOrigin = 'https://waldokolk-dotcom.github.io';
const expectedPath = '/whatsup-dog/';
if (base.protocol !== 'https:' || base.origin !== expectedOrigin || base.pathname !== expectedPath || base.search || base.hash || base.username || base.password) {
  throw new Error('Production target is outside the approved Pootgenoten URL.');
}

const checks = [];
async function probe(label, path, validate) {
  const target = new URL(path, base);
  if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname)) {
    checks.push({ label, ok: false, detail: 'target outside approved base path' });
    return;
  }
  try {
    const response = await fetch(target, {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
      headers: { accept: '*/*' }
    });
    if (!response.ok) {
      checks.push({ label, ok: false, detail: 'HTTP ' + response.status });
      return;
    }
    const body = await response.text();
    if (!validate(body)) {
      checks.push({ label, ok: false, detail: 'content validation failed' });
      return;
    }
    checks.push({ label, ok: true, detail: 'HTTP ' + response.status });
  } catch {
    checks.push({ label, ok: false, detail: 'request failed or exceeded 8 seconds' });
  }
}

await probe('homepage', '', body => body.includes('<title>Pootgenoten</title>') && body.includes('JOUW BUURT • POOTGENOTEN') && body.includes('id="view-map"'));
await probe('PWA manifest', 'manifest.webmanifest', body => {
  try { return JSON.parse(body).name === 'Pootgenoten'; } catch { return false; }
});
await probe('service worker', 'sw.js', body => body.includes('Pootgenoten') && body.length > 100);
await probe('map data', 'data/nijkerk-losloopgebieden.geojson', body => {
  try {
    const data = JSON.parse(body);
    return data.type === 'FeatureCollection' && Array.isArray(data.features) && data.features.length > 0;
  } catch { return false; }
});

const summary = [
  '## Pootgenoten production health probe',
  '',
  '| Check | Result | Detail |',
  '| --- | --- | --- |',
  ...checks.map(check => '| ' + check.label + ' | ' + (check.ok ? 'PASS' : 'FAIL') + ' | ' + check.detail + ' |'),
  '',
  'Target: approved public Pootgenoten origin; no credentials, database access, writes, or recovery actions.',
  ''
].join('\n');
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
if (checks.some(check => !check.ok)) process.exitCode = 1;
