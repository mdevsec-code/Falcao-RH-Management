import { z } from 'zod'

import { addressSchema } from './schemas'

/** Validade do link de admissão digital enviado ao novo colaborador. */
export const ADMISSION_LINK_DAYS = 7

/** O que o novo colaborador confere e completa pelo link (o RH já cadastrou nome, CPF e contrato). */
export const admissionSelfData = z.object({
  socialName: z.string().trim().max(160).transform(v => (v === '' ? null : v)).nullable().optional(),
  birthDate: z.iso.date({ error: 'Informe a data de nascimento.' }),
  email: z.email('E-mail inválido.').nullable().optional().or(z.literal('').transform(() => null)),
  phone: z.string({ error: 'Informe o celular.' }).trim().min(8, 'Informe o celular com DDD.').max(30),
  address: addressSchema.refine(a => !!a.city && !!a.state, { message: 'Informe ao menos cidade e UF.' }),
})
export type AdmissionSelfData = z.infer<typeof admissionSelfData>

/** Título do documento enviado pelo link: um item da relação de documentos. */
export const admissionDocumentTitle = z.string().trim().min(2).max(120)
