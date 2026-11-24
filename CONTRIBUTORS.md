# Contribuidores

Projeto **individual** (Projeto Final Full Cycle 4, Projeto A).

| Campo | Registro |
|---|---|
| **Nome completo** | Arthur Bruno Morais Moreira Araujo |
| **Turma** | GT4.0-FC02-ALDEOTA — Full Cycle, Engenharia de Software, Geração Tech 4.0 |
| **Usuário no GitHub** | `4r7hur9` |
| **Papel** | Autor único: produto, arquitetura, implementação, testes e operação |
| **Período** | 17/08/2026 a 24/11/2026 · 548 commits |
| **Declaração pessoal** | Ver a seção abaixo |

## Declaração pessoal

Eu, Arthur Bruno Morais Moreira Araujo, sou o autor único deste projeto. **Fiz e decidi:**

- **Produto:** concebi o SimpleClick, com vitrine por loja, sacola, pedido enviado pelo WhatsApp, painel do dono e administração da plataforma. Também defini o que cada entrega deveria conter e em que ordem.
- **Regras de negócio:** decidi o modelo de pedido e de preço, o isolamento entre lojas e quem pode ver e fazer o quê (cliente, dono, administrador).
- **Arquitetura:** escolhi monorepo com Next.js e API Express, PostgreSQL com migrações em SQL, contratos em Zod, testes em várias camadas e CI com gates.
- **Ambientes e publicação:** montei o staging e a produção no Railway, configurei os domínios e o DNS (`simplclick.com.br` e `api.simplclick.com.br`), criei a conta de administrador com segundo fator e fiz os pushes e merges que colocaram cada versão no ar.
- **Condução e revisão:** escrevi os cards do board, acompanhei cada entrega, testei as telas no navegador e no celular, apontei os defeitos que encontrei (cortes no menu lateral, avisos que empurravam a página, login próprio do admin) e decidi o que entrava em `main` e `staging`.

**O que a IA fez:** usei agentes de IA (Claude e Codex, pelo Code Crew e pelo plugin Workflow IA) como assistentes. Eles escreveram boa parte do código, dos testes e da documentação a partir dos meus cards, sempre dentro dos arquivos reservados e passando por typecheck, lint e testes.

**Como revisei:**
- conferi cada card em "Em revisão";
- rodei a CI antes de publicar;
- verifiquei o resultado no staging antes de levar para a produção.

Nenhum agente publicou nada sozinho: commit, push, merge e deploy foram decisão minha. O registro detalhado do uso de IA está em [`docs/ia.md`](docs/ia.md).

## Uso de IA

O uso de ferramentas de IA como assistente está registrado em [`docs/ia.md`](docs/ia.md). Os agentes não são contribuidores deste repositório: o autor decide o que entra, revisa e publica.

## O que foi feito por módulo

> Preenchido a partir da estrutura do repositório e do histórico de commits, sem medir a autoria por linha de código.

| Módulo | Contribuição |
|---|---|
| `apps/web` | Site em Next.js: vitrine, checkout, conta do cliente, painel do dono e administração |
| `apps/api` | API Express em `/v1`: pedidos com idempotência, autenticação, isolamento por loja, observabilidade |
| `apps/agente-impressao` | Agente de impressão térmica e emulador |
| `packages/database` | PostgreSQL: migrações em SQL, políticas por loja, seeds (demo, simulação, volume), cópia de segurança |
| `packages/contracts` | Contrato em Zod e OpenAPI gerado |
| `packages/core` | Regras puras (preço, valores do pedido) |
| `packages/ui` | Componentes e estilos |
| `infra/` | Compose, Traefik com TLS local, scripts de ambiente, Prometheus/Jaeger |
| `tests/` e `e2e/` | Testes de desempenho (k6) e ponta a ponta |
| `docs/` | ADRs, C4, OpenAPI, observabilidade, desempenho, deploy e estruturação |
| Operação | Staging e produção no Railway, domínio e DNS na Hostinger, CI no GitHub Actions, conta de administrador com segundo fator |
