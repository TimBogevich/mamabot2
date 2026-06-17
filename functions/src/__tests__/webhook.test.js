/**
 * Tests for Telegram webhook registration flow.
 *
 * Verifies that registerWebhook constructs the correct setWebhook URL,
 * handles Telegram API responses, and returns the expected response shape.
 * All Telegram API calls are mocked — no actual HTTP requests are made.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';

const TEST_TOKEN = 'test:resolved-token-12345';
const TELEGRAM_API_URL = 'https://api.telegram.org';
const TEST_HOST = 'us-central1-mamabot-97d22.cloudfunctions.net';
const EXPECTED_WEBHOOK_URL = `https://${TEST_HOST}/webhook`;

const req = createRequire(import.meta.url);

let originalFetch;

/**
 * Mock firebase-functions and firebase-functions/v2/https in the require cache
 * before index.js is loaded. This follows the same pattern as index.test.js.
 */
function injectFirebaseMock(configValue) {
  const fbPath = req.resolve('firebase-functions');
  req.cache[fbPath] = {
    id: fbPath,
    filename: fbPath,
    loaded: true,
    exports: {
      config: () => configValue,
    },
  };

  const fbV2HttpsPath = req.resolve('firebase-functions/v2/https');
  req.cache[fbV2HttpsPath] = {
    id: fbV2HttpsPath,
    filename: fbV2HttpsPath,
    loaded: true,
    exports: {
      onRequest: (_opts, handler) => handler,
    },
  };
}

/** Clear the require cache for all relevant modules. */
function cleanCache() {
  delete process.env.TELEGRAM_TOKEN;

  try {
    const indexPath = req.resolve('../../index.js');
    delete req.cache[indexPath];
  } catch { /* not cached yet */ }
  try {
    const tgPath = req.resolve('../utils/telegram.js');
    delete req.cache[tgPath];
  } catch { /* not cached yet */ }
  try {
    const fbPath = req.resolve('firebase-functions');
    delete req.cache[fbPath];
  } catch { /* not cached yet */ }
  try {
    const fbV2Path = req.resolve('firebase-functions/v2/https');
    delete req.cache[fbV2Path];
  } catch { /* not cached yet */ }

  vi.resetModules();
}

function unmockFirebase() {
  try {
    const fbPath = req.resolve('firebase-functions');
    delete req.cache[fbPath];
  } catch { /* not cached yet */ }
  try {
    const fbV2Path = req.resolve('firebase-functions/v2/https');
    delete req.cache[fbV2Path];
  } catch { /* not cached yet */ }
}

/** Create a mock request object with a given host header. */
function mockReq(host = TEST_HOST) {
  return {
    method: 'GET',
    headers: { host },
  };
}

/** Create a mock response object with vi.fn() spies. */
function mockRes() {
  const res = {
    json: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    sendStatus: vi.fn().mockReturnThis(),
  };
  return res;
}

/**
 * Import index.js dynamically and return just the registerWebhook function.
 * This requires firebase-functions and firebase-functions/v2/https to be
 * pre-mocked in the require cache.
 */
function loadRegisterWebhook() {
  return req('../../index.js').registerWebhook;
}

describe('registerWebhook', () => {
  beforeEach(() => {
    cleanCache();
    injectFirebaseMock({});
    process.env.TELEGRAM_TOKEN = TEST_TOKEN;
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.TELEGRAM_TOKEN;
    unmockFirebase();
  });

  it('returns success=true when Telegram API confirms webhook was set', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, description: 'Webhook was set' }),
    });

    const registerWebhook = loadRegisterWebhook();
    const req = mockReq(TEST_HOST);
    const res = mockRes();

    await registerWebhook(req, res);

    expect(res.json).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      description: 'Webhook was set',
      webhookUrl: EXPECTED_WEBHOOK_URL,
    });
  });

  it('constructs the correct Telegram API URL with the config-resolved token', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, description: 'Webhook was set' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      });
    globalThis.fetch = fetchMock;

    const registerWebhook = loadRegisterWebhook();
    const req = mockReq(TEST_HOST);
    const res = mockRes();

    await registerWebhook(req, res);

    const setWebhookUrl = fetchMock.mock.calls[0][0];
    expect(setWebhookUrl).toBe(
      `${TELEGRAM_API_URL}/bot${TEST_TOKEN}/setWebhook?url=${encodeURIComponent(EXPECTED_WEBHOOK_URL)}`,
    );
    // Confirm the token is NOT a hardcoded value
    expect(setWebhookUrl).not.toContain('8780361867');
  });

  it('derives webhook URL from the request host header', async () => {
    const customHost = 'custom-host.example.com';
    const expectedUrl = `https://${customHost}/webhook`;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, description: 'Webhook was set' }),
    });

    const registerWebhook = loadRegisterWebhook();
    const req = mockReq(customHost);
    const res = mockRes();

    await registerWebhook(req, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      description: 'Webhook was set',
      webhookUrl: expectedUrl,
    });
  });

  it('returns success=false when Telegram API reports an error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ ok: false, description: 'Bad Request: invalid token' }),
    });

    const registerWebhook = loadRegisterWebhook();
    const req = mockReq(TEST_HOST);
    const res = mockRes();

    await registerWebhook(req, res);

    expect(res.json).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      description: 'Bad Request: invalid token',
      webhookUrl: EXPECTED_WEBHOOK_URL,
    });
  });

  it('returns 500 when fetch network error occurs', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

    const registerWebhook = loadRegisterWebhook();
    const req = mockReq(TEST_HOST);
    const res = mockRes();

    await registerWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Network failure' });
  });

  it('properly encodes special characters in the webhook URL', async () => {
    const specialHost = 'project with spaces.cloudfunctions.net';
    const expectedWebhookUrl = `https://${specialHost}/webhook`;

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, description: 'Webhook was set' }),
    });
    globalThis.fetch = fetchMock;

    const registerWebhook = loadRegisterWebhook();
    const req = mockReq(specialHost);
    const res = mockRes();

    await registerWebhook(req, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      description: 'Webhook was set',
      webhookUrl: expectedWebhookUrl,
    });

    // Verify the URL in the fetch call is properly percent-encoded
    const calledUrl = fetchMock.mock.calls[0][0];
    expect(calledUrl).toContain(encodeURIComponent(expectedWebhookUrl));
    expect(calledUrl).not.toContain(' '); // no raw spaces
  });

  it('invokes registerWebhook when the cloud function handler receives GET', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, description: 'Webhook was set' }),
    });

    const mod = req('../../index.js');
    const reqObj = mockReq(TEST_HOST);
    const res = mockRes();

    // The webhook export is the raw handler (onRequest mock returns handler)
    await mod.webhook(reqObj, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      description: 'Webhook was set',
      webhookUrl: EXPECTED_WEBHOOK_URL,
    });
  });

  it('calls deleteMyCommands after successful setWebhook', async () => {
    const fetchMock = vi.fn();
    // First call: setWebhook
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, description: 'Webhook was set' }),
    });
    // Second call: deleteMyCommands
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true }),
    });
    globalThis.fetch = fetchMock;

    const registerWebhook = loadRegisterWebhook();
    const req = mockReq(TEST_HOST);
    const res = mockRes();

    await registerWebhook(req, res);

    expect(fetchMock).toHaveBeenCalledTimes(2);

    // First call: setWebhook
    expect(fetchMock.mock.calls[0][0]).toContain('/setWebhook');

    // Second call: deleteMyCommands
    const [cmdUrl] = fetchMock.mock.calls[1];
    expect(cmdUrl).toBe(`${TELEGRAM_API_URL}/bot${TEST_TOKEN}/deleteMyCommands`);
  });

  it('does not call deleteMyCommands when setWebhook fails', async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ ok: false, description: 'Bad Request' }),
    });
    globalThis.fetch = fetchMock;

    const registerWebhook = loadRegisterWebhook();
    const req = mockReq(TEST_HOST);
    const res = mockRes();

    await registerWebhook(req, res);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/setWebhook');
  });

  it('returns success even when deleteMyCommands fails (non-blocking)', async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, description: 'Webhook was set' }),
    });
    // deleteMyCommands fails
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetchMock.mockRejectedValueOnce(new Error('deleteMyCommands failed'));
    globalThis.fetch = fetchMock;

    const registerWebhook = loadRegisterWebhook();
    const req = mockReq(TEST_HOST);
    const res = mockRes();

    await registerWebhook(req, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      description: 'Webhook was set',
      webhookUrl: EXPECTED_WEBHOOK_URL,
    });
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[webhook] deleteMyCommands failed:',
      expect.stringContaining('deleteMyCommands failed'),
    );
    consoleWarnSpy.mockRestore();
  });
});