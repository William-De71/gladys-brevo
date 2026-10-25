// -----------------------------------------------------------------------------
// Brevo API client (https://developers.brevo.com, API v3).
//
// Every call carries the API key in the `api-key` header. The endpoints used:
//
//   GET  /account                            plan and credits (emails, SMS)
//   GET  /senders                            the email senders of the account
//   POST /smtp/email                         send a transactional email
//   POST /transactionalSMS/send              send a transactional SMS
//   GET  /smtp/statistics/events             events of the emails sent
//   GET  /transactionalSMS/statistics/events events of the SMS sent
//
// Rate limits of the free plan (docs/api-limits): 300 calls an hour on
// /smtp/* (sending excluded), 100 an hour on /account, /senders and the SMS
// statistics. A refusal is a 429 with `x-sib-ratelimit-reset` (seconds).
//
// Errors are JSON `{ code, message }`. A wrong key is a 401
// `{"code":"unauthorized","message":"Key not found"}`; an IP address missing
// from the "Authorized IPs" of the account (Security settings) is a 401 too,
// with a message about the IP address.
//
// This module holds only HTTP (no SDK, no Gladys concept): the transport is
// injected, so the tests never touch the network. The API key never appears in
// an error, a log line or a URL.
// -----------------------------------------------------------------------------

const BASE_URL = 'https://api.brevo.com/v3';
const REQUEST_TIMEOUT_MS = 20 * 1000;

// Kinds of failure, used by the rest of the integration to pick a message
// and a scene trigger reason.
const ERROR_KINDS = Object.freeze({
  AUTH: 'auth',
  IP_BLOCKED: 'ip_blocked',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not_found',
  BAD_REQUEST: 'bad_request',
  RATE_LIMITED: 'rate_limited',
  SERVER: 'server',
  TIMEOUT: 'timeout',
  UNREACHABLE: 'unreachable',
  UNEXPECTED: 'unexpected',
});

/**
 * @description A call Brevo refused or could not answer.
 */
class BrevoApiError extends Error {
  /**
   * @param {string} message - Readable message, without the API key.
   * @param {object} details - Failure details.
   * @param {string} details.kind - One of ERROR_KINDS.
   * @param {number|null} [details.status] - HTTP status, when Brevo answered.
   * @param {string|null} [details.code] - The `code` of the answer (e.g. not_enough_credits).
   * @param {string|null} [details.brevoMessage] - The `message` of the answer.
   * @param {number|null} [details.retryAfter] - Seconds before the limit resets (429).
   * @param {Error} [details.cause] - Underlying error.
   */
  constructor(
    message,
    { kind, status = null, code = null, brevoMessage = null, retryAfter = null, cause } = {},
  ) {
    super(message, cause ? { cause } : undefined);
    this.name = 'BrevoApiError';
    this.kind = kind;
    this.status = status;
    this.code = code;
    this.brevoMessage = brevoMessage;
    this.retryAfter = retryAfter;
  }
}

/**
 * @description The kind of failure of an answer.
 * @param {number} status - The HTTP status.
 * @param {string} message - The `code` and `message` of the answer.
 * @returns {string} One of ERROR_KINDS.
 * @example
 * kindOf(429, ''); // -> 'rate_limited'
 */
function kindOf(status, message) {
  if (status === 401) {
    // Brevo answers 401 both for a key it does not know and for a known key
    // used from an IP address the account does not authorize, which the user
    // fixes in the Security settings, not by changing the key.
    return /\bIP\b|ip address|unrecogni[sz]ed ip/i.test(message)
      ? ERROR_KINDS.IP_BLOCKED
      : ERROR_KINDS.AUTH;
  }
  if (status === 403) {
    return ERROR_KINDS.FORBIDDEN;
  }
  if (status === 404) {
    return ERROR_KINDS.NOT_FOUND;
  }
  if (status === 429) {
    return ERROR_KINDS.RATE_LIMITED;
  }
  if (status >= 500) {
    return ERROR_KINDS.SERVER;
  }
  if (status >= 400) {
    return ERROR_KINDS.BAD_REQUEST;
  }
  return ERROR_KINDS.UNEXPECTED;
}

/**
 * @description The default transport: fetch with a timeout, answering
 * `{ status, text, headers }`.
 * @param {string} url - The URL.
 * @param {object} init - fetch options.
 * @returns {Promise<{ status: number, text: string, headers: object }>} The answer.
 * @example
 * await fetchTransport('https://api.brevo.com/v3/account', { method: 'GET', headers });
 */
async function fetchTransport(url, init) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  return {
    status: response.status,
    text: await response.text(),
    headers: { 'x-sib-ratelimit-reset': response.headers.get('x-sib-ratelimit-reset') },
  };
}

/**
 * @description Build a query string (only the defined values).
 * @param {object} [query] - The parameters.
 * @returns {string} '' or '?a=1&b=2'.
 * @example
 * queryString({ days: 1, sort: 'desc' }); // -> '?days=1&sort=desc'
 */
function queryString(query = {}) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, String(value));
    }
  });
  const text = params.toString();
  return text ? `?${text}` : '';
}

/**
 * @description Create a Brevo API client.
 * @param {object} options - Options.
 * @param {Function} options.getApiKey - `() => string`.
 * @param {Function} [options.transport] - `(url, init) => Promise<{ status, text, headers }>` (tests).
 * @returns {object} The client: `get`, `post`.
 * @example
 * const api = createBrevoClient({ getApiKey: () => config.apiKey });
 * const account = await api.get('/account');
 */
function createBrevoClient({ getApiKey, transport = fetchTransport }) {
  /**
   * @description Send one HTTP request and turn network failures into BrevoApiError.
   * @param {string} url - The URL.
   * @param {object} init - fetch options.
   * @returns {Promise<{ status: number, text: string, headers?: object }>} The answer.
   */
  async function send(url, init) {
    try {
      return await transport(url, init);
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        throw new BrevoApiError('Brevo API timed out', { kind: ERROR_KINDS.TIMEOUT, cause: err });
      }
      // Never the request in the message: its headers carry the key.
      throw new BrevoApiError(`Brevo API unreachable: ${err.cause?.code ?? err.message}`, {
        kind: ERROR_KINDS.UNREACHABLE,
        cause: err,
      });
    }
  }

  /**
   * @description Make one call.
   * @param {string} method - HTTP method.
   * @param {string} path - Path under /v3, e.g. '/account'.
   * @param {object} [options] - Options.
   * @param {object} [options.query] - Query parameters.
   * @param {object} [options.body] - JSON body.
   * @returns {Promise<any>} The parsed JSON answer (null when empty).
   */
  async function call(method, path, { query, body } = {}) {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new BrevoApiError('The Brevo API key is missing', { kind: ERROR_KINDS.AUTH });
    }
    const headers = { Accept: 'application/json', 'api-key': apiKey };
    const payload = body === undefined ? '' : JSON.stringify(body);
    if (payload) {
      headers['Content-Type'] = 'application/json';
    }
    const answer = await send(`${BASE_URL}${path}${queryString(query)}`, {
      method,
      headers,
      ...(payload ? { body: payload } : {}),
    });

    let data = null;
    if (answer.text) {
      try {
        data = JSON.parse(answer.text);
      } catch {
        data = null;
      }
    }
    if (answer.status >= 200 && answer.status < 300) {
      return data;
    }
    const brevoMessage = typeof data?.message === 'string' ? data.message.slice(0, 300) : '';
    const code = typeof data?.code === 'string' ? data.code : null;
    const reset = Number(answer.headers?.['x-sib-ratelimit-reset']);
    throw new BrevoApiError(
      `Brevo API answered HTTP ${answer.status} to ${method} ${path}${brevoMessage ? `: ${brevoMessage}` : ''}`,
      {
        kind: kindOf(answer.status, `${code ?? ''} ${brevoMessage}`),
        status: answer.status,
        code,
        brevoMessage: brevoMessage || null,
        retryAfter: Number.isFinite(reset) && reset >= 0 ? reset : null,
      },
    );
  }

  return {
    get: (path, query) => call('GET', path, { query }),
    post: (path, body) => call('POST', path, { body }),
  };
}

export { createBrevoClient, BrevoApiError, ERROR_KINDS, BASE_URL, queryString, kindOf };
