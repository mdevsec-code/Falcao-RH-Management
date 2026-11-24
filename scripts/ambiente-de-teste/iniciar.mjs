// Abre o ambiente de teste: servidor de teste (porta 3333) + site (porta 5173),
// e o navegador quando o site estiver pronto. Feche com Ctrl+C.
// Uso, na pasta do projeto: npm run teste
import { exec, spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const URL = 'http://localhost:5173'

// `args` null = comando de shell (o npm no Windows é um .cmd e só roda assim).
const run = (name, command, args, cwd) => {
  const child = args ? spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }) : spawn(command, { cwd, shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const log = data => process.stdout.write(`[${name}] ${data}`)
  child.stdout.on('data', log)
  child.stderr.on('data', log)
  child.on('exit', code => {
    console.log(`[${name}] parou (código ${code}). Fechando o ambiente.`)
    process.exit(code ?? 1)
  })
  return child
}

const api = run('servidor', process.execPath, [join(here, 'servidor-de-teste.mjs')], root)
const web = run('site', 'npm run dev -w apps/web', null, root)

// Espera o site responder e abre o navegador (no Windows, macOS ou Linux).
const open = { win32: 'start ""', darwin: 'open', linux: 'xdg-open' }[process.platform] ?? 'xdg-open'
const wait = async () => {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(URL)).ok) {
        console.log(`\nAmbiente de teste pronto: ${URL}  (a primeira abertura pode levar 1 minuto)\nPara fechar: Ctrl+C nesta janela.\n`)
        exec(`${open} ${URL}`)
        return
      }
    } catch {
      /* ainda subindo */
    }
    await new Promise(r => setTimeout(r, 2000))
  }
  console.log(`O site não respondeu em 4 minutos. Veja as mensagens acima.`)
}
void wait()

const stop = () => {
  api.kill()
  web.kill()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
