# Estruturação do SimpleClick — índice das etapas

Documentos da seção de estruturação do plano (`Simple_Click_Plano_de_Estruturacao.md`). Cada etapa tem um card do Board
e um registro próprio. Revisão de referência: `69cf095`.

| Etapa | Documento | Card | Estado |
|---|---|---|---|
| 1. Inventário e primeira execução | [01-inventario.md](01-inventario.md) | #127 | ✅ rodado (com falhas, L-01 a L-14) |
| 2. Arquitetura: C4, ADR do pedido e OpenAPI | [../arquitetura/c4.md](../arquitetura/c4.md), [../adr/0001-pedido-e-carrinho-na-mesma-transacao.md](../adr/0001-pedido-e-carrinho-na-mesma-transacao.md), [../arquitetura/openapi-pedidos.yaml](../arquitetura/openapi-pedidos.yaml) | #128 | ⚠️ documentos prontos; testes só lidos |
| 3. Testes e critérios de aceite do checkout | [03-testes-checkout.md](03-testes-checkout.md) | #129 | ❌ defeito F-01 confirmado (correção na #134) |
| 4. Seed de simulação: 100 lojas e 1.000 pedidos | `04-simulacao.md` (ainda não existe) | #130, #135 | **a verificar** |
| 5. Desempenho: smoke, carga e estresse | `05-desempenho.md` (ainda não existe) | #131 | **a verificar** |
| 6. Operação, observabilidade e uso de IA | [06-operacao.md](06-operacao.md) | #132 | ✅ parcial (latência e diagnóstico a verificar) |
| 7. Controle da entrega e checklist acadêmico | [07-controle.md](07-controle.md) | #133 | ✅ consolidado; checklist com 2 itens marcados |

## Como ler

- O registro por etapa (responsável, revisão, ambiente, comando, resultado, evidência e pendência) está em
  [07-controle.md](07-controle.md), seção 1.
- Falhas com causa conhecida e menor caso que reproduz: [07-controle.md](07-controle.md), seção 2.
- Teste de ambiente seguindo o README do zero: [07-controle.md](07-controle.md), seção 3. Parou no `setup.sh`.

## Ordem para fechar o que falta

1. Teste de ambiente (seção 3 do 07) em máquina sem o stack, ou depois que a #135 terminar.
2. Correção F-01 (#134) e troca de `it.fails` por `it` em `checkout-aceite.int.test.ts`.
3. Relatórios de #135 (seed) e #131 (k6), que criam `04-simulacao.md` e `05-desempenho.md`.
4. Entrega acadêmica (seção 5 do 07): campos em branco, a preencher pela equipe.
