# Spec: Fundação

> feature: fundacao
> status: rascunho

## Contexto

Nenhuma das outras oito features funciona sem esta. A fundação entrega o
esqueleto que sustenta o projeto inteiro: o monorepo com fronteiras claras entre
web, API e pacotes compartilhados, o banco com isolamento por loja garantido no
nível do próprio PostgreSQL, o ambiente local que sobe com um comando, o banco de
teste separado do de produção, o cache, as filas, o design system e o portão de
qualidade que impede código sem prova de entrar. É a feature que decide se o
projeto vai ser fácil ou penoso de manter nos próximos anos.

## Histórias

### US-001 — Quem chega ao projeto sobe tudo com um comando

Como pessoa desenvolvendo o SimpleClick, quero subir o ambiente completo com um
comando, para que eu comece a trabalhar em minutos e não em um dia.

#### AC-001 — Um comando sobe web, API, banco, cache e roteador

- **Dado** um computador com Docker e o repositório recém-clonado
- **Quando** executo o comando único de subida do ambiente
- **Então** web, API, PostgreSQL, Redis e o roteador local sobem juntos, cada um responde em seu endereço local, e o roteiro de verificação de saúde de todos passa

#### AC-002 — Variável de ambiente faltando falha na hora com mensagem clara

- **Dado** um arquivo de ambiente incompleto, sem uma variável obrigatória
- **Quando** a API inicia
- **Então** ela recusa iniciar apontando pelo nome exatamente qual variável falta e o que se espera dela, em vez de quebrar depois com erro obscuro

#### AC-003 — Banco de teste é separado do banco de desenvolvimento

- **Dado** o ambiente local no ar com dados de desenvolvimento
- **Quando** executo a suíte de testes de integração
- **Então** os testes usam um banco próprio e descartável, os dados de desenvolvimento permanecem intactos, e rodar os testes duas vezes seguidas dá o mesmo resultado

#### AC-004 — Dados de exemplo criam um cenário navegável

- **Dado** um banco vazio
- **Quando** executo a carga de dados de exemplo
- **Então** existem duas lojas de ramos diferentes com categorias, produtos com opções, clientes e pedidos em vários status, o que permite navegar o sistema inteiro sem cadastrar nada à mão

### US-002 — Fronteiras entre módulos são respeitadas pela máquina

Como pessoa mantendo o projeto, quero que as regras de dependência entre módulos
sejam verificadas automaticamente, para que a arquitetura não se degrade a cada
entrega.

#### AC-005 — Importação proibida entre módulos quebra a verificação

- **Dado** as regras de fronteira declaradas no projeto
- **Quando** um módulo importa outro que não lhe é permitido, por exemplo a interface importando diretamente a camada de banco
- **Então** a verificação de qualidade falha apontando o arquivo e a regra violada, e a mudança não passa no portão de integração

#### AC-006 — Tipos do contrato são compartilhados de uma fonte única

- **Dado** um campo alterado no contrato de uma rota da API
- **Quando** a verificação de tipos roda no projeto inteiro
- **Então** o web acusa erro de tipo nos pontos afetados, porque web e API leem o mesmo contrato, e nenhum ajuste manual de tipo duplicado é necessário

#### AC-007 — Contrato publicado para aplicativos nativos fica em dia

- **Dado** que o contrato da API é a fonte da verdade
- **Quando** uma rota é criada ou alterada e a verificação roda
- **Então** o documento de contrato publicado é regenerado e a verificação falha se ele estiver diferente do que está no repositório, para que os aplicativos nativos futuros nunca leiam um contrato desatualizado

### US-003 — Isolamento entre lojas é garantido pelo banco

Como responsável pela plataforma, quero que o próprio banco impeça uma loja de
ler dados de outra, para que um erro de programação não vire vazamento de dados.

#### AC-008 — Toda tabela de loja tem isolamento ligado

- **Dado** o banco com todas as migrações aplicadas
- **Quando** a verificação estrutural do banco é executada
- **Então** ela falha se existir qualquer tabela com identificador de loja sem o isolamento por linha ativado e forçado, o que impede que uma migração nova crie tabela desprotegida por esquecimento

#### AC-009 — Consulta sem contexto de loja não devolve nada

- **Dado** uma conexão da aplicação sem o contexto de loja definido
- **Quando** uma consulta é feita a uma tabela de loja
- **Então** nenhuma linha é devolvida, em vez de devolver tudo, porque a ausência de contexto é tratada como negação e não como permissão

#### AC-010 — Loja A não alcança dado da loja B por nenhum caminho

- **Dado** duas lojas com produtos, pedidos e clientes
- **Quando** a conexão está no contexto da loja A e são tentadas leitura, inserção, alteração e remoção de registros da loja B
- **Então** todas as quatro operações falham ou devolvem vazio, e o teste que prova isso cobre as quatro operações separadamente

#### AC-011 — Contexto de loja não escapa de uma requisição para outra

- **Dado** um servidor com reuso de conexões de banco atendendo requisições de lojas diferentes em sequência
- **Quando** muitas requisições alternadas entre duas lojas são executadas em paralelo
- **Então** nenhuma requisição enxerga dado da outra loja, porque o contexto vive na transação e é descartado ao fim dela

#### AC-044 — Tabela do banco sem modelo tipado reprova a verificação

- **Dado** uma migração que cria uma tabela nova no banco
- **Quando** a verificação completa roda
- **Então** ela reprova enquanto a tabela não tiver modelo no esquema declarado ou não estiver numa lista de adiamento com motivo escrito — porque tabela sem modelo tipado obriga quem escreve o código a usar SQL cru, e SQL cru contorna o caminho único que sustenta o isolamento por linha

#### AC-045 — Migração alterada depois de aplicada reprova a verificação

- **Dado** um arquivo de migração que já foi aplicado no banco desta máquina
- **Quando** o arquivo é editado e a verificação completa roda
- **Então** ela reprova apontando o arquivo pelo nome — porque as migrações criam com "se não existir", reaplicar não altera tabela existente, e o banco fica em silêncio com uma estrutura diferente da que o repositório declara

#### AC-012 — Migração roda com credencial separada da aplicação

- **Dado** o processo de migração do banco
- **Quando** as migrações são aplicadas
- **Então** elas usam uma credencial própria, distinta da que a aplicação usa em execução, e a credencial da aplicação não tem permissão de contornar o isolamento

### US-004 — Interface nasce com um sistema visual consistente

Como pessoa construindo as telas, quero um sistema visual pronto e coerente,
para que cada tela nova não reinvente cor, espaçamento e componente.

#### AC-013 — Componentes base existem com os quatro estados

- **Dado** o sistema visual do projeto
- **Quando** uso os componentes base de botão, campo, cartão, lista, aviso e caixa de diálogo
- **Então** cada um oferece os estados de carregando, vazio, erro e sucesso onde faz sentido, e a página de demonstração dos componentes mostra todos eles

#### AC-014 — Cor e espaçamento vêm de valores declarados, não soltos no código

- **Dado** o sistema visual configurado
- **Quando** a verificação de qualidade roda sobre as telas
- **Então** ela acusa uso de cor escrita diretamente no componente em vez do valor declarado no tema, para que a identidade visual permaneça consistente

#### AC-015 — Loja aplica sua identidade sem quebrar o sistema

- **Dado** uma loja com logo e cor principal próprias
- **Quando** a vitrine dela é renderizada
- **Então** a cor da loja é aplicada nos pontos previstos, o contraste do texto continua acessível mesmo com cor escolhida pelo dono, e nenhum componente fica ilegível

#### AC-016 — Telas passam na verificação automática de acessibilidade

- **Dado** a página de demonstração dos componentes
- **Quando** a verificação automática de acessibilidade é executada
- **Então** nenhuma violação de nível crítico ou sério é encontrada nos componentes base

### US-005 — Portão de qualidade impede entrada de código sem prova

Como responsável pelo projeto, quero um portão que bloqueie o que não tem prova
na minha própria máquina, para que a qualidade não dependa de eu lembrar de
conferir nem de serviço externo com cota.

#### AC-017 — Um comando roda a verificação completa

- **Dado** o repositório na minha máquina com o ambiente no ar
- **Quando** executo o comando único de verificação
- **Então** ele roda validação de tipos, qualidade de código, testes de unidade, testes de integração contra o banco de teste, guardas estruturais do banco, telas de ponta a ponta, acessibilidade e a auditoria da especificação — e termina reprovando se qualquer uma falhar, dizendo qual falhou

#### AC-018 — Critério de aceite sem teste reprova a entrega

- **Dado** um critério de aceite declarado na especificação sem teste correspondente
- **Quando** a auditoria da especificação roda
- **Então** ela reprova apontando qual critério está sem prova, o que impede declarar pronto o que não foi verificado

#### AC-019 — Teste que apenas foi pulado não conta como prova

- **Dado** um teste marcado como pulado que corresponde a um critério de aceite
- **Quando** a verificação de provas roda
- **Então** aquele critério continua constando como sem prova, porque teste pulado não é prova

#### AC-020 — Segredo em código é barrado antes de entrar

- **Dado** uma alteração que inclui uma chave ou senha escrita diretamente no código
- **Quando** tento registrar essa alteração no histórico
- **Então** o registro é bloqueado apontando arquivo e linha, e o segredo não chega ao histórico do repositório

#### AC-040 — Gancho antes do registro cobre o rápido

- **Dado** uma alteração pronta para ser registrada no histórico
- **Quando** o registro é iniciado
- **Então** formatação, tipos do que mudou e busca por segredo rodam automaticamente em segundos, e o registro é bloqueado se algo falhar — sem que eu precise lembrar de executar nada

#### AC-041 — Gancho antes do envio cobre o portão inteiro

- **Dado** alterações registradas prontas para serem enviadas ao repositório remoto
- **Quando** o envio é iniciado
- **Então** a verificação completa roda e o envio é bloqueado se qualquer parte falhar, de modo que o histórico remoto nunca receba código que não passou pelo portão

#### AC-042 — Verificação local é reproduzível e não depende do estado da máquina

- **Dado** a mesma versão do código verificada em dois momentos diferentes
- **Quando** a verificação completa roda nas duas vezes
- **Então** o resultado é o mesmo, porque as versões das ferramentas são fixadas, o banco de teste é criado do zero e descartado, e nenhum teste depende de dado deixado por execução anterior

#### AC-043 — Pular o portão exige ato deliberado e fica registrado

- **Dado** uma situação excepcional em que preciso enviar código sem a verificação completa
- **Quando** uso a saída explícita para pular o portão
- **Então** ela funciona, mas exige sinalização explícita e o fato fica registrado em arquivo de pendências, para que a dívida seja visível e não esquecida

### US-006 — Sistema é observável quando algo dá errado

Como responsável pela operação, quero registro e alerta úteis sem expor dado
pessoal, para que eu descubra um problema antes do lojista reclamar.

#### AC-021 — Registro é estruturado e permite seguir uma requisição inteira

- **Dado** uma requisição que passa pela API e toca banco e cache
- **Quando** ela é registrada
- **Então** todas as linhas de registro daquela requisição compartilham um identificador que permite reconstruir o caminho inteiro, e o registro é legível por máquina

#### AC-022 — Dado pessoal e segredo nunca aparecem no registro

- **Dado** uma requisição que carrega telefone, endereço, chave PIX, senha e credencial de acesso
- **Quando** ela é registrada
- **Então** nenhum desses valores aparece no registro, mesmo em caso de erro com detalhamento completo, porque a proteção funciona por lista do que é permitido registrar

#### AC-023 — Verificação de saúde distingue vivo de pronto

- **Dado** a API iniciando com o banco ainda indisponível
- **Quando** as verificações de saúde são consultadas
- **Então** a verificação de vivo responde que o processo está de pé e a de pronto responde que ainda não pode receber tráfego, e só depois de banco e cache responderem a verificação de pronto passa

#### AC-024 — Erro não vaza detalhe interno para quem chamou

- **Dado** uma falha inesperada dentro da API
- **Quando** ela responde ao cliente
- **Então** a resposta traz mensagem genérica com um código de referência e o detalhamento técnico fica apenas no registro do servidor, sem pilha de execução nem nome de tabela na resposta

### US-007 — Trabalho demorado não travar a resposta ao usuário

Como pessoa usando o sistema, quero que a resposta seja rápida mesmo quando há
trabalho pesado envolvido, para que eu não espere por e-mail sendo enviado.

#### AC-025 — Envio de e-mail acontece fora do caminho da resposta

- **Dado** um cadastro que dispara e-mail de verificação
- **Quando** a pessoa envia o formulário
- **Então** a resposta chega sem esperar o envio do e-mail, o envio acontece em segundo plano, e a falha no envio não faz o cadastro falhar

#### AC-026 — Trabalho em segundo plano que falha é repetido e não se perde

- **Dado** um trabalho em segundo plano que falhou por indisponibilidade temporária
- **Quando** o sistema tenta novamente
- **Então** ele repete com espera crescente entre tentativas, e após esgotar as tentativas o trabalho fica registrado como falho para inspeção, em vez de desaparecer

#### AC-027 — Cache acelera sem servir dado de outra loja

- **Dado** o cache em uso para dados de loja
- **Quando** duas lojas consultam o mesmo tipo de dado
- **Então** cada uma recebe o próprio dado, porque toda chave de cache carrega a identificação da loja, e o teste prova que não há troca entre lojas

#### AC-028 — Cache é invalidado quando o dado muda

- **Dado** um catálogo de loja guardado em cache
- **Quando** o dono altera um produto
- **Então** a próxima consulta reflete a alteração dentro do prazo definido, sem exigir reinício de serviço nem limpeza manual

### US-008 — Publicar em produção é previsível e reversível

Como responsável pela operação, quero publicar com segurança e voltar atrás
rapidamente, para que um erro não deixe as lojas fora do ar.

#### AC-029 — Publicação aplica migração antes de trocar a versão

- **Dado** uma versão nova que inclui migração de banco
- **Quando** a publicação acontece
- **Então** a migração é aplicada antes de a versão nova receber tráfego, e a publicação é interrompida se a migração falhar, sem deixar o sistema em estado misto

#### AC-030 — Voltar à versão anterior é possível sem perder dado

- **Dado** uma versão publicada que apresentou problema
- **Quando** decido voltar à versão anterior
- **Então** o retorno acontece sem perda de dado, porque as migrações são compatíveis com a versão anterior por uma janela definida

#### AC-031 — Ambiente de produção e de teste nunca compartilham banco

- **Dado** os ambientes configurados
- **Quando** a verificação de configuração roda
- **Então** ela falha se produção e teste apontarem para o mesmo banco ou para o mesmo cache, o que impede o acidente mais caro possível

### US-009 — Evolução do banco é versionada e reproduzível

Como pessoa desenvolvendo o SimpleClick, quero que toda mudança de estrutura do
banco seja uma migração versionada no repositório, para que qualquer ambiente
chegue ao mesmo estado sem ninguém rodar comando à mão em produção.

#### AC-032 — Banco vazio chega ao estado atual só com as migrações

- **Dado** um banco de dados completamente vazio
- **Quando** aplico todas as migrações do repositório em ordem
- **Então** o banco chega exatamente ao estado esperado pela versão atual do código, incluindo tabelas, índices, funções, políticas de isolamento e gatilhos, sem nenhum passo manual

#### AC-033 — Migração aplicada duas vezes não quebra nem duplica

- **Dado** um banco já com todas as migrações aplicadas
- **Quando** o comando de migração é executado novamente
- **Então** nada é alterado e o comando termina com sucesso informando que não havia migração pendente

#### AC-034 — Migração pendente é detectada antes de o código subir

- **Dado** um código que espera uma coluna criada por migração ainda não aplicada
- **Quando** a API inicia ou a integração automatizada roda
- **Então** a inconsistência é detectada e apontada pelo nome da migração pendente, em vez de a aplicação quebrar depois no meio de uma requisição

#### AC-035 — Estrutura do banco fora do padrão reprova na integração

- **Dado** uma migração nova que cria uma tabela com identificador de loja
- **Quando** a verificação estrutural roda na integração automatizada
- **Então** ela reprova se a tabela não tiver isolamento por linha ativado e forçado, se faltar política para alguma das quatro operações, ou se tiver chave única global onde deveria ser única por loja

#### AC-036 — Dados de exemplo cobrem os ramos e os estados do sistema

- **Dado** um banco recém-migrado e vazio
- **Quando** executo a carga de dados de exemplo
- **Então** existem no mínimo duas lojas de ramos diferentes (uma de comida e uma de produto com estoque), com categorias e especificações próprias, produtos com imagens, preços múltiplos, variações com estoque, grupos de opção, clientes, e pedidos em todos os status possíveis, inclusive cancelado e aguardando confirmação

#### AC-037 — Carga de exemplo é determinística e repetível

- **Dado** a carga de dados de exemplo
- **Quando** eu a executo duas vezes em bancos vazios distintos
- **Então** os dois bancos ficam com exatamente os mesmos dados, porque identificadores, datas e valores são gerados de forma previsível, o que permite que testes e capturas de tela dependam deles

#### AC-038 — Teste monta seu próprio cenário sem depender de outro teste

- **Dado** a suíte de testes de integração
- **Quando** um teste precisa de uma loja com produto e pedido
- **Então** ele monta esse cenário por construtores próprios de dados de teste, roda isolado de qualquer outro teste, e a ordem de execução dos testes não altera o resultado

#### AC-039 — Carga de exemplo nunca roda em produção

- **Dado** o ambiente de produção configurado
- **Quando** o comando de carga de dados de exemplo é executado por engano
- **Então** ele se recusa a rodar informando que o ambiente não permite, para que dado fictício jamais alcance loja real

### US-010 — A API de produção parte completa e para sem derrubar quem está sendo atendido

Como responsável pela operação, quero que a API suba já com tudo o que precisa
e pare de forma ordenada quando o provedor trocar de versão, para que publicar
não perca requisição, e-mail na fila nem configuração esquecida.

A recusa de partir sem variável obrigatória já é o AC-002; esta história liga
aquele critério ao processo real da API e acrescenta o que falta à partida e ao
desligamento.

#### AC-046 — A partida sobe o segundo plano quando ele está ligado

- **Dado** o ambiente com o segundo plano ligado — o padrão em produção — e o cache no ar
- **Quando** a API inicia
- **Então** a fila de e-mail e o seu trabalhador sobem no mesmo processo e consomem o trabalho enfileirado, e o registro diz que o segundo plano subiu; com o segundo plano desligado de propósito, a API sobe sem abrir conexão de fila e o registro diz que ele está desligado

#### AC-047 — Sinal de término desliga a API de forma ordenada

- **Dado** a API atendendo uma requisição em curso, com banco, cache e filas abertos
- **Quando** ela recebe o sinal de término que o provedor envia ao trocar de versão
- **Então** ela para de aceitar conexão nova, entrega por inteiro a resposta da requisição em curso, só depois fecha filas, banco e cache, e sai com código zero; se o fechamento passar do prazo de desligamento, ela sai sozinha com código diferente de zero e registra o que não fechou, em vez de ficar pendurada até ser derrubada

#### AC-048 — A porta da API tem um nome só

- **Dado** o ambiente de partida da API
- **Quando** ela inicia
- **Então** ela escuta na porta dada por `PORT`, o nome que o provedor de hospedagem injeta e que a validação de partida conhece; se o nome antigo `API_PORT` ainda estiver no ambiente apontando para outra porta, ela recusa iniciar nomeando as duas variáveis, em vez de escutar num número que ninguém escolheu

### US-011 — O banco de produção nasce vazio, ganha a primeira administração e tem cópia que volta

Como responsável pela operação, quero levar um banco de produção recém-criado
ao estado do código, criar a primeira administração da plataforma e ter uma
cópia de segurança que eu já vi voltar, para que a primeira publicação não
dependa de comando digitado à mão no banco nem de segredo guardado no código.

A primeira aplicação das migrações não pode ser feita pela credencial de
migração, porque é a primeira migração que cria essa credencial. E a
administração não pode nascer sem o aplicativo autenticador: sem ele ela não
abre sessão (AC-122) e ficaria trancada do lado de fora.

#### AC-049 — Banco de produção vazio arranca com a credencial de arranque e passa a ser da credencial de migração

- **Dado** um banco de produção recém-criado e vazio, a credencial de dono que o provedor entrega e as senhas dos três papéis no ambiente
- **Quando** o operador roda o arranque com essa credencial
- **Então** as migrações chegam ao estado atual, os papéis de migração, de aplicação e de administração passam a entrar com as senhas do ambiente, e a credencial de migração confere sozinha que o banco está em dia, de modo que a publicação seguinte já não precisa da credencial de arranque; rodar de novo não altera nada; e, com a conexão ou o cache de teste presentes no ambiente, o arranque recusa nomeando a variável antes de tocar o banco

#### AC-050 — A primeira administração nasce do ambiente, uma vez só e sem segredo no código

- **Dado** o banco arrancado e sem administração da plataforma
- **Quando** o operador informa o e-mail e a senha da primeira administração por variável de ambiente
- **Então** nasce uma identidade com e-mail confirmado e com a administração da plataforma, gravada pela credencial de administração e nunca pela de migração; a senha cumpre a política de senha e não aparece na saída; rodar de novo com o mesmo e-mail termina com sucesso sem alterar nada; e, se já existir outra administração ativa, se o e-mail já pertencer a uma conta que não é administração, se a senha for fraca ou se faltar a chave de cifra do aplicativo, o arranque recusa dizendo o motivo e não grava nada

#### AC-051 — A primeira administração só entra com o aplicativo autenticador

- **Dado** o arranque da primeira administração
- **Quando** o operador cadastra no aplicativo autenticador a chave mostrada e digita o código que o aplicativo mostra
- **Então** a administração só é gravada se o código conferir, o segredo do aplicativo vai cifrado para o banco, os códigos de recuperação aparecem uma única vez na saída, e no primeiro acesso a senha sozinha não abre sessão: o login pede o código do aplicativo, o código usado no arranque não vale de novo, e só um código novo do aplicativo libera a sessão de administração

#### AC-052 — Cópia de segurança com retenção de sete dias e restauração ensaiada

- **Dado** o banco com dados de lojas
- **Quando** o operador faz a cópia de segurança e depois o ensaio de restauração
- **Então** a cópia sai num arquivo com a data no nome e com um manifesto tirado do mesmo instante da cópia (migrações aplicadas e linhas por tabela); cópias da mesma pasta com mais de sete dias são apagadas e as mais novas ficam; o ensaio restaura a cópia num banco descartável novo, confere o livro de migrações, o isolamento forçado e a contagem de linhas de cada tabela contra o manifesto, e apaga o banco descartável no fim; e uma cópia corrompida reprova o ensaio sem deixar banco descartável para trás

## Fora de escopo

- Regras de negócio de qualquer feature: esta entrega apenas o esqueleto, o
  isolamento, o portão de qualidade e o sistema visual.
- Aplicativos nativos em Kotlin e Swift: a fundação garante o contrato publicado
  que eles vão consumir, mas não os constrói.
- Escala horizontal, réplicas de leitura e particionamento de tabela.
- Recuperação de desastre completa (outra região, outro provedor). A cópia
  diária com restauração ensaiada entrou pela US-011 (Q-004).
- Rastreamento distribuído completo e painel de métricas de infraestrutura.
- Ambiente de homologação separado de produção — ver Q-002.

## Suposições

| ID      | Suposição                                                                                                                                                                                                                                                                                                                                                                          | Status     | Resolução                                                                                                                                                                         |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ASM-001 | O ambiente local usa contêineres para banco, cache e roteador, e web e API rodam como processo direto para recarregar rápido ao editar código                                                                                                                                                                                                                                      | confirmada | Confirmado pela composição e pelos comandos locais existentes no repositório                                                                                                      |
| ASM-002 | O isolamento por loja é feito com política do próprio PostgreSQL, e a credencial da aplicação não tem permissão de contornar essa política                                                                                                                                                                                                                                         | confirmada | Confirmado pelas migrações, guardas estruturais e provas de isolamento da fundação                                                                                                |
| ASM-003 | O administrador geral usa uma credencial de banco distinta da credencial do lojista, em vez de uma marcação na sessão, para que uma falha de injeção em rota de lojista não alcance todas as lojas                                                                                                                                                                                 | confirmada | Confirmado pela separação de credenciais e pelo caminho administrativo implementado                                                                                               |
| ASM-004 | A hospedagem começa nos planos gratuitos apenas para desenvolvimento e demonstração, e migra para plano pago no momento em que a primeira loja real entrar                                                                                                                                                                                                                         | confirmada | Decidido pelo dono do produto em 17/08/2026: gratuito na construção, plano pago no lançamento, porque o plano gratuito da Vercel proíbe uso comercial                             |
| ASM-005 | Os testes de unidade e integração usam Vitest, e o Playwright cobre as telas de ponta a ponta                                                                                                                                                                                                                                                                                      | confirmada | Decidido pelo dono do produto em 17/08/2026, em substituição ao Jest do pedido inicial, por causa de módulos ES e TypeScript no monorepo                                          |
| ASM-006 | O contrato entre web e API é declarado uma única vez e gera o documento que os aplicativos nativos vão consumir, evitando segunda fonte de verdade                                                                                                                                                                                                                                 | confirmada | Decidido pelo dono do produto em 17/08/2026                                                                                                                                       |
| ASM-009 | O acesso ao banco usa Prisma, sob o arranjo obrigatório registrado em design/decisoes.md: transação interativa por requisição, cliente cru nunca exportado, cadeias de conexão separadas para aplicação e migração, credencial da aplicação sem permissão de contornar o isolamento, migrações escritas à mão e conferência de linhas afetadas em toda alteração por identificador | confirmada | Decidido pelo dono do produto em 17/08/2026, contra a recomendação técnica de construtor de consulta tipado. O ponto de troca, se o arranjo pesar, é a tarefa T-006 e somente ela |
| ASM-007 | O sistema visual é construído sobre Tailwind com componentes próprios do projeto, sem adotar biblioteca de componentes pronta que imponha identidade visual                                                                                                                                                                                                                        | confirmada | Confirmado pela implementação da identidade visual global e pelos componentes próprios                                                                                            |
| ASM-008 | Um único servidor de aplicação atende web e trabalho em segundo plano na versão 1, para não multiplicar custo de hospedagem                                                                                                                                                                                                                                                        | confirmada | Confirmado para a versão 1; separação de processos fica condicionada a necessidade operacional                                                                                    |

## Perguntas em aberto

| ID    | Pergunta                                                                                                                                                                                            | Status     | Resposta                                                                                                                                                                                                                                         |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Q-002 | Precisamos de um ambiente de homologação separado de produção já na versão 1, ou desenvolvimento local e produção bastam no início?                                                                 | respondida | A versão 1 não terá homologação permanente; usa ambiente local e prévias isoladas quando disponíveis, mantendo somente produção como ambiente permanente                                                                                         |
| Q-003 | Qual o nome de domínio definitivo da plataforma?                                                                                                                                                    | respondida | Fica para o fim do projeto (decisão de 17/08/2026). O desenvolvimento roda em endereços locais que reproduzem a mesma topologia — dois nomes sob um domínio comum, com conexão segura —, então o endereço final é configuração e não arquitetura |
| Q-001 | O repositório fica público ou privado?                                                                                                                                                              | respondida | Privado, com a verificação rodando inteiramente na máquina de desenvolvimento, sem serviço externo (decisão de 17/08/2026)                                                                                                                       |
| Q-004 | Com que frequência a cópia de segurança do banco deve ser feita e por quanto tempo mantida? O plano gratuito do provedor não garante retenção                                                       | respondida | Cópia diária com retenção de sete dias; a restauração deve ser exercitada periodicamente                                                                                                                                                         |
| Q-005 | O SimpleClick deve poder ser instalado por outra pessoa em servidor próprio no futuro, ou será sempre operado apenas por você? Isso muda o quanto o ambiente precisa ser documentado e configurável | respondida | A versão 1 será operada apenas pelo responsável do produto; instalação por terceiros não orienta a arquitetura nem a documentação desta versão                                                                                                   |
