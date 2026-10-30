import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { twoFactor } from 'better-auth/plugins'

import type { Database } from '../db/client'
import * as schema from '../db/schema'
import type { Env } from '../env'
import type { Mailer } from '../lib/mailer'

export type AuthDeps = { db: Database; env: Env; mailer: Mailer }

/**
 * Identidade (ADR-0005): e-mail e senha, MFA por TOTP e sessões em banco.
 * Não há cadastro aberto: contas nascem de convites de um administrador,
 * que recebem um link para definir a senha.
 */
export const createAuth = ({ db, env, mailer }: AuthDeps) =>
  betterAuth({
    appName: 'Falcão RH',
    baseURL: env.API_URL,
    basePath: '/api/auth',
    secret: env.AUTH_SECRET,
    trustedOrigins: [env.WEB_ORIGIN],
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 10,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 60 * 24,
      sendResetPassword: async ({ user, url }) => {
        await mailer.send({
          to: user.email,
          subject: 'Falcão RH — defina sua senha',
          text: `Olá, ${user.name}.\n\nUse o link abaixo para definir sua senha de acesso ao Falcão RH. Ele vale por 24 horas.\n\n${url}\n\nSe você não esperava este e-mail, ignore-o.`,
        })
      },
    },
    session: {
      expiresIn: 60 * 60 * 12,
      updateAge: 60 * 60,
    },
    rateLimit: {
      enabled: env.NODE_ENV !== 'test',
      window: 60,
      max: 30,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/request-password-reset': { window: 300, max: 3 },
        '/two-factor/verify-totp': { window: 60, max: 5 },
      },
    },
    advanced: {
      useSecureCookies: env.NODE_ENV === 'production',
      cookiePrefix: 'falcao-rh',
      ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
    },
    telemetry: { enabled: false },
    plugins: [twoFactor({ issuer: 'Falcão RH' })],
  })

export type Auth = ReturnType<typeof createAuth>
