import { afterEach, describe, expect, it, vi } from 'vitest';

import { getAdminSession, listFeeds, loginAdminSession, logoutAdminSession, requestJson, triggerManualRefresh } from './feedsApi';

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

describe('admin session API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('includes browser cookies when calling API endpoints', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      requestId: 'request-1',
      status: 'success',
      data: {
        feeds: [],
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await listFeeds();

    expect(fetchMock).toHaveBeenCalledWith('/api/feeds', expect.objectContaining({
      credentials: 'include',
    }));
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('x-functions-key')).toBeNull();
  });

  it('starts an admin session with an access code', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      requestId: 'request-1',
      status: 'success',
      data: {
        authenticated: true,
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loginAdminSession('access-code')).resolves.toEqual({ authenticated: true });

    expect(fetchMock).toHaveBeenCalledWith('/api/session', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
    }));
  });

  it('logs out an admin session', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      requestId: 'request-1',
      status: 'success',
      data: {
        authenticated: false,
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await logoutAdminSession();

    expect(fetchMock).toHaveBeenCalledWith('/api/session', expect.objectContaining({
      method: 'DELETE',
      credentials: 'include',
    }));
  });

  it('surfaces session errors for protected refresh requests', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      requestId: 'request-1',
      status: 'error',
      error: {
        code: 'UNAUTHORIZED',
        message: 'Unauthorized',
      },
    }, { status: 401, statusText: 'Unauthorized' })));

    await expect(triggerManualRefresh()).rejects.toThrow('Admin session is missing or expired');
  });

  it('reads admin session state from the session endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      requestId: 'request-1',
      status: 'success',
      data: {
        authenticated: false,
        configured: true,
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getAdminSession()).resolves.toEqual({
      authenticated: false,
      configured: true,
    });
  });

  it('keeps requestJson on include credentials mode for arbitrary requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      requestId: 'request-1',
      status: 'success',
      data: { ok: true },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(requestJson<{ ok: boolean }>('/status')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/status', expect.objectContaining({
      credentials: 'include',
    }));
  });
});
