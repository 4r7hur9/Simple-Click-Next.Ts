# Plano #111 — Stitch · Área do cliente (/conta e pedidos)

## Contexto

O redesign Stitch leva a linguagem nova (tokens, Plus Jakarta Sans, Chip,
Abas, Gaveta, AvisoFlutuante, BarraInferior — **criados pelo #104**, ainda
ausentes de `packages/ui/src/index.ts`) para a área do cliente, que **já
existe e funciona**: `/conta`, pedidos, detalhe, favoritos, dados, endereços,
segurança, aplicativo autenticador e o acompanhamento público
`/loja/[slug]/pedido/[token]`. Sem mockup próprio: base do #104 e destinos da
barra inferior do #105.

Lacunas lidas no código que o card manda corrigir ("proteção das ações",
"sair e troca de conta"):

1. Remover produto favorito sempre falha: `LojasDaConta.tsx:86` chama
   `DELETE favoritos/produtos/<id>` e `PERMITIDOS` (`app/api/conta/[...resto]/route.ts:11`)
   só aceita um segmento depois de `favoritos` → 404. A API tem
   `DELETE /v1/conta/favoritos/produtos/:produtoId` (`z.uuid()`, `feed.routes.ts`).
2. CSRF: nada no web confere `Origin`/`Sec-Fetch-Site`/`content-type` em
   `/api/conta/*`; `encaminhar` (`server/encaminhar-a-loja.ts`) escreve
   `origin` próprio, então a conferência da API (`apps/api/src/core/cors.ts`)
   nunca recusa. `enderecos/[id]` não valida o id (`..` vira `/v1/conta/`).
3. `sairDaConta`/`sairPelaBarra` (`server/actions/auth.ts`) mantêm os cookies
   se a revogação falhar; `pedirEncerramento` não tem tempo limite.
4. A troca de senha promete desconexão imediata (`SegurancaDaConta.tsx:47`,
   descrição do cartão em `seguranca/page.tsx`); o acesso vive 15 min
   (`apps/api/src/modules/auth/token.ts`).
5. `seguranca/aplicativo/page.tsx` não confere sessão; favoritos com API fora
   mostram "vazio"; "Tirar dos favoritos" sem nome do item e sem pendente;
   `motivo` de erro com `erro.message` em `lib/acompanhamento.ts:39` e
   `lib/meus-pedidos.ts:64`; link `wa.me` sem `rel="noreferrer"`; `conta.css`
   com cores fixas que não seguem o tema.

Execução: **sequencial** (#104 → #105 → … → #110 → #111), só depois da
aprovação do gerente; uma tarefa após a outra, na pasta principal, sem
worktree, sem branch nova, sem commit/push. Proibido: `.spec/`, landing `/`,
arquivos do #104, `features/carrinho`, `features/checkout`, `apps/api`, banco,
contratos, dependências, `.env`.

## Decisões já tomadas (fonte)

- Plus Jakarta Sans; claro **e** escuro; "A decidir" ocultos (notas do board).
- Card #111: todas as telas (Q-11101), correção do favorito (Q-11105),
  proteção de origem/tipo (Q-11106).

## Hipóteses (não bloqueiam; o usuário pode mudar na aprovação)

| ID | Hipótese | Impacto se mudar |
| -- | -------- | ---------------- |
| H-1 (Q-11103) | `SecoesDaConta` nova, marcada pelo `atual` de `PaginaDaConta` (servidor, sem `usePathname`). Regra: **um só menu de seções por largura** — aparece onde o #105 não deixar menu da conta; decidido no T-11100 com o que o #105 entregou. | Só T-11101 |
| H-2 (Q-11104) | A conta segue o tema pelos tokens; nada força `data-tema` em `features/conta`; cores fixas novas não entram. | Só CSS |
| H-3 (Q-11107) | Lista sem polling; só o detalhe (5 s). | +1 efeito |
| H-4 (Q-11108) | Visão geral mantém métricas e gastos. | Remoção de blocos |
| H-5 (Q-11109) | "Favoritar / Tirar dos favoritos" (não "Seguir"). | Só textos |
| H-6 (Q-11110) | Dados como hoje (campos editáveis; e-mail fixo com dica). | Máscara |
| H-7 (Q-11111) | `*.onp` provam tela e proxy. Isolamento: AC-11101, AC-11105, AC-11108, AC-11114, AC-11112 têm teste de API atual; **AC-11113, AC-11117, AC-11118 não têm** (só `GET dados` em `lgpd-conta.test.ts`) → ficam "sem prova de isolamento neste card" e vão como recomendação a um card de segurança (é `apps/api`). | Card novo |
| H-8 (Q-11112) | Nada em `apps/api` nem no banco. | — |
| H-9 | `pedidos.css` (#112) não é necessário (`features/pedido` usa utilitários; `conta.css` é global por `app/tokens.css:12`). O acompanhamento vive no envelope `TemaDaMarca`, onde `--cor-marca*` vale. `vitrine.css` só se faltar algo (fila #107→#108→#111). | Sem dependência do #112 |
| H-10 | Regras `.sc-pedidos*` e `.sc-filtros*` de `conta.css` **não** são removidas nem alteradas: o painel as recebe por serem globais (`QuadroKanban.tsx:389`). A conta passa a usar classes novas (`.sc-meus-pedidos*`, `Chip`). Aviso ao #112. | Limpeza futura |
| H-11 (AC-11123) | "Voltar à loja" não tem fonte hoje (`conta/layout.tsx` monta `LateralDaSessao` sem `loja`; `sc_loja` é do painel). Fica com o #105 (regras de navegação); aqui só a prova do que ele entregar. Sem fonte, nada de heurística (Referer) — reportar ao gerente. | — |

## Revisão após #104, #105 e #110 (17/11/2026, só leitura)

Fatos lidos no código atual (nenhum arquivo meu foi alterado: `features/conta`,
`features/pedido`, `conta.css`, `usuario.css`, `server/actions/auth.ts`,
`app/api/conta/*`, `lib/acompanhamento.ts`, `lib/meus-pedidos.ts` seguem no
estado original):

- **#104 entregou** em `packages/ui/src/index.ts`: `Chip`/`FaixaDeChips` (`href` →
  `aria-current="true"`, `componenteDeLink`), `Abas`, `Gaveta` (classe
  `.sc-gaveta-modal`), `AvisoFlutuante` (`tom`, `mensagem`, `acao{rotulo,aoAcionar}`,
  `aoFechar` obrigatório, controlado; "use client"), `BarraInferior`,
  `BotaoMarcavel`; fonte Plus Jakarta Sans. Peças consumidas ficam confirmadas.
- **#105 entregou**: `LateralDoUsuario` saiu das molduras (`conta/layout.tsx` agora
  monta `NavegacaoDaSessao` + `BarraInferiorDaSessao`); `features/usuario/MenuDaConta.tsx`
  (avatar com os itens de `itensDoUsuario`, Ver tutorial, Sair);
  `tokenOuEntrar(caminho)` com `comDestino("/entrar", …)` em todas as páginas de
  `/conta`; `limparDadosLocaisDoCliente` (`sc:feed:local`, stories vistos) ao sair;
  `Referrer-Policy: strict-origin-when-cross-origin` global em `next.config.ts`.
- **#110** não tocou meus arquivos. Gate geral dele: typecheck do web falha em
  `(explorar)/explorar/_dados.ts` (#106) e `pnpm lint` tem erros alheios → o
  "gate verde" do #111 mede **os meus arquivos**; falhas alheias são reportadas, não corrigidas.

Ajustes ao plano:

1. **H-1 fechada**: `SecoesDaConta` entra sem conflito (o menu do avatar é um painel
   fechado; a barra inferior só leva a Perfil). Conferir um único `aria-current="page"`
   de seção visível por largura.
2. **H-11 mantida, sem fonte**: `conta/layout.tsx` chama `NavegacaoDaSessao` sem `loja`,
   logo não há "Voltar à loja" em `/conta` (item só existe com `loja`,
   `quem-esta-logado.ts:287`). AC-11123 fica pendente: pergunto ao gerente se o
   #105 deve passar a loja; sem resposta, registrar como não entregue.
3. **T-11100** só confere o que mudou desde esta revisão (git diff dos meus arquivos
   e da assinatura de `NavegacaoDaSessao`) e pede as vagas.
4. **T-11108**: o `sairPelaBarra` continua em `server/actions/auth.ts` (não editado
   pelo #105). A limpeza de `sc:feed:local` já é do #105 (`MenuDaConta`), então o #111
   só prova que ela roda no Sair; a falha na revogação continua sendo meu ajuste.
5. **AC-11127 / guardas**: as páginas já usam `comDestino`; `seguranca/aplicativo/page.tsx`
   passa a usar `tokenOuEntrar("/conta/seguranca/aplicativo")` e entra no teste do retorno.
6. **Referrer**: com a política global do #105, `referrer: "no-referrer"` no metadata
   das duas páginas de pedido continua (mais estrito que o global, o token está na rota).
7. **Código morto da lateral**: `LateralDaSessao`/`LateralDoUsuario` e `usuario.css`
   não são mais montados nas molduras, mas `tests/lateral-do-usuario.test.tsx` (lê o
   CSS), `tests/molduras-do-cliente.onp.test.tsx`, `tutorial/passos.ts`, `legal.css`,
   `feed.css` e `UsuarioNoMenu` ainda os referenciam. **Não removo** (quebraria teste
   legado, que não posso editar): só reporto ao gerente com a proposta de remover junto
   com esses testes, decisão do usuário. Substitui a limpeza do T-11101.
8. **Classes `.sc-sacola*`**: não são minhas; o aviso do #110 sobre `usuario.css:449`
   vale só se a limpeza acima for aprovada.

## Peças do #104 consumidas (conferir em T-11100)

`Chip` (`href` → `aria-current="true"`), `Abas`, `AvisoFlutuante` (`tom`,
`mensagem`, `acao`; erro com `role="alert"`), `Botao` (`forma="pilula"`,
`carregando`, `marcado`), `Cartao` (`superficie="vitrine"`), `IconeEstrela`,
tokens `--cor-*`, `--tipo-*`, `--fonte-*`. Faltou ou mudou → não criar aqui
(P-108): `board_message` ao gerente e parar a tarefa dependente.

## Tarefas (ordem de execução; testes `[CA-n] @spec:AC-111xx`, CA-n ↔ AC-111(00+n))

Padrão de teste: `// @vitest-environment jsdom`, `createRoot` + `act` e
ajudantes de `apps/web/tests/apoio-config.tsx`; `vi.mock("next/navigation"|
"next/headers")` com `vi.hoisted`; rotas importadas de `route.ts` com
`new Request(...)` e `{ params: Promise.resolve(...) }` (modelo:
`tests/painel-metricas-encaminhamento.test.ts`). Lint de camadas
(`packages/config-eslint/fronteiras.js`): `features` só importa `packages/ui`,
`contracts` e `lib`; `server` não importa `features`.

Ganchos intocáveis (testes e e2e atuais): `data-meus-pedidos`, `data-loja`
(seção por loja e sua ordem), `data-pedido`, `data-total`, primeiro `<a>` do
cartão = link do detalhe, "Pedido nº N", `data-status-atual` com
`role="status"`, `data-linha-do-tempo`, `data-passo`, `data-contato-da-loja`,
título "Contato da …", h1 "Pedido não encontrado", "A loja informou o motivo:",
`data-endereco`, "Sair deste dispositivo", "Encerrar todas as sessões",
"Não foi possível encerrar a sessão.", botão "Sair", `href="/conta/seguranca/aplicativo"`,
`.sc-usuario-lateral`, `[data-ver-tutorial]`. Teste legado quebrado → parar e
avisar o gerente; nunca editar o teste.

### T-11100 — Pré-voo e vagas (sem edição)
- `board_peers`/`board_notes`; conferir o que #104, #105, #106, #110 entregaram: peças em `packages/ui/src/index.ts`; `conta/layout.tsx`, `_token.ts` (assinatura de `tokenOuEntrar`), redirects das páginas, `LateralDoUsuario`, `UsuarioNoMenu`, `usuario.css`, `app/_usuario/sessao.tsx`, `server/actions/auth.ts` (o #105 liga `limparDadosLocaisDoFeed`), `lib/quem-esta-logado.ts`.
- Pedir ao gerente, por `board_message`, a vaga de `app/(conta)/entrar/page.tsx` (aviso de saída parcial) e confirmar `server/actions/auth.ts`, `app/api/conta/*`, `lib/acompanhamento.ts`, `lib/meus-pedidos.ts`, `seguranca/aplicativo/page.tsx`. Avisar #112 (Sair do painel e regras globais de `conta.css`) e #105.
- Linha de base: `pnpm exec vitest run --project web apps/web/tests`; `board_claim`.

### T-11109 — Proxy da conta (AC-11125, 11126) — vem antes das telas
- create `server/protecao-da-conta.ts` → `recusarAcaoDeFora(requisicao): Promise<Response | null>`, em POST/PUT/PATCH/DELETE, **antes** do 401:
  - 403 se `Sec-Fetch-Site` existe e ≠ `same-origin` (recusa `same-site`, `cross-site`, `none`);
  - senão 403 se `Origin` existe e (é `null` ou ∉ {origem de `enderecoDoSite()`, origem de `requisicao.url`}), com porta padrão normalizada;
  - sem `Origin` e sem `Sec-Fetch-Site` passa (cliente fora do navegador; decisão escrita);
  - 415 se `content-type` existe e o tipo (antes do `;`, minúsculo) ≠ `application/json`, ou se o corpo lido de `requisicao.clone().text()` não é vazio sem esse tipo; sem corpo passa (POST/DELETE do `BotaoFavoritar`).
- modify `app/api/conta/[...resto]/route.ts`: tabela caminho × método (design §5); `favoritos/<apelido>` com `FORMATO_DO_APELIDO` (`@simpleclick/contracts`); `favoritos/produtos/<uuid>` só **DELETE**; `sessoes/<uuid>` com UUID 8-4-4-4-12; método fora da tabela (inclui HEAD) → 404 sem encaminhar.
- modify `app/api/conta/enderecos/route.ts` (guarda) e `enderecos/[id]/route.ts` (guarda + id só UUID estrito → 404).
- `server/encaminhar-a-loja.ts` não muda (compartilhado com painel e loja).
- Teste `apps/web/tests/area-do-cliente-proxy.onp.test.ts`: positivos para cada chamador real (`chamarConta` com os caminhos de `LojasDaConta`, `SegurancaDaConta`, `DadosDaConta`; `BotaoFavoritar` POST/DELETE sem corpo; `Tutorial`; `PrivacidadeDaConta`; `JanelaDeNovoAceite`; `lib/enderecos-da-conta.ts`, inclusive `salvarEnderecoDaConta` do fechamento; `application/json; charset=utf-8`); negativos `favoritos/produtos/x/y`, `%2F`, `..`, `favoritos/produtos` sem id, `POST favoritos/produtos/<uuid>`, `feed/favoritos`, `metricas`, `GET excluir`, `HEAD excluir`, `DELETE dados`, `PATCH sessoes`, `POST dados`, `DELETE aceites`, `PUT` em `[...resto]`, `enderecos/..`, `%2e%2e`, `.`, id não-UUID; 403 (`cross-site`, `same-site`, `none`, `Origin: null`, origem estranha, porta diferente) e 415 (`text/plain`, form, corpo sem tipo); 403/415 antes do 401; sem cookie → 401 sem chamar a API; `fetch` simulado prova que a API não foi chamada.
- Regressão: `feed-telas`, `novo-aceite`, `conta-enderecos`, `fechamento-pagina`, `checkout-na-janela`, `config-entrega`.

### T-11101 — Moldura e seções (AC-11122, 11124; 11123 conforme H-11)
- create `features/conta/SecoesDaConta.tsx` (servidor): `<nav aria-label="Seções da conta">`, seis links na ordem Visão geral, Pedidos, Favoritos, Dados, Endereços, Segurança; `aria-current="page"` pelo `atual`.
- modify `features/conta/PaginaDaConta.tsx` (monta `SecoesDaConta`; hub em `/conta` no celular), `features/conta/VisaoGeralDaConta.tsx` + `app/(conta)/conta/page.tsx` (visual novo, métricas mantidas; troca `.sc-pedidos__*` por `.sc-meus-pedidos*`; `features/dashboard` só usado), `packages/ui/styles/conta.css` (`.sc-minha-conta*`, `.sc-secoes-da-conta*`, `.sc-meus-pedidos*` com tokens), `packages/ui/styles/usuario.css` só para limpar referências mortas que o #110 avisar (`.sc-sacola__area`).
- Teste `area-do-cliente-navegacao.onp.test.tsx`: seis seções, um único `aria-current="page"` de seção por largura, sem "Entrar"/"Criar conta" para logado, nenhum `data-tema` imposto.

### T-11102 — Favoritos (AC-11101..11104, 11130)
- modify `features/conta/LojasDaConta.tsx`, `app/(conta)/conta/favoritos/page.tsx`, `conta.css`.
- Ordem produtos → lojas favoritas → recentes (30 dias), blocos com título; cartão com foto, nome, preço, loja, link.
- Botão "Tirar <nome> dos favoritos" (★ preenchida, estado anunciado), `carregando` sem clique duplo; some só após `ok`; falha mantém o item e mostra `AvisoFlutuante` com "Tentar de novo". API fora → `Erro` com tentar de novo.
- `BotaoFavoritar` (#106) só usado. Sem contagem pública, nota, cupom, selo.
- Teste `area-do-cliente-favoritos.onp.test.tsx` + prova de ponta a ponta: `ListaDeProdutosFavoritos` → `chamarConta` → `DELETE` da rota real (T-11109) com a API simulada → item some.

### T-11103 — Lista de pedidos e filtros (AC-11105..11107, 11130)
- modify `features/conta/MeusPedidos.tsx`, `features/conta/FiltrosDePedidos.tsx` (situação vira `Chip href`; loja/período no `form method=get`; deixa de usar `.sc-filtros*`), `app/(conta)/conta/pedidos/page.tsx`, `pedidos/loading.tsx`, `conta.css` (`.sc-meus-pedidos*`; H-10).
- Agrupamento por loja mantido (`agruparPedidosPorLoja`); selo com `rotuloDoStatus` de `features/pedido/LinhaDoTempo.tsx` e `tomDoStatus` de `MeusPedidos.tsx` (nunca `painel-pedidos/SeloDeStatus.tsx`); cancelado com forma própria. Sem polling. `lerFiltro`, `filtrarPedidos`, `lojasDosPedidos` sem mudança.
- Teste `area-do-cliente-pedidos.onp.test.tsx`: estados reais, só `situacao|periodo|loja` no endereço, nenhum import de `painel-pedidos` em `features/conta`.

### T-11104 — Detalhe e linha do tempo (AC-11108..11110)
- modify `features/pedido/AcompanhamentoDoPedido.tsx` (visual com tokens; `INTERVALO_DO_ACOMPANHAMENTO_MS` = 5 000 e o laço `perguntar` intactos; aviso discreto mantém a última etapa; `wa.me` com `rel="noopener noreferrer"`), `features/pedido/LinhaDoTempo.tsx` (`aria-current="step"` e marca na etapa atual; anteriores listadas; desconhecido → "Em andamento"; `historico[].motivo` da loja continua como texto, nunca HTML), `conta.css` (`.sc-acompanhamento*`).
- create `app/(conta)/conta/pedidos/[id]/not-found.tsx` (mesma tela para alheio e inexistente).
- modify `pedidos/[id]/page.tsx` (visual; `referrer: "no-referrer"` no metadata; `throw` com código fixo), `lib/meus-pedidos.ts` (`ResultadoDoMeuPedido.motivo` fixo, sem `erro.message`); guarda do #105 preservada.
- Teste na `area-do-cliente-pedidos.onp.test.tsx` (fake timers).

### T-11105 — Acompanhamento público (AC-11111, 11112)
- modify `app/(loja)/loja/[slug]/pedido/[token]/page.tsx` (visual; `robots` noindex e `referrer: "no-referrer"`; título sem token; `throw` com código fixo), `not-found.tsx`, `lib/acompanhamento.ts` (`ResultadoDoAcompanhamento.motivo` só texto fixo).
- Só campos de `esquemaDoAcompanhamento` (telefone mascarado); sem "voltar" de conta.
- Teste `area-do-cliente-acompanhamento.onp.test.tsx`: campos permitidos; sem CPF/e-mail/endereço/telefone completo; `cache: "no-store"`; mesma tela para mal formado/inexistente/outra loja; token fora do título, do `motivo` e da mensagem do erro; `referrer` e `rel`. Limitação registrada: o token segue nos logs de acesso (Traefik/Next/API) → recomendação a card de segurança.

### T-11106 — Dados e endereços (AC-11113, 11114, 11130)
- modify `features/conta/DadosDaConta.tsx`, `features/conta/EnderecosSalvos.tsx` (pendente em "Usar como padrão" e "Apagar"; texto do que muda ao apagar o padrão), `dados/page.tsx`, `enderecos/page.tsx`, `conta.css`.
- Um só padrão; confirmação ao apagar (existe); erro sem apagar o digitado.
- Teste `area-do-cliente-perfil.onp.test.tsx`.

### T-11107 — Segurança, privacidade e autenticador (AC-11115..11118, 11121, 11130)
- modify `features/conta/SegurancaDaConta.tsx` ("os outros aparelhos saem em até 15 minutos"; pendente no "Encerrar" de sessão), `features/conta/PrivacidadeDaConta.tsx`, `seguranca/page.tsx` (descrição sem "imediato"; exclusão numa "zona de risco"), `seguranca/aplicativo/page.tsx` (exige sessão com a guarda vigente do #105), `seguranca/aplicativo/AtivacaoDoAplicativo.tsx` (remonta o `TotpForm` por `key` em `pagehide`/`pageshow` com `persisted`, para chave e códigos não voltarem pelo bfcache), `conta.css`.
- Mensagens atuais mantidas (`senha_incorreta`, `tem_loja`, `e_administrador`, `confirmacao_invalida`, limite de exportação).
- `features/auth/TotpForm.tsx` não é deste card: só testar que chave e códigos não vão a URL, título nem storage.
- Teste `area-do-cliente-seguranca.onp.test.tsx`.

### T-11108 — Sair, troca de conta, acesso vencido (AC-11119, 11120, 11127)
- Só com a vaga de `entrar/page.tsx` confirmada (T-11100); sem vaga → `card_report` needs_input, sem mexer em `auth.ts`.
- modify `server/actions/auth.ts`: `AbortSignal.timeout` em `pedirEncerramento`; `sairDaConta` e `sairPelaBarra` **sempre** apagam os cookies (`apagarCookiesDaSessao`, com o domínio); falha → `redirect("/entrar?saida=parcial")`; sucesso igual a hoje (`/entrar` e `destinoDepoisDeSair`). `encerrarTodasAsSessoes` igual (cookies ficam para tentar de novo).
- modify `app/(conta)/entrar/page.tsx`: com `saida=parcial`, `Aviso` "Saímos deste navegador, mas não conseguimos encerrar esta conexão no servidor. Entre de novo e use Encerrar todas as sessões em Segurança."
- AC-11120: a doc do Next 16 (`node_modules/next/dist/docs/01-app/04-glossary.md`, "Client Cache") diz que `cookies.delete` numa ação do servidor invalida o cache do cliente; páginas da conta são dinâmicas e as leituras usam `no-store`. Prova: teste de `auth.ts` real + varredura estrutural (toda página de `/conta` dinâmica; `lib/conta-do-cliente.ts` e `lib/meus-pedidos.ts` com `cache: "no-store"`). Limpeza de `sc:feed:local` e stories vistos: conferir que o #105 ligou `limparDadosLocaisDoFeed`; senão, avisar o gerente. Jornada com duas contas: e2e do #114.
- AC-11127: prova (401 → um único `redirect` para a entrada do #105; `/entrar` não volta à conta).
- Teste `area-do-cliente-sessao.onp.test.ts`: importa `auth.ts` de verdade (`next/headers` e `fetch` simulados): cookies apagados com `Domain` de `dominioDoCookieDeSessao` nos dois cenários de falha (rede e 5xx) e de tempo esgotado, destino do `redirect`, Sair do painel (`sairPelaBarra` com `/painel`) e aviso em `/entrar`.

### T-11110 — Regressão, varredura, prova onp (AC-11128, 11129)
- create `apps/web/tests/area-do-cliente-conteudo.onp.test.ts`: busca sem diferenciar maiúsculas, só em `features/conta`, `features/pedido`, `app/(conta)/conta` e `app/(loja)/loja/[slug]/pedido`: CNPJ, telefone fixo, "10x sem juros", cupom, fidelidade, avaliação, Universokar, placa, chassi, `googleusercontent`, `data-tema`. Revisão do dono continua a prova principal.
- Rodar sem alterar: `meus-pedidos`, `acompanhamento-pedido`, `acompanhamento-loja-suspensa`, `conta-enderecos`, `lateral-do-usuario`, `inicio-da-conta`, `conta-do-cliente`, `menu-lateral`, `sessao-servidor`, `telas-de-acesso`, `feed-telas`, `novo-aceite`, `botao-ja-enviei`, `fechamento-pagina`, `checkout-na-janela`, `config-entrega` e os de `apps/api/tests`.
- `onp-spec verify` deste card e o filtro de audit do `.spec/README.md`.

## Recomendações para card de segurança (fora do escopo, sem `apps/api`)

Testes de API com duas contas para `PATCH dados`, `POST senha`, `DELETE sessoes/:id`; guarda de origem em `/api/loja/*` e `/api/auth/*` (aplicativo, códigos de recuperação; `renovar-acesso.ts` chama `/api/auth/renovar` sem `Origin` e precisa passar); revogação do lado da API quando o Sair falha; token fora dos logs de acesso; "produtos" em `APELIDOS_RESERVADOS`.

## Verificação

1. Por tarefa: `pnpm exec vitest run apps/web/tests/area-do-cliente-<x>.onp.test.ts(x)` e `pnpm exec vitest related --run <arquivos>`.
2. Gate: `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, `pnpm test:int`, `pnpm test:e2e`, `pnpm build`, `pnpm exec prettier --check <arquivos>`, gitleaks.
3. ONP: `node ~/.claude/skills/onp-spec-driven/scripts/onp-spec.mjs verify` + filtro de audit da feature `stitch-area-do-cliente`.
4. Manual (`pnpm dev` atrás do Traefik, navegador do RM Code): `/conta`, favoritos, pedidos, detalhe, dados, endereços, segurança e um link público em 390 e 1280 px, claro e escuro; remover produto favorito de verdade; ações da conta funcionando (o `Origin` real bate com uma origem aceita); POST de outra origem → 403; Sair com a API parada → aviso em `/entrar`.
