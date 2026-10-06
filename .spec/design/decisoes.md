# Decisões do projeto

Registro das escolhas confirmadas pelo dono do produto e das que ainda faltam.
Formato: contexto → decisão → consequência. Uma decisão sai desta lista somente
quando deixa de valer.

## Decididas

### 2026-08-17 — Frontend é Next.js com React, sem HTMX

- **Contexto:** o pedido inicial citava HTMX com Tailwind e também React com
  Next e TypeScript. As duas abordagens competem pelo mesmo papel.
- **Decisão:** Next.js com App Router e React Server Components, mais Tailwind.
  HTMX fica fora.
- **Consequência:** o benefício que o HTMX traria (HTML vindo do servidor, pouco
  JavaScript no cliente) é entregue pelos Server Components, com tipagem de ponta
  a ponta e um único paradigma para manter. Fica valendo a regra de só marcar
  componente como interativo nas folhas que realmente precisam.

### 2026-08-17 — Regra de negócio mora em API própria, não no Next

- **Contexto:** o mesmo domínio precisa servir web hoje e aplicativos Kotlin e
  Swift depois.
- **Decisão:** API separada em Express com TypeScript como fonte única de verdade
  de negócio. O Next consome essa API.
- **Consequência:** o aplicativo nativo futuro consome exatamente a mesma API, sem
  reescrita nem extração de lógica. O custo é manter dois processos e um contrato
  explícito entre eles.

### 2026-08-17 — Isolamento entre lojas é imposto pelo banco

- **Contexto:** três papéis e dados de lojas diferentes na mesma base. Vazamento
  entre lojas é o pior defeito possível deste produto.
- **Decisão:** PostgreSQL com segurança em nível de linha, esquema único, coluna
  de loja em toda tabela de negócio, contexto definido por transação.
- **Consequência:** um erro de programação que esqueça o filtro não vaza dado,
  porque o banco nega por padrão. Em troca, todo acesso precisa passar pelo
  caminho único que abre a transação e define o contexto — e isso é verificado
  mecanicamente.

### 2026-08-17 — Site e API em domínio próprio compartilhado

- **Contexto:** o cookie de sessão precisa funcionar em todo navegador,
  inclusive nos que bloqueiam cookie entre sites por padrão. O crítico apontou
  que essa decisão era pré-requisito de CORS e da política do cookie, e não
  consequência.
- **Decisão:** site em `simpleclick.app` e API em `api.simpleclick.app` — mesmo
  domínio registrável, dois subdomínios.
- **Consequência:** o cookie de sessão funciona sem recorrer a configuração de
  terceiro-partidão, e a lista de origens autorizadas fica fechada e explícita.
  Exige registrar e configurar o domínio **antes** de escrever a autenticação, e
  o certificado precisa cobrir os dois nomes. Some a necessidade de token
  anti-falsificação separado, porque a checagem de origem passa a ser suficiente
  junto da restrição do cookie.

### 2026-08-17 — Hospedagem começa gratuita e migra no lançamento

- **Contexto:** o plano gratuito da Vercel proíbe uso comercial, e o SimpleClick
  é produto comercial mesmo sendo gratuito para o lojista.
- **Decisão:** planos gratuitos apenas para desenvolvimento e demonstração
  interna. Quando a primeira loja real entrar, migrar para plano pago.
- **Consequência:** custo zero durante a construção, com data de virada
  conhecida. Nenhuma loja real pode ser atendida no plano gratuito, e o projeto
  precisa nascer sem depender de recurso que só exista no plano gratuito.

### 2026-08-17 — Segundo fator por código de e-mail, com aplicativo como opção

- **Contexto:** o pedido original era segundo fator por e-mail, que não é fator
  independente, porque é o mesmo canal da recuperação de senha.
- **Decisão:** código por e-mail é o padrão do dono de loja; aplicativo
  autenticador fica disponível como opção e é obrigatório para a administração da
  plataforma.
- **Consequência:** menor atrito para o lojista pouco técnico, com risco
  registrado e aceito. Toda entrada nova gera aviso por e-mail como mitigação.

### 2026-08-17 — Testes com Vitest, ponta a ponta com Playwright

- **Contexto:** o pedido original era Jest. O monorepo usa módulos ES e
  TypeScript, onde o Jest exige configuração extra de transpilação.
- **Decisão:** Vitest para unidade e integração, Playwright para ponta a ponta.
- **Consequência:** mesma forma de escrever teste, sem camada de transpilação e
  com execução mais rápida. Divergência consciente do pedido escrito.

### 2026-08-17 — Impressão por clique é o padrão, automática é opcional

- **Contexto:** o pedido era que o cupom saísse direto na impressora. A via
  automática exige instalar um programa na máquina da loja.
- **Decisão:** a versão 1 imprime pelo navegador com layout de cupom, por clique.
  O modo automático existe como chave que o dono ativa, e depende do agente de
  impressão instalado.
- **Consequência:** toda loja imprime desde o primeiro dia, sem instalar nada, e
  quem tem movimento alto ativa o automático. O custo é manter dois caminhos de
  impressão que precisam gerar o mesmo cupom — e isso vira critério de teste.

### 2026-08-17 — Fila de impressão em PostgreSQL, não em Redis

- **Contexto:** no plano gratuito, o Redis é o primeiro serviço a cair quando o
  crédito termina.
- **Decisão:** a fila de impressão vive no PostgreSQL, com reivindicação por
  travamento e tentativa com espera crescente. Redis fica só para cache
  descartável.
- **Consequência:** se o cache cair, a cozinha continua recebendo pedido. Enfileirar
  a impressão acontece na mesma transação que cria o pedido, então nunca existe
  pedido sem cupom enfileirado.

### 2026-08-17 — Tipo de negócio é alterado somente pela administração

- **Contexto:** o tipo de negócio muda vocabulário e layout de todas as telas.
- **Decisão:** apenas a administração da plataforma altera o tipo de negócio; o
  dono da loja não vê esse campo como editável.
- **Consequência:** a adaptação por ramo é consistente e auditada. O dono que
  precisar mudar de ramo abre pedido para a administração.

### 2026-08-17 — Especificação de produto pertence à categoria

- **Contexto:** cada ramo tem campos próprios, mas quem conhece o catálogo é o
  dono.
- **Decisão:** o dono cria categorias e, dentro de cada categoria, cria as
  especificações dos produtos dela. O ramo apenas sugere o conjunto inicial.
- **Consequência:** uma categoria de pneus pede aro e largura sem que ninguém
  programe nada. Em troca, o registro de especificações precisa ser tipado e com
  histórico, porque pedido antigo exibe o nome da época.

### 2026-08-17 — Controle de estoque é ligado por ramo

- **Contexto:** roupa e autopeça vendem unidade contável; comida não.
- **Decisão:** estoque por variação nasce ativo para roupas, autopeças e
  eletrônicos, e desligado para comida.
- **Consequência:** exige tabela de movimento de estoque com motivo e origem, e
  travamento na confirmação do pedido para não vender a mesma última peça duas
  vezes.

### 2026-08-17 — O dono configura a própria loja

- **Contexto:** onze critérios de aceite consumiam configurações que nenhum
  critério permitia criar.
- **Decisão:** o dono cadastra dentro da própria loja a chave PIX, o horário de
  funcionamento, a taxa de entrega, as formas de pagamento, o contato de
  WhatsApp, a apresentação da página e o formato de impressão.
- **Consequência:** o checkout passa a ter de onde ler o que exibe. Alteração de
  dado sensível como a chave PIX fica destacada no histórico de auditoria.

### 2026-08-17 — Venda conta a partir de aceito, com três números na tela

- **Contexto:** era preciso definir o que entra no faturamento antes de
  implementar qualquer métrica.
- **Decisão:** o pedido conta como venda a partir do momento em que o dono
  aceita. A tela mostra três valores: vendido no período, já concluído e em
  andamento.
- **Consequência:** pedido fantasma e recusado ficam fora do faturamento, e o
  dono enxerga o movimento do dia e o realizado ao mesmo tempo.

### 2026-08-17 — No WhatsApp, o cliente envia para a loja

- **Contexto:** era preciso definir a direção da mensagem antes de escrever o
  gerador de texto e a tela de fechamento.
- **Decisão:** ao fechar o pedido, abre o WhatsApp do cliente com o texto pronto
  endereçado ao número da loja.
- **Consequência:** é o fluxo que o pequeno comércio já usa, e a conversa nasce
  no aparelho do cliente. O acompanhamento acontece pela página de status, não
  por mensagem automática — que exigiria a interface paga da Meta.

### 2026-08-17 — Versão 1 entrega o escopo completo

- **Contexto:** o crítico de completude recomendou cortar cerca de 70 critérios do
  caminho crítico, alertando que mais de 200 testes antes do lançamento é muito
  para uma pessoa.
- **Decisão:** a versão 1 entrega os 249 critérios como planejado, incluindo
  agente de impressão automática, movimento de estoque e composição de tela por
  ramo. O dono do produto reafirmou o escopo depois de ver a recomendação.
- **Consequência:** produto mais forte no lançamento, com prazo maior e volume de
  prova alto. As fases existem para que isso não seja um salto: F1 já é
  demonstrável de ponta a ponta, então a demora não é invisível. Se o prazo
  apertar, a lista de cortes do crítico continua válida e pode ser acionada a
  qualquer momento sem retrabalho de especificação.

### 2026-08-17 — Acesso ao banco com Prisma, sob arranjo obrigatório

- **Contexto:** com 59 tabelas, isolamento forçado, políticas por comando e
  contexto por transação, a escolha da camada de dados define o padrão de todo
  acesso. A recomendação técnica era construtor de consulta tipado.
- **Decisão:** Prisma, escolhido pelo dono do produto pela maturidade do
  ferramental e pela familiaridade.
- **Consequência:** o risco número um da stack passa a morar aqui, e o arranjo
  abaixo deixa de ser preferência e vira obrigação verificada. Cada item existe
  por um modo de falha real:
  1. **Transação interativa por requisição.** O contexto da loja é definido com
     valor de duração limitada à transação. Fora de transação, o valor vaza para a
     próxima requisição que reaproveitar a conexão.
  2. **Cliente cru nunca exportado.** O acesso passa por um único ponto que abre a
     transação e define o contexto; o cliente do Prisma não é acessível a nenhum
     módulo de domínio. Isso é o que o princípio P-004 verifica mecanicamente.
  3. **Duas cadeias de conexão distintas.** A da aplicação passa pelo agrupador de
     conexões em modo transação, com o ajuste que desliga instruções preparadas —
     sem ele, o Prisma quebra de forma intermitente atrás do agrupador. A de
     migração aponta direto ao banco, sem agrupador.
  4. **Credenciais separadas.** A da aplicação não pode contornar o isolamento; só
     a de migração é dona do esquema.
  5. **Migrações escritas à mão.** O Prisma não gera política de isolamento, função,
     gatilho, índice parcial nem verificação de coluna — então o esquema declarado
     serve para gerar tipos, e o conteúdo das migrações é nosso. Nenhuma migração
     entra sem passar pelas nove guardas estruturais.
  6. **Conferir linhas afetadas em toda alteração por identificador.** Alteração que
     atravessa loja devolve zero linhas sem erro; sem essa conferência, o dono de
     outra loja recebe sucesso e nada acontece.
- **Se o arranjo pesar:** o ponto de troca é a tarefa T-006, e só ela. Por isso
  todo acesso passa por um único arquivo — trocar a camada depois é reescrever um
  arquivo, não o sistema.

### 2026-08-17 — Contrato nasce de um esquema único

- **Contexto:** o mesmo contrato precisa servir o site agora e aplicativos Kotlin
  e Swift depois.
- **Decisão:** o esquema de validação que a API já precisa ter é a fonte única, e
  dele é gerado o documento de contrato padrão. O site importa os tipos direto; os
  aplicativos nativos geram o cliente deles a partir do documento.
- **Consequência:** uma fonte de verdade em vez de duas, e o portão de qualidade
  reprova quando o documento publicado divergir do código. Custo: uma camada fina
  de definição de rota e um passo de geração no processo de verificação.

### 2026-08-17 — Imagens no Cloudinary; contrato em balde privado separado

- **Contexto:** era preciso escolher onde ficam as imagens de produto e os
  documentos das lojas.
- **Decisão:** Cloudinary para mídia — imagem de produto, logo e capa —, escolhido
  pelo dono do produto. O contrato assinado e os documentos do responsável ficam
  em armazenamento privado separado.
- **Consequência:** o Cloudinary resolve de graça o que seria trabalho nosso:
  entrega da imagem no tamanho adequado ao dispositivo, que é exigência de dois
  critérios de aceite. Dois limites entram no radar do projeto:
  - a cota gratuita é um **pool único de 25 créditos por mês**, compartilhado entre
    transformação, armazenamento e tráfego de saída — vitrine com muitas fotos
    consome tráfego do mesmo pool, então a virada para plano pago pode chegar antes
    do previsto e precisa de acompanhamento;
  - documento em PDF tem uma configuração de conta que pode bloquear a entrega
    independentemente do controle de acesso do arquivo, o que torna o Cloudinary
    inadequado para contrato. Daí a separação, que também atende à recomendação de
    separar armazenamento por sensibilidade.

### 2026-08-17 — Repositório privado e verificação inteiramente local

- **Contexto:** a verificação automatizada é gratuita e ilimitada em repositório
  público, mas limitada a 2.000 minutos por mês em repositório privado no plano
  gratuito, e uma execução completa deste projeto custa entre 30 e 45 minutos de
  máquina. A alternativa de partir a verificação em duas camadas resolveria a
  cota, mas ao custo de deixar as telas fora do que roda a cada envio.
- **Decisão:** repositório privado e verificação executada inteiramente na máquina
  de desenvolvimento, sem serviço externo. Um comando único roda o portão
  completo. Dois ganchos automatizam o que importa: antes de registrar uma
  alteração, roda o rápido (formatação, tipos do que mudou, busca por segredo);
  antes de enviar ao repositório remoto, roda o portão inteiro e bloqueia o envio
  se algo falhar.
- **Consequência:** código fechado, custo zero, nenhuma cota para administrar e —
  o ganho principal — as telas de ponta a ponta passam a ser cobertas em **todo**
  envio, o que a solução em camadas não entregava. Três consequências a assumir:
  a máquina de desenvolvimento fica ocupada durante a verificação; o resultado não
  fica registrado em histórico externo, então a prova vive no arquivo de
  verificação do projeto; e pular o portão passa a ser tecnicamente possível, por
  isso a saída explícita registra a dívida em arquivo de pendências em vez de
  passar em silêncio.
- **Evolução conhecida:** se um dia fizer falta ter o resultado registrado fora da
  máquina, o caminho é ligar um executor próprio conectado ao repositório — mesma
  execução local, com histórico externo, ainda sem cota.

### 2026-08-17 — Domínio fica para o fim do projeto

- **Contexto:** a decisão de site e API em domínio próprio compartilhado foi
  tomada para que o cookie de sessão funcione em todo navegador. Isso sugeria
  registrar o domínio antes de escrever a autenticação.
- **Decisão:** o domínio não é comprado agora. O desenvolvimento inteiro acontece
  em endereços locais — o site e a API em dois nomes sob o mesmo domínio local,
  servidos com certificado próprio pelo roteador do ambiente.
- **Consequência:** o desenho não muda, porque o ambiente local reproduz
  exatamente a topologia decidida: dois nomes sob um domínio comum, com conexão
  segura. O endereço final vira configuração, não arquitetura. Duas coisas a
  assumir: nada é publicado até o fim do projeto, então não há ambiente para
  mostrar a alguém fora da máquina de desenvolvimento; e o comportamento do cookie
  com domínio real só é confirmado na publicação, embora o ambiente local com
  conexão segura cubra o essencial. O registro do domínio passa a ser tarefa da
  fase de publicação, e deixa de bloquear o começo.

### 2026-10-03 — Pedido em andamento de loja suspensa continua acompanhável (Q-203)

- **Contexto:** suspender tira a loja do ar (AC-209), mas o cliente que já
  pediu tem na mão o link de acompanhamento, recebido pelo WhatsApp. A pergunta
  Q-203 da administração de lojas estava aberta.
- **Decisão:** o cliente CONTINUA acompanhando pela página pública o pedido que
  já fez numa loja suspensa. A vitrine e o fechamento ficam indisponíveis, com a
  mesma resposta de loja inexistente (AC-402). Loja EXCLUÍDA sai do ar por
  inteiro, acompanhamento inclusive.
- **Consequência:** só a rota de acompanhamento resolve a loja por um caminho
  que aceita a suspensa; a vitrine, o carrinho e o fechamento continuam com a
  resolução de antes. O nome e o WhatsApp público da loja chegam à página por
  função dedicada, que devolve só esses dois campos e só para quem tem o link do
  pedido (migração 0039) — a política pública de `stores` continua escondendo a
  loja suspensa de todo o resto. Como loja suspensa não recebe pedido novo, todo
  pedido acompanhado ali é anterior à suspensão. Decidido na orquestração da
  onda 1, em 03/10/2026.

### 2026-10-03 — Funcionalidades por loja: só exceções sobre o padrão ligado

- **Contexto:** o modelo de dados prevê planos, assinaturas e chaves de
  funcionalidade, e a versão 1 é integralmente gratuita (AC-213). A T-207 da
  administração de lojas precisava saber o que nasce agora.
- **Decisão:** nesta versão só existem as EXCEÇÕES por loja
  (`store_feature_overrides`) sobre funcionalidades que nascem ligadas para
  todas (AC-213). Planos e assinaturas ficam para depois. O catálogo inicial de
  chaves é o do modelo de dados — `auto_print`, `custom_domain`, `multi_store` e
  `orders_per_month` —, e só as que têm efeito hoje são aplicadas de fato.
- **Consequência:** sem exceção gravada, a funcionalidade está ligada. A trava
  mora num ponto único (o middleware `exigirFuncionalidade`), aplicado às rotas
  de impressão que existem na base da faixa e documentado para ser ligado às
  rotas novas da fila de impressão na integração. Decidido na orquestração da
  onda 1, em 03/10/2026.
- **Como ficou na T-207 (06/10/2026):** `auto_print` responde pela ÁREA DE
  IMPRESSÃO TÉRMICA do painel do dono — cupom por clique, configuração do papel
  e o lado do dono da impressão automática (estado do agente, pendentes e
  geração do código de pareamento) —, que é o que o AC-212 pede para sumir do
  menu. A lista dessas rotas é `ROTAS_DA_IMPRESSAO_TERMICA`, em
  `apps/api/src/app.ts` (`/:apelido/configuracao/impressao`,
  `/:apelido/pedidos/:id/cupom` e `/:apelido/impressao`), e rota nova com
  apelido no endereço entra nela, e só nela. As rotas do PRÓPRIO AGENTE
  (`/v1/impressao/agente/*`: pareamento, trabalhos, confirmação e falha) não têm
  apelido no endereço e ficam FORA do portão: com a área desligada, nada novo
  entra na fila (`criar-pedido.usecase.ts`), mas o cupom que já estava nela e um
  código gerado pouco antes ainda funcionam. Fechar também essas rotas é
  pergunta ao dono (HarnessPlan.md, 8.2). Só a chave com efeito pode ser
  desligada (as outras respondem 422), e religar apaga a exceção. Proposta da
  faixa, a confirmar com o dono: o nome da chave segue o modelo de dados, mas
  cobre mais que a impressão automática.

### 2026-10-03 — Loja excluída fica 30 dias retida; a remoção definitiva respeita a guarda legal

- **Contexto:** o AC-211 pede exclusão reversível por prazo e remoção definitiva
  depois dele, e a ASM-204 propõe 30 dias. Mas a loja carrega dado que NÃO pode
  ser apagado: os pedidos (guarda fiscal de 5 anos, CDC art. 27 — decisão 9 do
  modelo de dados) e a trilha de auditoria (imutável pela G9, e presa à loja por
  chave estrangeira). Um `DELETE` da linha da loja é impossível de propósito.
- **Decisão:** excluir marca a loja (`status = 'DELETED'`, `deleted_at` e
  `purge_after = deleted_at + 30 dias`). Ela sai das listagens e do ar na hora,
  e a administração pode restaurá-la até o prazo. Vencido o prazo, a remoção
  definitiva — tarefa de segundo plano — apaga o que só servia para operar e o
  que identifica pessoas: a equipe e os convites, os endereços e apelidos
  antigos, os documentos do responsável (arquivo e linha) e a configuração
  (chave PIX, WhatsApp, aparência); e anonimiza o cadastro da loja (nome,
  documento, contato e endereço), liberando o apelido. Ficam os pedidos e a
  trilha, presos a uma linha de loja sem dado pessoal; o catálogo, que não tem
  dado pessoal e é para onde o histórico dos pedidos aponta; e o CONTRATO
  assinado, como prova da relação com a plataforma.
- **Consequência:** a remoção é guiada pela data (`purge_after`) e idempotente:
  uma rodada perdida é recuperada pela seguinte, e duas instâncias não removem a
  mesma loja ao mesmo tempo (trava de linha que pula a já reivindicada). Roda
  pela credencial da administração e registra `LOJA_REMOVIDA` na trilha, sem
  pessoa. A anonimização do dado do COMPRADOR nos pedidos segue a regra própria
  (decisão 9 do modelo), e não esta. A partida da tarefa é do processo da API:
  `main.ts` a entrega a `montarSegundoPlano`, que só sobe com o segundo plano
  ligado (o padrão em produção). A guarda do
  contrato depois da remoção é proposta da faixa, a confirmar com o dono.

### 2026-10-03 — Agente de impressão em Node/TypeScript, dentro do monorepo

- **Origem:** decidido na orquestração da onda 1, ao abrir a faixa de impressão
  (T-607 a T-610).
- **Contexto:** as tarefas do agente e do emulador pediam arquivos em Go, mas o
  projeto não introduz linguagem nem ferramenta nova sem o dono pedir, e tudo o
  que o agente precisa já existe em TypeScript puro, sem dependência externa: o
  contrato do cupom (versão 1), `diagramarCupom`, `lerCupomImpresso` e
  `compilarEscPos`, em `packages/core`.
- **Decisão:** o agente é um programa Node/TypeScript dentro do monorepo, em
  `apps/agente-impressao`, que roda com o Node 24 instalado na máquina da loja,
  sem empacotador nem executável único. A versão 1 fala só com impressora de rede
  (TCP na porta 9100, por `node:net`); impressora USB fica para decisão futura,
  porque exigiria módulo nativo ou chamar o spooler do sistema. O emulador de
  impressora (T-610) também é Node/TypeScript e roda dentro do processo do teste.
- **Consequência:** o cupom tem UMA implementação, a mesma da impressão pelo
  navegador, e o agente não pode divergir dela; nenhuma dependência npm nova. O
  custo é exigir o Node 24 instalado na máquina da loja e não ter, por enquanto,
  instalação como serviço do sistema nem impressora USB. Q-603 (quais sistemas
  na versão 1) continua aberta: o Node roda nos três, mas instalar e manter o
  agente em cada um é outra decisão.

### 2026-10-03 — Fila de impressão: quando enfileira, quando soma a via, e o clique

- **Origem:** decidido na orquestração da onda 1, ao abrir a faixa de impressão.
- **Contexto:** a decisão de 17/08 pôs a fila no PostgreSQL e o enfileiramento na
  transação do pedido, mas deixou abertos três pontos que mudam o que sai no
  papel: em que momento o trabalho entra na fila, quando a via (AC-621) é somada,
  e o que acontece quando o dono imprime por clique um cupom que ainda está na
  fila.
- **Decisão:** o trabalho entra na fila na CRIAÇÃO do pedido, por uma função SQL
  chamada na mesma transação — assim o módulo de pedidos não importa o de
  impressão, e a função só enfileira para a loja com o automático ligado. A via é
  somada na PRIMEIRA reivindicação do trabalho e guardada junto com os blocos; o
  reenvio do mesmo trabalho reaproveita os blocos e não soma via. Imprimir por
  clique um cupom pendente CANCELA o trabalho da fila, e o cupom nunca sai
  duplicado. Uma impressora por loja na versão 1 (Q-601 segue aberta).
- **Consequência:** o pedido que ainda aguarda confirmação no WhatsApp também
  imprime, porque já é pedido criado. Um trabalho que nunca saiu não conta via,
  e por isso a primeira impressão manual dele sai como via 1. Se o agente
  confirmar depois de o dono ter imprimido por clique, o trabalho continua
  cancelado e a contagem de vias do pedido segue sendo a verdade.

### 2026-10-03 — Pareamento do agente: uma impressora, porta fechada sem Redis, pendentes que esperam

- **Origem:** decidido na implementação da T-608 (faixa de impressão, onda 1),
  como consequência das decisões de 03/10 acima; a confirmar com o dono.
- **Contexto:** o pareamento por código de seis dígitos é a única porta da API
  sem credencial nenhuma, e o limite de tentativas da borda mora no Redis, que é
  o primeiro serviço a cair. Também faltava dizer o que acontece com os cupons
  pendentes quando o dono desliga e religa o automático, e com o agente antigo
  quando a loja pareia outro.
- **Decisão:** (1) parear um agente novo revoga os anteriores da loja — uma
  impressora por loja na versão 1, e o agente perdido ou trocado deixa de
  reivindicar na hora; (2) o código fecha no banco depois de cinco erros, com ou
  sem Redis, e o limite por loja e por origem no Redis FECHA o pareamento (503)
  quando o Redis não responde — sem contagem, seis dígitos ficariam abertos à
  força bruta; o resto da impressão segue sem Redis; (3) desligar o automático
  não cancela os pendentes: eles ficam na fila, à vista na tela de pedidos para
  o clique (que os cancela), e religar devolve ao agente só o que ainda espera.
- **Consequência:** a janela de duas folhas com dois agentes e confirmação
  perdida, registrada na T-607, deixa de existir enquanto a loja tiver um agente
  só. Com o Redis fora do ar, ninguém pareia agente novo até ele voltar — o
  agente já pareado continua imprimindo. Um cupom deixado na fila com o
  automático desligado sai quando o dono religar, se ninguém o imprimiu antes.

### 2026-10-03 — Painel de métricas: gráfico próprio, comparação justa e planilha genérica

- **Contexto:** o painel do dono (dashboard-metricas) precisa de gráficos de
  evolução por dia e de movimento por hora, compara o período com o anterior
  equivalente (AC-802) e exporta o período em planilha (AC-815). O site não tem
  biblioteca de gráfico (só GSAP e Three.js), a pilha não recebe tecnologia nova
  sem pedido, e "hoje" é um dia que ainda não acabou.
- **Decisão:** três escolhas, tomadas pelo orquestrador da onda 1:
  1. **Gráficos em SVG e CSS próprios**, sem biblioteca. Barras e linhas simples,
     legíveis no celular antes de bonitas na tela grande (ASM-805).
  2. **Período em curso compara com o mesmo pedaço do anterior.** Quando o
     período ainda não terminou (o "hoje", ou os atalhos de 3 e 7 dias que
     terminam hoje), o período anterior equivalente é cortado no mesmo ponto do
     relógio da loja: hoje até as 14h32 compara com ontem até as 14h32, e não
     com o dia de ontem inteiro. Período já encerrado compara com o anterior
     inteiro. A resposta diz até que instante o anterior foi contado e se foi
     cortado, para a tela poder escrever "ontem até 14h32".
  3. **Exportação em CSV genérico** (ponto e vírgula, marca de codificação,
     quebra de linha do Windows), que o Excel em português abre sem assistente.
     A compatibilidade com um sistema de contabilidade específico segue aberta
     (Q-803).
- **Consequência:** nenhuma dependência nova no site; a comparação do meio do
  dia deixa de acusar queda que não existe (ontem inteiro contra hoje pela
  metade sempre "cai"); e a planilha atende o contador hoje, ficando o formato
  dedicado para quando a Q-803 for respondida.

## Pendentes — bloqueiam implementação

| #   | Decisão que falta                                   | Por que bloqueia                                                                                                                                                                                                                                                                                                     | Opções                                                                                                 |
| --- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| D2b | Qual armazenamento privado guarda o contrato        | Bloqueia o envio de documentos da T-205 em PRODUÇÃO: o código está pronto atrás de uma porta (`core/arquivo-privado.ts`) e, sem esta decisão, responde 503 "indisponível" ali; a prova usa memória e o ambiente local, disco (`ARMAZENAMENTO_PRIVADO_DIR`). O Cloudinary cobre a mídia, mas não o documento sensível | Armazenamento de objeto sem custo de saída · armazenamento da AWS · armazenamento do provedor de banco |
| D3  | Como a fila de pedidos atualiza ao vivo             | Muda três critérios de aceite e o custo no plano gratuito                                                                                                                                                                                                                                                            | Conexão contínua servidor para cliente · conexão bidirecional · consulta periódica curta               |
| D5  | Estoque reserva no carrinho ou baixa na confirmação | Define se existe janela de venda a mais                                                                                                                                                                                                                                                                              | Baixa na confirmação, com janela aceita · reserva com prazo no carrinho                                |
| D6  | Repositório público ou privado                      | Define o orçamento de minutos de verificação automatizada                                                                                                                                                                                                                                                            | Privado com orçamento limitado · público com verificação sem custo                                     |
| D7  | Nome do domínio definitivo                          | Não bloqueia mais nada: virou tarefa da fase de publicação, no fim do projeto                                                                                                                                                                                                                                        | —                                                                                                      |

Resolvidas: D1 (contrato de esquema único), D2 (mídia no Cloudinary), D4 (Prisma
sob arranjo obrigatório), D6 (privado com verificação local), o escopo da versão 1
(completo) e o momento do domínio (fim do projeto).

**Nenhuma decisão pendente bloqueia o início da construção.** D2b aparece na fase
F5, D3 na F2 e D5 na F3.
