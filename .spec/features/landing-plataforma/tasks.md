# Tasks: Landing da plataforma

> feature: landing-plataforma

## T-960 — A página que conta a história sem script [concluida]

- Refs: US-910, AC-933, AC-934, AC-937
- Arquivos: apps/web/src/app/page.tsx, apps/web/src/features/landing/HistoriaDaLanding.tsx, apps/web/tests/landing-historia.test.tsx, packages/ui/styles/landing.css, packages/ui/package.json
- Notas: desenhada no servidor, legível com script desligado. As seções contam uma sequência, e cada uma tem caminho para começar sem voltar ao topo.
- Esforço: alto

## T-961 — A narrativa por rolagem [concluida]

- Refs: US-910, AC-936, AC-937, AC-938
- Arquivos: apps/web/src/features/landing/NarrativaDaLanding.tsx, apps/web/tests/landing-narrativa.test.tsx
- Notas: GSAP com ScrollTrigger. A âncora acompanha o número de seções visíveis; movimento reduzido entrega o estado final. Seção grudada só onde há altura para isso.
- Esforço: alto

## T-962 — O mundo em três dimensões, carregado sob condição [concluida]

- Refs: US-910, AC-935
- Arquivos: apps/web/src/features/landing/mundo.ts, apps/web/src/features/landing/podeRodar3D.ts, apps/web/tests/landing-mundo.test.ts, pnpm-workspace.yaml, apps/web/package.json
- Notas: o mundo é montado por `NarrativaDaLanding`, e não por um componente próprio — quem decide se ele existe é quem já decide o resto do movimento, e separar em dois faria a decisão morar longe de quem a toma. A decisão de carregar é tomada ANTES do download. Sem WebGL, no celular, com poucos núcleos ou com movimento reduzido, o pacote nem é baixado. Descarte explícito de geometria e textura ao sair.
- Esforço: alto

## T-963 — Teste de ponta a ponta da landing [pendente]

- Refs: US-910, AC-934, AC-938
- Arquivos: e2e/specs/landing.spec.ts
- Notas: cobre a página com script desligado e a régua de 344px de largura.
- Esforço: medio
