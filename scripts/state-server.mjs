import { createServer } from 'node:http';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const port = Number.parseInt(process.env.STATE_PORT || '8787', 10);
const stateDir = path.resolve(process.cwd(), 'data');
const stateFile = path.join(stateDir, 'dashboard-state.json');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const json = (res, status, payload) => {
  res.writeHead(status, { 'Content-Type': 'application/json', ...corsHeaders });
  res.end(JSON.stringify(payload));
};

const ensureDir = async () => {
  await mkdir(stateDir, { recursive: true });
};

const readState = async () => {
  try {
    const raw = await readFile(stateFile, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const writeState = async (payload) => {
  await ensureDir();
  const tempFile = `${stateFile}.tmp`;
  await writeFile(tempFile, JSON.stringify(payload, null, 2), 'utf8');
  await rename(tempFile, stateFile);
};

const collectBody = async (req) =>
  new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 4 * 1024 * 1024) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  if (req.url === '/health') {
    json(res, 200, { ok: true, file: stateFile });
    return;
  }

  if (req.url !== '/api/state') {
    json(res, 404, { error: 'Not found' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const payload = await readState();
      json(res, 200, payload);
      return;
    }

    if (req.method === 'PUT') {
      const raw = await collectBody(req);
      const parsed = JSON.parse(raw || '{}');
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        json(res, 400, { error: 'Invalid payload' });
        return;
      }
      await writeState(parsed);
      json(res, 200, { ok: true });
      return;
    }

    json(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    json(res, 500, { error: error.message || 'Unexpected error' });
  }
});

await ensureDir();
server.listen(port, () => {
  console.log(`[state-server] listening on http://localhost:${port}`);
  console.log(`[state-server] state file: ${stateFile}`);
});
