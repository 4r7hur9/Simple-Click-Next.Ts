# Plano de continuação a partir do estado atual

## Como vamos usar nosso tempo

Segunda-feira é uma janela de trabalho conjunto, não um prazo artificial para
89 tarefas pendentes. O objetivo é trabalhar em blocos verificáveis: escolher
uma faixa, executar, provar e só então puxar a próxima.

## Marcos concluídos

- Identidade visual global implementada. O `verify` registrou prova PASS para
  os 11 critérios de aceite; o comando global ainda sai 1 por falhas de
  infraestrutura Windows/WSL e contrato OpenAPI fora desta feature.
- Landing concluída, incluindo T-963: conteúdo completo sem JavaScript e
  largura de 344px sem estouro.
- Checkout concluído, incluindo T-510.
- Vitrine pública concluída de T-403 a T-409 e T-421: desempenho, imagens
  responsivas, acessibilidade, teclado, categoria, busca, produto, carrinho e
  checkout foram exercitados em navegador real. A suíte Playwright passou em
  64 de 64 cenários nos projetos desktop e celular.
- Identidade e acesso têm a interface de entrada e um usuário local de teste.
  O cookie de renovação agora é host-only quando o site roda em `localhost`.

## Próxima onda especificada

1. Executar as configurações de contato e aparência da loja (T-904 e T-905).
2. Depois delas, executar T-410: página `/l/{apelido}/sobre` com texto
   institucional, logo, capa, endereço de retirada e WhatsApp explicitamente
   público.
3. O DTO público ganhará somente `sobre: string | null` e
   `whatsappPublico: string | null`; telefone cadastral, e-mail, documentos e
   contatos não públicos continuarão bloqueados pela allowlist.
4. Em seguida, continuar configuração da loja e catálogo, antes da operação
   do pedido.

## Ordem das próximas fatias

1. Identidade e acesso.
2. Configuração da loja e catálogo.
3. Operação do pedido.
4. Clientes e métricas.
5. Administração de lojas.
6. Cardápio na TV.

Essa ordem segue dependências reais: áreas privadas precisam de acesso;
operação precisa de catálogo e configuração; métricas e clientes precisam de
pedidos; TV reaproveita catálogo/vitrine estabilizados.

## Regra de avanço

Cada bloco termina com teste anotado, `verify` e auditoria da feature. A dívida
das features futuras permanece visível, mas não é misturada com regressão do
que já foi entregue.
