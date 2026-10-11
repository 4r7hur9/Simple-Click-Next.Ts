# Tasks: Carrinho e Fechamento do Pedido

> feature: pedido-checkout

## T-500 — Carrinho que sobrevive ao recarregar [concluida]

- Refs: US-500, AC-500, AC-501, AC-502
- Arquivos: apps/web/src/features/carrinho/useCarrinho.ts, apps/web/src/features/carrinho/useCarrinho.test.tsx, apps/web/src/features/carrinho/GavetaCarrinho.tsx, apps/web/src/features/carrinho/LinhaCarrinho.tsx, apps/web/tests/carrinho-gaveta.test.tsx, apps/api/src/modules/cart/carrinho.usecase.ts, apps/api/tests/carrinho.int.test.ts, packages/database/migrations/0012_carrinho_do_visitante.sql, packages/database/migrations/0013_indice_do_carrinho_cobre_a_sessao.sql, apps/api/src/core/contexto.ts, apps/api/src/core/db.ts
- Notas: o caso de uso não tem teste de unidade próprio — carrinho é indivisível do banco (persistência entre requisições e isolamento por sessão são políticas, não código), e a prova mora em `carrinho.int.test.ts`. Carrinho de uma loja nunca se mistura com o de outra. Item que chega a zero sai. Carrinho vazio convida a voltar à vitrine.
- Esforço: alto

## T-501 — Conferência de preço e disponibilidade antes de fechar [concluida]

- Refs: US-500, AC-503, AC-504
- Arquivos: packages/core/src/pedido-total.ts, packages/core/src/pedido-total.test.ts, packages/core/src/index.ts, apps/api/src/modules/cart/conferir-preco.usecase.ts, apps/api/tests/conferir-preco.int.test.ts, apps/web/src/features/checkout/AvisoDeMudanca.tsx, apps/web/tests/aviso-de-mudanca.test.tsx
- Notas: o caso de uso não tem teste de unidade próprio — ele existe para LER o catálogo, e um catálogo simulado provaria só que o código chama o que mandei chamar; a prova mora em `conferir-preco.int.test.ts`. O que mudou é mostrado item por item e exige confirmação. Valor enviado pelo cliente é descartado e a divergência registrada. Marcado com @principle:P-006.
- Esforço: alto

## T-502 — Entrega ou retirada, com endereço condicional [concluida]

- Refs: US-501, AC-505, AC-506, AC-508, AC-509
- Arquivos: apps/web/src/features/checkout/FormularioCheckout.tsx, apps/web/src/features/checkout/CamposDeEndereco.tsx, apps/web/tests/formulario-checkout.test.tsx, apps/api/src/modules/orders/checkout.schema.ts, apps/api/src/modules/orders/checkout.schema.test.ts
- Notas: a PÁGINA `app/(loja)/l/[slug]/checkout/page.tsx` saiu desta lista e entra junto com as rotas HTTP, que vêm da vitrine (T-400, T-401). O site não pode falar com o banco direto — a tabela de fronteiras não autoriza —, então uma página escrita agora não teria de onde carregar a configuração da loja e seria uma casca. Os quatro critérios desta tarefa são de comportamento do formulário e da borda, e estão provados sem ela. Endereço obrigatório só na entrega; na retirada mostra o endereço da loja. Loja que só faz retirada não oferece entrega. Cliente logado vem com dados preenchidos e editáveis.
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
- Arquivos: packages/core/package.json, packages/core/tsconfig.json, packages/core/src/index.ts, packages/core/src/cupom-texto.ts, packages/core/src/cupom-texto.test.ts, packages/core/src/cupom-texto.test.ts.snap, packages/core/src/cupom-texto-blocos.ts, packages/core/src/cupom-texto-formato.ts, packages/core/src/pedido-descrito.ts
- Notas: função pura testada por comparação com texto esperado. Acento e emoji íntegros, quebras de linha preservadas. Texto longo é encurtado de forma controlada, com o link de acompanhamento levando ao detalhe completo.
- Esforço: alto

## T-508 — Abertura do WhatsApp com o texto pronto [concluida]

- Refs: US-504, AC-520, AC-523
- Arquivos: apps/web/src/features/checkout/EnvioWhatsApp.tsx, apps/web/tests/envio-whatsapp.test.tsx, apps/web/src/lib/whatsapp.ts, apps/web/src/lib/whatsapp.test.ts, packages/database/migrations/0020_pedido_le_o_whatsapp_da_loja.sql, apps/api/src/modules/storefront/fechamento.usecase.ts, apps/api/src/modules/orders/pedidos.routes.ts, apps/api/src/app.ts, apps/api/tests/carrinho-rota.int.test.ts, packages/contracts/src/carrinho.ts, apps/web/src/lib/carrinho-do-navegador.ts, apps/web/src/features/checkout/FechamentoDaCompra.tsx, apps/web/tests/fechamento-pagina.test.tsx
- Notas: o cliente envia para o número da loja. A abertura precisa acontecer no mesmo gesto do usuário, senão o navegador bloqueia. Se falhar ou o cliente fechar antes, o pedido continua registrado e há caminho para reenviar, mais alternativa de copiar o texto.
- Notas: **LIGADA AO FLUXO EM 26/08.** O componente existia desde 19/08 e não tinha de onde vir a mensagem. Agora ela é montada NA API, ao criar o pedido, e volta na resposta — texto e endereço prontos.
- Notas: **O NÚMERO DA LOJA NÃO É CAMPO DE RESPOSTA**, e essa foi a decisão que mais pesou. Na carga de exemplo, o número da loja e o celular do dono são O MESMO — e é realista: no pequeno negócio, o dono É o WhatsApp da loja. Publicá-lo como campo seria publicar o celular pessoal dele para qualquer pessoa que abrisse a vitrine, e para todo robô que varresse a plataforma. Ele vai EMBUTIDO no endereço da conversa, e o endereço só volta para quem acabou de criar um pedido — mesmo desenho da chave PIX (migração 0019), pelo mesmo motivo. Há prova de que a resposta tem só três campos: `endereco`, `texto` e `completo`.
- Notas: a leitura do número mora em função própria (`app.store_whatsapp()`, migração 0020), separada da configuração de fechamento. Uma função que devolve UMA coluna e é chamada por UMA rota torna difícil o acidente de serializá-la junto de outra coisa.
- Notas: o texto é montado no SERVIDOR porque só ele tem o pedido inteiro — nomes das escolhas, taxa com o nome que o dono deu, forma de pagamento. E porque montá-lo lá é o que mantém o número fora da tela.
- Notas: número impossível devolve nulo em vez de link. Link com número errado abre uma conversa vazia, a pessoa acha que enviou, e o dono nunca recebe.
- Notas: **loja sem WhatsApp NÃO perde o pedido** (AC-523). Ele existe, tem número e está na fila do dono; a tela mostra o código e explica que a loja não cadastrou WhatsApp. Nulo é mais honesto que um endereço que não abre nada.
- Esforço: alto

## T-509 — Número de WhatsApp normalizado [concluida]

- Refs: US-504, AC-913
- Arquivos: packages/core/src/telefone.ts, packages/core/src/telefone.test.ts, packages/core/src/index.ts
- Notas: normaliza máscara, espaços e ausência de código do país, e recusa número impossível — número errado gera link silenciosamente inútil.
- Esforço: baixo

## T-511 — Rotas HTTP do carrinho [concluida]

- Refs: US-500, AC-411, AC-500, AC-501, AC-502
- Arquivos: packages/contracts/src/carrinho.ts, packages/contracts/src/rotas.ts, packages/contracts/src/index.ts, packages/contracts/src/contrato.test.ts, contrato/openapi.json, apps/api/src/modules/cart/carrinho.routes.ts, apps/api/src/core/sessao-do-carrinho.ts, apps/api/src/app.ts, apps/api/src/contracts/gerar.test.ts, apps/api/tests/carrinho-rota.int.test.ts, apps/web/src/lib/carrinho-do-navegador.ts, apps/web/src/features/produto/EscolhasDoProduto.tsx, apps/web/src/app/(loja)/l/[slug]/produto/[id]/page.tsx, packages/ui/styles/produto.css
- Notas: NASCEU DE UMA LACUNA, e não do plano. A T-500 entregou o caso de uso do carrinho e o declarou como único arquivo; nenhuma rota o expunha, e ninguém notou porque nada o chamava. A T-405 esbarrou nisso ao precisar de para onde mandar o item, e a dívida 66 registrou. Esta tarefa é o encanamento que faltava — sem ela a página do produto tem botão sem destino e a do fechamento não pode nascer.
- Notas: O DONO DO CARRINHO É UM TOKEN DE SESSÃO, emitido pela API como cookie no primeiro contato — comprar na vitrine não exige cadastro. Mesmo desenho do token de acompanhamento do pedido: um segredo longo e aleatório, e apresentá-lo é a prova de que foi você quem montou aquele carrinho. É ele que a política do banco confere (migração 0012).
- Notas: quem EMITE o token é a API, e não a tela. Se o cliente escolhesse o próprio, escolheria o de outra pessoa — os dois carrinhos virariam o mesmo, e o visitante veria o que o vizinho está prestes a comprar. Cookie com valor malformado é recusado e substituído.
- Notas: a chamada sai do NAVEGADOR, e não do servidor do Next. Se o servidor do site a fizesse, o cookie seria dele e todos os visitantes dividiriam o mesmo carrinho — exatamente a falha que a 0012 corrigiu no banco. É o caminho que a decisão de 17/08 desenhou: mesmo domínio registrável, dois subdomínios, `SameSite=Lax` viajando e `core/cors.ts` com lista fechada de origens no lugar de um token anti-falsificação.
- Notas: **fecha a segunda metade do AC-411.** A rota RECALCULA o item com `calcularItem` — a MESMA função que a tela chama — usando os preços que ela lê do catálogo, e recusa o que não fecha. O total enviado pelo cliente é anotado quando diverge e nunca compõe a conta (P-006). Os NOMES das opções são resolvidos do banco: nome vindo de fora poria texto arbitrário no cupom impresso.
- Notas: a recusa é 409 e GENÉRICA. A tela já sabe o que falta — calculou o mesmo antes de enviar —, e quem chega aqui com item que não fecha ou está com a página aberta desde antes de o dono mexer no cardápio, ou monta requisição à mão. Nenhum dos dois precisa de um mapa do catálogo na mensagem de erro.
- Notas: o item do carrinho NÃO carrega nome nem preço do produto, e isso é desenho. O carrinho guarda o que foi ESCOLHIDO; nome e preço vêm do catálogo no momento de conferir (AC-503), porque entre montar e fechar o dono pode ter corrigido um preço. A cópia congelada nasce no PEDIDO, e não no carrinho (AC-506).
- Notas: o carrinho não é apagável pelo visitante — só o item. Carrinho abandonado é o rastro de quem chegou perto de comprar, e o dono precisa dele para saber onde perde venda.
- Notas: a prova de integração precisou mandar `Origin` à mão. O navegador o manda sozinho; o supertest não, e sem ele a API responde 403 antes de a rota existir para a requisição (AC-126, AC-128). Foi assim que a primeira rodada reprovou, e o 403 estava certo.
- Notas: o mapeamento apontou para `apps/api/src/modules/cart/sessao-do-carrinho.ts` até 26/09. O arquivo subiu para `apps/api/src/core/sessao-do-carrinho.ts` quando o fechamento passou a usá-lo também (ver a tarefa das rotas do pedido); o caminho acima é o real.
- Esforço: alto

## T-512 — Rota de conferência do carrinho [concluida]

- Refs: US-500, AC-503, AC-504
- Arquivos: packages/core/src/preco-vigente.ts, packages/core/src/preco-vigente.test.ts, packages/core/src/pedido-total.ts, packages/core/src/pedido-total.test.ts, packages/core/src/index.ts, packages/contracts/src/carrinho.ts, packages/contracts/src/rotas.ts, packages/contracts/src/index.ts, packages/contracts/src/contrato.test.ts, contrato/openapi.json, apps/api/src/modules/cart/conferir-preco.usecase.ts, apps/api/src/modules/cart/carrinho.routes.ts, apps/api/src/modules/storefront/produto.usecase.ts, apps/api/src/contracts/gerar.test.ts, apps/api/tests/carrinho-rota.int.test.ts
- Notas: **DOIS ERROS DE DINHEIRO foram achados e corrigidos ao expor a rota.** Os dois eram latentes: até a T-511 não havia como pôr no carrinho um item com opção ou com variante, então nenhum caminho chegava neles.
- Notas: o primeiro — **o acréscimo da opção saía de graça**. A conferência somava só o preço do PRODUTO, e o carrinho guarda a escolha, não o preço dela. O bacon de R$ 3,00 seria cobrado por zero: o cliente veria R$ 23,00 na vitrine e o pedido sairia por R$ 20,00. Agora o acréscimo é lido de `option_items` NO MOMENTO de conferir, o que também faz a conta acompanhar o dono que mudou o preço do adicional.
- Notas: o segundo — **produto com variante era conferido por ZERO**. `displayPriceCents` é nulo quando o preço mora na variante, e o código lia `?? 0n`. O comentário dizia "vale zero e não passa", mas nada filtrava zero: o item seguia, o pedido saía de graça e a cozinha preparava. Agora preço desconhecido é NULO, e nulo faz o item ser retirado com explicação (`SEM_PRECO`). Nulo não é zero, e a diferença é dinheiro.
- Notas: `ItemParaConferir` ganhou `precoBaseEmCentavos` porque duas linhas do mesmo produto podem ter preços legítimos diferentes — pizza P e G —, e uma tabela por produto não expressa isso. `undefined` significa "use o do produto"; `null` significa "procurei e não achei".
- Notas: a comparação de mudança de preço passou a ser com o unitário COM os acréscimos, que é o que a tela mostrou. Comparar só o preço do produto acusaria mudança onde não houve, e calaria a mudança do preço de um adicional.
- Notas: **`precoQueVale` subiu para `packages/core`**. A regra nasceu na rota do produto (T-405) e a conferência passou a precisar da mesma decisão; a tabela de fronteiras não deixa um módulo importar o outro, e a arquitetura prescreve exatamente isto. Copiar teria funcionado no dia — o custo apareceria como a vitrine anunciando promoção e o fechamento cobrando o cheio.
- Notas: entre dois preços do mesmo tipo valendo ao mesmo tempo, vale o MENOR. Cadastro sobreposto é engano do dono, e cobrar o maior por engano dele é o cliente pagando a conta.
- Notas: a rota é POST, e não GET, por duas razões que valem mais que a forma: ela carrega a declaração do que a tela mostrou, e REGISTRA a divergência quando os números não batem. Um GET que escreve no registro de segurança mente sobre o que é.
- Notas: o carrinho conferido é o DA SESSÃO, achado pelo cookie — não um identificador recebido por parâmetro, que seria o caminho para conferir, e depois fechar, o carrinho de outra pessoa.
- Esforço: alto

## T-513 — Rota de configuração do fechamento [concluida]

- Refs: US-501, US-502, AC-506, AC-507, AC-510, AC-904
- Arquivos: packages/database/migrations/0019_fechamento_le_o_pagamento.sql, apps/api/src/modules/storefront/fechamento.usecase.ts, apps/api/src/modules/storefront/vitrine.routes.ts, apps/api/tests/vitrine-sem-dado-sensivel.test.ts, packages/contracts/src/vitrine.ts, packages/contracts/src/rotas.ts, packages/contracts/src/index.ts, packages/contracts/src/contrato.test.ts, apps/api/src/contracts/gerar.test.ts, contrato/openapi.json
- Notas: **É A ÚNICA ROTA DO CONTRATO QUE CARREGA A CHAVE PIX.** O AC-904 manda a chave não aparecer nos dados públicos da vitrine; o AC-510 manda ela aparecer quando o cliente escolhe pagar com PIX. Os dois convivem porque são MOMENTOS diferentes, e não permissões diferentes: a chave não é segredo de quem vai pagar — é segredo de quem está varrendo a plataforma para juntar chaves. Quem abre o cardápio não precisa dela; quem chegou ao fechamento, precisa. As duas metades do critério são provadas lado a lado, no mesmo arquivo, para uma não envelhecer sem a outra notar.
- Notas: a leitura vem de FUNÇÃO DEDICADA (migração 0019), e não da relação — mesmo motivo da 0014. A linha de `store_settings` guarda a chave PIX ao lado da largura do papel da impressora, dos avisos internos e do WhatsApp do dono; ler a linha inteira tornaria tudo isso alcançável por quem escrevesse `select: { printing: true }` num caso de uso futuro. A função devolve TRÊS colunas, e é o esquema quem garante.
- Notas: chave cadastrada em loja que NÃO aceita PIX não sai. O dono desligou o PIX, e devolver a chave assim mesmo é entregar um dado que ele decidiu não usar.
- Notas: taxa NULA é "a combinar" e taxa ZERO é "não cobro frete" — ler `?? 0` transformaria a primeira na segunda, e a loja passaria a entregar de graça sem ter decidido isso. É a mesma lição de `precoEmCentavos` na T-512: nulo não é zero, e a diferença é dinheiro.
- Notas: o que a loja aceita de ENTREGA vem da coluna da loja (`fulfillment_modes`), e não desta configuração — é a que o resto do sistema já usa, e duas fontes para a mesma pergunta divergem no dia em que uma for editada.
- Notas: forma de pagamento desconhecida é descartada em silêncio. O dono pode ter configurado algo de uma versão futura, e mostrar um botão que a tela não sabe processar quebraria o fechamento no último passo.
- Notas: o teste antigo guardava a chave PIX numa forma inventada (`{ chavePix, nomeDoRecebedor }`), porque ele só precisava de "algo com cara de PIX" para provar que não vazava — qualquer forma servia. Esta tarefa passou a LER o campo, e a forma passou a importar: alinhada com a da carga de exemplo, que nasce do modelo de dados. Ver a dívida 75.
- Esforço: medio

## T-514 — Rota de criação do pedido [concluida]

- Refs: US-503, AC-504, AC-507, AC-511, AC-515, AC-516, AC-517
- Arquivos: apps/api/src/modules/orders/pedidos.routes.ts, apps/api/src/app.ts, apps/api/src/core/sessao-do-carrinho.ts, apps/api/src/modules/cart/carrinho.routes.ts, packages/core/src/pedido-total.ts, packages/core/src/pedido-total.test.ts, packages/contracts/src/carrinho.ts, packages/contracts/src/rotas.ts, packages/contracts/src/index.ts, packages/contracts/src/contrato.test.ts, apps/api/src/contracts/gerar.test.ts, contrato/openapi.json, apps/api/tests/carrinho-rota.int.test.ts
- Notas: **O CORPO NÃO TRAZ ITENS, e é esse o ponto.** Eles vêm do CARRINHO daquela sessão, lidos no servidor; os preços vêm do catálogo, lidos no mesmo instante. Aceitar itens no corpo deixaria o cliente escolher o que compra e por quanto — o erro que o AC-504 existe para impedir, e o que a primeira versão deste produto permitia. Há prova disso: corpo com `itens` é recusado na borda.
- Notas: A ORDEM DOS PASSOS É A REGRA, e não detalhe. Conferir os itens ANTES de calcular a taxa (senão o subtotal pode não existir mais), e criar DEPOIS de conferir (senão grava preço velho). Impedimento — mínimo não alcançado, forma de entrega que a loja não faz — é recusa de NEGÓCIO e vem antes de criar: o carrinho continua intacto e a pessoa sabe o que falta.
- Notas: o TOKEN PÚBLICO do pedido é sorteado na BORDA e declarado no contexto, e não dentro do caso de uso — o isolamento por linha confere a declaração contra a linha escrita (migração 0009), e sortear lá dentro deixaria as duas divergentes. São 32 bytes de aleatoriedade: quem tem o token vê o pedido, e número sequencial deixaria qualquer pessoa passear pelos pedidos da loja (AC-614).
- Notas: **`sessao-do-carrinho.ts` subiu de `modules/cart` para `core`.** Ele nasceu no carrinho na T-511, quando só o carrinho o usava; o fechamento precisa da MESMA sessão, e a tabela de fronteiras não deixa um módulo importar outro. É a regra do projeto aplicada — o que dois módulos precisam sobe. Fica ao lado de `cors.ts` e `validar.ts`, que são da mesma natureza.
- Notas: `ItemPrecificado` ganhou `acrescimosEmCentavos`, separado do unitário. O pedido guarda os dois porque o cupom precisa dizer "X-Salada R$ 20,00 / + Bacon R$ 3,00" em vez de um total sem explicação — e é o que o dono confere quando o cliente reclama do valor.
- Notas: a chave PIX é CONGELADA no pedido quando o pagamento é PIX (AC-511), e só nesse caso. O dono trocar a dele depois não mexe em pedido nenhum — provado trocando a chave e conferindo o pedido antigo.
- Notas: esta é a costura mais larga do sistema — quatro módulos (`cart`, `storefront`, `stores`, `orders`) e nenhum importa o outro. A borda passa as funções, e é a única camada que enxerga os quatro.
- Notas: a primeira rodada de provas reprovou por CENÁRIO, e as recusas estavam certas: a loja de teste não tinha configuração de entrega (não aceita nem entrega nem retirada) nem horário (fechada). Duas recusas corretas de um cenário incompleto.
- Esforço: alto

## T-515 — A página do fechamento [concluida]

- Refs: US-501, US-502, US-503, AC-503, AC-507, AC-508, AC-510, AC-512, AC-516
- Arquivos: apps/web/src/app/(loja)/l/[slug]/checkout/page.tsx, apps/web/src/features/checkout/FechamentoDaCompra.tsx, apps/web/src/server/fechamento.ts, apps/web/src/lib/carrinho-do-navegador.ts, apps/web/src/features/checkout/AvisoDeMudanca.tsx, apps/web/tests/fechamento-pagina.test.tsx, packages/ui/styles/fechamento.css, packages/ui/package.json
- Notas: **A PÁGINA ANOTADA DESDE 19/08 FINALMENTE NASCEU.** Os componentes existiam desde a T-502 e esperavam as rotas: a apresentação (T-400), o carrinho (T-511), a conferência (T-512), a configuração (T-513) e a criação (T-514). Cinco tarefas de encanamento para uma tela — e a tela levou uma sessão.
- Notas: A DIVISÃO ENTRE SERVIDOR E NAVEGADOR é a decisão que manda. Tudo que descreve a LOJA — nome, cor, formas de pagamento, taxa, chave PIX — chega pronto do servidor, desenhado antes de qualquer script. Tudo que descreve o CARRINHO é carregado no navegador, porque o carrinho é identificado por um cookie que a API emitiu no domínio dela: se o servidor do Next fizesse a chamada, o cookie seria dele e todos os visitantes dividiriam o mesmo carrinho — a falha da migração 0012 voltando pela porta da frente.
- Notas: a página é a ÚNICA do site que pede a chave PIX, e por isso é a única marcada como NÃO INDEXÁVEL. É página de sessão: só faz sentido para quem tem carrinho, e um buscador que a indexasse ofereceria a estranhos um endereço que abre vazio — carregando a chave da loja.
- Notas: o cache da configuração é de 15 segundos, menor que o da vitrine. Preço de vitrine desatualizado por um minuto é um preço; chave PIX desatualizada é dinheiro indo para a conta errada.
- Notas: a taxa é calculada na tela só para MOSTRAR — quem cobra é o servidor, que refaz a conta ao criar o pedido. Se as duas divergirem, vale a do servidor e a diferença aparece como divergência no registro.
- Notas: o mínimo não alcançado diz QUANTO falta, e não só que falta: "pedido mínimo de R$ 60,00" manda a pessoa calcular sozinha (AC-508).
- Notas: a chave de idempotência é uma por TENTATIVA de fechar, e não por pedido — é o que faz o segundo toque no botão reencontrar o primeiro pedido em vez de criar outro (AC-516).
- Notas: `SEM_PRECO` entrou em `AvisoDeMudanca` como "Saiu do cardápio". Para quem comprou, o efeito é o mesmo de ter saído — e a tela não fala de cadastro com o cliente.
- Notas: o formulário NÃO pede UF, e o pedido tem coluna para ela. Não é esquecimento: entrega de bairro não precisa de estado, e todo campo a mais no celular é uma desistência a mais. Ver a dívida 77.
- Esforço: alto

## T-510 — Teste de ponta a ponta do fechamento [concluida]

- Refs: US-500, US-503, US-504, AC-500, AC-514, AC-520
- Arquivos: e2e/specs/carrinho.spec.ts, e2e/specs/checkout.spec.ts, e2e/fixtures/intercepts.ts, e2e/fixtures/loja-de-teste.ts, e2e/package.json, apps/web/src/features/checkout/FechamentoDaCompra.tsx
- Notas: a chamada ao WhatsApp é interceptada no teste, para validar o texto gerado sem depender de rede externa. A troca é instalada com `addInitScript`, ANTES de qualquer script da página: instalada depois, o componente já teria guardado a referência original. E ela devolve um objeto, e não `null` — `null` é como o navegador diz "bloqueei a janela", e o componente trata isso como falha de envio (AC-523).
- Notas: **FECHA A DÍVIDA 68.** Cada metade estava provada e a junção nunca tinha rodado: o cookie atravessando dois endereços, o `credentials: "include"` valendo, o CORS deixando o POST passar com a origem do site. É o que só um navegador de verdade mostra.
- Notas: o cenário monta LOJA PRÓPRIA (`e2e-lanchonete`), e não usa a da carga de exemplo. A da carga tem horário de verdade — abre às 11h —, e cenário que só passa depois do almoço não é prova, é sorte. Esta abre todos os dias, o dia inteiro, e o fluxo é o mesmo às três da manhã.
- Notas: a montagem é IDEMPOTENTE e à prova de corrida. O Playwright roda cenários em paralelo, e dois deles podem procurar a loja ao mesmo tempo, não achar, e tentar criar — o segundo bate no índice único, que é o banco funcionando. Quem perde a corrida procura de novo e usa o que o outro criou.
- Notas: `ON CONFLICT` não serve neste banco: os índices únicos são PARCIAIS (`WHERE deleted_at IS NULL`) e alguns são sobre expressão (`lower(slug)`), e a cláusula só casa quando a especificação bate exatamente com o índice. Procurar antes de inserir funciona com qualquer forma.
- Notas: os pedidos criados pelo cenário são APAGADOS no fim; a loja e o carrinho ficam. Pedido de teste aparece na fila do dono, e fila com pedido de teste é fila em que ninguém confia — já o carrinho abandonado é rastro que o dono usa, e recriar a loja a cada execução seria trabalho sem ganho.
- Notas: **o cenário encontrou uma falha de tela.** O resumo do fechamento mostrava só o subtotal e a taxa — não listava os itens. Atendia a letra do AC-507 ("o valor dos itens") e falhava o propósito: quem chega ao fechamento precisa CONFERIR o que está comprando antes de dar nome e telefone. Resumo que esconde o que se leva é resumo que se aceita sem ler, e a reclamação chega depois, com o pedido na cozinha.
- Esforço: medio

## T-516 — Carrinho convertido na mesma transação do pedido [concluida]

- Refs: US-503, AC-516, AC-524
- Arquivos: packages/database/migrations/0043_carrinho_convertido_no_pedido.sql, apps/api/src/modules/orders/pedido-fechado.usecase.ts, apps/api/src/modules/orders/pedidos.routes.ts, apps/api/tests/carrinho-convertido.int.test.ts, e2e/specs/config-pagamento.spec.ts
- Notas: NASCEU DA DÍVIDA 95 (achado do ponta a ponta das configurações, T-908). Nada gravava `carts.converted_at`, e nem podia: a política do visitante (0012) exige `converted_at IS NULL` no `WITH CHECK`. Depois de pedir, o cliente voltava ao fechamento com os mesmos itens, e um segundo "Fechar pedido" — chave de fechamento nova, porque é uma por tentativa — criava outro pedido igual.
- Notas: quem converte é `app.converter_carrinho` (migração 0043), função com os direitos de quem a definiu e caminho de busca fixo (guarda G10), chamada pela rota NA MESMA transação do pedido, depois de `criarPedido` dar certo e de o estoque ser reservado. Mesmo desenho da fila de impressão: o módulo `orders` não importa `cart`. A função só converte o carrinho da loja e da SESSÃO declaradas, e só para o pedido do token declarado na transação; a política do visitante não mudou.
- Notas: converter de novo devolve falso, e a rota desfaz a transação com 409. É o que faz a corrida de dois fechamentos do mesmo carrinho (chaves diferentes) perder um deles: o segundo espera a trava da linha, acha o carrinho já convertido, e o pedido duplicado não chega a existir.
- Notas: a sessão do carrinho NÃO mudou. O carrinho aberto já era procurado com `convertedAt: null`, e o índice único da sessão (0008) vale só para carrinho aberto: o próximo acesso da mesma sessão abre um carrinho novo, vazio.
- Notas: **a nova tentativa com a MESMA chave mudou de fonte.** Antes ela relia o carrinho, que continuava igual; agora o carrinho já foi convertido, e relê-lo daria subtotal zero, recusa por mínimo e mensagem sem itens. A rota procura o pedido da chave ANTES de ler o carrinho e, achando, responde com o pedido guardado — valores, taxa e mensagem dele (`pedido-fechado.usecase.ts`), lidos numa transação com o token do pedido declarado. O mesmo vale quando a outra tentativa chega primeiro no meio do caminho.
- Notas: o ponta a ponta da entrega grátis (`config-pagamento.spec.ts`) apagava o cookie `sc_carrinho` para começar num carrinho novo; o contorno saiu.
- Esforço: alto
