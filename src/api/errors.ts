export type ApiErrorKind =
  | 'network'
  | 'offline'
  | 'rate-limit'
  | 'auth'
  | 'not-found'
  | 'server'
  | 'bad-response'
  | 'missing-key'
  | 'aborted';

export type ApiContext = 'weather' | 'search';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;

  constructor(kind: ApiErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}

export function isAbort(err: unknown): boolean {
  return (
    (err instanceof ApiError && err.kind === 'aborted') ||
    (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError')
  );
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError') {
    return new ApiError('aborted', 'Request cancelled');
  }
  if (err instanceof TypeError) {
    // fetch() rejects with TypeError when the network is unreachable.
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    return new ApiError(offline ? 'offline' : 'network', err.message);
  }
  return new ApiError('bad-response', err instanceof Error ? err.message : String(err));
}

export function errorFromStatus(status: number, service: string): ApiError {
  if (status === 401 || status === 403) return new ApiError('auth', `${service} rejected the API key`, status);
  if (status === 404) return new ApiError('not-found', `${service} has no data for this request`, status);
  if (status === 429) return new ApiError('rate-limit', `${service} rate limit reached`, status);
  if (status >= 500) return new ApiError('server', `${service} is having problems`, status);
  return new ApiError('bad-response', `${service} returned HTTP ${status}`, status);
}

export interface UserMessage {
  title: string;
  hint: string;
}

/** Turns an error into copy that says what failed and what the user can do next. */
export function userMessage(err: ApiError, context: ApiContext): UserMessage {
  const isWeather = context === 'weather';
  const service = isWeather ? 'weather' : 'city search';
  switch (err.kind) {
    case 'offline':
      return {
        title: isWeather ? "You're offline, so the forecast couldn't load." : "You're offline, so city search isn't available.",
        hint: isWeather
          ? 'Reconnect and tap Retry. Your last viewed city is still available offline.'
          : 'Reconnect to search. Your favourites and last viewed city still work.',
      };
    case 'network':
      return {
        title: `We couldn't reach the ${service} service.`,
        hint: 'Check your connection (or any ad/content blocker), then tap Retry.',
      };
    case 'rate-limit':
      return {
        title: isWeather ? 'The weather service is busy right now.' : 'City search is busy right now.',
        hint: isWeather ? 'Wait about a minute and tap Retry.' : 'Pause for a second and keep typing.',
      };
    case 'auth':
    case 'missing-key':
      return {
        title: `${isWeather ? 'Weather' : 'City search'} isn't configured correctly on this site.`,
        hint: 'This is a problem on our side, not yours. Please try again later.',
      };
    case 'not-found':
      return {
        title: isWeather ? 'No forecast is available for this location.' : 'No matching cities were found.',
        hint: isWeather ? 'Try a nearby larger city.' : 'Check the spelling or try a nearby larger city.',
      };
    case 'server':
      return {
        title: `The ${service} service is having problems.`,
        hint: 'This usually clears up within a few minutes. Tap Retry.',
      };
    case 'bad-response':
      return {
        title: `We got an unexpected response from the ${service} service.`,
        hint: 'Tap Retry. If it keeps happening, try another city.',
      };
    case 'aborted':
      return { title: 'Request cancelled.', hint: '' };
  }
}
