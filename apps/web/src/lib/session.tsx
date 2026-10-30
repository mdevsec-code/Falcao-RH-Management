import { useSuspenseQuery } from '@tanstack/react-query'

import { can, type Permission } from '@falcao-rh/contracts'

import { meQuery } from './queries'

/** Usuário da sessão. As rotas autenticadas garantem que ele já foi carregado. */
export const useMe = () => useSuspenseQuery(meQuery).data

export const useCan = (permission: Permission) => can(useMe().role, permission)
