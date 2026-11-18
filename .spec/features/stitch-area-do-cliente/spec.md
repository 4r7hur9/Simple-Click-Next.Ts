# Spec: Continuidade visual de favoritos, pedidos e perfil do cliente

> feature: stitch-area-do-cliente
> status: rascunho

<!--
  Card #111 do RM Board. Bloco de códigos deste card: 11101 a 11199.
  Só especificação (README do #103): nada aqui está aprovado para
  implementação. As telas desta área NÃO existem no ZIP do Stitch (ele só
  mostra as entradas Favoritos, Pedidos e Perfil da barra inferior), então
  as telas derivadas são PROPOSTAS do design.md para o dono revisar.
  Nenhuma pergunta foi respondida por presunção: todas estão "aberta".
-->

## Contexto

O SimpleClick permite criar, personalizar e administrar lojas de segmentos
diferentes. A área do cliente serve às lojas criadas na plataforma: o cliente
guarda favoritos, acompanha pedidos de várias lojas e cuida do próprio perfil.
Universokar e autopeças nos mockups do Stitch são só exemplos visuais (P-104,
P-105); nada de oficina, compatibilidade veicular, placa ou chassi.

Esta spec pede **continuidade visual**: levar a linguagem do Stitch (peças e
tokens do #104) para telas que já existem e funcionam, **sem perder função,
privacidade nem regra de sessão**. O estado atual foi lido no código em
09/11/2026 (evidências no design.md, seção 1):

- `/conta` (visão geral), `/conta/pedidos`, `/conta/pedidos/[id]`,
  `/conta/favoritos`, `/conta/dados`, `/conta/enderecos`, `/conta/seguranca` e
  `/conta/seguranca/aplicativo` existem, com a `LateralDoUsuario` como único
  menu da conta.
- O acompanhamento público por código está em
  `/loja/[slug]/pedido/[token]` e já é `noindex`.
- A leitura do código achou lacunas que o redesign não pode esconder (US-11107):
  remover produto favorito aparenta falhar, e as ações da conta dependem só do
  cookie SameSite para CSRF.

O que **não** é desta spec (para não duplicar o time):

- cabeçalho, barra inferior, rodapé e o retorno depois de entrar
  (`?proximo=`): **#105**;
- axe, estados vazio/erro/carregamento, larguras, toque e a revisão das telas
  sem mockup: **#114** (referências cruzadas abaixo);
- entrada `/escolher-loja`, `/escolher-loja/nova` e `/vender`: #112 e #105.

### Referências cruzadas (outros cards)

| Assunto                             | Onde está                                   |
| ----------------------------------- | ------------------------------------------- |
| Estrela de favoritar e seu estado   | #104, AC-10406                              |
| Barra inferior e item ativo         | #104, AC-10414                              |
| Tema claro preservado               | #104, AC-10420, e a pergunta Q-10402        |
| Revisão das telas sem referência    | #114, AC-11403                              |
| Acompanhamento depois do fechamento | #114, AC-11407                              |
| Acessibilidade automática (axe)     | #114, AC-11409                              |
| Vazio, erro e carregamento          | #114, AC-11416                              |
| Retorno depois de entrar            | #105 (critérios próprios, sem repetir aqui) |

## Histórias

### US-11101 — Reencontrar o que guardei

Como cliente, quero ver e gerenciar meus produtos e lojas favoritos, para
voltar a eles sem procurar de novo.

#### AC-11101 — Só vejo os meus favoritos

- **Dado** duas pessoas com contas diferentes, cada uma com favoritos próprios
- **Quando** uma delas abre Favoritos
- **Então** a tela mostra apenas os produtos e as lojas favoritados por ela
- **E** nenhum favorito, recente ou contagem da outra pessoa aparece

#### AC-11102 — Produtos e lojas ficam separados e legíveis

- **Dado** uma pessoa com produtos favoritos, lojas favoritas e lojas visitadas
  nos últimos 30 dias
- **Quando** ela abre Favoritos
- **Então** produtos, lojas favoritas e recentes aparecem em blocos distintos,
  cada um com título
- **E** cada produto mostra foto, nome, preço e a loja, com link para o produto

#### AC-11103 — Tirar dos favoritos some da lista na hora

- **Dado** um produto favorito listado
- **Quando** a pessoa aciona "Tirar dos favoritos"
- **Então** o produto some da lista sem recarregar a página
- **E** se a operação falhar, o produto continua na lista e um aviso diz o que
  fazer (tentar de novo), sem apagar nada
- **E** isso vale para produto e para loja favoritos (a falha atual do produto
  está em US-11107, AC-11125)

#### AC-11104 — A estrela anuncia o que ela faz

- **Dado** a estrela de favoritar de um produto ou de uma loja
- **Quando** um leitor de tela ou o teclado a alcança
- **Então** ela é anunciada com o nome da ação e o estado atual (favoritado ou
  não)
- **E** o estado não depende só da cor ou do preenchimento do ícone (regras
  da estrela: #104, AC-10406)

### US-11102 — Acompanhar meus pedidos de todas as lojas

Como cliente, quero uma lista dos meus pedidos com o estado real de cada um,
para saber o que já saiu e o que falta.

#### AC-11105 — Só vejo os meus pedidos

- **Dado** duas pessoas com pedidos em lojas diferentes
- **Quando** uma delas abre Pedidos
- **Então** a lista traz só os pedidos dela, de todas as lojas onde pediu
- **E** nenhuma loja, total ou código de pedido da outra pessoa aparece

#### AC-11106 — Cada pedido mostra o estado que ele realmente tem

- **Dado** pedidos em estados diferentes (recebido, aceito, em preparo, pronto
  ou saiu, concluído, cancelado)
- **Quando** o cliente abre a lista
- **Então** cada pedido mostra o texto do cliente para o estado real
  (`rotuloDoStatus`), nunca um estado inventado nem o texto interno do painel
- **E** o estado cancelado tem aparência própria, distinta dos concluídos

#### AC-11107 — Os filtros vão no endereço e sobrevivem ao voltar

- **Dado** a lista filtrada por situação, período e loja
- **Quando** o cliente abre um pedido e volta, ou recarrega a página
- **Então** a lista volta com os mesmos filtros (eles estão no endereço)
- **E** nenhum dado pessoal vai para o endereço, só situação, período e loja

#### AC-11108 — Pedido de outra pessoa é igual a pedido que não existe

- **Dado** o endereço do detalhe de um pedido de outra pessoa e o de um pedido
  inexistente
- **Quando** o cliente abre cada um
- **Então** as duas respostas são a mesma tela de "pedido não encontrado"
- **E** a tela não revela se o pedido existe

### US-11103 — Ver o pedido andando

Como cliente, quero ver a etapa atual e o histórico do pedido, para saber o
que está acontecendo sem chamar a loja.

#### AC-11109 — A linha do tempo mostra a etapa real

- **Dado** um pedido que muda de etapa
- **Quando** o cliente o consulta (detalhe da conta ou link público)
- **Então** a linha do tempo marca a etapa atual e lista as anteriores, com o
  texto do cliente (`rotuloDoStatus`, `explicacaoDoStatus`)
- **E** uma etapa que o sistema ainda não suporta é mostrada com texto neutro,
  sem quebrar a tela

#### AC-11110 — O acompanhamento atualiza sozinho

- **Dado** o detalhe de um pedido aberto
- **Quando** a loja muda a etapa
- **Então** a tela passa a mostrar a nova etapa em até 5 segundos, sem recarregar
  (intervalo já existente em `INTERVALO_DO_ACOMPANHAMENTO_MS`)
- **E** se a atualização falhar, a última etapa conhecida continua visível com
  um aviso discreto

#### AC-11111 — O link público mostra só os campos permitidos

- **Dado** o link público de um pedido (`/loja/[slug]/pedido/[token]`)
- **Quando** qualquer pessoa com o link o abre
- **Então** a tela traz só: número, código, estado, forma de receber e de
  pagar, total, data, nome do cliente, telefone **mascarado**, nome e WhatsApp
  público da loja, itens com opções e o histórico de etapas
- **E** não aparece CPF, e-mail, endereço salvo nem telefone completo
- **E** a página pede aos buscadores para não indexar (`noindex`) e não é
  guardada em cache

#### AC-11112 — Código errado e código de outra loja dão a mesma resposta

- **Dado** um código mal formado, um código que não existe e um código válido
  aberto com o apelido de outra loja
- **Quando** cada um é aberto
- **Então** os três mostram a mesma tela "pedido não encontrado"
- **E** o código do pedido não aparece em título, log nem ferramenta de métricas

### US-11104 — Cuidar do meu perfil, endereços e privacidade

Como cliente, quero ver e editar só os meus dados, endereços e consentimentos,
para manter a conta correta e sob o meu controle.

#### AC-11113 — Só vejo e edito os meus dados

- **Dado** duas pessoas com dados diferentes
- **Quando** uma abre Dados e salva uma alteração
- **Então** a tela mostra e grava só os dados dela
- **E** o e-mail aparece como dado fixo, com a explicação de que não muda aqui

#### AC-11114 — Meus endereços são só meus e há um só padrão

- **Dado** duas pessoas, cada uma com endereços salvos
- **Quando** uma delas abre Endereços
- **Então** vê, cria, edita, apaga e marca como padrão apenas os dela
- **E** nunca existe mais de um endereço padrão
- **E** apagar o padrão não deixa a tela sem explicar o que muda

#### AC-11115 — Exportar e excluir a conta pedem confirmação forte

- **Dado** a área de privacidade em Segurança
- **Quando** a pessoa pede a exportação dos dados ou a exclusão da conta
- **Então** a exportação pede a senha, e a exclusão pede a senha e a palavra
  EXCLUIR
- **E** a tela explica as respostas possíveis: senha incorreta, limite de
  exportações, conta com loja ou conta de administração (exclusão recusada)
- **E** depois de excluir, a sessão local é encerrada e a pessoa sai do site

#### AC-11116 — Aceites ficam visíveis e registrados

- **Dado** a pessoa com aceites de termos e privacidade registrados
- **Quando** ela abre Segurança
- **Então** vê o histórico de aceites e o que falta aceitar
- **E** aceitar uma versão nova continua registrando a data

### US-11105 — A sessão e a segurança da conta continuam firmes

Como cliente, quero que trocar a senha, sair e usar um aparelho compartilhado
não deixem meus dados expostos.

#### AC-11117 — Trocar a senha derruba as outras conexões, com a janela dita

- **Dado** uma conta conectada em dois aparelhos
- **Quando** a pessoa troca a senha num deles
- **Então** a conexão do outro aparelho é encerrada na próxima renovação, em
  até 15 minutos (vida do token de acesso)
- **E** a tela **não promete** encerramento imediato
- **E** a conexão atual continua aberta

#### AC-11118 — Eu não encerro a conexão de outra pessoa

- **Dado** a pessoa A e a pessoa B, cada uma com conexões abertas
- **Quando** A tenta encerrar a conexão de B pelo identificador
- **Então** a resposta é "não encontrada" e nenhuma conexão muda
- **E** a lista de conexões de A mostra só as de A

#### AC-11119 — Sair apaga a sessão deste navegador mesmo se a revogação falhar

- **Dado** a pessoa logada e a API de revogação indisponível
- **Quando** ela escolhe Sair
- **Então** os cookies de sessão deste navegador são apagados
- **E** a tela avisa que a conexão pode continuar ativa em outros aparelhos

#### AC-11120 — Depois de sair, nada da pessoa anterior aparece

- **Dado** a pessoa A saiu e a pessoa B entrou no mesmo navegador
- **Quando** B abre Favoritos, Pedidos, Dados e a visão geral, ou usa o botão
  Voltar do navegador
- **Então** nenhuma tela mostra favorito, recente, pedido, endereço ou métrica
  de A
- **E** o Voltar depois de sair leva à tela de acesso, não ao conteúdo de A

#### AC-11121 — Chave e códigos do aplicativo autenticador não vazam

- **Dado** a ativação do aplicativo autenticador (chave e códigos de
  recuperação)
- **Quando** a pessoa a conclui, navega adiante ou usa o Voltar
- **Então** a chave e os códigos nunca aparecem em endereço, título nem
  armazenamento do navegador
- **E** eles não reaparecem depois de a pessoa sair da tela

### US-11106 — Andar entre conta e loja sem se perder

Como cliente, quero alternar entre a minha conta e as lojas sem entrar de novo
nem perder onde eu estava.

#### AC-11122 — As seções da conta têm uma navegação própria e clara

- **Dado** a pessoa em qualquer tela de `/conta`
- **Quando** ela quer ir a Visão geral, Pedidos, Favoritos, Dados, Endereços ou
  Segurança
- **Então** vê a lista das seções com a atual marcada e anunciada como página
  atual
- **E** no celular, `/conta` funciona como a página inicial das seções
  (decisão em Q-11103)

#### AC-11123 — "Voltar à loja" leva à loja certa

- **Dado** o cliente que chegou à conta saindo de uma loja
- **Quando** aciona "Voltar à loja"
- **Então** vai à vitrine dessa mesma loja
- **E** o apelido vem da resposta da API e não de um parâmetro do endereço

#### AC-11124 — Alternar não pede para entrar de novo

- **Dado** o cliente logado numa loja
- **Quando** abre a conta e depois volta a qualquer loja
- **Então** continua logado nas duas, com o mesmo cookie de sessão
- **E** nenhuma tela mostra o convite "entrar" ou "criar conta" por engano

### US-11107 — Lacunas encontradas na leitura (condicionadas a decisão)

Como dono do produto, quero ver as lacunas que o redesign não deve esconder,
para decidir se entram neste trabalho ou num card próprio. Cada critério abaixo
só vale **depois** da resposta (Q-11105 e Q-11106); nada aqui está decidido.

#### AC-11125 — Tirar produto dos favoritos funciona de ponta a ponta

- **Dado** um produto favorito listado em `/conta/favoritos`
- **Quando** a pessoa o remove
- **Então** a remoção chega à API pelo caminho exato `favoritos/produtos/<id>`
  (id no formato de UUID) e responde sucesso
- **E** o proxy da conta continua recusando caminhos fora da lista, entre eles
  `favoritos/produtos/x/y`, segmento com `%2F` ou `..`, `feed/favoritos`,
  `metricas` e `GET excluir`

#### AC-11126 — Ações da conta de fora do site são recusadas

- **Dado** uma requisição POST, PATCH ou DELETE para `/api/conta/*` vinda de
  outra origem, ou com `Sec-Fetch-Site: cross-site`
- **Quando** ela chega ao proxy
- **Então** a resposta é 403 e a API não é chamada
- **E** corpo que não seja `application/json` recebe 415

#### AC-11127 — Acesso vencido não vira laço de entrada

- **Dado** o cookie de sessão presente, mas o acesso vencido e a renovação
  recusada
- **Quando** a pessoa abre uma página da conta
- **Então** vai para a tela de acesso uma única vez, sem voltar à conta e
  recair na tela de acesso em repetição
- **E** o retorno depois de entrar segue os critérios do #105

### US-11108 — Cara nova sem perder função nem conteúdo real

Como dono do produto, quero que o redesign troque o visual e mantenha as
funções, para não regredir o que já funciona.

#### AC-11128 — Toda função existente continua

- **Dado** as funções atuais da área do cliente (favoritar e desfavoritar,
  filtrar pedidos, ver detalhe, editar dados, gerenciar endereços, trocar senha,
  ver e encerrar conexões, ativar e desativar o aplicativo autenticador,
  aceites, exportar e excluir)
- **Quando** o redesign for entregue
- **Então** cada função continua disponível e os testes atuais dessas áreas
  passam sem alteração
- **E** nenhuma função nova entra sem decisão registrada (P-107)

#### AC-11129 — Nada do Stitch vira conteúdo de produção

- **Dado** os textos, números, nomes e imagens exibidos na área do cliente
- **Quando** conferidos contra o ZIP do Stitch
- **Então** nenhum CNPJ, telefone, nota, prazo, cupom, promessa ou imagem
  externa do mockup aparece (P-103, P-105)
- **E** os exemplos usados em protótipos vêm de lojas e produtos de segmentos
  variados, e nunca automotivos (P-104)

#### AC-11130 — Ação em andamento e erro de ação são mostrados

- **Dado** qualquer ação da área (remover favorito, salvar dados, salvar
  endereço, trocar senha)
- **Quando** a ação está em andamento ou falha
- **Então** o botão mostra o estado pendente e não aceita clique duplo
- **E** uma falha mostra mensagem clara com a saída (tentar de novo), sem apagar
  o que a pessoa digitou

## Camada de prova de cada critério

Um teste da web com `fetch` simulado prova a **tela**, não o isolamento entre
pessoas. Por isso cada critério diz quem o prova (decisão D-4 do design; a
aceitação de teste legado como prova é a Q-11111).

| Critérios                              | Camada de prova                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| AC-11101, AC-11105, AC-11108, AC-11113 | API com banco (testes atuais de `apps/api/tests`) e e2e com duas contas (#114) |
| AC-11114, AC-11118, AC-11112           | API com banco (testes atuais) e teste de tela                                  |
| AC-11102, AC-11103, AC-11104, AC-11106 | teste de tela `*.onp.test.tsx` em `apps/web/tests`                             |
| AC-11107, AC-11109, AC-11110, AC-11130 | teste de tela `*.onp.test.tsx` em `apps/web/tests`                             |
| AC-11111, AC-11122, AC-11123, AC-11124 | teste de tela e de rota; e2e do #114 para a jornada                            |
| AC-11115, AC-11116, AC-11117, AC-11121 | API (testes atuais) e teste de tela para as mensagens                          |
| AC-11119, AC-11120                     | teste de ação do servidor e e2e com troca de conta (#114)                      |
| AC-11125, AC-11126, AC-11127           | teste do proxy `*.onp.test.ts` (só se a pergunta correspondente for aprovada)  |
| AC-11128, AC-11129                     | regressão dos testes atuais; varredura de texto (P-105) e revisão do dono      |

## Fora de escopo

- Implementar código, criar testes, alterar banco, API ou dependências.
- Cabeçalho, barra inferior, rodapé e retorno depois de entrar (#105).
- Axe, estados vazio/erro/carregamento, larguras e toque (#114).
- Painel do lojista e administração (#112, #113).
- Funções "A decidir" (#115–#120, #123–#126): fidelidade, cupons, avaliações e
  afins não são dependência (P-107).
- Compatibilidade veicular, placa, chassi ou oficina (P-104).
- Commit, push, PR, merge, worktree ou troca de branch.

## Suposições

| ID        | Suposição                                                                                                                                       | Status | Resolução |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| ASM-11101 | As funções atuais são preservadas; não há mudança em `apps/api` nem no banco, e o proxy web só muda se as perguntas Q-11105 e Q-11106 aprovarem | aberta | —         |
| ASM-11102 | Os textos de estado do cliente continuam vindo de `rotuloDoStatus` e `explicacaoDoStatus`; nenhuma etapa nova é criada                          | aberta | —         |
| ASM-11103 | O verde da marca é #B7FF00 e as peças vêm do #104; os wireframes são neutros em relação ao tema até a Q-10402 e a Q-11104                       | aberta | —         |
| ASM-11104 | O retorno depois de entrar e a barra inferior são do #105; esta spec só os referencia                                                           | aberta | —         |
| ASM-11105 | Testes `*.onp.test.tsx` provam a tela e o proxy; isolamento entre pessoas é provado pela API com banco e pelo e2e do #114                       | aberta | —         |
| ASM-11106 | Axe, vazio, erro, carregamento e larguras ficam no #114; as telas desta spec apenas os suportam                                                 | aberta | —         |
| ASM-11107 | Telas fora do ZIP exigem proposta visual própria; o design.md traz wireframes textuais comparáveis                                              | aberta | —         |
| ASM-11108 | O token de acesso dura 15 minutos (`apps/api/src/modules/auth/token.ts`), então a revogação por troca de senha chega em até esse prazo          | aberta | —         |

## Perguntas em aberto

| ID      | Pergunta                                                                                                                                                   | Status | Resposta |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- |
| Q-11101 | Quais telas entram na primeira onda: só Favoritos e Pedidos, ou também Perfil, Endereços e Segurança?                                                      | aberta | —        |
| Q-11102 | Em que formato o dono avalia as telas derivadas: wireframe textual do design.md, protótipo na vitrine de peças (/ui) ou imagens geradas?                   | aberta | —        |
| Q-11103 | A navegação da conta substitui a `LateralDoUsuario` ou convive com ela, e no celular `/conta` vira a página inicial das seções "Perfil"? (liga com o #105) | aberta | —        |
| Q-11104 | A conta segue o tema do sistema ou fica sempre escura, e a lateral escura forçada continua? (liga com a Q-10402 do #104)                                   | aberta | —        |
| Q-11105 | O defeito de remover produto favorito entra neste redesign ou num card próprio de correção?                                                                | aberta | —        |
| Q-11106 | A proteção de origem e de tipo de conteúdo nas ações da conta (AC-11126) entra aqui ou num card de segurança?                                              | aberta | —        |
| Q-11107 | A lista de pedidos também atualiza sozinha, como o detalhe, ou só o detalhe (hoje só o detalhe atualiza)?                                                  | aberta | —        |
| Q-11108 | A visão geral com métricas e gastos continua, é reduzida ou sai da página inicial da conta?                                                                | aberta | —        |
| Q-11109 | No texto, a loja favorita é "Favoritar" ou "Seguir"? (o Stitch usa "Seguir loja")                                                                          | aberta | —        |
| Q-11110 | CPF e telefone aparecem completos em Dados ou mascarados, com opção de mostrar?                                                                            | aberta | —        |
| Q-11111 | Testes antigos de API valem como prova de isolamento, ou o dono exige testes `*.onp` e e2e novos para cada critério?                                       | aberta | —        |
| Q-11112 | Encerrar a conexão de outra pessoa hoje só é barrado pela política do banco; vale pedir uma checagem extra na API num card de segurança?                   | aberta | —        |
