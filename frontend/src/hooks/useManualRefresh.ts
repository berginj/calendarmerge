import { useMutation, useQueryClient } from '@tanstack/react-query';
import { triggerManualRefresh } from '../api/feedsApi';

export function useManualRefresh() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      return triggerManualRefresh();
    },
    onSuccess: () => {
      // Invalidate service status to trigger refresh
      queryClient.invalidateQueries({ queryKey: ['serviceStatus'] });
    },
  });

  return {
    refresh: mutation.mutateAsync,
    isRefreshing: mutation.isPending,
    result: mutation.data,
    error: mutation.error,
  };
}
