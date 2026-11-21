# Campos explicados — índice

Pedido do dono: todo campo que não se explica sozinho ganha um "i" com
explicação bem escrita, e nem o "i" nem o balão podem ficar por cima de
campos, botões ou textos.

- **Regra de uso e de escrita:** `apps/web/AGENTS.md`, seção "Campos explicados".
- **Componente:** `Info` e a prop `info` do `Campo`, em `@simpleclick/ui`
  (`packages/ui/src/info.tsx`, posição do balão em `info-posicao.ts`,
  estilo em `styles/info.css`). Vitrine com todos os casos: `/ui`, seção
  "Info (campo explicado)". Card #66.
- **Conferência na tela:** `node scripts/campos-explicados/conferir.mjs
[site] [filtro]` (Playwright headless, 1400×900 e 390×844). Abre cada "i",
  confere linha do rótulo, sobreposição, corte por rolagem/modal e Esc, e
  lista campos sem rótulo visível. Saída em `/tmp/sc72/`. Card #72.

## Inventários por área

Cada inventário tem, por tela, a tabela campo → rótulo antes/depois → texto
do "i" (✅) ou "rótulo basta" (—). Os números são as linhas das tabelas.

| Área                                                                                                                              | Inventário                                 | Card | Textos do "i" (fonte única)                                                     | Com "i" | Rótulo basta |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ---- | ------------------------------------------------------------------------------- | ------: | -----------: |
| Catálogo do painel: produto, atacado, preços nomeados, fotos e vídeos, opções, variações, estoque, categorias, especificações     | [catalogo.md](catalogo.md)                 | #67  | `apps/web/src/features/painel-catalogo/explicacoes.ts`                          |      37 |           34 |
| Configurações (horário, entrega, pagamento, contato, impressão), aparência, equipe, feed, stories, comentários, início e métricas | [painel-config.md](painel-config.md)       | #68  | `apps/web/src/features/config/explicacoes-do-painel.ts`                         |      52 |           18 |
| Pedidos (quadro, pedido aberto, pedido manual) e clientes (lista, cadastro, ficha, importador)                                    | [pedidos-clientes.md](pedidos-clientes.md) | #69  | no próprio componente (`features/painel-pedidos/`, `features/painel-clientes/`) |      24 |           36 |
| Loja pública, produto, carrinho, checkout, acompanhamento, entrar/criar conta, criar loja, loja em análise, minha conta, explorar | [loja-conta.md](loja-conta.md)             | #70  | `apps/web/src/features/loja/explicacoes-para-clientes.ts`                       |       8 |           79 |
| Administração: dashboard, lojas (lista, nova, ficha e abas), pessoas (lista, cadastro, ficha), auditoria                          | [admin.md](admin.md)                       | #71  | `apps/web/src/features/admin/explicacoes.ts`                                    |      37 |           52 |
| **Total**                                                                                                                         |                                            |      |                                                                                 | **158** |      **219** |

Prints da conferência de cada card: `prints/painel-config/` (#68) e, fora do
repositório, `/tmp/sc67`, `/tmp/sc71` e `/tmp/sc72`.

## Lacunas registradas (não existem na API; nada foi inventado na tela)

- **Frações / meio a meio** e **peso da variação** — [catalogo.md](catalogo.md#o-que-não-existe-no-painel-fica-registrado).
- **Raio de entrega / bairros** e **número de vias do cupom** — [painel-config.md](painel-config.md).

## Enums em inglês que foram traduzidos

- Auditoria: papéis (`OWNER` → "dono da loja"…), 18 tipos de ato e nomes de
  campo crus (`foraDoLimite`…) — [admin.md](admin.md).
- Pedidos e clientes: forma de pagamento, tipo de entrega, situação —
  [pedidos-clientes.md](pedidos-clientes.md#enums-que-vazavam-em-inglês-corrigidos).
- Loja e conta: pagamento, entrega e situação do pedido passam por tabelas de
  tradução — [loja-conta.md](loja-conta.md).

## Revisão final (card #72, 18/10/2026)

- **Typecheck, lint e testes do monorepo:** passam (`pnpm typecheck`,
  `pnpm lint`, `pnpm test:unit`; site: 145 arquivos, 1301 testes).
- **Telas na tela de verdade:** 54 telas (sem conta, cliente, dono e admin),
  em 1400 px e 390 px, mais a janela do pedido no quadro e o produto com
  atacado na loja: **259 "i" abertos, nenhum problema**. Em todos, o ícone
  fica na linha do rótulo, não cobre controle, botão nem texto, o balão fica
  inteiro na tela (inclusive dentro de janela) e o Esc fecha só o balão,
  devolvendo o foco ao "i".
- **Corrigido aqui:** no editor de opções, a 390 px, o "i" de "Já vem marcada
  para o cliente" e de "Usar este grupo como eixo da grade de variações"
  caía sozinho na linha de baixo. `RotuloComInfo` do catálogo deixou de usar
  `flex-wrap`: o texto quebra dentro do rótulo e o "i" fica ao lado.
- **Busca no código** (`apps/web/src`): nenhum `<option>` com código em
  inglês, nenhum enum renderizado cru e nenhum campo numérico que nasce com
  `0` sem explicação. O único `0` visível é "Mínimo de escolhas" das opções,
  que tem rótulo, "i" e a frase "0 = opcional." embaixo.
- **Fica como está (decisão do #66):** com o balão aberto, ele abre para
  cima e cobre o campo de cima enquanto estiver aberto. Isso protege o campo
  que a pessoa está preenchendo; fecha com Esc, clique fora ou rolagem.
- **Repetição a observar:** há dois `RotuloComInfo` (em `features/config/` e
  em `features/painel-catalogo/`) com a mesma ideia. O de config ainda usa
  `flex-wrap`; não deu problema nas telas de hoje, mas um rótulo longo no
  celular pode repetir o caso acima.
- **Não conferido por este script** (ficou com a conferência do card da
  área): janelas que só abrem com dados na hora, como o carrinho com itens,
  o checkout e a segunda etapa de criar loja (#70).
