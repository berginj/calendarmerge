import { useMutation, useQueryClient } from '@tanstack/react-query';
import { loadSavedFunctionsKey, triggerManualRefresh } from '../api/feedsApi';

export function useManualRefresh() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const key = loadSavedFunctionsKey();
      if (!key) {
        throw new Error('Function key required for manual refresh');
      }

      return triggerManualRefresh();
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
