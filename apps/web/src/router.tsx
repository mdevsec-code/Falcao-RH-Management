import { createRootRoute, createRoute, createRouter, lazyRouteComponent, Outlet, redirect } from '@tanstack/react-router'
import { z } from 'zod'

import { can, EMPLOYEE_STATUSES, type Permission } from '@falcao-rh/contracts'

import { AppShell } from './components/app-shell'
import { ErrorState, Skeleton } from './components/ui/layout'
import { ApiError } from './lib/api'
import { meQuery, queryClient } from './lib/queries'
import { LoginPage } from './pages/login'
import { SetPasswordPage } from './pages/set-password'

// Telas internas carregam sob demanda: o login não baixa gráficos nem formulários.
const rootRoute = createRootRoute({ component: Outlet })

const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: '/entrar', component: LoginPage })

export const setPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/definir-senha',
  validateSearch: z.object({ token: z.string().optional(), error: z.string().optional() }),
  component: SetPasswordPage,
})

/** Área autenticada: sem sessão, vai para o login. */
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  beforeLoad: async () => {
    try {
      await queryClient.ensureQueryData(meQuery)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) throw redirect({ to: '/entrar' })
      throw error
    }
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
  errorComponent: ({ error }) => (
    <div className="mx-auto mt-24 max-w-lg px-4">
      <ErrorState error={error} />
    </div>
  ),
})

const guard = (permission: Permission) => async () => {
  const me = await queryClient.ensureQueryData(meQuery)
  if (!can(me.role, permission)) throw redirect({ to: '/' })
}

const indexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  beforeLoad: async () => {
    const me = await queryClient.ensureQueryData(meQuery)
    throw redirect({ to: can(me.role, 'dashboard.view') ? '/painel' : '/meu-cadastro' })
  },
})

const dashboardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/painel',
  beforeLoad: guard('dashboard.view'),
  component: lazyRouteComponent(() => import('./pages/dashboard'), 'DashboardPage'),
})

export const employeesSearch = z.object({
  q: z.string().optional(),
  status: z.enum(EMPLOYEE_STATUSES).optional(),
  departmentId: z.string().optional(),
  page: z.number().int().min(1).optional(),
})

export const employeesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/colaboradores',
  validateSearch: employeesSearch,
  beforeLoad: guard('employees.read'),
  component: lazyRouteComponent(() => import('./pages/employees'), 'EmployeesPage'),
})

export const employeeDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/colaboradores/$id',
  beforeLoad: guard('employees.read'),
  component: lazyRouteComponent(() => import('./pages/employee-detail'), 'EmployeeDetailPage'),
})

const structureRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/estrutura',
  beforeLoad: guard('org.read'),
  component: lazyRouteComponent(() => import('./pages/structure'), 'StructurePage'),
})

const portalRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/meu-cadastro',
  beforeLoad: guard('self.read'),
  component: lazyRouteComponent(() => import('./pages/portal'), 'PortalPage'),
})

const accountRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/minha-conta',
  component: lazyRouteComponent(() => import('./pages/account'), 'AccountPage'),
})

const requestsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/solicitacoes',
  validateSearch: z.object({ id: z.string().optional(), tab: z.enum(['fila', 'todas', 'calendario']).optional() }),
  beforeLoad: guard('requests.read'),
  component: lazyRouteComponent(() => import('./pages/requests'), 'RequestsPage'),
})

const myRequestsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/minhas-solicitacoes',
  beforeLoad: guard('self.request'),
  component: lazyRouteComponent(() => import('./pages/my-requests'), 'MyRequestsPage'),
})

const documentsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/documentos',
  validateSearch: z.object({ id: z.string().optional(), expiring: z.coerce.number().optional() }),
  beforeLoad: guard('documents.read'),
  component: lazyRouteComponent(() => import('./pages/documents'), 'DocumentsPage'),
})

const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/configuracoes',
  beforeLoad: guard('settings.manage'),
  component: lazyRouteComponent(() => import('./pages/settings'), 'SettingsPage'),
})

const accessRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/acessos',
  beforeLoad: guard('users.manage'),
  component: lazyRouteComponent(() => import('./pages/access'), 'AccessPage'),
})

const routeTree = rootRoute.addChildren([
  loginRoute,
  setPasswordRoute,
  appRoute.addChildren([
    indexRoute,
    dashboardRoute,
    employeesRoute,
    employeeDetailRoute,
    structureRoute,
    portalRoute,
    accessRoute,
    accountRoute,
    requestsRoute,
    myRequestsRoute,
    documentsRoute,
    settingsRoute,
  ]),
])

/** Enquanto a tela é baixada: a moldura da página, nunca um vazio. */
function PagePending() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Carregando">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-36" />
      <Skeleton className="h-64" />
    </div>
  )
}

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultPendingComponent: PagePending,
  defaultPendingMs: 150,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
