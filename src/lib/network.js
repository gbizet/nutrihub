export const DEFAULT_NETWORK_TIMEOUT_MS = 15_000;

export class HttpRequestError extends Error {
  constructor({
    message,
    code = 'HTTP_ERROR',
    status = 0,
    url = '',
    method = 'GET',
    body = '',
    cause = null,
    timeoutMs = DEFAULT_NETWORK_TIMEOUT_MS,
  } = {}) {
    super(message || 'HTTP request failed.');
    this.name = 'HttpRequestError';
    this.code = code;
    this.status = status;
    this.url = url;
    this.method = method;
    this.body = body;
    this.timeoutMs = timeoutMs;
    if (cause) this.cause = cause;
  }
}

const isAbortError = (error) => error?.name === 'AbortError' || error?.code === 'ABORT_ERR';

const attachSignal = (targetController, sourceSignal) => {
  if (!sourceSignal) return () => {};
  if (sourceSignal.aborted) {
    targetController.abort(sourceSignal.reason);
    return () => {};
  }
  const forwardAbort = () => targetController.abort(sourceSignal.reason);
  sourceSignal.addEventListener('abort', forwardAbort, { once: true });
  return () => sourceSignal.removeEventListener('abort', forwardAbort);
};

const buildErrorMessage = (method, url, response, body) => {
  const suffix = body ? `: ${body}` : `: ${response.statusText || 'HTTP error'}`;
  return `${method} ${url} failed with ${response.status}${suffix}`;
};

export const fetchWithTimeout = async (url, options = {}, meta = {}) => {
  const timeoutMs = Math.max(1, Number(meta.timeoutMs || DEFAULT_NETWORK_TIMEOUT_MS));
  const controller = new AbortController();
  const detachSignal = attachSignal(controller, options.signal);
  const timer = setTimeout(() => controller.abort(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs);
  const method = `${options.method || 'GET'}`.toUpperCase();

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (isAbortError(error) || controller.signal.aborted) {
      throw new HttpRequestError({
        message: `${method} ${url} timed out after ${timeoutMs}ms`,
        code: 'TIMEOUT',
        url,
        method,
        cause: error,
        timeoutMs,
      });
    }
    throw new HttpRequestError({
      message: `${method} ${url} failed before a response was received.`,
      code: 'NETWORK_ERROR',
      url,
      method,
      cause: error,
      timeoutMs,
    });
  } finally {
    clearTimeout(timer);
    detachSignal();
  }
};

export const fetchJson = async (url, options = {}, meta = {}) => {
  const response = await fetchWithTimeout(url, options, meta);
  const method = `${options.method || 'GET'}`.toUpperCase();

  if (!response.ok) {
    const body = await response.text();
    throw new HttpRequestError({
      message: buildErrorMessage(method, url, response, body),
      code: 'HTTP_ERROR',
      status: response.status,
      url,
      method,
      body,
      timeoutMs: Math.max(1, Number(meta.timeoutMs || DEFAULT_NETWORK_TIMEOUT_MS)),
    });
  }

  if (response.status === 204) return null;

  try {
    return await response.json();
  } catch (error) {
    throw new HttpRequestError({
      message: `${method} ${url} returned invalid JSON.`,
      code: 'INVALID_JSON',
      status: response.status,
      url,
      method,
      cause: error,
      timeoutMs: Math.max(1, Number(meta.timeoutMs || DEFAULT_NETWORK_TIMEOUT_MS)),
    });
  }
};
