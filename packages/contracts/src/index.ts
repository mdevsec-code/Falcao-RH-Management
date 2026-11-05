import { z } from 'zod'

// Campos sem mensagem própria nunca aparecem em inglês para o usuário.
z.config(z.locales.pt())

export * from './cpf'
export * from './permissions'
export * from './schemas'
export * from './phase5'
export * from './recruitment'
