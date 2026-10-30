import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3333),
  HOST: z.string().default('127.0.0.1'),
  DATABASE_URL: z.string().min(1),
  /** Conexões simultâneas por instância da API. */
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  /** Origem pública do frontend: CORS, cookies e links de e-mail. */
  WEB_ORIGIN: z.url().default('http://localhost:5173'),
  /** URL pública da API (Better Auth monta as rotas /api/auth a partir dela). */
  API_URL: z.url().default('http://localhost:3333'),
  /** Segredo de assinatura de sessões: no mínimo 32 caracteres aleatórios. */
  AUTH_SECRET: z.string().min(32),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  /** SMTP do provedor transacional (ex.: Amazon SES). Vazio: e-mails só no log. */
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('Falcão RH <nao-responda@localhost>'),

  /** Arquivos privados: `local` (disco, desenvolvimento) ou `s3` (produção). */
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_DIR: z.string().default('./storage'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default('sa-east-1'),
  /** Só para provedores compatíveis com S3 (MinIO, R2). Vazio na AWS. */
  S3_ENDPOINT: z.string().optional(),
})
  .refine(env => env.NODE_ENV !== 'production' || Boolean(env.SMTP_URL), {
    message: 'SMTP_URL é obrigatório em produção: sem ele ninguém recebe convites.',
    path: ['SMTP_URL'],
  })
  .refine(env => env.STORAGE_DRIVER !== 's3' || Boolean(env.S3_BUCKET), {
    message: 'S3_BUCKET é obrigatório com STORAGE_DRIVER=s3.',
    path: ['S3_BUCKET'],
  })

export type Env = z.infer<typeof schema>

export const loadEnv = (source: NodeJS.ProcessEnv = process.env): Env => {
  const parsed = schema.safeParse(source)
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Variáveis de ambiente inválidas:\n${issues}\nVeja .env.example.`)
  }
  return parsed.data
}
