import nodemailer, { type Transporter } from 'nodemailer'

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

/** Produção: SMTP do provedor transacional (Amazon SES, ou outro). */
export class SmtpMailer implements Mailer {
  private readonly transport: Transporter

  constructor(url: string, private readonly from: string) {
    this.transport = nodemailer.createTransport(url)
  }

  async send(mail: Mail) {
    await this.transport.sendMail({ from: this.from, to: mail.to, subject: mail.subject, text: mail.text })
  }
}

export const createMailer = (env: Env, log: (message: string) => void): Mailer =>
  env.SMTP_URL ? new SmtpMailer(env.SMTP_URL, env.MAIL_FROM) : new MemoryMailer(log)
