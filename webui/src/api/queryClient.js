// Cisum web player v0.11.5 - Shared data cache (TanStack Query).
// Kept in its own module so code outside React components (preloading, card play buttons)
// reads and fills the same cache as the pages.
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      // One retry, except for "not found" (Subsonic code 70): the item was deleted, retrying is useless
      retry: (failures, error) => error?.code !== 70 && failures < 1,
    },
  },
})
