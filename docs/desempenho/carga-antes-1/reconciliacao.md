# Reconciliação — carga (rodada 68fd2f93)

**Resultado: APROVADA** — 101789 pedidos na base = 101000 iniciais + 789 novos.

| | verificação | resultado |
|---|---|---|
| ✔ | os 101000 pedidos iniciais continuam idênticos aos da linha de base | impressão 33510c401400… igual |
| ✔ | as 100 lojas continuam com exatamente 10 pedidos do seed | 100 lojas, 0 fora de 10 |
| ✔ | nenhuma chave de compra gerou mais de um pedido | 789 chaves, todas com 1 pedido |
| ✔ | pedidos novos no banco = compras confirmadas pelo k6 (replay soma zero) | banco 789; k6 criou 589, recuperou 0, preparo 200, incertas 0 (faixa 789–789); replays corretos 589, somando zero |
| ✔ | 101000 iniciais + 789 novas = 101789 pedidos na base | a base tem 101789 |
| ✔ | total, subtotal e linhas de todo pedido novo fecham em centavos | 0 total(is) e 0 linha(s) que não fecham, em 789 pedido(s) |
| ✔ | nenhum pedido ligado a cliente de outra loja e nenhum item de outra loja | 0 pedido(s), 0 item(ns) |
| ✔ | observação (não reprova): itens com acréscimo de opção cujas linhas de opção gravaram preço 0 | 0 item(ns): a API guarda o acréscimo só em options_total_cents |

## Classes encontradas no banco

- duplicidade (mais de um pedido por chave): **0**
- defeito conhecido AC-516 (500 com o pedido gravado, uma vez): **0**
- falha de infraestrutura (500 sem pedido gravado): **0**
- tempo esgotado na criação, aceito dentro da faixa: **0**
