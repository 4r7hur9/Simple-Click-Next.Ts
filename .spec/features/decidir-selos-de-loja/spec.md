# Spec: Selo público de loja verificada (A decidir)

> feature: decidir-selos-de-loja
> status: rascunho

<!--
  Card #118 do RM Board. Bloco de códigos deste card: 11801 a 11899.
  Função "A DECIDIR" (P-107): nada aqui está aprovado para implementação.
  A primeira decisão é a Q-11801 (fazer ou não). Os critérios descrevem o
  comportamento PROPOSTO para o dono do produto revisar; nenhuma resposta das
  perguntas foi presumida. Plano técnico proposto em design.md.
-->

## Contexto

O SimpleClick permite criar, personalizar e administrar lojas de diferentes
segmentos. As telas do Stitch mostram selos de "loja verificada",
"certificada" e "homologada" na vitrine e no feed. Hoje esse selo não existe
(matriz do #103, `.spec/features/stitch-planejamento/design.md`).

O que existe é a **aprovação para operar**: a administração aprova a loja e
ela entra no ar (`stores.status = ACTIVE`). Como a vitrine só mostra loja
ativa, **toda** loja pública já está aprovada, e a aprovação sozinha não diz
nada ao cliente. Esta spec separa três coisas:

- **aprovação para operar**: já existe e não muda;
- **verificação da loja na plataforma**: proposta desta spec. A administração
  conferiu dados e documentos da loja;
- **garantia comercial ou certificação técnica**: fora do escopo. O SimpleClick
  não homologa produto, não autoriza oficina e não certifica qualidade.

O selo proposto é um só, "Loja verificada" (ASM-11801). Ele descreve o que a
plataforma conferiu e diz claramente o que não garante.

## Histórias

### US-11801 — O cliente entende o que o selo comprova

Como cliente, quero entender o que um selo comprova antes de confiar nele,
para decidir a compra sabendo o que foi conferido e o que não foi.

#### AC-11801 — A explicação do selo abre por clique, toque ou teclado

- **Dado** uma loja verificada com o selo visível na vitrine
- **Quando** o cliente aciona o selo com clique, toque ou teclado
- **Então** abre uma explicação curta que diz quais itens a plataforma
  conferiu e o mês e ano da verificação
- **E** um leitor de tela anuncia o selo pelo texto "Loja verificada", e não
  só pela cor ou pelo ícone

#### AC-11802 — A explicação diz o que o selo não garante

- **Dado** a explicação do selo aberta
- **Quando** o cliente a lê
- **Então** ela informa que o selo não garante a qualidade dos produtos, prazos
  nem atendimento
- **E** informa que o selo não é certificação técnica, homologação de produto
  nem autorização de fabricante

#### AC-11803 — O público não vê dado pessoal nem os bastidores da verificação

- **Dado** uma loja verificada, uma loja com o selo revogado e uma loja nunca
  verificada
- **Quando** qualquer pessoa consulta a vitrine, o feed ou a explicação do selo
- **Então** nenhuma resposta pública traz CPF, documento do responsável, nome
  de quem concedeu, motivo interno nem arquivo de documento
- **E** a loja revogada e a loja vencida aparecem exatamente como a loja nunca
  verificada: sem selo e sem aviso de revogação

### US-11802 — A administração concede e revoga o selo com registro

Como pessoa da administração da plataforma, quero conceder e revogar o selo
de uma loja com motivo e registro, para que cada selo público tenha um
responsável e possa ser auditado.

#### AC-11804 — Conceder o selo fica registrado na trilha, sem dado pessoal

- **Dado** uma loja ativa com os itens de verificação conferidos
- **Quando** uma pessoa da administração concede o selo, informando o motivo
- **Então** a vitrine e o feed passam a mostrar "Loja verificada"
- **E** a trilha da loja registra quem concedeu, quando, a validade e os itens
  conferidos, por tipo e impressão digital (hash) do documento
- **E** o registro não guarda CPF, CNPJ, nome do responsável nem cópia do
  documento, porque a equipe da loja também lê essa trilha

#### AC-11805 — Revogar tira o selo do público no prazo do cache

- **Dado** uma loja com o selo visível
- **Quando** uma pessoa da administração revoga o selo, informando o motivo
- **Então** o selo deixa de aparecer na vitrine e no feed em até 60 segundos,
  ou na hora, se as etiquetas de cache da loja forem invalidadas
- **E** a revogação fica na trilha com quem revogou, quando e o motivo

#### AC-11806 — Quem não é da administração não mexe no selo

- **Dado** uma pessoa sem acesso de administração da plataforma (cliente,
  dono ou equipe da loja)
- **Quando** ela tenta conceder ou revogar um selo
- **Então** recebe a recusa de acesso (resposta 403)
- **E** o selo e a trilha continuam como estavam

#### AC-11807 — Quem tem vínculo com a loja não concede o selo dela

- **Dado** uma pessoa da administração que também é membro da loja ou quem a
  cadastrou
- **Quando** ela tenta conceder o selo a essa loja
- **Então** a tela avisa que outra pessoa da administração precisa fazer a
  verificação
- **E** nada é concedido nem registrado como concessão

### US-11803 — Sem verificação não há selo, e aprovar não é verificar

Como cliente, quero que o selo só apareça em loja realmente verificada, para
que ele continue significando alguma coisa.

#### AC-11808 — Loja ativa sem verificação não mostra selo

- **Dado** uma loja aprovada e ativa que nunca foi verificada
- **Quando** ela aparece na vitrine, no catálogo, na página do produto, no
  feed, nos favoritos ou nos recentes
- **Então** nenhum selo de verificação é mostrado

#### AC-11809 — Aprovar a loja não concede o selo

- **Dado** uma loja aguardando aprovação
- **Quando** a administração aprova a loja e ela entra no ar
- **Então** a loja fica ativa e sem selo de verificação

#### AC-11810 — Reativar ou restaurar a loja não traz o selo de volta

- **Dado** uma loja verificada que foi suspensa, desativada ou excluída
- **Quando** a administração a reativa ou restaura
- **Então** a loja volta ao ar sem selo
- **E** o selo só volta com uma nova concessão

#### AC-11811 — O selo é da loja, não do dono

- **Dado** um dono com duas lojas, uma verificada e outra não
- **Quando** a loja não verificada é exibida
- **Então** ela aparece sem selo

#### AC-11812 — Trocar os dados conferidos tira o selo

- **Dado** uma loja verificada
- **Quando** a razão social, o número do documento ou o endereço da loja muda
- **Então** o selo deixa de aparecer no público
- **E** a trilha registra que a verificação foi encerrada por mudança de dado

#### AC-11813 — Selo vencido some sozinho

- **Dado** uma loja verificada cuja validade terminou
- **Quando** a vitrine ou o feed é consultado depois do vencimento
- **Então** a loja aparece sem selo, sem precisar de ação da administração

### US-11804 — O dono acompanha a verificação da própria loja

Como dono de loja, quero ver no painel se a minha loja é verificada e até
quando, para saber o que os clientes estão vendo.

#### AC-11814 — O painel mostra a situação do selo, sem os bastidores

- **Dado** o dono de uma loja verificada, vencida ou nunca verificada
- **Quando** ele abre a área da loja no painel
- **Então** vê a situação ("Verificada até mês/ano", "Verificação vencida" ou
  "Não verificada") e o que o selo significa
- **E** não vê quem concedeu nem as notas internas da administração

### US-11805 — O selo não pode ser imitado nem quebrar a vitrine

Como dono do produto, quero que o selo venha só da administração e que a sua
chegada não derrube nenhuma loja, para proteger a confiança e a operação.

#### AC-11815 — O dono não se dá o selo

- **Dado** um dono ou alguém da equipe da loja
- **Quando** envia, por qualquer formulário ou chamada do painel, um campo de
  verificação ou de selo
- **Então** o campo é ignorado ou recusado
- **E** a loja continua sem selo

#### AC-11816 — O texto livre da loja não usa os termos reservados

- **Dado** o dono editando o nome, a descrição, o "sobre" ou o banner da loja
- **Quando** ele escreve uma expressão reservada ao selo (por padrão "loja
  verificada", "loja certificada", "loja homologada" e "revenda oficial"; a
  lista final sai da Q-11805)
- **Então** a tela avisa que a expressão é reservada ao selo da plataforma e
  não salva
- **E** palavras soltas como "verificado" em outro sentido ("produto
  verificado na entrega") continuam permitidas

#### AC-11817 — A vitrine continua abrindo antes e depois do campo novo

- **Dado** a versão do site que ainda não conhece o selo e a versão que conhece
- **Quando** a API responde com o campo de verificação, ou sem ele
- **Então** as duas versões abrem a vitrine e o feed normalmente
- **E** nenhuma loja aparece como "indisponível" por causa do campo

#### AC-11818 — O selo não vai para buscadores nem para a prévia de link

- **Dado** uma loja verificada
- **Quando** a página dela gera os dados estruturados para buscadores e a
  imagem de prévia de link
- **Então** nenhum dos dois menciona verificação, certificação ou selo, até a
  Q-11809 decidir diferente

## Fora do escopo

- Certificação técnica, homologação de peças ou produtos, oficina autorizada,
  autorização de fabricante ou de marca.
- Filtro "Revendas oficiais" do feed (ASM-11805).
- Consulta a serviço externo de verificação (Receita, birôs) ou qualquer
  custo novo (ASM-11803).
- Selo por produto, avaliações de clientes (#117) e ranking (#124).
- Funções automotivas: compatibilidade veicular, placa ou chassi (P-104).
- Implementar código, alterar banco ou API, publicar texto ou commit nesta fase.

## Suposições

| ID        | Suposição                                                                                                                                                              | Status | Resolução |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| ASM-11801 | Existe um único selo, "Loja verificada"; não haverá níveis nem selos diferentes por ramo                                                                               | aberta | —         |
| ASM-11802 | A verificação usa só o que a administração já recebe: contrato assinado, documento do responsável, comprovante de endereço e o número do documento da loja             | aberta | —         |
| ASM-11803 | Nenhum serviço externo nem custo novo; a conferência é manual, feita pela administração                                                                                | aberta | —         |
| ASM-11804 | "Certificada", "homologada", "oficial" e "autorizada" ficam proibidos por padrão no texto público do selo, porque nenhum órgão certificador está envolvido             | aberta | —         |
| ASM-11805 | O filtro "Revendas oficiais" do Stitch fica fora do escopo, pela mesma razão                                                                                           | aberta | —         |
| ASM-11806 | O prazo para uma revogação sumir do público é o do cache atual da vitrine (60 segundos), ou na hora com invalidação das etiquetas                                      | aberta | —         |
| ASM-11807 | O selo pertence à loja (store_id), não ao dono nem ao CNPJ; cada loja é verificada separadamente                                                                       | aberta | —         |
| ASM-11808 | Suspender, desativar ou excluir a loja encerra a verificação; a volta ao ar exige nova concessão                                                                       | aberta | —         |
| ASM-11809 | A explicação pública mostra só os itens conferidos, por nome genérico ("documento da empresa", "endereço"), e o mês e ano; não mostra número de documento nem endereço | aberta | —         |

## Perguntas em aberto

| ID      | Pergunta                                                                                                                                                      | Status | Resposta |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- |
| Q-11801 | Fazer ou não o selo de loja verificada?                                                                                                                       | aberta | —        |
| Q-11802 | Quais critérios e documentos a loja precisa ter conferidos para receber o selo?                                                                               | aberta | —        |
| Q-11803 | Quem pode conceder: qualquer pessoa da administração, só algumas, ou duas pessoas (uma confere e outra aprova)? A revogação pode ser feita por uma pessoa só? | aberta | —        |
| Q-11804 | Qual a validade do selo e como é a renovação (aviso ao dono antes de vencer)?                                                                                 | aberta | —        |
| Q-11805 | Quais termos podem ser usados no público ("verificada" e outros)? Quem revisa juridicamente o texto da explicação antes de publicar?                          | aberta | —        |
| Q-11806 | A explicação pode mostrar a razão social ou o CNPJ da loja, ou fica só com os itens genéricos?                                                                | aberta | —        |
| Q-11807 | O dono pede a verificação pelo painel, ou a administração decide sozinha quando verificar?                                                                    | aberta | —        |
| Q-11808 | Por quanto tempo a evidência da verificação é guardada e o que acontece com ela quando a loja é removida de vez ou o documento é trocado?                     | aberta | —        |
| Q-11809 | O selo deve aparecer nos dados para buscadores, na prévia de link ou num filtro do feed?                                                                      | aberta | —        |
| Q-11810 | Loja aberta com CPF (pessoa física) também pode receber o selo, com os mesmos critérios?                                                                      | aberta | —        |
