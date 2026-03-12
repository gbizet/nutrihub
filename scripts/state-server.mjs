import { resolveStateServerConfig, startStateServer } from './state-server-core.mjs';

const config = resolveStateServerConfig(process.env, process.cwd());

if (!config.enabled) {
  console.log('[state-server] disabled. Set STATE_ENABLE=1 to start the local companion server.');
  process.exit(0);
}

const { config: startedConfig } = await startStateServer(config);

console.log(`[state-server] listening on http://${startedConfig.bindHost}:${startedConfig.port}`);
console.log(`[state-server] state file: ${startedConfig.stateFile}`);
console.log(`[state-server] Drive proxy: ${startedConfig.googleClientId ? 'configured' : 'not configured (set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_TOKEN_ENCRYPTION_KEY)'}`);
