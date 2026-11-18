# Spec: Expansão visual da administração da plataforma

> feature: stitch-admin-plataforma
> status: rascunho

<!--
  Card #113 do RM Board. Bloco de códigos deste card: 11301 a 11399.
  Spec de ESPECIFICAÇÃO: nada implementado e nada aprovado. A administração
  não tem mockup no Stitch; a proposta aplica os tokens e peças do #104 às
  telas que já existem. Evidências, inventários e donos de arquivo em
  design.md. Testes futuros: *.onp.test.ts(x) em apps/web (o verify só roda
  os projetos web e unit). Nenhuma resposta das perguntas foi presumida.
-->

## Contexto

O SimpleClick permite criar, personalizar e administrar lojas de diferentes
segmentos. A administração da plataforma (`/admin`) já faz: início com
métricas de crescimento, lista e ficha de lojas (resumo, cadastro, contrato e
documentos, funcionalidades, histórico), lista e ficha de contas, aprovação,
recusa, ativação, desativação, suspensão, exclusão e restauração de lojas,
limites e trilha de auditoria. O ZIP do Stitch não tem nenhuma tela de
administração (matriz do #103, seção 4.6). Esta spec propõe só a
**atualização visual** dessas telas com a base visual do #104 e os padrões
de tela do #112 (cabeçalho de página, filtros, tabela com ações, ficha com
abas, janela de confirmação, estados), para a administração e o painel do
lojista parecerem um produto só.

O que **não** muda: quem pode entrar, como as lojas são aprovadas, quais
dados a administração enxerga, as confirmações, os registros na trilha, os
contratos e as rotas. Como a reforma é visual, o risco real é ela soltar
dado pessoal, enfraquecer uma confirmação ou mexer em cache por acidente; por
isso as três primeiras histórias travam o que já existe e só depois vêm as
telas.

Fora do alcance: selos públicos de loja (#118), tema escuro do cliente
(decisão do dono, Q-10304) e qualquer função "A decidir". Exemplos de
Universokar/autopeças do Stitch não são conteúdo (P-104, P-105).

## Histórias

### US-11301 — A reforma não abre a administração a quem não é da administração

Como pessoa responsável pela plataforma, quero que a reforma visual não mude
quem consegue ver ou fazer algo na administração, para que o acesso continue
tão fechado quanto hoje.

#### AC-11301 — Quem não é da administração continua recusado em todas as telas

- **Dado** uma pessoa sem papel de administração (cliente, dono, equipe) ou
  sem sessão
- **Quando** ela abre qualquer tela de `/admin` ou chama a ponte da
  administração
- **Então** cada tela mostra o mesmo texto de recusa de hoje e nenhum dado
  de loja ou de conta (a API responde 401 sem sessão e 403 com a sessão
  errada)
- **E** o texto das sete mensagens de sessão da administração não muda

#### AC-11302 — O contador de lojas pendentes não vaza

- **Dado** o menu da administração com o selo de lojas aguardando aprovação
- **Quando** o menu é montado para quem não é da administração, ou com a API
  fora do ar
- **Então** o selo mostra zero ou não mostra número nenhum
- **E** o número é calculado a cada requisição, sem cache compartilhado
  entre pessoas

#### AC-11303 — A recusa não revela o que existe

- **Dado** uma pessoa que não é da administração
- **Quando** ela abre a ficha de uma loja que existe e a de uma que não
  existe
- **Então** as duas telas são iguais e não repetem o código nem o termo
  digitado

#### AC-11304 — A reforma não acrescenta caminho à ponte

- **Dado** a lista fechada de caminhos que o site repassa à API da
  administração
- **Quando** a reforma visual é aplicada
- **Então** caminho fora da lista continua recebendo 404 e requisição sem
  cookie continua recebendo 401
- **E** nenhuma entrada é acrescentada por causa deste card (entradas de
  outros cards, como o #118, são decididas nos cards deles)

### US-11302 — Dado pessoal não se espalha com a nova aparência

Como pessoa responsável pelos dados das lojas e dos donos, quero que a
reorganização das telas não mostre nem guarde dado pessoal em lugar novo.

#### AC-11305 — Nenhum campo pessoal novo em lista, cartão ou ficha

- **Dado** o inventário de dado pessoal por tela do design.md (CPF ou CNPJ,
  e-mail, telefone e endereço, com a tela onde cada um aparece e se a leitura
  é auditada)
- **Quando** as telas reformadas são exibidas
- **Então** cada tela mostra só os campos pessoais do inventário, nem mais
- **E** o documento do responsável aparece só na ficha da loja, como hoje

#### AC-11306 — O termo de busca não vai para título, link nem mensagem

- **Dado** uma busca por nome, CNPJ, e-mail ou telefone nas listas de lojas
  e de contas
- **Quando** a lista mostra resultado, vazio ou erro
- **Então** o termo não aparece no título da página, em link que leva para
  fora do site nem na mensagem de "nada encontrado"

#### AC-11307 — Dado administrativo nunca fica em cache

- **Dado** as telas da administração e a ponte
- **Quando** o código das telas é examinado e a ponte responde
- **Então** não há `"use cache"` nem `unstable_cache` em `app/(admin)` nem em
  `features/admin*`, e dado administrativo não é buscado em Server Component
  sem `no-store`
- **E** toda resposta da ponte traz `cache-control: no-store`

#### AC-11308 — O contrato da ficha não sai da administração

- **Dado** os contratos `admin-*` de `packages/contracts`
- **Quando** o código do site é examinado
- **Então** nenhum arquivo fora de `app/(admin)`, `features/admin*`,
  `server/admin-api.ts` e `features/painel/MenuDaAdministracao.tsx` os
  importa (as páginas públicas da loja não usam contrato de administração)

#### AC-11309 — O documento continua fora da página

- **Dado** a aba de contrato e documentos de uma loja
- **Quando** a administração pede para abrir um documento
- **Então** o link é gerado no clique, vale poucos minutos e nunca fica no
  HTML da página
- **E** não há pré-visualização embutida nem botão de copiar o link, e o
  arquivo baixa como anexo, com os cabeçalhos que a ponte já repassa
  (`content-disposition`, `x-content-type-options`,
  `content-security-policy`)

#### AC-11310 — Título sem dado de pessoa e nada de dado pessoal no console

- **Dado** as páginas e telas da administração reformadas
- **Quando** o título da aba e o console do navegador são conferidos
- **Então** o título é fixo e não leva nome de loja, e-mail nem documento
- **E** nenhuma tela reformada escreve dado pessoal em `console.*`

### US-11303 — As ações importantes continuam pedindo confirmação e deixando rastro

Como pessoa da administração, quero reconhecer de relance quais ações são
sérias e ter certeza de que cada uma ainda pede confirmação e fica
registrada.

#### AC-11311 — Aprovar, ativar e desativar pedem confirmação antes de enviar

- **Dado** uma loja em situação que permite aprovar, ativar ou desativar
- **Quando** a administração clica no botão do ato
- **Então** abre a janela de confirmação com as consequências do ato
- **E** nenhuma requisição sai antes do segundo clique, no botão de confirmar

#### AC-11312 — Recusar e suspender exigem o motivo

- **Dado** a janela de confirmação de recusar ou o passo de suspender
- **Quando** a administração confirma sem escrever o motivo
- **Então** a tela mostra o aviso do motivo e nada é enviado

#### AC-11313 — Excluir exige digitar o nome da loja

- **Dado** o passo de excluir uma loja
- **Quando** o nome digitado é diferente do nome da loja
- **Então** o botão de confirmar fica desabilitado e nada é enviado

#### AC-11314 — O ato enviado e o registro na trilha não mudam

- **Dado** cada ato (aprovar, recusar, ativar, desativar, suspender,
  reativar, excluir, restaurar)
- **Quando** a administração o confirma
- **Então** a tela envia ao mesmo endereço e com o mesmo corpo de hoje
- **E** a API continua gravando o ato na trilha, o que os testes de API
  atuais seguem provando como portão (a prova só de tela não alcança isso)

#### AC-11315 — O tom de cada ato é reconhecível e não depende só da cor

- **Dado** a tabela ato → tom do design.md (hoje só recusar e excluir usam o
  tom de perigo na confirmação)
- **Quando** o botão e a janela de um ato são exibidos
- **Então** o ato destrutivo tem tom de perigo, nome e texto de consequência
  explícitos, além da cor
- **E** o ato reversível não usa o tom de perigo

#### AC-11316 — Sem ação em lote e a janela continua modal

- **Dado** a lista de lojas e a janela de confirmação
- **Quando** a reforma é aplicada
- **Então** não existe seleção em lote para aprovar, recusar ou excluir
- **E** a janela segue abrindo com `showModal()`, com foco preso e Esc, e não
  é trocada pelo `Dialogo` do pacote enquanto a Q-10408 do #104 não for
  respondida

### US-11304 — Listas de lojas e de contas claras e reconhecíveis

Como administrador, quero revisar lojas e contas numa lista clara, com
filtros e ações reconhecíveis.

#### AC-11317 — Cada lista mostra os quatro estados com as peças comuns

- **Dado** a lista de lojas e a lista de contas
- **Quando** estão carregando, vazias, com erro ou sem sessão
- **Então** cada estado aparece com as peças comuns (`Carregando`, `Vazio`,
  `Erro`, `Aviso`) e o texto atual de cada situação

#### AC-11318 — Filtro, busca e página continuam no endereço

- **Dado** uma lista filtrada por situação, busca e página
- **Quando** a administração copia o endereço ou recarrega
- **Então** a mesma consulta é refeita, como hoje
  (`consultaDoEndereco` e `enderecoDaLista`)
- **E** os filtros por situação aparecem como chips do #104 com o estado
  marcado anunciado

#### AC-11319 — A lista cabe no celular sem rolagem lateral da página

- **Dado** a lista de lojas ou de contas em 344px de largura
- **Quando** a administração a abre
- **Então** nenhuma coluna empurra a página para os lados (a tabela vira
  cartões ou rola dentro do próprio quadro)
- **E** esta prova depende de navegador e fica para o e2e do #114

### US-11305 — Fichas de loja e de conta organizadas

Como administrador, quero abrir a ficha de uma loja ou de uma conta e achar
cada informação no seu bloco, com a situação sempre à vista.

#### AC-11320 — A ficha da loja mantém as cinco abas como navegação

- **Dado** a ficha de uma loja
- **Quando** a administração troca de aba
- **Então** cada aba continua sendo uma página própria (Resumo, Cadastro,
  Contrato e documentos, Funcionalidades, Histórico), com a atual marcada
  por `aria-current="page"`
- **E** o cabeçalho mostra nome, situação e o ato disponível

#### AC-11321 — A situação da loja aparece por selo com texto

- **Dado** uma loja em qualquer situação (em análise, ativa, recusada,
  inativa, suspensa, excluída)
- **Quando** ela aparece na lista ou na ficha
- **Então** a situação aparece num `Selo` com o nome por extenso, nunca só
  por cor ou ícone
- **E** nenhum selo de "loja verificada" é criado aqui (é o #118)

#### AC-11322 — A ficha da conta mostra o limite de lojas do dono

- **Dado** a ficha de uma conta de dono
- **Quando** ela é aberta
- **Então** mostra o contato, a lista de lojas da conta e o limite de lojas
  com o uso atual, no mesmo bloco de hoje, com a mesma regra de edição

### US-11306 — Cadastro, documentos e funcionalidades com as peças comuns

Como administrador, quero que os formulários e as telas de apoio da loja
usem as mesmas peças e mensagens do resto da administração.

#### AC-11323 — Nova loja e cadastro mostram erro no campo certo

- **Dado** o formulário de nova loja e o de cadastro da loja
- **Quando** um campo obrigatório falta ou é inválido
- **Então** o erro aparece junto do campo e é anunciado a leitores de tela
  (`Campo` do pacote)
- **E** as regras de validação atuais não mudam

#### AC-11324 — Documentos mantêm o envio, a lista e o download

- **Dado** a aba de contrato e documentos
- **Quando** a administração envia, lista ou baixa um documento
- **Então** envio, lista e download funcionam como hoje, com os estados de
  carregando, vazio e erro nas peças comuns

#### AC-11325 — Funcionalidades continuam exigindo o motivo

- **Dado** a aba de funcionalidades
- **Quando** a administração liga ou desliga uma funcionalidade
- **Então** a tela continua pedindo o motivo antes de enviar

### US-11307 — Início e auditoria legíveis

Como administrador, quero ver o crescimento da plataforma e o histórico de
auditoria em cartões e listas legíveis.

#### AC-11326 — Cartões e gráficos do início usam tokens e têm texto

- **Dado** o início da administração
- **Quando** os cartões de número e os gráficos aparecem
- **Então** as cores vêm dos tokens `--cor-*` (sem verde novo, P-102) e
  cada gráfico mantém o texto equivalente (`role="img"` com `aria-label`, ou
  lista com rótulos)
- **E** o contraste de 3:1 das marcas do gráfico é medido no e2e do #114

#### AC-11327 — A auditoria destaca o ato sensível sem expor o dado

- **Dado** uma linha da trilha de um ato sensível (abrir documento, alterar
  configuração sensível)
- **Quando** a lista de auditoria é exibida
- **Então** o ato aparece destacado por texto, além da cor
- **E** valores já mascarados (por exemplo, "…1234") não são reformatados
  como CPF, CNPJ ou telefone

### US-11308 — Teclado, toque e tokens

Como pessoa que usa teclado, leitor de tela ou celular, quero usar a
administração com a mesma qualidade das outras áreas.

#### AC-11328 — Todo controle é alcançado pelo teclado com foco visível

- **Dado** qualquer tela reformada da administração
- **Quando** a pessoa percorre a página só com Tab, Enter, Espaço e Esc
- **Então** todo controle é alcançado e acionado, o foco é visível e a janela
  de confirmação devolve o foco ao botão que a abriu

#### AC-11329 — O alvo de toque segue a decisão do #104

- **Dado** botões, chips e linhas acionáveis nas telas reformadas
- **Quando** o valor do alvo de toque for decidido (P-106 e Q-10405 do #104)
- **Então** as telas usam o token do #104, sem valor próprio
- **E** a medida renderizada é provada no e2e do #114

#### AC-11330 — Nenhuma cor ou medida solta nas telas

- **Dado** os arquivos de `features/admin*` e de `app/(admin)`
- **Quando** o código é examinado
- **Então** não há cor hexadecimal solta nem o verde `#b2f800` (P-102, P-108);
  cores e medidas vêm dos tokens

#### AC-11331 — O tema claro da administração não muda sem decisão

- **Dado** a administração no tema claro de hoje
- **Quando** os tokens do redesign entram
- **Então** as telas mantêm os valores claros atuais (AC-10420 do #104)
- **E** só mudam de tema se o dono responder a Q-11304

## Fora de escopo

- Implementar código, criar testes, alterar banco, API, contratos ou
  dependências.
- Autorização, aprovação de lojas, regras de limite e conteúdo da trilha.
- Selo público de loja verificada (#118), tema escuro do cliente, qualquer
  função "A decidir" (#115–#120, #123–#126); nada automotivo (P-104).
- Menu lateral e moldura (`features/painel/*`), que são do #112.
- Commit, push, PR, merge, worktree ou troca de branch.

## Suposições

| ID        | Suposição                                                                                                                                                                                                                                    | Status | Resolução |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| ASM-11301 | Nenhuma regra comercial nova: contratos, rotas da API, lista da ponte e trilha ficam como estão; outros cards podem alterá-los no próprio card                                                                                               | aberta | —         |
| ASM-11302 | Peça visual que faltar (chip, abas, aviso flutuante) é pedida ao #104; este card só a usa                                                                                                                                                    | aberta | —         |
| ASM-11303 | A moldura (menu lateral, estilo do menu, pé do menu) é do #112; a fila de arquivos é #112 e depois #113                                                                                                                                      | aberta | —         |
| ASM-11304 | Os sete padrões de tela do #112 (cabeçalho de página, barra de filtros, tabela com ações por linha, ficha com abas, janela de confirmação, estados, cartão de métrica) são dele; este card os referencia pelo nome e não cria padrão próprio | aberta | —         |
| ASM-11305 | A administração segue o tema claro de hoje até a decisão do tema (AC-10420)                                                                                                                                                                  | aberta | —         |
| ASM-11306 | O verify só roda os projetos web e unit; por isso as provas desta feature ficam em `apps/web/tests/*.onp.test.ts(x)`, e a prova de API segue nos testes atuais                                                                               | aberta | —         |
| ASM-11307 | Contraste renderizado, larguras de 344, 768 e 1280px e alvo de toque medido dependem de navegador e ficam para o e2e do #114 (AC_SEM_PROVA até lá)                                                                                           | aberta | —         |
| ASM-11308 | Gráfico novo que precise de endpoint novo exige card próprio (a lista da ponte é fechada)                                                                                                                                                    | aberta | —         |

## Perguntas em aberto

| ID      | Pergunta                                                                                                                                                                                | Status | Resposta |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- |
| Q-11301 | A administração entra na onda interna do redesign e em qual ordem em relação ao painel do lojista? (liga com Q-10301)                                                                   | aberta | —        |
| Q-11302 | Quais telas têm prioridade: lojas, ficha da loja, contas, início ou auditoria?                                                                                                          | aberta | —        |
| Q-11303 | A tabela de lojas e de contas fica compacta (mais linhas por tela) ou confortável (mais respiro)?                                                                                       | aberta | —        |
| Q-11304 | A administração fica no tema claro de hoje, adota o escuro do redesign ou segue o sistema? (liga com Q-10304 e Q-10402)                                                                 | aberta | —        |
| Q-11305 | O início ganha gráficos novos (isso pede endpoint e card próprio) ou só recebe o retoque visual dos atuais?                                                                             | aberta | —        |
| Q-11306 | A ficha da loja precisa de uma variante própria para celular (abas em rolagem ou lista) ou basta a versão responsiva atual?                                                             | aberta | —        |
| Q-11307 | A leitura da lista e da ficha de contas (e-mail e telefone) deve passar a ser auditada como a leitura da ficha da loja? Hoje não é.                                                     | aberta | —        |
| Q-11308 | A busca por CNPJ, e-mail ou telefone deve sair do endereço da página (hoje vai em `?busca=`) e as telas da administração devem enviar `Referrer-Policy: no-referrer`?                   | aberta | —        |
| Q-11309 | Quem não é da administração deve ser redirecionado no servidor, ou ao menos a casca e o menu devem sumir, em vez de ver o menu com a mensagem de sessão? E as páginas ganham `noindex`? | aberta | —        |
| Q-11310 | Quem é o dono do estilo do cartão de consentimento de `packages/ui/styles/legal.css`, que aparece na administração e não tem dono na seção 7 do #103?                                   | aberta | —        |
| Q-11311 | A prova de API desta feature pode usar o projeto `api-int` no verify (pedido ao gerente e ao #103) ou fica só a prova na web mais os testes atuais de API?                              | aberta | —        |
| Q-11312 | Alterar limites de loja e do dono, que hoje salvam sem confirmação, deve passar a pedir confirmação? Hoje a regra existente é preservada.                                               | aberta | —        |
| Q-11313 | Quais atos levam o tom de perigo: só recusar e excluir (como hoje) ou também desativar e suspender?                                                                                     | aberta | —        |
