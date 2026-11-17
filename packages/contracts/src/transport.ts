import { z } from 'zod'

import { uuid } from './schemas'

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform(value => (value === '' ? null : value))
    .nullable()
    .optional()

// ---------- mobilidade e transporte ----------

export const TRANSPORT_MODES = ['mobility', 'chartered', 'own', 'none'] as const
export type TransportMode = (typeof TRANSPORT_MODES)[number]
export const TRANSPORT_MODE_LABELS: Record<TransportMode, string> = {
  mobility: 'Mobilidade (cartão/app)',
  chartered: 'Fretado',
  own: 'Condução própria',
  none: 'Sem transporte',
}

export const transportRouteInput = z.object({
  name: z.string().trim().min(2).max(80),
  vehicle: optionalText(60),
  capacity: z.coerce.number().int().min(1).max(200).nullable().optional(),
  driver: optionalText(120),
  shift: optionalText(60),
})
export type TransportRouteInput = z.infer<typeof transportRouteInput>

export const employeeTransportInput = z
  .object({
    mode: z.enum(TRANSPORT_MODES),
    provider: optionalText(80),
    routeId: uuid.nullable().optional(),
    pickupPoint: optionalText(160),
    pickupDistrict: optionalText(80),
    pickupCity: optionalText(80),
    /** Custo mensal em centavos (cartão de mobilidade, auxílio etc.). */
    monthlyCostCents: z.coerce.number().int().min(0).max(10_000_000).nullable().optional(),
    notes: optionalText(500),
  })
  .refine(value => value.mode !== 'chartered' || !!value.routeId, {
    message: 'Informe a rota do fretado.',
    path: ['routeId'],
  })
export type EmployeeTransportInput = z.infer<typeof employeeTransportInput>
