import { queryOptions, QueryClient } from '@tanstack/react-query'

import { api, ApiError } from './api'
import type { CostCenter, Department, Me, Position, Unit } from './types'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Erros de permissão ou validação não melhoram tentando de novo.
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
})

export const meQuery = queryOptions({ queryKey: ['me'], queryFn: () => api<Me>('/me'), staleTime: 5 * 60_000 })

export const orgQueries = {
  departments: queryOptions({ queryKey: ['departments'], queryFn: () => api<Department[]>('/departments') }),
  units: queryOptions({ queryKey: ['units'], queryFn: () => api<Unit[]>('/units') }),
  costCenters: queryOptions({ queryKey: ['cost-centers'], queryFn: () => api<CostCenter[]>('/cost-centers') }),
  positions: queryOptions({ queryKey: ['positions'], queryFn: () => api<Position[]>('/positions') }),
}
