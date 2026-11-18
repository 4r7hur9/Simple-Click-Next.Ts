# Plano — #110 Stitch · Sacola e fechamento (retomada, revisado)

## Contexto
T-11001…T-11009. Já feito na árvore (não commitada): ColunaDaSacola (montada por portal em `[data-regiao-da-sacola]` no CarrinhoFlutuante), BarraDaSacola, listener de `sc:abrir-sacola` no CarrinhoFlutuante, fechamento.css, testes sacola-linha/lateral/barra/estilos e fechamento-*.

## Falta
1. T-11003: `tests/sacola-abrir.onp.test.tsx` (CA-6, CA-29): coluna visível → foco no título; barra → abre `<dialog>`; vazia → anuncia sem mover foco; outro `dialog[open]` → ignora; `detail.atendido`; `prepararFechamento` 0 chamadas; destino nunca do `detail`. Corrigir a corrida (contagem 0 antes da primeira leitura: abrir diálogo ou não marcar `atendido`) e o ramo sem `showModal` (ir a `/loja/<apelido>/carrinho`). Sem tocar em TelaDoCatalogo.tsx (portal já cobre).
2. T-11008: `tests/sacola-privacidade.onp.test.tsx` (CA-23/25/26/27): renderToString da TelaDoCatalogo com região vazia; fetch com `no-store`; varredura do DOM nos dois passos por cupom/desconto/parcel/previs/compra segura; console sem dados pessoais; `prepararFechamento` não chamado ao montar.
3. T-11009 dividida: (a) migrar para fechamento.css as regras `.sc-carrinho-janela*` usadas por GavetaCarrinho, LinhaCarrinho, ColunaDaSacola, PassoDoFechamento, FechamentoDaCompra, CarrinhoFlutuante; conferir páginas que só importam vitrine.css e `.sc-flutuante__gaveta` (fica/migra); (b) apagar de vitrine.css a lista exata (vitrine.css:1433-1546, `.sc-sacola`, `.sc-sacola__*`, sem curinga) — BLOQUEADA até o gerente incluir o #110 na fila; avisar donos de legal.css e tutorial/passos.ts.
4. Decidir `SacolaFlutuante`/posicao-da-sacola (Q-11003) antes de (b).

## Verificação
Gate do config: pnpm typecheck, lint, test:unit, test:int, test:e2e, build; e2e da coluna ≥1280px e barra no celular.

## Rollback
Alterações não commitadas e aditivas; reverter por arquivo (`git checkout`/remoção dos novos). CSS antigo só sai em (b), reversível por git.
