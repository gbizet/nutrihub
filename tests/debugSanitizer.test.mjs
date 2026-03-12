import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeDebugValue } from '../src/lib/debugSanitizer.js';

test('sanitizeDebugValue redacts token and authorization fields recursively', () => {
  const sanitized = sanitizeDebugValue({
    accessToken: 'secret-token',
    nested: {
      Authorization: 'Bearer secret-token',
      safe: 'ok',
    },
  });

  assert.equal(sanitized.accessToken, '[redacted]');
  assert.equal(sanitized.nested.Authorization, '[redacted]');
  assert.equal(sanitized.nested.safe, 'ok');
});
