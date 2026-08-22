# Tasks: Identidade visual global

> feature: identidade-visual-global

## T-965 — Instalar ativos oficiais e congelar os tokens da marca [pendente]

- Refs: US-911, AC-941, AC-942, AC-943, AC-945
- Arquivos: apps/web/public/brand/logo-primary.svg, apps/web/public/brand/logo-reverse.svg, apps/web/public/brand/logo-monochrome-black.svg, apps/web/public/brand/logo-monochrome-white.svg, apps/web/public/brand/app-icon-light.svg, apps/web/public/brand/app-icon-dark.svg, packages/ui/styles/theme.css, packages/ui/src/tokens.ts, packages/ui/tests/tokens.test.ts, packages/ui/tests/contraste.test.ts
- Modelo: gpt-5
- Esforço: alto
- Notas: usa somente SVGs oficiais convertidos em curvas. A fonte oficial para esta tarefa está versionada em `.spec/features/identidade-visual-global/assets/simple-click-kit-marca.zip`; extraia apenas os SVGs necessários e preserve seus desenhos sem recriação. Paleta muda em CSS e no espelho TypeScript na mesma tarefa; contraste é gate.

## T-966 — Aplicar Space Grotesk e Inter sem depender da rede em execução [pendente]

- Refs: US-911, AC-942
- Arquivos: apps/web/src/app/layout.tsx, apps/web/tests/tipografia-identidade.test.ts
- Modelo: gpt-5
- Esforço: medio
- Notas: `next/font` baixa na construção e serve localmente. Asectica não entra como fonte; sua licença demo não autoriza esse uso.

## T-967 — Expor os tokens como API semântica do Tailwind 4 [pendente]

- Refs: US-912, AC-946, AC-948
- Arquivos: apps/web/src/app/tokens.css, apps/web/src/app/globals.css, apps/web/tests/tailwind-identidade.test.ts
- Modelo: gpt-5
- Esforço: medio
- Notas: usa `@theme inline`; não cria `tailwind.config.js` nem duplica valores literais.

## T-968 — Definir a base global da interface [pendente]

- Refs: US-911, US-912, AC-942, AC-943, AC-947, AC-950, AC-951
- Arquivos: apps/web/src/app/globals.css, apps/web/tests/css-global.test.ts
- Modelo: gpt-5
- Esforço: alto
- Notas: cobre documento, corpo, títulos, links, controles, seleção, foco, movimento reduzido e composição modular de 8px. Nenhum fundo decorativo atravessa área de leitura; botão é opaco e usa raio de 6px; texto não interativo não recebe cápsula decorativa.

## T-969 — Alinhar os componentes base à identidade oficial [pendente]

- Refs: US-911, AC-941, AC-942, AC-943, AC-948, AC-950, AC-951
- Arquivos: packages/ui/styles/componentes.css, packages/ui/tests/componentes.test.tsx, apps/web/tests/cores-projeto.test.ts
- Modelo: gpt-5
- Esforço: alto
- Notas: preserva carregando, vazio, erro e sucesso, alvo de toque e foco acessíveis. Remove glassmorphism, botões translúcidos e qualquer badge. Estado funcional usa ícone + texto livre; aviso destacado pode ocupar bloco opaco completo.

## T-970 — Preservar a personalização isolada da loja e da landing [pendente]

- Refs: US-911, AC-943, AC-944
- Arquivos: packages/ui/src/tema-loja.tsx, packages/ui/tests/tema-loja.test.tsx, packages/ui/styles/landing.css, apps/web/tests/landing-previa.test.tsx
- Modelo: gpt-5
- Esforço: alto
- Notas: a loja pode substituir intenção primária no escopo autorizado; não redefine estados funcionais nem vaza para fora do envelope.

## T-971 — Completar a vitrine interna da identidade [pendente]

- Refs: US-913, AC-945, AC-949
- Arquivos: apps/web/src/app/(dev)/ui/page.tsx, apps/web/tests/vitrine-ui-a11y.test.tsx, apps/web/tests/vitrine-identidade.test.tsx
- Modelo: gpt-5
- Esforço: medio
- Notas: prova temas claro/escuro, largura de 344px, ativos da marca e todos os componentes/estados.
