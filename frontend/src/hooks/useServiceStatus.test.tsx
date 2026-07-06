import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

import { publicStatus } from '../test/statusFixtures';
import { useServiceStatus } from './useServiceStatus';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderWithClient(children: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>,
  );
}

function StatusProbe({ includeAdmin }: { includeAdmin: boolean }) {
  const { data, isLoading } = useServiceStatus(includeAdmin);

  if (isLoading) {
    return <div>Loading</div>;
  }

  return <div>{data?.adminInsightsAvailable ? 'admin diagnostics' : 'public status'}</div>;
}

describe('useServiceStatus', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not request protected admin status before admin sign-in', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('status.json')) {
        return Promise.resolve(jsonResponse(publicStatus()));
      }

      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithClient(<StatusProbe includeAdmin={false} />);

    expect(await screen.findByText('public status')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/status/internal'))).toBe(false);
  });

  it('overlays protected admin status when an admin session is known', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/status/internal')) {
        return Promise.resolve(jsonResponse({
          requestId: 'request-1',
          status: 'success',
          data: {
            status: publicStatus({
              adminInsightsAvailable: true,
              sourceStatuses: [],
            }),
          },
        }));
      }
      if (url.includes('status.json')) {
        return Promise.resolve(jsonResponse(publicStatus()));
      }

      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithClient(<StatusProbe includeAdmin />);

    expect(await screen.findByText('admin diagnostics')).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/status/internal'))).toBe(true);
    });
  });
});
