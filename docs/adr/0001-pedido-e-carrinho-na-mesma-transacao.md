# ADR 0001 — O pedido é criado e o carrinho é convertido na mesma transação

- **Estado:** aceita (já é o comportamento do código; este registro explica o porquê)
- **Contexto de código:** `apps/api/src/modules/orders/pedidos.routes.ts:326-460`, `apps/api/src/modules/orders/pedido-fechado.usecase.ts`, migrações `0008_pedidos.sql` (unicidade da chave) e `0043` (`app.converter_carrinho`)

## Contexto

Fechar o pedido faz três coisas no banco: **cria o pedido** (com os itens e os valores recalculados no servidor), **baixa o estoque** e **retira o carrinho de cena**, marcando-o como convertido. Em rede móvel ruim, a resposta pode se perder depois de a compra já estar gravada, e a tela repete o envio. O cliente também pode tocar duas vezes no botão.

## Decisão

Essas três escritas acontecem **em uma única transação do PostgreSQL**, dentro de `acesso.emTransacao(...)` (`pedidos.routes.ts:326`):

1. procura pedido já criado com a mesma `chaveDeIdempotencia` na loja (`pedidoDaChaveDeFechamento`, linha 330). Se existe, devolve-o e não escreve nada;
2. lê o carrinho, confere contra o catálogo e calcula os valores (`conferirCarrinho` e `calcularValores`, linhas 336-350);
3. grava o pedido (`criarPedido`, linha 385), baixa o estoque (`reservarEstoque`, linha 429) e converte o carrinho (`converterCarrinhoNoPedido`, linha 438);
4. se a conversão devolve `false` (o carrinho já virou pedido numa corrida), a rota lança `conflito` e **a transação inteira é desfeita**, inclusive o pedido recém-criado (linhas 442-448).

A resposta de um reenvio sai do **pedido guardado**, não do carrinho (`respostaDoPedidoGuardado`, linhas 463-473).

## Por que não converter o carrinho depois

Converter em outra transação (ou em uma tarefa posterior) deixa uma janela em que o pedido existe e o carrinho ainda aparece ativo:

| Falha | Converter depois | Mesma transação |
|---|---|---|
| Servidor cai entre criar o pedido e converter o carrinho | Pedido gravado, carrinho intacto. O cliente volta ao fechamento com os mesmos itens e, com chave nova, cria um **segundo pedido igual**. A cozinha prepara duas vezes | Tudo ou nada: ou há pedido **e** carrinho convertido, ou nenhum dos dois |
| Dois fechamentos do mesmo carrinho ao mesmo tempo | Os dois criam pedido; só depois um percebe | A conversão é condicional; quem perde recebe falso, a rota desfaz a transação e o pedido duplicado **não chega a existir** |
| Reparar o inconsistente | Exige varredura de pedidos sem carrinho convertido, com regra de qual vale | Não há estado inconsistente a reparar |

O custo da decisão: a transação fica um pouco mais longa (cálculo, pedido, estoque, conversão). É aceitável porque é curta e só toca linhas da própria loja.

## O que acontece se a compra é gravada e a conexão cai antes da resposta

1. O servidor confirma a transação: pedido gravado, estoque baixado, carrinho convertido. A resposta 201 se perde.
2. A tela repete o envio com a **mesma chave** (a tela gera uma por tentativa de fechar, `chaveDeIdempotencia`, obrigatória, 8 a 64 caracteres: `packages/contracts/src/carrinho.ts:326`).
3. O servidor acha o pedido pela chave **antes** de ler o carrinho, porque o carrinho já foi convertido e releitura daria carrinho vazio (comentário em `pedidos.routes.ts:327-329`). Devolve **HTTP 200** com o **mesmo pedido** (`id`, `numero`, `tokenPublico`), `jaExistia: true` e valores e mensagem tirados do pedido guardado.
4. Nada é gravado de novo: sem segundo pedido, sem segunda baixa de estoque, sem gastar número da sequência da loja.

Se a queda acontece **antes** do commit, nada foi gravado, e o reenvio com a mesma chave cria o pedido normalmente (201).

O banco reforça: índice único `(store_id, idempotency_key) WHERE idempotency_key IS NOT NULL` (`0008_pedidos.sql:178`). A chave vale **por loja**.

## Testes que protegem a decisão

- `apps/api/tests/carrinho-convertido.int.test.ts` (integração, PostgreSQL):
  - *o carrinho que virou pedido sai de cena (AC-524)*: após o 201, o carrinho está marcado como convertido, a mesma sessão vê carrinho vazio e um segundo fechamento (chave nova) não cria outro pedido;
  - *carrinho de outra sessão, de outra loja ou já convertido não é convertido*: a segunda conversão perde, que é o que desfaz a corrida;
  - *a mesma chave depois da conversão (AC-516)*: 200, mesmo `id`, `numero` e `tokenPublico`, `jaExistia: true`, valores e mensagem do pedido guardado.
- `apps/api/tests/pedido-idempotente.test.ts`: mesma chave devolve o mesmo pedido e a contagem fica em 1; a segunda tentativa não gasta número da sequência; pedidos sem chave seguem distintos; a mesma chave em outra loja cria pedido.

**Lacuna conhecida:** nenhum teste derruba a conexão literalmente entre o commit e a resposta. A propriedade é provada pelo reenvio da mesma chave depois de um 201 já concluído, que é o estado em que a queda deixaria o banco. O desfazer em caso de conversão falsa (item 4) é coberto pela prova de conversão que perde, não por um teste que force falha no meio da transação.

## Consequências

- Quem mexer em `pedidos.routes.ts` deve manter criar pedido, baixar estoque e converter carrinho **dentro do mesmo `emTransacao`**. Mover a conversão para fora quebra os testes acima.
- A busca por chave vem **antes** da leitura do carrinho. Inverter a ordem devolve "carrinho vazio" ao reenvio.
- Quem calcula o preço é o servidor (`packages/core/src/pedido-total.ts`, `taxa-entrega.ts`). O total que a tela mostra serve só para registrar divergência; o subtotal visto que não bate com o recalculado dá 409 `preco_divergente` (linhas 373-382).
