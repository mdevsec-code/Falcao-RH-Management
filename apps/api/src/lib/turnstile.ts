/**
 * Desafio anti-robô do formulário público (Cloudflare Turnstile). Só é
 * exigido quando `TURNSTILE_SECRET` está configurado; sem ele, valem o
 * campo-armadilha e o tempo mínimo de preenchimento.
 */
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export const verifyTurnstile = async (secret: string, token: string | undefined, ip: string): Promise<boolean> => {
  if (!token) return false
  try {
    const response = await fetch(VERIFY_URL, {
      method: 'POST',
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(5000),
    })
    const data = (await response.json()) as { success?: boolean }
    return data.success === true
  } catch {
    // Fora do ar ou lento: na dúvida, não aceita.
    return false
  }
}
