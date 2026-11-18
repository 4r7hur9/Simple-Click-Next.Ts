# Plano #105 — Stitch · Navegação do cliente (topo, barra inferior, rodapé)

## Contexto

O redesign Stitch troca a navegação do cliente. Sai a "lateral do usuário"
(trilho à esquerda no computador, pílula no topo no celular). Entram:

- um **topo** com marca, localização, busca, sacola e avatar; no computador,
  também as abas Explorar, Lojas, Favoritos e Pedidos;
- uma **barra inferior** no celular: Explorar, Lojas, Favoritos, Pedidos e
  Perfil;
- o rodapé.

Junto entram as correções de segurança e LGPD que a spec achou:

- havia dois validadores de retorno diferentes;
- as páginas de `/conta` mandam para `/entrar` sem guardar o destino;
- a coordenada é guardada sem consentimento;
- não existe `Referrer-Policy`.

- **Spec:** `.spec/features/stitch-navegacao-cliente/{spec,design,tasks}.md` (T-10501…T-10512).
- **Execução sequencial** (#104 → #105 → …), na pasta principal. Sem commit, sem push, sem trocar de branch.
- **Início:** só quando o gerente avisar que o #104 terminou. A primeira ação é conferir o contrato real da `BarraInferior`. Se divergir do que o #104 combinou, o plano é revisado.

### Decisões já tomadas

| Pergunta | Decisão | Quem |
| --- | --- | --- |
| Q-10505 lateral | **Substituir**: o topo e o menu da conta substituem a lateral em explorar, loja e conta. Painel e admin ficam intactos | usuário |
| Q-10506 rodapé | **Enxuto atual** (`RodapeLegal`) com o visual novo | usuário |
| Q-10509 privacidade | **Atualizar a Política de Privacidade** junto com o botão de localização | usuário |
| Arquivos sem dono | Autorizados na vez do #105. Nos arquivos de cards seguintes, só a mudança mínima, listada no `card_report` | gerente |
| Q-10510 barra do #104 | `<BarraInferior rotulo componenteDeLink oculta itens>`: item com `href` e `atributos` data-\*, ou com `aoAcionar`; mais o token `--altura-da-barra-inferior` | contrato combinado com o #104 |
| Q-10507 `viewportFit` | O #104 põe `viewportFit: "cover"` em `app/layout.tsx`, o que vale para o site todo, inclusive a landing. Os tokens de camada não entram; ficam valores locais | #104 |
| Q-10501 Lojas | `/explorar/lojas` | hipótese (recomendada) |
| Q-10502 barras | A barra da página (sacola ou ação do produto) substitui a barra inferior | hipótese (= ASM-11007 do #110) |
| Q-10503 localização | Endereço padrão (cidade, UF) mais localização aproximada | hipótese |
| Q-10504 sacola fora da loja | Não aparece | hipótese |
| Q-10508 Referrer-Policy | `strict-origin-when-cross-origin` no site todo | hipótese (o card pede) |

**Fora do escopo:** landing `/`; `.spec/`; arquivos do #104; `features/conta`; `features/loja`; painel e admin; `server/loja-da-pagina.ts`. Também fica com o #106 (desenho do feed): lat/lng na URL do feed e o arredondamento em `lerConsulta`.

## Decisões de arquitetura

- **D-1 Validador único** em `lib/destino-seguro.ts` (`features/auth/destino-seguro.ts` reexporta, por causa da fronteira). Ele:
  - normaliza com `new URL(v, base)` e exige a mesma origem;
  - recusa `%2f`, `%5c`, `%00` e caracteres de controle;
  - resolve `.` e `..` **antes** de conferir `/api/` e as telas de acesso (sem diferenciar maiúsculas);
  - devolve só caminho e busca, sem fragmento.
- **D-2 Redução de segredo dentro do validador:**
  - `/loja/<slug>/pedido/<token>…` e `/l/<slug>/pedido/<token>…` viram `/loja/<slug>`;
  - `lat` e `lng` (em qualquer caixa e codificação) saem da busca.
  - Como `JanelaDeAcesso.caminhoAtual()`, as telas de entrar e a verificação já chamam `destinoSeguro` e `destinoDosParametros`, herdam a redução sem editar a janela.
  - `enderecoComRetorno` passa a usar o validador, mas mantém `"/"` e `null` sem `proximo`.
  - `destinoDepoisDeSair` passa a ser `destinoSeguro` restrito a `/loja/`.
- **D-3 Abas do topo são links** com `aria-current="page"`, e não o `Abas` do #104 (que é `tablist`).
- **D-4 O avatar nunca leva `aria-current`.** Em Perfil, no computador, nenhuma das 4 abas fica atual: o avatar ganha um estado visual e o link de dentro do menu leva `aria-current`.
- **D-5 `MenuDaConta` próprio** (`popover` nativo, com classes próprias em `navegacao.css`, sem depender de `usuario.css`). Reaproveita `itensDoUsuario`, `itemAtivo`, `nomeLegivel`, `SELO_DO_PAPEL` e `ICONES_DO_USUARIO`, que muda para `features/usuario/icones-do-usuario.ts` com reexportação. "Ver tutorial" dispara `EVENTO_VER_TUTORIAL`.
- **D-6 A lateral continua no código**, só sai das molduras. `LateralDoUsuario` e `usuario.css` ficam com os testes atuais; a remoção é do #111. Rollback: as molduras voltam a usar `LateralDaSessao`.
- **D-7 Sobrescritas em `apps/web/src/features/usuario/navegacao.css`** com `body:has(.sc-topo-cliente)`: `--sc-feed-topo`, `--altura-da-barra` (`.sc-pagina-da-loja`) e o `inset-block-start` de `.sc-sacola__area`. Não edita `feed.css`, `vitrine.css` nem `usuario.css`.
- **D-8 Cidade lida no servidor:**
  - arquivo `server/cidade-do-topo.ts`, com `cache()` do React, `cache: "no-store"` e tempo limite de 2,5 s;
  - só para quem tem papel `cliente`, em paralelo com `usuarioDoPedidoAtual`;
  - só o endereço com `padrao: true` conta; sem padrão, `null`;
  - `{ cidade, uf }` aparados, com `uf` de 2 letras, e nada além disso;
  - falha ou 401 dá `null`, sem redirecionar.
- **D-9 Coordenada no aparelho** (`apps/web/src/features/usuario/local-do-aparelho.ts`):
  - grava no `localStorage` só com consentimento funcional dado **a partir da data do texto novo** (`consentimento.em >= INICIO_DA_LOCALIZACAO`); sem isso, fica só em memória;
  - arredonda ao gravar e ao ler;
  - apaga ao recusar.
  - `limparDadosLocaisDoCliente()` apaga `sc:feed:local` e `sc:feed:stories-vistos`.
  - Ela roda nos três Sair (menu da conta, lateral e `UsuarioNoMenu`).
  - Cobre também **qualquer outra saída**, sem depender de botão: quando o topo monta com papel logado, grava a marca `sc:aparelho:teve-conta`. Quando monta como visitante e acha essa marca, limpa tudo e apaga a marca. Isso inclui o Sair da página de segurança, a exclusão da conta, o Sair do painel (`MenuDoPainel`) e a sessão vencida.
  - `VERSAO_DA_POLITICA` não muda.
- **D-10 Sacola no topo:**
  - abre pelo evento `sc:abrir-sacola` com `detail.atendido`;
  - sem quem atenda, vai a `/loja/${encodeURIComponent(apelido)}/carrinho`, usando só a prop do servidor (nunca o `detail`);
  - a contagem dedupla pedidos em voo (`lib/contagem-da-sacola.ts`).
- **D-11 `Referrer-Policy: strict-origin-when-cross-origin`** via `headers()` no `next.config.ts`.
- **D-12 Busca na página** (`useSearchParams`, para as abas do feed preservarem os filtros) só dentro de `<Suspense>`, com a lista sem busca como reserva. Os parâmetros são convertidos para `ParametrosDaPagina` antes de chamar `lerConsulta`.

## Subtarefas (em ordem)

Testes novos ficam em `apps/web/tests/*.onp.test.ts(x)`, com título `"[CA-n] @spec:AC-105xx …"`. O jsdom ganha um dublê de `popover`/`showPopover`.

1. **T-10501 Validador único** (D-1, D-2)
   - Cria `lib/destino-seguro.ts`; reexporta em `features/auth`; ajusta `enderecoComRetorno` e `destinoDepoisDeSair`.
   - Mudança mínima no feed (#106): os 5 `/entrar?proximo=` montados à mão passam a usar `comDestino`.
   - Teste `retorno-ao-destino.onp.test.ts` com todos os casos hostis: `//evil.com`, `/\evil`, `%0d%0a`, tab, `/api/x`, `/./api/x`, `/conta/../api/x`, `/./entrar`, `/Entrar`, `%252F%252Fevil`, `/%2F/evil`, `/%5Cevil`, `https:evil.com`, `//evil.com@site`, fragmento, mais de 512 caracteres, token (inclusive `/l/…`, `%74oken`, barra dupla, com busca), `lat`/`LAT`/`%6Cat`/repetido, `proximo` junto com `retorno`, `/` sozinho e a janela de acesso na rota do token.
2. **T-10502 Retorno ao destino em /conta** (depois de T-10501)
   - `tokenOuEntrar(caminho)` e todas as guardas: `conta/page:26`; `dados`; `pedidos`; `pedidos/[id]` linhas 39 e 42 (`encodeURIComponent(id)`); `enderecos:22`; `favoritos`; `seguranca` (sem `?estado=`); `seguranca/aplicativo` (guarda nova); `escolher-loja:35`; `escolher-loja/nova:16`.
   - Na verificação, o destino sobrevive às 3 saídas.
   - `CodigoDeRecuperacaoForm` passa a entregar `{ orientarPara?, redirecionarPara }`, os dois validados. `orientarPara` tem prioridade.
   - Teste `retorno-na-conta.onp.test.tsx`, com a prova estrutural (`redirect` e `replace` de `"/entrar"`, `'/entrar'` ou `` `/entrar` `` sem destino).
3. **T-10503 Regras puras** (depois de T-10501)
   - `apps/web/src/features/usuario/regras-da-navegacao.ts`: tabela rota→item com exatamente um ativo; itens com endereço por papel (o visitante vai a `/entrar?proximo=/conta/…`); endereços das abas do feed.
   - `RodapeLegal` passa a usar `caminhoSemBarra`.
   - Teste `navegacao-do-cliente.onp.test.tsx`, com a matriz dos 5 papéis × `/painel` e `/admin`.
4. **T-10504 Topo e menu da conta** (depois de T-10503)
   - Arquivos, todos em `apps/web/src/features/usuario/`: `TopoDoCliente.tsx`, `MenuDaConta.tsx`, `navegacao.css` (criado aqui) e `icones-do-usuario.ts`.
   - Busca: com `#sc-feed-busca` na página, só foca; fora dela, abre `/explorar/produtos#sc-feed-busca` e foca ao chegar.
   - Teste `topo-do-cliente.onp.test.tsx`.
5. **T-10505 Barra inferior** (depois de T-10504; edita `navegacao.css`)
   - `apps/web/src/features/usuario/BarraInferiorDoCliente.tsx` com `rotulo="Navegação principal"`, `componenteDeLink={Link}` e `oculta={tecladoAberto}` (regra pura `tecladoAberto` sobre `visualViewport`).
   - Some a partir de 64rem.
   - Teste `barra-inferior-do-cliente.onp.test.tsx`.
6. **T-10506 Localização** (depois de T-10504)
   - Arquivos: `apps/web/src/features/usuario/LocalizacaoDoTopo.tsx`, `apps/web/src/features/usuario/local-do-aparelho.ts` e `apps/web/src/server/cidade-do-topo.ts`.
   - `BarraDoFeed` (mínimo): usa o módulo e não pede mais a localização sozinho ao abrir.
   - Textos (privacidade, cookies funcionais, data em `contato.ts`).
   - Em `/explorar`, trocar a localização faz `router.replace`.
   - Teste `localizacao-do-topo.onp.test.tsx`, cobrindo: rótulos; consentimento e a data dele; arredondamento; limpeza nos três Sair e pela marca `sc:aparelho:teve-conta` (abrir como visitante depois de excluir a conta ou de a sessão vencer apaga as duas chaves); nenhum `getCurrentPosition` ao montar; chaves exatas `{cidade, uf}`; 401 vira `null`.
7. **T-10507 Sacola no topo** (depois de T-10504)
   - Arquivos: `apps/web/src/features/usuario/SacolaDoTopo.tsx` e `apps/web/src/lib/contagem-da-sacola.ts`.
   - Mínimo do #110: `EVENTO_ABRIR_SACOLA` e o ouvinte no `CarrinhoFlutuante`, que também passa a usar a contagem compartilhada.
   - Teste `sacola-do-topo.onp.test.tsx`: anúncio "Sacola, N itens"; nenhum número no HTML do servidor; recuo para o carrinho.
8. **T-10508 Molduras e troca da lateral** (depois de T-10505 a T-10507)
   - `NavegacaoDaSessao` em `sessao.tsx`; as 3 molduras passam a usá-la.
   - `UsuarioNoMenu`: o Sair também limpa os dados locais.
   - `passos.ts`: alvos explícitos (`[data-navegacao="explorar"]`, sacola do topo, botão do menu da conta).
   - Teste `molduras-do-cliente.onp.test.tsx`: papel só da sessão; a `JanelaDeAcesso` continua montada; a lateral fora; regressão do tutorial.
9. **T-10509 Barras fixas** (depois de T-10508; edita `apps/web/src/features/usuario/navegacao.css` e `legal.css`; o seletor dos cookies passa de `nav[aria-label="Atalhos"]` para a classe estável `.sc-barra-inferior` do #104)
   - Topo `sticky`.
   - Reserva no fim da página com `--altura-da-barra-inferior` + `env(safe-area-inset-bottom)`.
   - `scroll-padding-block`.
   - Sobrescritas do D-7.
   - Abaixo de 64rem, a barra some com `.sc-sacola` e `.sc-produto__acao`.
   - Aviso flutuante e cookies acima da barra.
   - Teste `barras-fixas.onp.test.ts` (o que o CSS declara).
10. **T-10510 Rodapé** (depois de T-10509; edita `RodapeLegal.tsx`, já mexido na T-10503)
    - Visual novo.
    - Teste `rodape-do-cliente.onp.test.tsx`: cada link corresponde a um `page.tsx`; textos proibidos ausentes; some em `/tv`.
11. **T-10511 Referrer-Policy** (independente)
    - `headers()` no `next.config.ts`.
    - Teste `referrer-policy.onp.test.ts`.
12. **T-10512 e2e proposto ao #114** (depois de T-10509 e T-10510)
    - `e2e/specs/navegacao-do-cliente.onp.spec.ts`: larguras 344, 390, 768, 1024 e 1280; uma barra fixa por vez; cookies acima da barra; foco não encoberto; sacola mantida ao ir ao Explorar e voltar; cabeçalho `Referrer-Policy` em `/loja/x/pedido/<token>`.

## Mudanças mínimas em arquivos de outros cards (vão no card_report)

| Card | Arquivo | Mudança |
| --- | --- | --- |
| #106 | `BarraDoFeed.tsx` | Usa o módulo de localização; sem pedido automático ao abrir |
| #106 | `TelaDoFeed.tsx`, `Post.tsx`, `PostDeLoja.tsx`, `GavetaDeComentarios.tsx`, `BotaoFavoritar.tsx` | `comDestino` |
| #110 | `lib/carrinho-do-navegador.ts`, `CarrinhoFlutuante.tsx` | Evento e contagem compartilhada |
| sem dono | `features/auth/CodigoDeRecuperacaoForm.tsx` | Assinatura de `aoCriarSessao` |

Nenhuma edição em `feed.css`, `vitrine.css`, `produto.css`, `usuario.css` nem `app/layout.tsx`.

## Riscos e pendências declaradas

- **O contrato do #104 pode mudar.** Por isso a primeira leitura é `packages/ui/src/barra-inferior.tsx`. Se a peça não existir: `card_report paused` (dependency).
- **Tirar a lateral pode deslocar as barras grudadas.** Mitigação: o D-7 e uma conferência no navegador em 390 e 1280 px. O script `scripts/prints-do-recorte/loja-real-vs-previa.mjs:37` ainda esconde `.sc-usuario-lateral`; isso vai para o relatório.
- **Divergências que vão para o `card_report`:**
  - AC-10522 diverge da Q-10506: o rodapé enxuto não tem os links de área, que ficam no topo e na barra.
  - AC-10504, AC-10517, AC-10519, AC-10520 e AC-10521 só têm prova do que o CSS declara. A prova real é o e2e/simulador do #114.
- **Pendência jurídica:** o texto da política muda, mas `VERSAO_DOS_DOCUMENTOS_LEGAIS` e a versão de aceite do servidor não. Quem já aceitou os funcionais antes não tem a coordenada gravada (D-9).
- **Custo:** uma chamada de servidor a mais por moldura, só para o papel cliente.
- **Prévia `/loja/<slug>/previa`:** fica igual a hoje (a lateral já aparecia lá).

## Verificação

- **Por tarefa:** `pnpm exec vitest run --project web apps/web/tests/<arquivo>`.
- **Regressão:** `destino-seguro.test.ts`, `destino-pos-login.test.ts`, `lateral-do-usuario.test.tsx`, `janela-de-acesso.test.tsx`, `telas-de-acesso.test.tsx`, `legal.test.tsx`, `consentimento.test.ts`, `tutorial.test.tsx`, `carrinho-gaveta.test.tsx`, `feed-telas.test.tsx`, `fronteiras-projeto.test.ts`, `css-da-loja-sem-verde-fixo.test.ts` e `mapa-do-site.test.ts`.
- **Gate:** `pnpm typecheck`, `pnpm lint`, `pnpm test:unit` e `onp-spec audit` da feature.
- **Manual** (navegador do RM Code):
  - `/explorar`;
  - `/loja/<slug>/cardapio` com itens na sacola;
  - `/conta/pedidos` sem sessão → entrar → voltar à página;
  - larguras 390 e 1280, nos temas claro e escuro.
