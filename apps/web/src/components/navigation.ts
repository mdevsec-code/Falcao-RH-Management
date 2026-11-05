import {
  BriefcaseBusiness,
  Contact,
  Building2,
  CalendarCheck,
  FileText,
  Globe,
  IdCard,
  LayoutDashboard,
  Palmtree,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react'

import type { Permission } from '@falcao-rh/contracts'

export type NavItem = {
  to: string
  label: string
  description: string
  icon: LucideIcon
  permission: Permission
  section: 'Gestão' | 'Pessoal' | 'Administração'
  needsEmployee?: boolean
}

/** Mapa de navegação único: menu lateral e paleta de comandos leem daqui. */
export const NAV: NavItem[] = [
  { to: '/painel', label: 'Painel', description: 'Indicadores de pessoas', icon: LayoutDashboard, permission: 'dashboard.view', section: 'Gestão' },
  { to: '/colaboradores', label: 'Colaboradores', description: 'Cadastro, fichas e histórico', icon: Users, permission: 'employees.read', section: 'Gestão' },
  { to: '/solicitacoes', label: 'Solicitações', description: 'Aprovações, férias e calendário', icon: CalendarCheck, permission: 'requests.read', section: 'Gestão' },
  { to: '/documentos', label: 'Documentos', description: 'Arquivos, validade e versões', icon: FileText, permission: 'documents.read', section: 'Gestão' },
  { to: '/recrutamento', label: 'Recrutamento', description: 'Vagas, candidatos e publicação', icon: BriefcaseBusiness, permission: 'recruitment.read', section: 'Gestão' },
  { to: '/talentos', label: 'Banco de talentos', description: 'Fichas, etiquetas e convites', icon: Contact, permission: 'talent_pool.read', section: 'Gestão' },
  { to: '/recrutamento/pagina-de-vagas', label: 'Página de vagas', description: 'Editar a página pública de recrutamento', icon: Globe, permission: 'recruitment.manage', section: 'Gestão' },
  { to: '/estrutura', label: 'Estrutura', description: 'Organograma, departamentos e cargos', icon: Building2, permission: 'org.read', section: 'Gestão' },
  { to: '/meu-cadastro', label: 'Meu cadastro', description: 'Seus dados e documentos', icon: IdCard, permission: 'self.read', section: 'Pessoal', needsEmployee: true },
  { to: '/minhas-solicitacoes', label: 'Férias e ausências', description: 'Seu saldo e seus pedidos', icon: Palmtree, permission: 'self.request', section: 'Pessoal', needsEmployee: true },
  { to: '/minha-conta', label: 'Minha conta', description: 'Senha, verificação em duas etapas, aparelhos', icon: UserCog, permission: 'self.read', section: 'Pessoal' },
  { to: '/acessos', label: 'Usuários e acessos', description: 'Convites e perfis', icon: ShieldCheck, permission: 'users.manage', section: 'Administração' },
  { to: '/configuracoes', label: 'Configurações', description: 'Organização, segurança e aprovações', icon: Settings, permission: 'settings.manage', section: 'Administração' },
]

/** Item do menu da rota atual: o mais específico (`/recrutamento/pagina-de-vagas` vence `/recrutamento`). */
export const activeNavItem = (path: string) =>
  NAV.filter(item => path === item.to || path.startsWith(`${item.to}/`)).sort((a, b) => b.to.length - a.to.length)[0]
