import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearFunctionsKey, listFeeds, loadSavedFunctionsKey, saveFunctionsKey, triggerManualRefresh } from './feedsApi';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    statusText: init.statusText,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
}

describe('manual refresh API client', () => {
  afterEach(() => {
    clearFunctionsKey();
    vi.unstubAllGlobals();
  });

  it('unwraps successful manual refresh envelopes and sends the function key header', async () => {
    saveFunctionsKey('test-key');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      requestId: 'request-1',
      status: 'success',
      data: {
        refreshId: 'refresh-1',
        success: true,
        state: 'success',
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(triggerManualRefresh()).resolves.toEqual({
      refreshId: 'refresh-1',
      success: true,
      state: 'success',
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/refresh', expect.objectContaining({
      method: 'POST',
      headers: expect.any(Headers),
    }));
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('x-functions-key')).toBe('test-key');
  });

  it('surfaces rate-limit details from manual refresh errors', async () => {
    saveFunctionsKey('test-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      requestId: 'request-1',
      status: 'error',
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Please wait before refreshing again',
        details: 'Manual refresh is limited to once every 30 seconds. Retry in 18 seconds.',
      },
    }, { status: 429, statusText: 'Too Many Requests' })));

    await expect(triggerManualRefresh()).rejects.toThrow('Manual refresh is limited to once every 30 seconds');
  });

  it('surfaces invalid function key errors for manual refresh', async () => {
    saveFunctionsKey('bad-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      requestId: 'request-1',
      status: 'error',
      error: {
        code: 'UNAUTHORIZED',
        message: 'Unauthorized',
      },
    }, { status: 403, statusText: 'Forbidden' })));

    await expect(triggerManualRefresh()).rejects.toThrow('Admin function key is missing or invalid');
  });

  it('migrates legacy localStorage function keys into sessionStorage', async () => {
    window.localStorage.setItem('calendarmerge_functions_key', 'legacy-key');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      requestId: 'request-1',
      status: 'success',
      data: {
        feeds: [],
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    expect(loadSavedFunctionsKey()).toBe('legacy-key');
    expect(window.localStorage.getItem('calendarmerge_functions_key')).toBeNull();
    expect(window.sessionStorage.getItem('calendarmerge_functions_key')).toBe('legacy-key');

    await listFeeds();

    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('x-functions-key')).toBe('legacy-key');
  });
});
