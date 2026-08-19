# Tasks: Carrinho e Fechamento do Pedido

> feature: pedido-checkout

## T-500 — Carrinho que sobrevive ao recarregar [pendente]

- Refs: US-500, AC-500, AC-501, AC-502
- Arquivos: apps/web/src/features/carrinho/useCarrinho.ts, apps/web/src/features/carrinho/useCarrinho.test.ts, apps/web/src/features/carrinho/GavetaCarrinho.tsx, apps/web/src/features/carrinho/LinhaCarrinho.tsx, apps/api/src/modules/cart/carrinho.usecase.ts, apps/api/src/modules/cart/carrinho.usecase.test.ts
- Notas: carrinho de uma loja nunca se mistura com o de outra. Item que chega a zero sai. Carrinho vazio convida a voltar à vitrine.
- Esforço: alto

## T-501 — Conferência de preço e disponibilidade antes de fechar [pendente]

- Refs: US-500, AC-503, AC-504
- Arquivos: packages/core/src/pedido-total.ts, packages/core/src/pedido-total.test.ts, apps/api/src/modules/cart/conferir-preco.usecase.ts, apps/api/src/modules/cart/conferir-preco.usecase.test.ts, apps/web/src/features/checkout/AvisoDeMudanca.tsx
- Notas: o que mudou é mostrado item por item e exige confirmação. Valor enviado pelo cliente é descartado e a divergência registrada. Marcado com @principle:P-006.
- Esforço: alto

## T-502 — Entrega ou retirada, com endereço condicional [pendente]

- Refs: US-501, AC-505, AC-506, AC-508, AC-509
- Arquivos: apps/web/src/app/(loja)/l/[slug]/checkout/page.tsx, apps/web/src/features/checkout/FormularioCheckout.tsx, apps/web/src/features/checkout/CamposDeEndereco.tsx, apps/api/src/modules/orders/checkout.schema.ts
- Notas: endereço obrigatório só na entrega; na retirada mostra o endereço da loja. Loja que só faz retirada não oferece entrega. Cliente logado vem com dados preenchidos e editáveis.
- Esforço: alto

## T-503 — Taxa de entrega, mínimo e entrega grátis no resumo [concluida]

- Refs: US-501, AC-507, AC-906, AC-907, AC-908
- Arquivos: packages/core/src/taxa-entrega.ts, packages/core/src/taxa-entrega.test.ts, apps/web/src/features/checkout/ResumoDoPedido.tsx, apps/web/src/server/resumo-de-valores.ts, apps/web/tests/resumo-do-pedido.test.tsx, apps/web/package.json
- Notas: ordem de cálculo fixada e testada: itens, depois taxa, depois total. Taxa aparece em linha separada com o nome que o dono deu. Mínimo informa quanto falta.
- Esforço: medio

## T-504 — Chave PIX exibida e copiável [concluida]

- Refs: US-502, AC-510, AC-511, AC-512, AC-513
- Arquivos: apps/web/src/features/checkout/CaixaPix.tsx, apps/web/src/features/checkout/SeletorDePagamento.tsx, apps/api/src/modules/orders/pagamento.ts, apps/api/src/modules/orders/pagamento.test.ts, apps/web/tests/caixa-pix.test.tsx, apps/web/tests/seletor-de-pagamento.test.tsx, infra/tests/sem-cobranca.test.ts
- Notas: chave com nome do recebedor e confirmação visual de cópia. O pedido guarda a chave que valia no momento. Nenhuma etapa pede dado de cartão nem cobra de verdade. Troco informado quando o pagamento é em dinheiro.
- Esforço: medio

## T-505 — Criação do pedido com número por loja e sem duplicata [concluida]

- Refs: US-503, AC-514, AC-516, AC-517, AC-518
- Arquivos: apps/api/src/modules/orders/criar-pedido.usecase.ts, apps/api/src/modules/orders/numero-pedido.ts, apps/api/src/modules/orders/numero-pedido.test.ts, apps/api/tests/pedido-idempotente.test.ts, packages/database/migrations/0008_pedidos.sql, packages/database/migrations/0009_checkout_do_cliente.sql, packages/database/migrations/0010_busca_por_chave_de_fechamento.sql, packages/database/migrations/0011_indices_cobrem_a_busca_do_fechamento.sql, packages/database/guards/g5_indice_cobre_politica.sql, infra/tests/pre-deploy.int.test.ts, apps/api/src/core/contexto.ts, apps/api/src/core/db.ts
- Notas: o caso de uso não tem teste de unidade próprio — ele é indivisível do banco (numeração atômica, índice único parcial, políticas de isolamento), e a prova inteira mora em `pedido-idempotente.test.ts`. Número sequencial por loja com incremento atômico. Envio repetido devolve o mesmo pedido em vez de criar outro. Loja fechada não aceita e preserva o carrinho. Convidado fecha pedido sem conta e recebe o link.
- Esforço: max

## T-506 — Pedido é cópia congelada do momento da compra [concluida]

- Refs: US-503, AC-515
- Arquivos: apps/api/src/modules/orders/snapshot.ts, apps/api/src/modules/orders/snapshot.test.ts, apps/api/tests/pedido-imutavel.test.ts
- Notas: nome, preço e opções copiados como texto e número; referência ao produto existe mas nunca é usada para ler preço. Imutabilidade imposta pelo banco, não por convenção. Marcado com @principle:P-010.
- Esforço: alto

## T-507 — Gerador do texto do pedido para WhatsApp [concluida]

- Refs: US-504, AC-519, AC-521, AC-522
- Arquivos: packages/core/package.json, packages/core/tsconfig.json, packages/core/src/index.ts, packages/core/src/cupom-texto.ts, packages/core/src/cupom-texto.test.ts, packages/core/src/cupom-texto.test.ts.snap
- Notas: função pura testada por comparação com texto esperado. Acento e emoji íntegros, quebras de linha preservadas. Texto longo é encurtado de forma controlada, com o link de acompanhamento levando ao detalhe completo.
- Esforço: alto

## T-508 — Abertura do WhatsApp com o texto pronto [pendente]

- Refs: US-504, AC-520, AC-523
- Arquivos: apps/web/src/features/checkout/EnvioWhatsApp.tsx, apps/web/src/features/checkout/EnvioWhatsApp.test.ts, apps/web/src/lib/whatsapp.ts, apps/web/src/lib/whatsapp.test.ts
- Notas: o cliente envia para o número da loja. A abertura precisa acontecer no mesmo gesto do usuário, senão o navegador bloqueia. Se falhar ou o cliente fechar antes, o pedido continua registrado e há caminho para reenviar, mais alternativa de copiar o texto.
- Esforço: alto

## T-509 — Número de WhatsApp normalizado [concluida]

- Refs: US-504, AC-913
- Arquivos: packages/core/src/telefone.ts, packages/core/src/telefone.test.ts, packages/core/src/index.ts
- Notas: normaliza máscara, espaços e ausência de código do país, e recusa número impossível — número errado gera link silenciosamente inútil.
- Esforço: baixo

## T-510 — Teste de ponta a ponta do fechamento [pendente]

- Refs: US-500, US-503, US-504, AC-500, AC-514, AC-520
- Arquivos: e2e/specs/carrinho.spec.ts, e2e/specs/checkout.spec.ts, e2e/fixtures/intercepts.ts
- Notas: a chamada ao WhatsApp é interceptada no teste, para validar o texto gerado sem depender de rede externa.
- Esforço: medio
