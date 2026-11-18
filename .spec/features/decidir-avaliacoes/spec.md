# Spec: Avaliações com notas e reputação de lojas e produtos (A decidir)

> feature: decidir-avaliacoes
> status: rascunho

<!--
  Card #117 do RM Board. Bloco de códigos deste card: 11701 a 11799.
  Função "A decidir" (P-107): nada aqui está aprovado. Os critérios marcados
  como "proposta" dependem de pergunta aberta e só valem depois da resposta
  do dono do produto. Nenhuma tarefa do redesign (#104–#114) depende desta spec.
-->

## Contexto

Os mockups do Stitch mostram nota ★, número de avaliações, uma aba "Avaliações"
e o filtro "Lojas 4.8+". Esses números são ilustrativos (P-105). Hoje o
SimpleClick não tem nota nem avaliação: o que existe são curtidas e comentários
de texto moderados pela loja (card #47: `app.comments`,
`packages/contracts/src/social.ts`), e a estrela do código é a de favoritar.
Os Termos de Uso já dizem que avaliações "podem ser moderadas pela loja e pelo
SimpleClick", mas não há ferramenta de moderação na plataforma.

Esta spec propõe, para o dono do produto decidir: nota, texto de avaliação,
média e contagem reais, resposta da loja, elegibilidade, moderação e
contestação, sem confundir comentário social com avaliação e sem dar à loja o
poder de apagar crítica. As evidências e as alternativas estão em design.md.

## Histórias

### US-11701 — Comprador avalia a experiência

Como comprador, quero compartilhar minha experiência com uma nota e um texto,
para ajudar outras pessoas a escolher.

#### AC-11701 — Pedido concluído permite avaliar (proposta)

- **Dado** uma pessoa logada com um pedido online concluído numa loja (ASM-11701, ASM-11704)
- **Quando** ela envia uma nota inteira de 1 a 5 e um texto opcional
- **Então** a avaliação é gravada e aparece na loja conforme a regra de publicação (Q-11707)
- **E** a escala, o texto obrigatório e o alvo (loja, produto ou pedido) seguem as respostas de Q-11702 e Q-11705

#### AC-11702 — Sem elegibilidade, recebe a restrição e nada é gravado

- **Dado** uma pessoa sem elegibilidade (sem pedido concluído, pedido de outra pessoa, pedido manual, conta sem e-mail verificado ou pedido cancelado)
- **Quando** ela tenta avaliar
- **Então** a tela mostra uma única mensagem de restrição, igual para todos os motivos, sem revelar se o pedido existe
- **E** nenhuma avaliação é gravada (a resposta é uma recusa)

#### AC-11703 — Uma avaliação vigente por pessoa e loja; editar substitui (proposta)

- **Dado** uma pessoa que já avaliou uma loja (Q-11704, Q-11706)
- **Quando** ela envia outra avaliação ou edita a existente dentro do prazo
- **Então** continua existindo uma única avaliação vigente dela naquela loja, com a nota e o texto mais recentes
- **E** a média e a contagem não duplicam a pessoa

#### AC-11704 — Dono, equipe e criador não avaliam a própria loja

- **Dado** o dono, uma pessoa da equipe (ativa ou desligada há pouco, Q-11703) ou quem criou a loja
- **Quando** tenta avaliar essa loja, mesmo com pedido concluído
- **Então** recebe a restrição de AC-11702 e nada é gravado

#### AC-11705 — Bloqueio de comentários não impede avaliar

- **Dado** uma pessoa bloqueada pela loja no módulo de comentários (`app.comment_blocks`)
- **Quando** ela tem um pedido concluído e envia uma avaliação
- **Então** a avaliação é aceita
- **E** a elegibilidade de avaliação não consulta o bloqueio de comentários

#### AC-11706 — Limites de envio contra abuso

- **Dado** envios repetidos por uma pessoa, por uma loja num intervalo de tempo ou por um mesmo IP (`ip_hmac`)
- **Quando** o limite definido é ultrapassado
- **Então** o envio é recusado com aviso de espera (limite de denúncias incluído)
- **E** os valores dos limites ficam registrados no contrato, como em `LIMITES_DOS_COMENTARIOS`

#### AC-11707 — A autoria não depende da ficha do cliente na loja

- **Dado** uma avaliação publicada
- **Quando** a loja desvincula ou apaga a ficha do cliente (`store_customers`)
- **Então** a avaliação continua publicada e editável pelo autor
- **E** o autor e a loja da avaliação foram gravados como cópia fixa no momento do envio

### US-11702 — Visitante consulta a reputação real

Como visitante, quero ver notas reais de uma loja, para decidir onde comprar.

#### AC-11708 — Loja sem avaliações não mostra nota nem quantidade

- **Dado** uma loja sem avaliações elegíveis publicadas
- **Quando** a vitrine, o cartão do feed ou a página do produto são abertos
- **Então** não aparece nota, estrela nem quantidade
- **E** nada é inventado nem copiado dos mockups (P-105)

#### AC-11709 — Média e contagem refletem as avaliações publicadas

- **Dado** avaliações publicadas de uma loja
- **Quando** uma avaliação é publicada, alterada, ocultada ou apagada pela exclusão da conta
- **Então** a próxima consulta mostra a média e a contagem calculadas só com as avaliações publicadas
- **E** o arredondamento e o mínimo para exibir seguem Q-11709

#### AC-11710 — A lista pública mostra só campos fechados

- **Dado** a lista de avaliações de uma loja ativa
- **Quando** qualquer pessoa a consulta
- **Então** cada item traz só nome curto, nota, data, texto e resposta da loja
- **E** não traz identificador do pedido, e-mail nem contato do autor

### US-11703 — Lojista responde sem poder apagar crítica

Como lojista, quero responder às avaliações, para dar a minha versão sem
esconder a opinião do cliente.

#### AC-11711 — Uma resposta pública por avaliação

- **Dado** uma avaliação da minha loja
- **Quando** respondo
- **Então** a resposta aparece junto da avaliação, com limite de tamanho
- **E** responder de novo substitui a resposta anterior (o destino da resposta quando o autor edita o texto segue Q-11708)

#### AC-11712 — A equipe da loja não apaga nem altera avaliação (nota, texto, situação)

- **Dado** uma pessoa do dono ou da equipe da loja
- **Quando** tenta apagar a avaliação ou mudar nota, texto ou situação, pela tela ou direto no banco
- **Então** a operação é recusada
- **E** só a coluna da resposta pode ser alterada pela loja

#### AC-11713 — O painel não revela o pedido nem o contato do autor

- **Dado** a tela de avaliações no painel da loja
- **Quando** o lojista a abre
- **Então** vê nome curto, nota, texto e data
- **E** não vê o pedido, o telefone, o e-mail nem o endereço do autor

#### AC-11714 — A resposta da loja também pode ser denunciada

- **Dado** uma resposta pública da loja
- **Quando** o autor ou um terceiro a denuncia com motivo de lista fechada
- **Então** a resposta entra na mesma fila de moderação da plataforma
- **E** a resposta continua visível até a decisão

### US-11704 — Moderação e contestação justas

Como dono do produto, quero que a remoção de avaliação siga uma regra pública e
auditável, para que ninguém apague crítica de forma arbitrária.

#### AC-11715 — Denúncia com motivo de lista fechada (proposta)

- **Dado** uma avaliação publicada
- **Quando** a loja ou outra pessoa logada a denuncia escolhendo um motivo de uma lista fechada
- **Então** a denúncia é registrada uma vez por pessoa e a avaliação continua visível e contada até a decisão (Q-11707)
- **E** a loja é informada só de que há denúncia, sem saber quem denunciou

#### AC-11716 — Ocultar só pela plataforma, com motivo e trilha (proposta)

- **Dado** uma avaliação denunciada
- **Quando** o admin da plataforma decide ocultá-la informando o motivo (Q-11713)
- **Então** ela sai da lista pública e da média e da contagem
- **E** a decisão vai para a trilha da plataforma (`audit_platform`) só com identificadores e código do motivo, sem o texto da avaliação

#### AC-11717 — O autor é avisado e pode contestar (proposta)

- **Dado** uma avaliação oculta
- **Quando** o autor entra na conta
- **Então** vê o motivo e pode pedir nova análise dentro do prazo (Q-11708, Q-11715)
- **E** a contestação é decidida por quem não decidiu a primeira vez, quando houver mais de um admin

#### AC-11718 — Avaliação oculta não volta por edição

- **Dado** uma avaliação oculta pela plataforma
- **Quando** o autor a edita
- **Então** ela continua oculta até nova decisão
- **E** toda edição passa de novo pelos limites de AC-11706

### US-11705 — Comentário social não é avaliação

Como comprador, quero que curtir e comentar continuem simples, sem mexer na
nota da loja.

#### AC-11719 — Comentário aprovado não muda a nota

- **Dado** uma loja com comentários aprovados e nenhuma avaliação
- **Quando** a reputação é consultada
- **Então** não há nota nem contagem de avaliações
- **E** a contagem de comentários do feed continua a mesma de hoje

#### AC-11720 — Desligar avaliações é tudo ou nada (proposta)

- **Dado** uma loja que desligou as avaliações (se Q-11710 permitir)
- **Quando** a vitrine é aberta
- **Então** nota, contagem e lista somem por inteiro
- **E** nenhuma avaliação é apagada, e ligar de novo traz tudo de volta

### US-11706 — Nada aparece sem decisão

Como dono do produto, quero que nenhuma nota apareça enquanto eu não aprovar a
função, para o redesign não prometer o que não existe.

#### AC-11721 — Sem aprovação, nenhum bloco de nota aparece

- **Dado** que Q-11701 não foi respondida como "fazer"
- **Quando** qualquer tela do cliente é aberta
- **Então** não aparecem estrela de nota, número de avaliações, aba "Avaliações" nem o filtro "Lojas 4.8+"
- **E** nenhuma tarefa do redesign depende desta função (P-107)

### US-11707 — Privacidade, exclusão de conta e texto seguro

Como pessoa titular dos dados, quero que minha avaliação siga a LGPD, e como
visitante quero ler o texto dos outros sem risco.

#### AC-11722 — Exclusão de conta trata a avaliação (proposta)

- **Dado** uma pessoa com avaliações que exclui a conta
- **Quando** a exclusão termina
- **Então** as avaliações seguem a decisão de Q-11711 (apagar ou trocar o autor por "Cliente")
- **E** a média e a contagem da loja são recalculadas

#### AC-11723 — A exportação de dados traz as avaliações

- **Dado** uma pessoa com avaliações
- **Quando** ela pede a exportação dos seus dados
- **Então** o arquivo inclui as avaliações e as respostas que ela recebeu

#### AC-11724 — Texto malicioso fica inerte em todas as telas

- **Dado** uma avaliação ou resposta com `</script>`, `<img onerror>`, caracteres de controle e de direção bidi
- **Quando** o texto aparece na vitrine, no painel, no admin, no e-mail de aviso e nos dados estruturados (se Q-11712 permitir)
- **Então** é exibido como texto puro, sem executar nada
- **E** o banco recusa texto vazio após remover espaços ou acima de 500 caracteres

## Fora de escopo

- Implementar código, criar testes, alterar banco, API ou dependências.
- Decidir as perguntas abaixo pelo dono do produto.
- Modelo novo de permissões granulares para admins da plataforma.
- Programa de selos (#118), mais vendidos (#124) e posts de texto (#116).
- Funções de oficina, compatibilidade veicular e consulta de placa ou chassi.
- Commit, push, PR, merge, worktree ou troca de branch.

## Suposições

| ID        | Suposição                                                                                                                                                     | Status | Resolução |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| ASM-11701 | Proposta padrão: nota inteira de 1 a 5 da loja por pedido concluído, texto opcional de até 500 caracteres, edição limitada e publicação sem aprovação prévia  | aberta | —         |
| ASM-11702 | A média e a contagem são calculadas na leitura, como em `resumo-social.ts`, sem visão materializada (guarda G6)                                               | aberta | —         |
| ASM-11703 | O autor aparece com o nome curto já usado nos comentários (`app.nome_curto_da_pessoa`)                                                                        | aberta | —         |
| ASM-11704 | Só pedido online no status COMPLETED, de conta com e-mail verificado, é elegível; pedido manual fica de fora                                                  | aberta | —         |
| ASM-11705 | As telas de avaliar, responder e moderar não existem no ZIP do Stitch e precisam de proposta visual própria                                                   | aberta | —         |
| ASM-11706 | A fila de denúncias vale para todo admin, porque a plataforma não tem permissões granulares; ela é pré-requisito para lançar a função                         | aberta | —         |
| ASM-11707 | Os critérios de banco e de API são provados fora do `onp-spec verify`, que só roda os projetos web e unit; a decisão do gerente sobre o comando fica pendente | aberta | —         |

## Perguntas em aberto

| ID      | Pergunta                                                                                                                        | Status | Resposta |
| ------- | ------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- |
| Q-11701 | Fazer ou não a função de avaliações (liga com Q-10305)?                                                                         | aberta | —        |
| Q-11702 | Avalia a loja, o produto, o pedido ou uma combinação? (O produto exige guardar o item do pedido.)                               | aberta | —        |
| Q-11703 | Só comprador verificado? Pedido manual e compra sem conta contam? Equipe desligada há quantos dias ainda não pode avaliar?      | aberta | —        |
| Q-11704 | Uma avaliação por compra ou uma vigente por pessoa e loja?                                                                      | aberta | —        |
| Q-11705 | Qual a escala (estrelas inteiras, meia estrela) e o texto é obrigatório?                                                        | aberta | —        |
| Q-11706 | Qual o prazo depois do pedido para avaliar e qual o prazo para editar?                                                          | aberta | —        |
| Q-11707 | Quem modera (só a plataforma, a loja ou os dois) e a publicação é antes ou depois da moderação?                                 | aberta | —        |
| Q-11708 | Quem pode contestar, quantas vezes e o que acontece com a resposta da loja quando o autor edita o texto?                        | aberta | —        |
| Q-11709 | Há um mínimo de avaliações para mostrar a média? Qual o arredondamento? Entram o filtro "4.8+" e a ordenação "melhor avaliado"? | aberta | —        |
| Q-11710 | A loja pode desligar as avaliações?                                                                                             | aberta | —        |
| Q-11711 | Com a conta excluída, a avaliação é apagada ou o autor vira "Cliente" e o vínculo é cortado?                                    | aberta | —        |
| Q-11712 | Publicar `aggregateRating` nos dados estruturados para os buscadores?                                                           | aberta | —        |
| Q-11713 | Quem pode ocultar uma avaliação: só o admin da plataforma ou também a loja, em algum caso?                                      | aberta | —        |
| Q-11714 | E o pedido entregue que a loja nunca conclui ou cancela depois: o comprador marca como recebido ou vale após X dias?            | aberta | —        |
| Q-11715 | Qual o prazo para a plataforma decidir uma denúncia e existe retirada de emergência (dado pessoal de terceiros, ofensa)?        | aberta | —        |
| Q-11716 | Qual papel da equipe pode responder e denunciar: reaproveita `moderar_comentarios` ou cria permissão nova?                      | aberta | —        |
