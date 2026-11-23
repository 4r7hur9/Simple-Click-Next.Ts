# Roteiro de fala — SimpleClick

Acompanha `docs/apresentacao/index.html` (30 slides, arquivo único, abre offline). Quatro partes: o sistema, a arquitetura, o Code Crew e o Workflow IA.

- **Abrir:** dois cliques em `index.html`. Não precisa de servidor nem de internet.
- **Teclas:** `→` e `←` (ou espaço, PageDown/PageUp) navegam; `Home`/`End` vão às pontas; `I` abre o índice; `T` troca o tema; `F` põe em tela cheia. O endereço guarda o slide (`#s18`).
- **Tela pequena** (menos de 900 px): os slides viram uma página que rola.
- **Prints:** vêm de `apps/web/public/landing/`, com dados fictícios do seed.
- **Tom:** frases curtas, primeira pessoa. Termo técnico? Diga em uma frase o que é. Os slides já trazem a explicação; o roteiro só lembra.

## Duas durações

| Versão | Slides | Tempo |
|---|---|---|
| **Completa** | 1 a 30 | 20 a 25 min |
| **10 minutos** | 1 · 3 · 4 · 6 · 8 · 10 · 11 · 18 · 19 · 20 · 22 · 25 · 28 · 30 | 10 min |

Divisão dos 10 minutos: sistema 2 min (slides 1, 3, 4, 6) → arquitetura 4 min (8, 10, 11, 18, 19) → Code Crew 2 min (20, 22) → Workflow IA 2 min (25, 28, 30). A demonstração ao vivo, se houver, entra depois do slide 6; o passo a passo está em `docs/apresentacao.md`.

---

## Abertura

### 1. Capa (30 s)
"Este é o SimpleClick, meu projeto final, o Projeto A. Vou mostrar o sistema, como ele é por dentro e como eu trabalhei com agentes de IA."

### 2. Roteiro (20 s)
Quatro partes: sistema, arquitetura, Code Crew, Workflow IA. "Todo número aqui foi medido; as fontes estão neste roteiro."

## Parte 1 — O sistema (≈ 4 min)

### 3. O problema (1 min)
"A pequena loja já vende pelo WhatsApp. Falta vitrine e controle do pedido. O SimpleClick dá os dois, sem tirar a loja do WhatsApp. E uma loja nunca vê os dados de outra."
- Fontes: `README.md`; 22 modelos de loja em `docs/estruturacao/04-simulacao.md`.

### 4. O caminho de um pedido (1 min)
Conte os seis passos. Frise dois pontos: o sistema **não envia** a mensagem (o cliente envia) e, se a internet cai e o cliente repete, **o pedido não duplica**.
- Fontes: `docs/arquitetura/c4.md` §1; `docs/adr/0001-pedido-e-carrinho-na-mesma-transacao.md`.

### 5. Para o cliente (40 s)
Explorar, loja, sacola, conta.
- Fonte: rotas em `apps/web/src/app/(explorar)`, `(loja)`, `(conta)`.

### 6. Para o dono (1 min)
Quadro de pedidos, resumo de vendas e as fotos da vitrine (fundo e topo do cardápio). Cite equipe, estoque, stories.
- Fontes: `packages/contracts/src/etapas-do-pedido.ts`; rotas em `apps/web/src/app/(painel)/painel/`.
- Se houver demonstração, é aqui (sem usar as portas do preview).

### 7. Para a administração (30 s)
Aprova lojas, gerencia contas, vê métricas, tem auditoria.
- Fonte: `apps/web/src/app/(admin)/admin/`; `apps/api/src/modules/{admin,admin-metricas}`.

## Parte 2 — A arquitetura (≈ 9 min)

### 8. As peças (1 min)
"Site, API, banco e cache. O site mostra, a API decide, o banco guarda, o cache lembra o que se repete." Monorepo = um repositório com tudo. Monólito modular = um programa só, dividido em 16 módulos.
- Fontes: `README.md`, `CONTRIBUTORS.md`; 70 migrações em `packages/database/migrations/` (até a 0074).

### 9. C4 de contexto (45 s)
"Este é o mapa de fora: quem usa e o que fica fora. O WhatsApp é externo; eu só preparo o link."
- Fonte: `docs/c4/contexto.md` → `docs/arquitetura/c4.md` §1.

### 10. C4 de contêiner (45 s)
"Agora por dentro: site fala com a API, a API usa o banco e o cache. O cache tem três usos reais: limite de tentativas, métricas e filas."
- Fonte: `docs/c4/containers.md` → `docs/arquitetura/c4.md` §2.

### 11. Duas garantias (1 min 30)
- **Loja isolada:** todo acesso ao banco passa por um ponto só, que informa de qual loja é a requisição. Descartado: rota falando direto com o banco (um esquecimento vaza dado). Fonte: `docs/adr/0002-database-pattern-prisma-e-sql.md`, `apps/api/src/core/db.ts`, `apps/api/tests/isolamento-entre-lojas-dono.test.ts`.
- **Pedido sem duplicar:** criar pedido, baixar estoque e fechar sacola numa transação; repetir a chave devolve o mesmo pedido (HTTP 200). Descartado: fechar a sacola depois. Fonte: ADR 0001; `carrinho-convertido.int.test.ts`, `pedido-idempotente.test.ts`.

### 12. Módulos e volume (45 s)
16 módulos com fronteira conferida por lint; 101.000 pedidos (1.000 do seed + 100.000 de volume, 167.284 itens); 13 conferências com 0 violação. Diga: o volume só existe na base local.
- Fontes: `apps/api/src/modules/`, `packages/config-eslint/fronteiras.js`, `docs/estruturacao/04-simulacao.md`, `09-volume.md`.

### 13. Testes (1 min)
3.943 de unidade (web 2.655, api 692, core 274, ui 247, contracts 49…); 1.035 de integração (api 847, database 161, testing 27); contrato de API; 338/338 ponta a ponta. Cobertura 80,10 / 77,99 / 79,75 / 71,07 %, com mínimos 75 / 73 / 75 / 66. Ressalva: medido em 19–20/11/2026 na minha máquina; 2 testes de tempo falham com a cobertura ligada.
- Fontes: `docs/estruturacao/08-suite-verde.md`, `10-e2e.md`, `apps/api/tests/contrato-openapi.test.ts`, `vitest.config.ts`, `docs/ci.md`.

### 14. CI (1 min)
8 verificações (qualidade, unitários, integração, cobertura, dependências, segredos, contrato, build). Achado real: 48 vulnerabilidades (4 críticas, 18 altas), nenhuma no meu código, resolvidas com atualização. Execução verde: 8/8, 14 min 30 s, commit `2ada0f4` (desde então só documentação mudou).
- Fontes: `.github/workflows/ci.yml`, `docs/ci.md`; <https://github.com/4r7hur9/Simple-Click-Next.Ts/actions/runs/44890192508>.

### 15. Observabilidade (1 min)
Logs sem dado pessoal, métricas, um rastro de 131 etapas / 37 ms ao criar pedido, meta de 99% abaixo de 1 s. Limite: a meta de 28 dias só se confirma em produção.
- Fontes: `docs/observabilidade.md`, `docs/observabilidade/{metrics.txt,trace-pedido.json,slo-promql.json}`, `infra/compose/regras-slo.yml`.

### 16. Subir, configurar, publicar (45 s)
`docker compose up --build`; segredos do ambiente (a API recusa partir em produção com segredo fraco); uma feature flag (`FLAG_VITRINE_PROXIMO_PRECO`, desligada por padrão); dois ambientes definidos. **Diga:** nada está no ar ainda, e eu só validei a sintaxe do compose, não subi a pilha inteira.
- Fontes: `docker-compose.yml`, `docs/ambientes-e-deploy.md`, `apps/api/src/core/{env,flags}.ts`.

### 17. Como medi o desempenho (45 s)
Base com 100 lojas e 101.000 pedidos; k6 em três etapas (subida 2 min, 20 compradores por 5 min, descida 1 min); mesma quantidade de trabalho antes e depois. p95 = tempo que 95% das respostas ficam abaixo. Notebook Apple M4, k6 v1.3.0.
- Fontes: `tests/performance/k6/`, `docs/desempenho.md` §3.

### 18. O gargalo: 481 ms → 9 ms (1 min 30)
"Meus pedidos" ligava cliente e itens só pelo número; os índices começam pela loja, então o banco lia tudo. Correção única: informar a loja nas duas ligações (migração 0074, sem índice novo; recusa aplicar se houver vínculo entre lojas). Números: 481 → 9 ms (medianas: 588 e 374 antes, 9 e 9 depois); conta de 167 pedidos ~2,0 s → 0,7 ms; páginas lidas 1.644.403 → 991. Por que não cache: quem acabou de pedir quer ver na hora. Ressalva: notebook, execuções em horas diferentes.
- Fontes: `docs/desempenho.md` §4–§7, `docs/desempenho/comparacao.md`, `packages/database/tests/meus-pedidos-por-loja.test.ts`.

### 19. Estresse com 101 mil pedidos (1 min)
20, 40 e 60 usuários: 8,68 / 17,41 / 26,31 req/s; p95 do catálogo 29 / 16 / 12 ms; do pedido 42 / 30 / 26 ms; 57.139 requisições, 0 falhas; 1.639 compras e 1.639 repetições corretas; 102.639 = 101.000 + 1.639. **Não achei o limite:** o teto está acima de 60 usuários nesta máquina. Não é capacidade medida.
- Fontes: `docs/desempenho.md` §3.1; `docs/desempenho/estresse-volume-3/`; commit `4fbd4db`.

## Parte 3 — Code Crew (≈ 4 min)

### 20. O quadro de agentes (1 min)
"Cada card é um agente de IA trabalhando, com conversa própria. O gerente coordena, e eu decido." O board passou do #150. Ao terminar cada rodada o agente avisa: terminei / preciso de resposta / parei.

### 21. Vários agentes, sem conflito (1 min)
Reserva de arquivos antes de editar; um card espera o outro (#142 sobre #138 e #131); memória do time (nota real do #142: "disco cheio trava o Docker: mantenha 15 GiB livres"); regras de convivência (portas do preview, bases de teste).

### 22. Risco e plano (1 min 30)
Risco decide o modelo: toda tarefa de risco alto foi para o opus (34 de 34). O plano é conferido por máquina antes de editar (arquivos, comandos e símbolos existem?). 44 versões de plano em 14 cards; só 1 de 14 passou de primeira. Alto e crítico exigem revisão adversarial; crítico exige rollback.
- Fonte: `.rmcode/plans/card-*-v*.json` do board.

### 23. Card #153 (1 min)
Efeito de vidro, risco alto. v1: 25 falhas (17 símbolos inexistentes, 6 comandos); v2: 48 falhas de caminho; v3: 1 falha (revisão não concluída); v4: pronto, 26 apontamentos resolvidos. A revisão achou dois problemas críticos de CSS. Sobrou `packages/ui/styles/vidro.css` e o teste `[CA-1]` em `packages/ui/tests/vidro.test.ts`.

### 24. Card #142 (1 min)
Desempenho, risco alto. 4 versões de plano; 23 apontamentos em 2 rodadas; ordem rígida antes → correção → depois; critério CA-5 virou 5 testes em `packages/database/tests/meus-pedidos-por-loja.test.ts`. Ressalva: a v4 salva ainda marca `review-missing`; a aprovação final do plano não está nos arquivos lidos.

## Parte 4 — Workflow IA (≈ 4 min)

### 25. Do card ao código pronto (1 min 30)
Especificação → plano → testes primeiro → implementação → portões → revisão → correção em loop → verificador final → pacote de provas. 13 agentes especialistas; quem revisa não escreveu. Gravidade: urgente e alto bloqueiam. Estado só muda pelo comando oficial.
- Fontes: `CLAUDE.md`, `.workflow-ia/config.json`, `.workflow-ia/README.md`; plugin versão 0.9.0.

### 26. Portões na máquina (1 min)
typecheck, lint, unidade, integração, e2e, build e segredos são obrigatórios; segurança e dependências, opcionais. Configuração só por humano. O teste precisa falhar antes do código; teste enfraquecido é detectado.
- Fonte: `.workflow-ia/config.json` › `gate.etapas`, `provas`, `ci`, `limites`.

### 27. Critério vira teste (45 s)
Card → requisito → CA-5 → teste `[CA-5]` → portão. Regra do `CLAUDE.md`: testes com critério levam a tag `[CA-n]` no nome.

### 28. O humano decide (1 min)
Produto, aprovação e commit/PR/merge são meus. Nenhum agente faz commit, push ou PR sem autorização explícita. Registro do uso de IA em `docs/ia.md`: pedido → sugestão → decisão → teste. Exemplo: 4 testes de virada de preço (`preco-vigente-virada.test.ts`) e 3 mutações. Só código e dados sintéticos foram à IA.

## Fechamento

### 29. Próximos passos (45 s)
Diferente: ambiente de testes para mudança de preço; guardar resumo do corpo junto da chave; corrigir o 500 em confirmações simultâneas (card #129); mesma correção na função de itens do pedido. Falta: subir a pilha do zero; criar staging e produção; carga no GitHub Actions; achar o ponto de saturação; preencher minhas decisões no `docs/ia.md` e os campos de `CONTRIBUTORS.md`.

### 30. Fechamento (20 s)
"Simples para o cliente, sólido por dentro. O sistema, a arquitetura testada e um jeito de trabalhar em que a decisão é minha. Obrigado. Perguntas?"

---

## Perguntas prováveis

- **Por que monólito e não serviços?** Um time de uma pessoa; o módulo já tem fronteira conferida por lint e dá para separar depois.
- **Por que 481 ms e não mais rápido?** A meta era 500 ms e passou para 9 ms com uma correção só; mais que isso seria otimizar sem causa.
- **Isso aguenta mais de 60 usuários?** Não sei: não achei o limite. O teto está acima de 60 nesta máquina.
- **A IA escreveu tudo?** Ela executa dentro de card, plano e portões; as decisões e as aprovações são minhas.
