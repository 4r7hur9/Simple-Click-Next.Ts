# Plano de continuação a partir do estado atual

## Como vamos usar nosso tempo

Segunda-feira é uma janela de trabalho conjunto, não um prazo artificial para
89 tarefas pendentes. O objetivo é trabalhar em blocos verificáveis: escolher
uma faixa, executar, provar e só então puxar a próxima.

## PRE-0 — Identidade visual global

Antes de continuar criando telas, executar o subplano
`identidade-visual-global`: ativos → tokens → tipografia → Tailwind → base
global → componentes → escopo da loja → vitrine e provas.

## Depois do PRE-0 — fechar fatias quase prontas

1. Resolver as decisões abertas da fundação sem alterar princípios para calar
   a auditoria.
2. Fechar o teste de ponta a ponta da landing (T-963).
3. Fechar o teste de ponta a ponta do checkout (T-510).
4. Concluir a vitrine pública a partir da leitura já entregue (T-403 a T-409).

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
