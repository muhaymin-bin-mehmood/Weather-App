import { ApiError, errorFromStatus, toApiError } from './errors';

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * fetch + JSON with typed errors and a timeout. The caller's AbortSignal is
 * respected; a timeout surfaces as a 'network' error, not 'aborted'.
 */
export async function fetchJson<T>(
  url: string,
  service: string,
  init: RequestInit & { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...rest } = init;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    const res = await fetch(url, { ...rest, signal: controller.signal });
    if (!res.ok) throw errorFromStatus(res.status, service);
    try {
      return (await res.json()) as T;
    } catch {
      throw new ApiError('bad-response', `${service} returned invalid JSON`);
    }
  } catch (err) {
    if (timedOut) throw new ApiError('network', `${service} took too long to respond`);
    throw toApiError(err);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
