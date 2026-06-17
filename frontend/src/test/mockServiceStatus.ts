import { vi } from 'vitest';
import type { ServiceStatus } from '../hooks/useServiceStatus';

export const mockUseServiceStatus = vi.fn();

vi.mock('../hooks/useServiceStatus', async () => {
  const actual = await vi.importActual<typeof import('../hooks/useServiceStatus')>('../hooks/useServiceStatus');

  return {
    ...actual,
    useServiceStatus: mockUseServiceStatus,
  };
});

export function mockStatus(status: ServiceStatus, refetchResult?: ServiceStatus): void {
  mockUseServiceStatus.mockReturnValue({
    data: status,
    isLoading: false,
    error: null,
    refetch: vi.fn().mockResolvedValue({ data: refetchResult ?? status }),
  });
}

export function mockLoadingStatus(): void {
  mockUseServiceStatus.mockReturnValue({
    data: undefined,
    isLoading: true,
    error: null,
  });
}

export function resetStatusMock(): void {
  mockUseServiceStatus.mockReset();
}

