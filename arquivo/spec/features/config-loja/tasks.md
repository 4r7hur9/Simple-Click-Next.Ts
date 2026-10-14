# Tasks: Configurações da Loja

> feature: config-loja

## T-900 — Configurações por seção, com gravação atômica e auditoria [concluida]

- Refs: US-906, AC-921, AC-922, AC-923
- Arquivos: apps/api/src/modules/stores/configuracoes.usecase.ts, apps/api/src/modules/stores/configuracoes.usecase.test.ts, apps/api/src/modules/stores/configuracoes.schema.ts, apps/api/src/modules/stores/configuracao.routes.ts, packages/contracts/src/store-settings.ts, apps/api/tests/apoio-de-configuracao.ts, apps/api/tests/config-loja-secoes.int.test.ts, apps/web/src/app/api/loja/[secao]/route.ts, apps/web/src/app/(painel)/painel/layout.tsx, apps/web/src/app/(painel)/painel/page.tsx, apps/web/src/app/(painel)/painel/config/layout.tsx, apps/web/src/app/(painel)/painel/config/horarios/page.tsx, apps/web/src/features/config/secoes.ts, apps/web/src/features/config/useSecao.ts, apps/web/src/features/config/ErroDoCampo.tsx, apps/web/src/features/config/FormularioHorario.tsx, apps/web/tests/apoio-config.tsx, apps/web/tests/config-secoes.test.tsx, apps/web/tests/painel-inicial.test.tsx
- Notas: nada é salvo pela metade — a seção, as colunas da loja que ela toca e o registro na trilha entram na MESMA transação, e a recusa volta no formato de toda a API (`campos[]` com `caminho`), apontando cada campo. Cada alteração registra autor, momento, campo e valor anterior (só os campos que mudaram); chave PIX e WhatsApp saem mascarados e com ação `CONFIG_SENSIVEL_ALTERADA`. As seções são a lista fechada `SECOES_DO_DONO` do contrato — pagamento, entrega, horário, contato, apresentação e impressão —, uma rota por seção e esquema estrito: tipo de negócio, apelido, documento e contrato não têm como entrar. A tela de horário (grade, fechar agora e datas especiais) nasce aqui porque o dono precisa encontrá-la (AC-921); o cálculo continua o da T-903.
- Esforço: alto

## T-901 — Chave PIX e formas de pagamento [concluida]

- Refs: US-900, AC-900, AC-901, AC-902, AC-903, AC-904
- Arquivos: packages/core/src/chave-pix.ts, packages/core/src/chave-pix.test.ts, packages/core/src/index.ts, apps/api/src/modules/stores/configuracoes.schema.ts, apps/api/src/modules/storefront/fechamento.usecase.ts, apps/api/tests/config-pagamento.int.test.ts, apps/api/tests/vitrine-sem-dado-sensivel.test.ts, apps/web/src/app/(painel)/painel/config/pagamento/page.tsx, apps/web/src/features/config/FormularioPagamento.tsx, apps/web/src/features/config/useSecao.ts, apps/web/tests/config-pagamento.test.tsx
- Notas: a chave é conferida pelo tipo na borda (regra pura em `packages/core/src/chave-pix.ts`: CPF e CNPJ com dígito verificador, celular com DDD, e-mail, chave aleatória) e sai normalizada; a recusa aponta `pix.chave` com o formato esperado e a chave anterior continua valendo. PIX sem chave não entra nas formas do fechamento (documento antigo incluído). O pedido guarda a chave do momento (snapshot da AC-511), provado trocando a chave entre dois pedidos. A chave nunca vai inteira para a trilha (P-009) e não sai na vitrine. O aviso por e-mail ao dono quando a chave muda (Q-901) não é critério desta tarefa e fica pendente.
- Esforço: alto

## T-902 — Entrega, retirada, taxa e valor mínimo [concluida]

- Refs: US-901, AC-905, AC-906, AC-907, AC-908
- Arquivos: apps/api/tests/config-entrega.int.test.ts, apps/web/src/app/(painel)/painel/config/entrega/page.tsx, apps/web/src/features/config/FormularioEntrega.tsx, apps/web/src/features/checkout/FechamentoDaCompra.tsx, apps/web/tests/config-entrega.test.tsx
- Notas: o dono digita em reais e a tela converte para centavos inteiros, exata e sem ponto flutuante; valor que não é dinheiro é apontado no campo antes de ir à rede. O checkout oferece exatamente os modos ativos (coluna `fulfillment_modes`); com os dois desligados o fechamento mostra que a loja não está recebendo pedidos e o servidor recusa, e o painel avisa (T-907). Taxa, gratuidade e mínimo configurados chegam ao fechamento e ao total do pedido — o cálculo continua o de `packages/core/src/taxa-entrega.ts`.
- Esforço: medio

## T-903 — Horário de funcionamento, fechar agora e exceções [concluida]

- Refs: US-902, AC-909, AC-910, AC-911, AC-912
- Arquivos: packages/core/src/horario-loja.ts, packages/core/src/horario-loja.test.ts, packages/core/src/index.ts, apps/api/src/modules/stores/horarios.usecase.ts, apps/api/tests/vitrine-sem-dado-sensivel.test.ts, packages/database/migrations/0015_horario_de_funcionamento.sql, packages/database/prisma/schema.prisma
- Notas: a TELA do painel (grade de horários) saiu desta lista e entra com o painel do dono; os quatro critérios são de cálculo e de guarda, e estão provados sem ela. O caso de uso não tem teste de unidade próprio — ele só monta o objeto que o cálculo puro interpreta, e a prova de que monta certo exige as linhas do banco. Cálculo sempre no fuso da loja, nunca no relógio do cliente nem em fuso universal. Mais de uma faixa por dia. Fechar agora não desconfigura a semana. Exceção datada vence o horário semanal.
- Esforço: alto

## T-904 — Contato de WhatsApp e texto da mensagem [concluida]

- Refs: US-903, AC-913, AC-914, AC-915
- Arquivos: packages/contracts/src/store-settings.ts, packages/contracts/src/index.ts, apps/api/src/modules/stores/configuracoes.usecase.ts, apps/api/tests/config-contato.int.test.ts, apps/web/src/app/(painel)/painel/config/contato/page.tsx, apps/web/src/features/config/EditorDeMensagem.tsx, apps/web/src/lib/previa-da-mensagem.ts, apps/web/tests/config-contato.test.tsx
- Notas: o número é normalizado pela regra de `packages/core/src/telefone.ts` na borda e na tela ("Assim fica: +55 (11) …"), e número impossível é recusado explicando o que falta. O dono edita a saudação — pode apagá-la; nula é escolha, ausente é a de fábrica —, e o corpo do pedido (código, itens, entrega, pagamento, total, link) é do sistema e não sai (ASM-905). A prévia usa o mesmo gerador do pedido de verdade, com um pedido de exemplo, e a mensagem não leva marca da plataforma. Sem número o painel avisa e o pedido continua registrado. Encerramento editável (Q-902) ficou fora: exigiria mexer na montagem da mensagem do checkout.
- Esforço: medio

## T-905 — Apresentação da loja, logo, capa e cor [concluida]

- Refs: US-904, AC-916, AC-917, AC-918
- Arquivos: apps/api/src/modules/stores/imagem-da-loja.ts, apps/api/src/modules/stores/imagem-da-loja.test.ts, apps/api/src/core/midia.ts, apps/api/src/core/midia.test.ts, apps/api/src/modules/stores/configuracao.routes.ts, apps/api/tests/config-aparencia.int.test.ts, apps/web/src/app/api/loja/imagem/[tipo]/route.ts, apps/web/src/app/(painel)/painel/config/aparencia/page.tsx, apps/web/src/features/config/FormularioAparencia.tsx, apps/web/tests/config-aparencia.test.tsx
- Notas: nome de exibição (`stores.name`), boas-vindas, sobre, logo, capa e cor numa seção só, com prévia desenhada pelo mesmo `TemaDaLoja` da vitrine antes de publicar. Cor clara demais é consertada na letra pelo design system (AC-015) e avisada ao dono quando a própria cor não serve de texto. Logo e capa são conferidas pelos bytes (JPEG, PNG, WebP; 1 MB e 3 MB; 1:1 e 3:1 — regras no contrato, usadas pela tela e pela API) e guardadas pela porta de mídia (`core/midia.ts`, Cloudinary pela decisão D2, `CLOUDINARY_URL`); sem credencial o envio responde indisponível e o painel aceita o endereço https://. A conferência de assinatura repete a do catálogo (`catalog/imagens`): subir as duas para `packages/core` fica para depois do merge.
- Esforço: alto

## T-906 — Formato de impressão do cupom [concluida]

- Refs: US-905, AC-919, AC-920
- Arquivos: apps/api/src/modules/stores/impressao-config.usecase.ts, apps/api/src/modules/stores/impressao-config.usecase.test.ts, apps/api/tests/config-impressao.int.test.ts, apps/web/src/app/(painel)/painel/config/impressao/page.tsx, apps/web/src/features/config/FormularioImpressao.tsx, apps/web/tests/config-impressao.test.tsx
- Notas: a largura (58 ou 80 mm, 32 ou 48 colunas) é a que o gerador do cupom recebe, e trocá-la vale para o próximo cupom do mesmo pedido; o essencial (pedido, itens, total) não tem interruptor na tela e é religado pela normalização mesmo que a requisição peça o contrário. A montagem do cupom na largura recebida é da T-605 (faixa F5), que lê esta configuração por `normalizarConfiguracaoDeImpressao`.
- Esforço: medio

## T-907 — Avisos de configuração pendente no painel [concluida]

- Refs: US-903, AC-902, AC-914
- Arquivos: apps/api/src/modules/stores/pendencias.usecase.ts, apps/api/src/modules/stores/pendencias.usecase.test.ts, apps/api/src/modules/stores/configuracao.routes.ts, apps/web/src/app/api/loja/[secao]/route.ts, apps/web/src/features/config/AvisosPendentes.tsx, apps/web/src/app/(painel)/painel/layout.tsx, apps/web/tests/avisos-pendentes.test.tsx
- Notas: regra pura em `pendencias.usecase.ts`: sem forma de pagamento que o checkout ofereça (PIX sem chave não conta), sem entrega nem retirada, sem WhatsApp e sem horário, cada aviso dizendo a consequência para o cliente e com atalho para a tela que resolve — inclusive a de horário. O aviso aparece destacado (tom de atenção) no topo de todo o painel; falha ao consultar não vira aviso falso.
- Esforço: baixo

## T-908 — Teste de ponta a ponta das configurações [concluida]

- Refs: US-900, US-901, US-902, US-903, US-904, US-905, AC-900, AC-902, AC-905, AC-906, AC-907, AC-908, AC-909, AC-911, AC-913, AC-915, AC-916, AC-919, AC-920
- Arquivos: e2e/fixtures/config-loja.ts, e2e/specs/config-pagamento.spec.ts, e2e/specs/config-horarios.spec.ts, e2e/specs/config-aparencia.spec.ts, e2e/specs/config-contato.spec.ts, e2e/specs/config-impressao.spec.ts
- Notas: o dono salva cada seção pela tela do painel e o cliente vê o efeito na loja do painel, sem esperar o cache vencer (aviso da dívida 93): chave PIX e recebedor no checkout (e sem chave o PIX não aparece), taxa com o nome do dono, entrega grátis, mínimo só da entrega com retirada liberada e modo desligado sumindo do checkout, dia sem faixa e "fechar agora" deixando a vitrine fechada e o fechamento recusando (o carrinho fica), semana intacta ao reabrir, número normalizado e saudação na conversa do WhatsApp sem marca da plataforma, apresentação com prévia e na página pública (logo e capa servidas pelo navegador do cenário), papel de 58/80 mm e endereço tirado do cupom seguinte do mesmo pedido. Cada cenário tem a loja do painel só para ele (trava da montagem) e a devolve como estava, avisando o site. É ponta a ponta, fora do portão e da prova escopada (que é Vitest); roda com `test:e2e:isolado`. Achados fora do escopo na dívida 95 de `docs/pendencias.md` (carrinho não convertido, horário de reabertura que não chega ao fechamento); a recusa que sumia da tela foi corrigida em `fix(checkout)`.
- Esforço: medio
