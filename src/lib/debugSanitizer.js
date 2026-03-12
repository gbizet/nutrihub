const MAX_DEBUG_DEPTH = 4;
const MAX_ARRAY_ITEMS = 20;
const MAX_OBJECT_ENTRIES = 30;

const REDACTED_VALUE = '[redacted]';
const SECRET_KEY_PATTERN = /(authorization|cookie|secret|token)/i;

const isSecretKey = (key = '') => SECRET_KEY_PATTERN.test(`${key}`.trim());

export const sanitizeDebugValue = (value, depth = 0, parentKey = '') => {
  if (isSecretKey(parentKey)) return REDACTED_VALUE;
  if (depth > MAX_DEBUG_DEPTH) return '[max-depth]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return value;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      code: value.code,
    };
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeDebugValue(item, depth + 1, parentKey));
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, MAX_OBJECT_ENTRIES)
        .map(([key, item]) => [key, sanitizeDebugValue(item, depth + 1, key)]),
    );
  }
  return `${value}`;
};
