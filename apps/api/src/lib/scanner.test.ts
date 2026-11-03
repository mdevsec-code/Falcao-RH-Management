import { createServer, type Server } from 'node:net'

import { afterEach, describe, expect, it } from 'vitest'

import { ClamdScanner, MemoryScanner } from './scanner'

const EICAR = 'X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'

describe('MemoryScanner', () => {
  it('libera PDF comum e barra EICAR', async () => {
    const s = new MemoryScanner()
    expect(await s.scan(Buffer.from('%PDF-1.7 curriculo'))).toBe('clean')
    expect(await s.scan(Buffer.from(`abc${EICAR}def`))).toBe('infected')
  })
  it('lança quando indisponível', async () => {
    const s = new MemoryScanner()
    s.failing = true
    await expect(s.scan(Buffer.from('x'))).rejects.toThrow()
  })
})

describe('ClamdScanner', () => {
  let server: Server | undefined
  afterEach(() => new Promise<void>(done => (server ? server.close(() => done()) : done())))

  const fake = async (onData: (received: Buffer, reply: (text: string) => void) => void) => {
    server = createServer(socket => {
      let received: Buffer = Buffer.alloc(0)
      socket.on('data', chunk => {
        received = Buffer.concat([received, chunk])
        if (received.subarray(-4).equals(Buffer.alloc(4))) onData(received, text => socket.end(text))
      })
      socket.on('error', () => {})
    })
    await new Promise<void>(r => server!.listen(0, '127.0.0.1', r))
    return (server.address() as { port: number }).port
  }

  it('responde clean e envia o protocolo INSTREAM', async () => {
    let seen: Buffer = Buffer.alloc(0)
    const port = await fake((received, reply) => {
      seen = received
      reply('stream: OK\0')
    })
    expect(await new ClamdScanner('127.0.0.1', port).scan(Buffer.from('hello'))).toBe('clean')
    const header = Buffer.from('zINSTREAM\0')
    expect(seen.subarray(0, header.length).equals(header)).toBe(true)
    expect(seen.readUInt32BE(header.length)).toBe(5)
    expect(seen.subarray(header.length + 4, header.length + 9).toString()).toBe('hello')
  })
  it('responde infected', async () => {
    const port = await fake((_r, reply) => reply('stream: Eicar-Signature FOUND\0'))
    expect(await new ClamdScanner('127.0.0.1', port).scan(Buffer.from('x'))).toBe('infected')
  })
  it('lança com resposta inesperada', async () => {
    const port = await fake((_r, reply) => reply('INSTREAM size limit exceeded. ERROR\0'))
    await expect(new ClamdScanner('127.0.0.1', port).scan(Buffer.from('x'))).rejects.toThrow()
  })
  it('rejeita quando o servidor não responde', async () => {
    const port = await fake(() => {})
    await expect(new ClamdScanner('127.0.0.1', port, 200).scan(Buffer.from('x'))).rejects.toThrow()
  })
})
