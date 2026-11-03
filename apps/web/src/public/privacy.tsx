import { useMutation } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '../components/ui/button'
import { publicApi } from './public-api'
import { PublicFrame } from './public-frame'

/** Link do e-mail do candidato: renovar o consentimento ou apagar os dados. */
export function PrivacyPage() {
  const { token } = useParams({ strict: false }) as { token: string }
  const [confirming, setConfirming] = useState(false)
  const erase = useMutation({ mutationFn: () => publicApi.erase(token) })
  const renew = useMutation({ mutationFn: () => publicApi.renew(token) })
  const done = erase.isSuccess ? 'erased' : renew.isSuccess ? 'renewed' : null

  return (
    <PublicFrame>
      <div className="mx-auto max-w-xl px-4 py-16 sm:py-24">
        <div className="surface overflow-hidden">
          <div className="night-glow grain relative px-7 py-8 text-snow">
            <ShieldCheck className="size-8 text-brand" aria-hidden />
            <h1 className="mt-4 font-display text-[36px] leading-none font-semibold">Seus dados</h1>
            <p className="mt-2 text-[14.5px] text-fog">Você decide o que a Falcão guarda sobre você.</p>
          </div>
          <div className="flex flex-col gap-4 p-7">
            {done === 'erased' && <p className="text-[15px] text-ink-soft">Pronto. Se havia dados ligados a este link, eles foram apagados.</p>}
            {done === 'renewed' && <p className="text-[15px] text-ink-soft">Obrigado! Seu cadastro no banco de talentos foi renovado.</p>}
            {!done && (
              <>
                <p className="text-[15px] leading-relaxed text-ink-soft">
                  Você pode manter seu cadastro no banco de talentos por mais tempo, para ser lembrado em novas vagas, ou apagar todos os seus dados
                  e currículos agora.
                </p>
                <Button variant="primary" size="lg" loading={renew.isPending} onClick={() => renew.mutate()}>
                  <RefreshCw className="size-4" aria-hidden /> Continuar no banco de talentos
                </Button>
                {confirming ? (
                  <div className="flex flex-col gap-2 rounded-md border border-danger/25 bg-danger-soft p-4">
                    <p className="text-[14px] text-danger">Isso apaga seu cadastro, candidaturas e currículos. Não dá para desfazer.</p>
                    <div className="flex gap-2">
                      <Button onClick={() => setConfirming(false)}>Cancelar</Button>
                      <Button variant="danger" loading={erase.isPending} onClick={() => erase.mutate()}>
                        Apagar meus dados
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="ghost" onClick={() => setConfirming(true)} className="text-danger hover:bg-danger-soft hover:text-danger">
                    <Trash2 className="size-4" aria-hidden /> Apagar meus dados
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </PublicFrame>
  )
}
