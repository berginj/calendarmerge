import { useMutation, useQueryClient } from '@tanstack/react-query';
import { loadSavedFunctionsKey } from '../api/feedsApi';

export function useManualRefresh() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const key = loadSavedFunctionsKey();
      if (!key) {
        throw new Error('Function key required for manual refresh');
      }

      const apiBase = new URL('/api', window.location.origin);
      const refreshUrl = new URL('refresh', apiBase);
      refreshUrl.searchParams.set('code', key);

      const response = await fetch(refreshUrl.toString(), {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`Refresh failed: ${response.statusText}`);
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate service status to trigger refresh
      queryClient.invalidateQueries({ queryKey: ['serviceStatus'] });
    },
  });

  return {
    refresh: mutation.mutate,
    isRefreshing: mutation.isPending,
    result: mutation.data,
    error: mutation.error,
  };
}
