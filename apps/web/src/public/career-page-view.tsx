import {
  Bus,
  ChevronDown,
  Clock,
  Globe,
  GraduationCap,
  HardHat,
  HeartPulse,
  Home,
  Camera,
  BriefcaseBusiness,
  Share2,
  Mail,
  MessageCircle,
  ShieldCheck,
  Smile,
  TrendingUp,
  Users,
  Utensils,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'

import type { CareerPageContent } from './public-api'

/** Ícones permitidos nos cartões de benefícios (lista fixa do editor). */
export const BENEFIT_ICON_MAP: Record<string, LucideIcon> = {
  HeartPulse,
  Bus,
  Utensils,
  GraduationCap,
  ShieldCheck,
  HardHat,
  Wallet,
  Smile,
  Clock,
  TrendingUp,
  Users,
  Home,
}

/** Texto simples em parágrafos (quebra dupla) — nunca HTML. */
export function Paragraphs({ text, className }: { text: string; className?: string }) {
  return (
    <>
      {text
        .split(/\n{2,}/)
        .map(p => p.trim())
        .filter(Boolean)
        .map((paragraph, i) => (
          <p key={i} className={className}>
            {paragraph}
          </p>
        ))}
    </>
  )
}

function Section({ id, eyebrow, title, children }: { id?: string; eyebrow?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} data-reveal className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
      {eyebrow && (
        <p className="eyebrow mb-3 flex items-center gap-2">
          <span className="h-px w-5 bg-brand" aria-hidden />
          {eyebrow}
        </p>
      )}
      <h2 className="font-display text-[clamp(34px,4vw,52px)] leading-[0.95] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
      <div className="mt-8">{children}</div>
    </section>
  )
}

/**
 * Seções institucionais da página de vagas (abaixo da capa). Usado na página
 * pública e na pré-visualização do editor. Seções desligadas não aparecem.
 */
export function CareerSections({ content, stats }: { content: CareerPageContent; stats: { jobs: number; cities: number } }) {
  const { about, benefits, faq, links } = content
  const contacts = [
    links.instagram && { href: links.instagram, label: 'Instagram', icon: Camera },
    links.linkedin && { href: links.linkedin, label: 'LinkedIn', icon: BriefcaseBusiness },
    links.facebook && { href: links.facebook, label: 'Facebook', icon: Share2 },
    links.site && { href: links.site, label: 'Site', icon: Globe },
    links.whatsapp && { href: `https://wa.me/55${links.whatsapp.replace(/\D/g, '')}`, label: 'WhatsApp', icon: MessageCircle },
    links.email && { href: `mailto:${links.email}`, label: links.email, icon: Mail },
  ].filter(Boolean) as { href: string; label: string; icon: LucideIcon }[]

  return (
    <>
      {about.enabled && about.body.trim() && (
        <Section eyebrow="Quem somos" title={about.title}>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div className="flex max-w-2xl flex-col gap-4 text-[16.5px] leading-relaxed text-ink-soft">
              <Paragraphs text={about.body} />
            </div>
            <div className="night-glow grain relative overflow-hidden rounded-xl border border-night-line p-7 text-snow">
              <div className="blueprint pointer-events-none absolute inset-0 opacity-70" aria-hidden />
              <div className="relative grid grid-cols-2 gap-6">
                {[
                  [String(stats.jobs), stats.jobs === 1 ? 'vaga aberta' : 'vagas abertas'],
                  [String(stats.cities), stats.cities === 1 ? 'cidade' : 'cidades'],
                ].map(([value, label]) => (
                  <div key={label}>
                    <p className="num font-display text-[44px] leading-none font-semibold text-brand">{value}</p>
                    <p className="mt-1 text-[13px] text-fog">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>
      )}

      {benefits.enabled && benefits.items.length > 0 && (
        <div className="border-y border-line bg-paper/60">
          <Section eyebrow="Benefícios" title={benefits.title}>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {benefits.items.map(item => {
                const Icon = BENEFIT_ICON_MAP[item.icon] ?? Smile
                return (
                  <li key={item.title} className="surface group p-6 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift">
                    <span className="flex size-11 items-center justify-center rounded-[11px] bg-night text-brand transition-transform duration-500 group-hover:-rotate-6">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <p className="mt-5 font-semibold text-ink">{item.title}</p>
                    {item.text && <p className="mt-1 text-[14px] leading-relaxed text-steel">{item.text}</p>}
                  </li>
                )
              })}
            </ul>
          </Section>
        </div>
      )}

      {faq.enabled && faq.items.length > 0 && (
        <Section eyebrow="Dúvidas" title="Perguntas frequentes">
          <div className="surface divide-y divide-line">
            {faq.items.map(item => (
              <details key={item.question} className="group px-6 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-medium text-ink">
                  {item.question}
                  <ChevronDown className="size-5 shrink-0 text-steel transition-transform duration-300 group-open:rotate-180" aria-hidden />
                </summary>
                <div className="-mt-1 flex flex-col gap-3 pb-5 text-[15px] leading-relaxed text-steel">
                  <Paragraphs text={item.answer} />
                </div>
              </details>
            ))}
          </div>
        </Section>
      )}

      {contacts.length > 0 && (
        <section data-reveal className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <div className="surface flex flex-wrap items-center justify-between gap-5 p-6">
            <div>
              <p className="font-semibold text-ink">Fale com o RH da Falcão</p>
              <p className="text-[14px] text-steel">Acompanhe novidades e vagas nos nossos canais.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {contacts.map(link => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-paper px-4 text-[13.5px] font-medium text-ink-soft shadow-xs transition-colors hover:border-steel-soft hover:text-ink"
                >
                  <link.icon className="size-4" aria-hidden /> {link.label}
                </a>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  )
}
