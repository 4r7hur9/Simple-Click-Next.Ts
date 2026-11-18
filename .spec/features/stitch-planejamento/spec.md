# Spec: Planejamento do redesign Stitch

> feature: stitch-planejamento
> status: rascunho

<!--
  Card #103 do RM Board. Bloco de códigos deste card: 10301 a 10399.
  Esta spec é de PLANEJAMENTO: os critérios se cumprem com documentos
  (design.md, README.md, constituição e config). Não há implementação nem
  teste automatizado nesta fase (ver ASM-10303).
-->

## Contexto

O SimpleClick permite criar, personalizar e administrar lojas de diferentes
segmentos, publicar catálogo ou cardápio e receber pedidos. O usuário
recebeu um redesign do Stitch (7 telas e o guia "Kinetic Retail Dark") com
dados ilustrativos de uma loja de autopeças e quer revisar a ordem do
redesign e decidir cada função nova antes de qualquer implementação. Esta
spec organiza o plano: o que cada bloco das telas significa para o código
atual, quem cuida de cada parte e como os cards #104–#126 especificam sem se
atropelar.

## Histórias

### US-10301 — Matriz das telas do Stitch

Como dono do produto, quero ver cada bloco das 7 telas do Stitch comparado
com o que o SimpleClick já tem, para decidir o redesign sabendo o que é
reaproveitamento, o que é novo e o que fica de fora.

#### AC-10301 — Todo bloco tem origem, situação, evidência e card

- **Dado** as 7 telas exportadas do Stitch e o código atual
- **Quando** o dono do produto abre a matriz em design.md
- **Então** cada bloco visual aparece com a tela de origem, a situação
  (existe, parcial, nova, não confirmada, a decidir ou fora), a evidência no
  código e o card responsável
- **E** nenhum bloco do inventário das 7 telas fica sem linha

#### AC-10302 — Blocos automotivos ficam fora, com substituto genérico

- **Dado** um bloco do mockup com compatibilidade veicular, placa, chassi,
  código OEM com tema automotivo ou "garagem ativa"
- **Quando** a matriz é revisada
- **Então** o bloco está marcado como fora de escopo
- **E** a linha indica o substituto genérico que serve a lojas de qualquer
  segmento (por exemplo "Fale com a loja no WhatsApp")

### US-10302 — Funções novas continuam a decidir

Como dono do produto, quero que cada função nova (blog, avaliações, cupons,
fidelidade e as demais) espere a minha decisão, para que o redesign não
dependa de nada que eu ainda não aprovei.

#### AC-10303 — Função não aprovada não trava o redesign

- **Dado** uma função nova ainda não aprovada
- **Quando** o plano de ondas e a sequência dos cards são apresentados
- **Então** ela aparece como "A decidir"
- **E** nenhuma tarefa nem card do redesign (#104–#114) depende dela

#### AC-10304 — Cada função opcional tem o seu card

- **Dado** a lista de funções opcionais encontradas nos mockups
- **Quando** o dono do produto consulta a matriz
- **Então** cada função opcional aponta para um card "A decidir" próprio
  (#115–#120, #123–#126)

### US-10303 — Divisão do trabalho sem disputa de arquivos

Como dono do produto, quero que as tarefas futuras não mexam no mesmo
arquivo ao mesmo tempo, para não perder trabalho nem precisar de worktrees.

#### AC-10305 — Arquivo compartilhado tem um dono ou uma fila

- **Dado** dois cards que precisam do mesmo arquivo
- **Quando** a divisão técnica é apresentada em design.md
- **Então** o arquivo tem um único card dono ou uma ordem explícita de quem
  mexe primeiro

#### AC-10306 — Execução recomendada é uma após a outra

- **Dado** o plano de execução recomendado
- **Quando** ele é lido
- **Então** a execução é sequencial, na pasta principal do projeto
- **E** nenhum passo cria worktree nem troca de branch

### US-10304 — Base de especificação pronta para o time

Como agente de um card do redesign, quero encontrar pronta a estrutura de
especificação com a minha pasta e os meus códigos, para escrever a minha
spec sem colidir com outro card.

#### AC-10307 — O README diz a pasta e os códigos de cada card

- **Dado** um agente de qualquer card entre #104 e #126
- **Quando** ele abre .spec/README.md
- **Então** encontra a pasta da sua feature e o bloco de códigos do seu card
- **E** a receita para criar a spec sem usar a numeração automática do motor

#### AC-10308 — A auditoria não acusa erro de estrutura

- **Dado** a pasta .spec criada por este card
- **Quando** o motor ONP audita o projeto
- **Então** não aparece erro de estrutura (código duplicado, critério
  incompleto, seção ausente, referência quebrada ou princípio violado)
- **E** os únicos achados permitidos são critério sem teste ou sem prova

#### AC-10309 — Testes antigos não contam como prova

- **Dado** os testes atuais com marcações antigas de critério (números de
  001 a 951, da spec arquivada)
- **Quando** o motor ONP audita o projeto
- **Então** nenhum desses testes é lido como teste órfão nem como prova de um
  critério novo

### US-10305 — Uma cor de marca só

Como dono do produto, quero que o verde do SimpleClick continue sendo o
#B7FF00, para que o redesign não traga um segundo verde parecido.

#### AC-10310 — O verde do Stitch não entra no produto

- **Dado** o guia do Stitch com primary branco e verde #b2f800
- **Quando** o motor ONP audita o código do site e do pacote de interface
- **Então** o princípio P-102 passa sem nenhuma ocorrência do verde do Stitch
- **E** design.md registra que o verde oficial é #B7FF00

## Fora de escopo

- Implementar código, criar testes, alterar banco, API ou dependências.
- Especificar os cards #104–#126 (cada card escreve a sua).
- Publicar conteúdo, assumir custos externos ou declarar decisões aprovadas.
- Funções de oficina, compatibilidade veicular e consulta de placa ou chassi.
- Mudar a landing (/) ou a página inicial do cliente (/explorar).
- Commit, push, PR, merge, worktree ou troca de branch.

## Suposições

| ID        | Suposição                                                                                                                                                 | Status | Resolução |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| ASM-10301 | As funções que já existem (feed, stories, favoritos, curtidas, comentários, atacado, variações, WhatsApp, kanban) são preservadas e só ganham visual novo | aberta | —         |
| ASM-10302 | A prova visual e de ponta a ponta do #114 pode exigir um segundo comando de verificação além do vitest                                                    | aberta | —         |
| ASM-10303 | Esta spec de planejamento não tem teste automatizado; a prova é a revisão do dono do produto mais a auditoria sem erro de estrutura                       | aberta | —         |

## Perguntas em aberto

| ID      | Pergunta                                                                                                                                       | Status | Resposta |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- |
| Q-10301 | As ondas propostas (cliente primeiro; painel e administração depois, sem mockup) estão certas, e painel e administração entram neste redesign? | aberta | —        |
| Q-10302 | A fonte passa a ser Plus Jakarta Sans (Stitch) ou continuam Space Grotesk nos títulos e Inter no texto?                                        | aberta | —        |
| Q-10303 | A página inicial do cliente continua sendo /explorar e a landing (/) fica como está?                                                           | aberta | —        |
| Q-10304 | A experiência do cliente fica só no tema escuro do Stitch ou mantém claro e escuro?                                                            | aberta | —        |
| Q-10305 | Quais funções "A decidir" (blog, posts de texto, avaliações, selos, cupons, avise-me, câmera, mais vendidos, fidelidade, parcelamento) entram? | aberta | —        |
| Q-10306 | Quando e em qual branch a pasta .spec e o onpspec.config.json recebem commit?                                                                  | aberta | —        |
