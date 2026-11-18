# Plano #112 — Stitch · Painel do lojista (visual proposto)

## Context
O painel (`/painel/*`) não tem tela no Stitch. O usuário aprovou estender a linguagem da base visual (#104) a ele, sem mudar funções, rotas, permissões nem contratos de API. Spec: `.spec/features/stitch-painel-lojista/` (T-11201…T-11212). Decisões do board: Plus Jakarta Sans global; painel claro E escuro (menu continua grafite); "A decidir" ocultos; Q-11201 aprovada; ordem numérica; arquivos sem dono tratados como deste card.

## Hipóteses (sem perguntar)
- Q-11207 (Configurar nos avisos p/ equipe), Q-11209 (busca na URL), Q-11210 (máscara), Q-11211 (cookie da prévia), PT5 (Dialogo): **comportamento atual mantido**; só visual.
- Peça/token que faltar na base visual: pedir ao gerente e parar (não editar #104).
- `stories.css` é fila após o #106 (em revisão): `board_message` ao #106 antes de editar; só bloco novo no fim.
- `.sc-pedidos*`/`.sc-filtros*` do `conta.css` são da conta: não editar `conta.css`; classes novas do painel com prefixo próprio (`.sc-painel-*`), sem alterar seletores compartilhados.

## Abordagem
Reaplicar tokens/peças existentes (`Chip`/`FaixaDeChips`, `Gaveta` (.sc-gaveta-modal), `Abas`, `AvisoFlutuante`, `Botao marcado/cta`, `Campo busca`, `sairDaConta`) às telas atuais. Tailwind com variáveis `var(--cor-*)` já usadas em `estilo-do-menu.ts`; trocar cor literal por token. Nenhum arquivo de `packages/ui/src` é editado.

## Tarefas (sequenciais, uma por vez; testes `*.onp.test.tsx` com "[CA-n] @spec:AC-112xx")
1. **T-11201 Moldura/menu/avisos/sem permissão** — `features/painel/*` (MenuLateral, estilo-do-menu, SecaoDoMenu…), `config/AvisoDeSuspensao|AvisosPendentes`, `_painel/GuardaDoPainel`, `(painel)/painel/layout.tsx`. Manter `data-tema="escuro"` (AC-11250); menu da administração sem regressão (AC-11211; `MenuDaAdministracao` só consome). Testes: tabela papel→itens fixa, `permissaoDoCaminho`, contador sem permissão não busca.
2. **T-11202 Filtros/chips/gaveta/paginação** — `BarraDeFiltros.tsx`: trocar `Chip` e `Gaveta` locais por `Chip`/`Gaveta` do UI; `lista-paginada.tsx`; `filtros.css` remove `.sc-filtros__chip`/`.sc-gaveta` próprios (após conferir uso por admin e conta via grep). Contrato `useConsultaNaUrl`/`Paginacao` intacto.
3. **T-11203 Catálogo** — painel-catalogo/estoque/variacoes/opcoes: tokens, cartões no celular, mesmas paginações.
4. **T-11204 Clientes** — lista/ficha/importação + classes de cliente em `pedidos.css` (só bloco do painel).
5. **T-11205 Pedidos** — quadro, detalhe, som, impressão (`FolhaDoCupom` sem tema), `pedidos.css`/`quadro.css`; etapa em texto além de cor; cores literais das etapas viram tokens ou exceção registrada em nota (não editar `.spec/`).
6. **T-11206 Aparência/prévia** — config/Formulario Aparencia, PreviaDaLojaReal, SeletorDeCor, `seletor-de-cor.css`; cor da loja só na prévia; não tocar rota de prévia/`server/previa.ts`.
7. **T-11207 Configurações** — `MolduraDaConfiguracao`, formulários; `Abas` onde for alternância na mesma página.
8. **T-11208 Métricas/início** — dashboard/*: valor+variação em texto com seta, resumo textual dos gráficos.
9. **T-11209 Equipe/escolha de loja** — senhas mantêm tipo/autocomplete; confirmações como hoje.
10. **T-11210 Cadastro dono/aprovação/tutorial** — `cadastro.css`; `passos.ts` troca seletor por `data-tutorial` próprio no menu (T-11201 adiciona o atributo); `/cadastrar` fora.
11. **T-11211 Feed/stories/comentários** — `stories.css` (bloco no fim), mantém `podeTrocarFoto`/`podeConfigurar`.
12. **T-11212 Consistência** — teste que varre `.tsx` do painel por cor literal (exceto SeletorDeCor), `#b2f800`, recurso externo, dados do Stitch.
Moldura da administração (T-11302): atender pedido do #113 após T-11201 verde.

## Correções da revisão (incorporadas)
- `.sc-pedidos`, `.sc-pedidos__topo`, `.sc-filtros`, `.sc-filtros__chips` existem também em `conta.css` (global): T-11202/04/05 NÃO alteram esses seletores; renomeiam só do lado do painel (TSX+CSS) e há teste [CA] de que `/conta/pedidos` não muda.
- T-11202: a `Gaveta` do UI exige `id`, fica sempre no DOM e não some ≥48rem: passar `id` e `rotuloDoFechar="Fechar os filtros"`, fechar via `matchMedia("(min-width: 48rem)")`, uma só gaveta montada; testes de foco, Esc e alargar. Invólucro `.sc-filtros__chips` → `FaixaDeChips` (rola em vez de quebrar linha, intencional). `.sc-filtros__chip`/`.sc-gaveta` só são usados pelo painel; manter `gaveta-e-aviso.onp.test.tsx`.
- T-11201: `PropsDoMenuLateral` não muda de assinatura; [CA] com snapshot de seções/`href` de `secoesDaAdministracao` e render do `MenuLateral` com `itens`; `menu-lateral.test.tsx` e `admin-gestao.test.tsx` rodam. Atributo fixo `data-tutorial="menu-do-painel"` só no `MenuDoPainel`, com teste; T-11210 usa-o e atualiza `tutorial.test.tsx`. `MenuDoPainel.tsx`, `usePedidosNovos.ts`, `lib/permissoes.ts` entram para teste (contador de pedidos e de comentários pendentes sem permissão não busca). Quem edita `MenuLateral` depois (#113/T-11302): pedido ao #112.
- Consumidores da conta: `GraficoDeBarras`/`VariacaoEmSeta` (usados em `conta/VisaoGeralDaConta.tsx`), `CartaoDaLoja`/`FormularioOutraLoja` (`escolher-loja`), `cadastro.css` (`/cadastrar`): só classes novas, mudanças compatíveis; rodar os testes deles.
- T-11212 varre também os CSS do painel (`pedidos.css`, `filtros.css`, `quadro.css`, `cadastro.css`, `stories.css`, `seletor-de-cor.css`) com exceções explícitas (cupom).
- `packages/ui/src`, `componentes.css` e `theme.css` (#104) não são editados; comentário desatualizado em `gaveta.tsx`/`componentes.css` fica anotado para o #104.

- T-11210/tutorial: `MENU_DO_PAINEL` é lista de dois alvos; troca só o seletor do `aside` por `[data-tutorial="menu-do-painel"]` e mantém `nav[aria-label="Atalhos"]` (celular); teste [CA] nos dois tamanhos; atualizar o comentário de `passos.ts:11-12` (agora há marcação, justificada por AC-11237).

## Riscos
- `pedidos.css`/`filtros.css` compartilhados com conta/admin → grep de uso antes de remover; rodar testes da conta e da admin.
- Cor de etapa sem token → pedir à base visual.
- Teste legado checando classes/`data-tema` → ajustar só testes do painel.

## Verificação
Por tarefa: `pnpm --filter web test` (arquivos do painel + conta + admin), typecheck, lint; ao fim gate completo (comandos de `.workflow-ia/config.json`). Conferir visualmente 344/768/1280px, claro e escuro, no navegador. Sem commit/push.
