import { connect } from 'node:net'

import type { Env } from '../env'

export type ScanResult = 'clean' | 'infected'

/** Antivírus de arquivos enviados. Lança se não conseguir um veredito. */
export interface Scanner {
  scan(body: Buffer): Promise<ScanResult>
}

const CHUNK = 64 * 1024

/** Cliente mínimo do protocolo INSTREAM do clamd (só `node:net`). */
export class ClamdScanner implements Scanner {
  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly timeoutMs = 15_000,
  ) {}

  scan(body: Buffer): Promise<ScanResult> {
    return new Promise<ScanResult>((resolve, reject) => {
      const socket = connect({ host: this.host, port: this.port })
      let reply = ''
      let settled = false
      const finish = (error: Error | null, result?: ScanResult) => {
        if (settled) return
        settled = true
        socket.destroy()
        if (error) reject(error)
        else resolve(result!)
      }

      socket.setTimeout(this.timeoutMs, () => finish(new Error('Antivírus: tempo esgotado.')))
      socket.on('error', error => finish(error))
      socket.on('data', chunk => (reply += chunk.toString('utf8')))
      socket.on('close', () => {
        const text = reply.replace(/\0/g, '').trim()
        if (/^stream: OK$/.test(text)) finish(null, 'clean')
        else if (/FOUND$/.test(text)) finish(null, 'infected')
        else finish(new Error(`Antivírus: resposta inesperada "${text}".`))
      })

      socket.on('connect', () => {
        socket.write('zINSTREAM\0')
        for (let offset = 0; offset < body.length; offset += CHUNK) {
          const part = body.subarray(offset, offset + CHUNK)
          const size = Buffer.alloc(4)
          size.writeUInt32BE(part.length)
          socket.write(size)
          socket.write(part)
        }
        socket.write(Buffer.alloc(4))
      })
    })
  }
}

const EICAR = 'X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'

/** Para testes: detecta a assinatura EICAR; `failing` simula indisponibilidade. */
export class MemoryScanner implements Scanner {
  failing = false

  async scan(body: Buffer): Promise<ScanResult> {
    if (this.failing) throw new Error('Antivírus indisponível.')
    return body.includes(EICAR) ? 'infected' : 'clean'
  }
}

export const createScanner = (env: Env): Scanner =>
  env.NODE_ENV === 'test' ? new MemoryScanner() : new ClamdScanner(env.CLAMAV_HOST, env.CLAMAV_PORT)
