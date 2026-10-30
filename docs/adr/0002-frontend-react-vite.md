# ADR-0002: React + Vite (SPA) em vez de Next.js

**Situação:** aceita, 29/10/2026

**Contexto.** Todo o produto está atrás de login; não há páginas públicas indexáveis. Pedimos separação clara entre interface e regras de negócio.

**Decisão.** React 19 + Vite, TanStack Router (filtros em parâmetros de URL tipados), TanStack Query, React Hook Form + Zod, Tailwind CSS 4 + Radix. Rotas internas carregadas sob demanda.

**Alternativas.** Next.js: ótimo para SSR e SEO, que aqui não agregam; exige servidor Node para a interface e convida a pôr lógica de negócio em server actions. Vue/Nuxt: bons, mas com menor oferta de profissionais e de componentes corporativos acessíveis.

**Consequências.** A interface é um conjunto de arquivos estáticos servidos pelo proxy, na mesma origem da API. Bundle inicial: 127 KB comprimidos.
