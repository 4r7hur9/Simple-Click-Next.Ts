# Spec: Identidade e Acesso

> feature: identidade-acesso
> status: rascunho

## Contexto

Três públicos entram no SimpleClick pela mesma porta e precisam ver mundos
diferentes: o **administrador geral** (opera a plataforma e cadastra lojas), o
**dono da loja** (opera o próprio negócio) e o **cliente final** (compra e
acompanha pedidos). Esta feature entrega cadastro, verificação de e-mail,
login com segundo fator, sessão segura e a propagação do papel e da loja até o
banco — é o alicerce de que toda outra feature depende para não vazar dado de
uma loja para outra.

## Histórias

### US-100 — Cliente final cria conta para acompanhar seus pedidos

Como cliente final, quero criar uma conta com meu nome, e-mail, telefone e
senha, para que meus pedidos fiquem salvos e eu não precise digitar meus dados
a cada compra.

#### AC-100 — Cadastro válido cria conta pendente de verificação

- **Dado** que estou na tela de cadastro e não tenho conta com o e-mail informado
- **Quando** envio nome, e-mail válido, telefone e senha que atende a política mínima
- **Então** a tela confirma que minha conta foi criada e avisa que enviamos um e-mail de verificação, e ainda não consigo entrar (conta com e-mail não verificado)

#### AC-101 — E-mail já cadastrado não revela que a conta existe

- **Dado** que já existe uma conta com o e-mail `ana@exemplo.com`
- **Quando** tento me cadastrar com esse mesmo e-mail
- **Então** a tela mostra a mesma mensagem de sucesso do cadastro novo e um e-mail de aviso é enviado ao dono do endereço, sem que a resposta permita descobrir que aquele e-mail tem conta (proteção contra enumeração de usuários)

#### AC-102 — Senha fraca é recusada com motivo claro

- **Dado** que estou na tela de cadastro
- **Quando** envio a senha `123456`
- **Então** a tela recusa o cadastro e explica qual regra falhou (mínimo de caracteres e senha presente em vazamentos conhecidos), sem apagar os outros campos que preenchi

### US-101 — Dono da loja confirma o e-mail antes do primeiro acesso

Como dono de loja, quero confirmar meu e-mail por um link enviado a mim, para
que ninguém use meu endereço para criar acesso ao meu negócio.

#### AC-103 — Link de verificação válido libera o acesso

- **Dado** que recebi o e-mail de verificação e o link ainda está no prazo
- **Quando** abro o link
- **Então** a tela confirma que meu e-mail foi verificado, minha conta passa a permitir login, e o mesmo link não funciona uma segunda vez

#### AC-104 — Link expirado pode ser reenviado

- **Dado** que meu link de verificação passou do prazo de validade
- **Quando** abro o link
- **Então** a tela avisa que o link expirou e oferece reenviar a verificação, e o reenvio respeita um limite de tentativas por período

### US-102 — Dono e administrador entram com segundo fator

Como dono de loja, quero um código de uso único enviado ao meu e-mail depois da
senha, para que minha senha vazada não seja suficiente para alguém operar minha
loja.

#### AC-105 — Senha correta pede o segundo fator antes de liberar a sessão

- **Dado** que sou dono de loja com e-mail verificado
- **Quando** informo e-mail e senha corretos
- **Então** a tela pede o código de seis dígitos que enviamos ao meu e-mail e nenhuma sessão é criada até o código ser aceito

#### AC-106 — Código correto cria a sessão e o código não serve de novo

- **Dado** que recebi o código de uso único e ele está no prazo
- **Quando** informo o código correto
- **Então** entro no painel da minha loja e aquele mesmo código passa a ser inválido para qualquer nova tentativa

#### AC-107 — Código errado tem tentativas limitadas

- **Dado** que estou na etapa do segundo fator
- **Quando** erro o código cinco vezes seguidas
- **Então** a tela informa que a tentativa foi bloqueada, o código em aberto é invalidado e preciso começar o login de novo

#### AC-108 — Cliente final decide se usa segundo fator

- **Dado** que sou cliente final com e-mail verificado e segundo fator desativado
- **Quando** informo e-mail e senha corretos
- **Então** entro direto na minha conta, e existe na minha área uma opção para ativar o segundo fator (obrigatório para dono e administrador, opcional para cliente)

### US-108 — Quem quer mais segurança usa aplicativo autenticador

Como dono de loja preocupado com segurança, quero trocar o código do e-mail por
um aplicativo autenticador no meu celular, para que invadir meu e-mail não seja
suficiente para entrar na minha loja. Como administrador geral, isso é
obrigatório para mim, porque minha conta alcança todas as lojas.

#### AC-121 — Ativar o aplicativo autenticador exige confirmar um código

- **Dado** que sou dono de loja logado e uso código por e-mail como segundo fator
- **Quando** escolho ativar o aplicativo autenticador, leio o código de barras quadrado na tela com o aplicativo e informo o código de seis dígitos que ele mostra
- **Então** o aplicativo passa a ser meu segundo fator, o código por e-mail deixa de ser aceito no login, e recebo códigos de recuperação para guardar

#### AC-122 — Administrador geral não entra sem aplicativo autenticador

- **Dado** que sou administrador geral e ainda não configurei o aplicativo autenticador
- **Quando** faço login com e-mail e senha corretos
- **Então** sou levado obrigatoriamente à configuração do aplicativo antes de alcançar qualquer dado, e nenhuma sessão de administrador é liberada por código de e-mail

#### AC-123 — Código de recuperação devolve o acesso e é consumido

- **Dado** que perdi o celular com o aplicativo autenticador e tenho meus códigos de recuperação
- **Quando** uso um código de recuperação no lugar do código de seis dígitos
- **Então** entro na conta, aquele código de recuperação nunca funciona de novo, sou avisado por e-mail, e a tela me orienta a configurar o aplicativo em um aparelho novo

#### AC-124 — Código do aplicativo não é aceito duas vezes

- **Dado** que acabei de entrar usando o código do aplicativo autenticador
- **Quando** o mesmo código é informado outra vez dentro da janela em que ainda seria válido
- **Então** a segunda tentativa é recusada, para que um código capturado não sirva para uma segunda entrada

### US-103 — Sessão continua válida sem expor o acesso

Como pessoa usando o sistema, quero continuar logado ao voltar depois, sem que
um script malicioso na página consiga roubar meu acesso.

#### AC-109 — Sessão nasce em cookie inacessível a script

- **Dado** que acabei de entrar com sucesso
- **Quando** a sessão é criada
- **Então** o token de renovação chega em cookie marcado como httpOnly, Secure e SameSite, e nenhum token de sessão é gravado no armazenamento local do navegador

#### AC-110 — Renovação troca o token e detecta reuso

- **Dado** que meu token de acesso expirou e meu token de renovação é válido
- **Quando** o sistema renova a sessão
- **Então** recebo um par novo de tokens, o token de renovação anterior deixa de funcionar, e se o token antigo for usado de novo toda a família de sessões daquele dispositivo é revogada e sou avisado por e-mail

#### AC-111 — Aplicativo nativo autentica na mesma API sem cookie

- **Dado** um cliente que não usa cookie (aplicativo nativo futuro em Kotlin ou Swift)
- **Quando** ele faz login informando que é cliente nativo
- **Então** recebe o par de tokens no corpo da resposta e usa o token de acesso no cabeçalho de autorização, seguindo as mesmas regras de expiração e rotação da web

### US-104 — Encerrar sessões que não reconheço

Como dono de loja, quero sair da conta e também encerrar as sessões de outros
dispositivos, para que um acesso esquecido no computador da loja não vire porta
aberta.

#### AC-112 — Sair encerra a sessão atual de verdade

- **Dado** que estou logado
- **Quando** escolho sair
- **Então** o cookie de sessão é removido, o token de renovação é revogado no servidor, e usar o token anterior não devolve acesso

#### AC-113 — Encerrar todas as sessões derruba os outros dispositivos

- **Dado** que tenho sessões abertas em dois dispositivos
- **Quando** escolho encerrar todas as sessões
- **Então** as duas sessões param de funcionar na próxima renovação e preciso entrar novamente em cada dispositivo

### US-105 — Recuperar acesso quando esqueço a senha

Como pessoa que esqueceu a senha, quero receber um link para definir uma senha
nova, para que eu recupere o acesso sem falar com suporte.

#### AC-114 — Pedido de recuperação não revela quem tem conta

- **Dado** que informo um e-mail na tela de esqueci minha senha
- **Quando** envio o pedido
- **Então** a tela mostra sempre a mesma confirmação de envio, exista ou não conta com aquele e-mail, e o link só é enviado de fato para e-mail cadastrado

#### AC-115 — Nova senha invalida as sessões antigas

- **Dado** que abri um link de recuperação válido
- **Quando** defino uma senha nova que atende à política
- **Então** consigo entrar com a senha nova, o link não funciona novamente, e todas as sessões anteriores daquela conta são revogadas

### US-106 — Cada papel só alcança o que é dele

Como administrador geral, quero que o papel de cada pessoa limite o que ela
alcança, para que um dono de loja jamais leia dados de outra loja e um cliente
não entre em área de gestão.

#### AC-116 — Dono de loja não alcança dados de outra loja

- **Dado** que sou dono da loja A e existe a loja B com produtos e pedidos
- **Quando** peço qualquer recurso identificado como pertencente à loja B, mesmo informando o identificador direto na URL
- **Então** recebo negativa de acesso e nenhum dado da loja B aparece na resposta, mesmo que a checagem da aplicação falhe (o banco impede pela política de isolamento)

#### AC-117 — Cliente final não entra em área de gestão

- **Dado** que estou logado como cliente final
- **Quando** tento abrir o painel da loja ou a área do administrador geral
- **Então** sou levado a uma tela que explica que não tenho permissão, sem vazar qual recurso existe do outro lado

#### AC-118 — Administrador geral alcança todas as lojas de forma auditada

- **Dado** que sou administrador geral
- **Quando** consulto dados de qualquer loja
- **Então** vejo os dados solicitados e cada acesso fica registrado no histórico de auditoria com quem acessou, o que acessou e quando

### US-107 — Resistir a tentativa de invasão por tentativa e erro

Como responsável pela plataforma, quero limitar tentativas de login, para que
uma lista de senhas vazadas não seja testada contra as contas das lojas.

#### AC-119 — Excesso de tentativas de login é barrado

- **Dado** que houve dez tentativas de login falhas para a mesma conta em curto intervalo
- **Quando** uma nova tentativa é feita, mesmo com a senha correta
- **Então** a resposta informa bloqueio temporário com o tempo de espera, o intervalo de espera cresce a cada novo bloqueio, e o dono da conta é avisado por e-mail

#### AC-120 — Limite vale por conta e por origem

- **Dado** um atacante que distribui tentativas entre muitas contas de um mesmo endereço de origem
- **Quando** o volume de tentativas daquela origem passa do limite por minuto
- **Então** as requisições daquela origem são recusadas com status de excesso de requisições, e o limite considera o endereço real informado pela borda confiável, não apenas o endereço da conexão

### US-109 — Só a nossa própria interface pode agir em nome de quem está logado

Como responsável pela plataforma, quero que apenas as origens que eu autorizo
consigam usar a sessão de alguém, para que um site malicioso não consiga criar
pedido, alterar produto nem ler dados usando a sessão aberta da vítima.

#### AC-125 — Origem não autorizada é recusada

- **Dado** um navegador com sessão válida aberta na plataforma
- **Quando** uma página hospedada em um domínio que não está na lista de origens autorizadas tenta chamar a API com credenciais
- **Então** a chamada é recusada, a resposta não traz os cabeçalhos que liberariam a leitura do conteúdo, e a lista de origens autorizadas é fechada — nunca refletindo de volta a origem que chamou

#### AC-126 — Requisição que muda dados exige origem confiável

- **Dado** uma requisição que cria, altera ou remove algo
- **Quando** ela chega sem indicação de origem, ou com origem fora da lista autorizada
- **Então** é recusada antes de tocar o domínio, mesmo trazendo cookie de sessão válido, o que fecha o caminho de falsificação de requisição entre sites

#### AC-127 — Requisição de leitura pública continua livre

- **Dado** a vitrine pública de uma loja, que não exige sessão
- **Quando** ela é consultada de qualquer origem
- **Então** a consulta funciona normalmente, porque a restrição de origem se aplica ao que usa sessão, e não ao conteúdo público

#### AC-128 — Sessão do navegador não vale para requisição de outro site nem por engano

- **Dado** um formulário em site de terceiros apontando para a nossa API
- **Quando** ele é enviado com o navegador da vítima, carregando o cookie de sessão automaticamente
- **Então** a operação não acontece, porque o cookie tem restrição de envio entre sites e a origem é conferida em toda requisição que muda estado

## Fora de escopo

- Login social (Google, Apple, Facebook) — avaliado depois da versão 1.
- Segundo fator por SMS — descartado por custo e por ser o fator mais frágil dos
  disponíveis.
- Chave de segurança física e entrada sem senha por biometria do dispositivo
  (WebAuthn/passkeys) — risco aceito e documentado para depois da versão 1.
- Convite de funcionário e papéis intermediários dentro da loja (ex: atendente
  com acesso só a pedidos) — ver Q-101.
- Troca de senha por dentro do painel com senha atual (entra na área de conta,
  feature futura); esta feature cobre só a recuperação por e-mail.
- Autenticação dos aplicativos nativos ponta a ponta: o contrato está previsto
  em AC-111, mas o aplicativo em si não é construído aqui.

## Suposições

| ID      | Suposição                                                                                                                                                                                                                                                                                                      | Status     | Resolução                                                                                                                                                                                  |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ASM-100 | O e-mail transacional sai por um serviço gratuito com domínio verificado (Resend ou Brevo no plano free) e o limite diário do plano cobre o volume da versão 1                                                                                                                                                 | aberta     | —                                                                                                                                                                                          |
| ASM-101 | Token de acesso com validade curta (15 minutos) e token de renovação com validade longa (30 dias) atendem ao uso real do dono da loja, que fica com o painel aberto durante o expediente                                                                                                                       | aberta     | —                                                                                                                                                                                          |
| ASM-102 | Código de uso único por e-mail é o segundo fator padrão do dono de loja na versão 1, com aplicativo autenticador disponível como opção; para o administrador geral o aplicativo autenticador é obrigatório                                                                                                     | confirmada | Decidido pelo dono do produto em 17/08/2026: e-mail agora como padrão, aplicativo autenticador como opção, obrigatório para administrador geral. O risco aceito está registrado em ASM-106 |
| ASM-106 | Risco aceito conscientemente: enquanto o dono de loja usa código por e-mail, quem compromete a caixa de e-mail dele obtém os dois fatores, porque é o mesmo canal da recuperação de senha. A mitigação na versão 1 é avisar por e-mail toda entrada nova e oferecer o aplicativo autenticador na área de conta | confirmada | Trade-off aceito pelo dono do produto em 17/08/2026 em troca de menor atrito para o lojista pouco técnico                                                                                  |
| ASM-103 | O cliente final aceita criar conta para acompanhar pedido, e o pedido como convidado (sem conta) também é permitido, apenas sem histórico                                                                                                                                                                      | aberta     | —                                                                                                                                                                                          |
| ASM-104 | Um mesmo e-mail pode ser cliente em várias lojas com uma única conta na plataforma, e não uma conta por loja                                                                                                                                                                                                   | aberta     | —                                                                                                                                                                                          |
| ASM-105 | A senha é guardada com Argon2id; o servidor gratuito da Railway tem memória suficiente para os parâmetros recomendados sem degradar o login                                                                                                                                                                    | aberta     | —                                                                                                                                                                                          |

## Perguntas em aberto

| ID    | Pergunta                                                                                                                                                                                    | Status | Resposta |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- |
| Q-100 | O dono da loja se cadastra sozinho pelo site ou só existe quando o administrador geral cria a loja para ele (o v1 tinha login e senha definidos pelo administrador no cadastro do cliente)? | aberta | —        |
| Q-101 | A loja precisa de mais de um acesso na versão 1 (dono e atendente), ou um único acesso por loja basta para começar?                                                                         | aberta | —        |
| Q-102 | Cliente final pode entrar apenas com telefone e código por WhatsApp, em vez de e-mail e senha? Seria mais natural para o público das lojas, mas depende de custo de envio                   | aberta | —        |
| Q-103 | Quanto tempo o cliente final permanece logado antes de precisar entrar de novo? Um dono de loja pede sessão longa; um cliente em dispositivo compartilhado pede sessão curta                | aberta | —        |
