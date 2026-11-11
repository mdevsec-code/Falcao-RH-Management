import nodemailer, { type Transporter } from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport'

import type { Env } from '../env'

export type Mail = { to: string; subject: string; text: string }

export interface Mailer {
  send(mail: Mail): Promise<void>
}

/**
 * Desenvolvimento e testes: não envia nada, registra no log e guarda as
 * mensagens em memória.
 */
export class MemoryMailer implements Mailer {
  readonly sent: Mail[] = []

  constructor(private readonly log?: (message: string) => void) {}

  async send(mail: Mail) {
    this.sent.push(mail)
    this.log?.(`[e-mail para ${mail.to}] ${mail.subject}\n${mail.text}`)
  }
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

/**
 * Opções de conexão a partir de `SMTP_URL`, sempre com criptografia:
 * `smtps://` usa TLS direto (porta 465); `smtp://` exige STARTTLS
 * (`requireTLS`), e o envio falha se o servidor não oferecer. Só um servidor
 * na própria máquina (ex.: Mailpit em desenvolvimento) dispensa TLS.
 */
export const smtpOptions = (url: string): SMTPTransport.Options => {
  const parsed = new URL(url)
  if (parsed.protocol !== 'smtp:' && parsed.protocol !== 'smtps:') throw new Error('SMTP_URL deve começar com smtps:// ou smtp://.')
  const secure = parsed.protocol === 'smtps:'
  const local = LOCAL_HOSTS.has(parsed.hostname)
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : secure ? 465 : 587,
    secure,
    requireTLS: !secure && !local,
    ignoreTLS: !secure && local,
    auth: parsed.username ? { user: decodeURIComponent(parsed.username), pass: decodeURIComponent(parsed.password) } : undefined,
    tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
  }
}

/** Produção: SMTP do provedor transacional (Amazon SES, ou outro). */
export class SmtpMailer implements Mailer {
  private readonly transport: Transporter

  constructor(url: string, private readonly from: string) {
    this.transport = nodemailer.createTransport(smtpOptions(url))
  }

  async send(mail: Mail) {
    await this.transport.sendMail({ from: this.from, to: mail.to, subject: mail.subject, text: mail.text })
  }
}

export const createMailer = (env: Env, log: (message: string) => void): Mailer =>
  env.SMTP_URL ? new SmtpMailer(env.SMTP_URL, env.MAIL_FROM) : new MemoryMailer(log)
