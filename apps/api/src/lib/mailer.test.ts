import { describe, expect, it } from 'vitest'

import { smtpOptions } from './mailer'

describe('conexão SMTP', () => {
  it('smtps:// usa TLS direto na 465', () => {
    const options = smtpOptions('smtps://usuario:s%40nha@email-smtp.us-east-1.amazonaws.com')
    expect(options).toMatchObject({ host: 'email-smtp.us-east-1.amazonaws.com', port: 465, secure: true, requireTLS: false })
    expect(options.auth).toEqual({ user: 'usuario', pass: 's@nha' })
    expect(options.tls).toMatchObject({ minVersion: 'TLSv1.2', rejectUnauthorized: true })
  })

  it('smtp:// exige STARTTLS (não envia em texto puro)', () => {
    expect(smtpOptions('smtp://u:p@email-smtp.sa-east-1.amazonaws.com:587')).toMatchObject({ port: 587, secure: false, requireTLS: true, ignoreTLS: false })
  })

  it('só o servidor local de desenvolvimento dispensa TLS', () => {
    expect(smtpOptions('smtp://localhost:1025')).toMatchObject({ requireTLS: false, ignoreTLS: true, auth: undefined })
  })

  it('recusa outros protocolos', () => {
    expect(() => smtpOptions('http://exemplo.com')).toThrow(/smtps:\/\//)
  })
})
