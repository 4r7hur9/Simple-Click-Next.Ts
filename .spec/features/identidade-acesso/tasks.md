# Tasks: Identidade e Acesso

> feature: identidade-acesso

## T-100 — Cadastro de cliente final e política de senha [concluida]

- Refs: US-100, AC-100, AC-101, AC-102
- Arquivos: apps/api/src/modules/auth/register.usecase.ts, apps/api/src/modules/auth/register.usecase.test.ts, apps/api/src/modules/auth/auth.schema.ts, apps/api/src/modules/auth/senha.ts, apps/api/src/modules/auth/senha.test.ts, packages/contracts/src/auth.ts
- Notas: resposta idêntica para e-mail novo e já cadastrado, para não permitir descobrir quem tem conta. Senha guardada com algoritmo de derivação resistente, conferida contra vazamentos conhecidos.
- Esforço: alto

## T-101 — Verificação de e-mail com link de uso único [concluida]

- Refs: US-101, AC-103, AC-104
- Arquivos: apps/api/src/modules/auth/verificar-email.usecase.ts, apps/api/src/modules/auth/verificar-email.usecase.test.ts, apps/api/src/modules/auth/codigos.repo.ts, apps/api/src/jobs/email.job.ts, apps/web/src/app/(conta)/verificar-email/page.tsx
- Notas: link guardado como resumo criptográfico, nunca em texto. Uso único, com prazo, e reenvio limitado por período.
- Esforço: medio

## T-102 — Login com senha e desafio de segundo fator [concluida]

- Refs: US-102, AC-105, AC-106, AC-107, AC-108
- Arquivos: apps/api/src/modules/auth/login.usecase.ts, apps/api/src/modules/auth/login.usecase.test.ts, apps/api/src/modules/auth/segundo-fator.usecase.ts, apps/api/src/modules/auth/segundo-fator.usecase.test.ts, apps/api/src/modules/auth/desenvolvimento.routes.ts, apps/web/src/app/(conta)/entrar/page.tsx, apps/web/src/app/(conta)/entrar/verificacao/page.tsx, apps/web/src/features/auth/CascaDaConta.tsx, apps/web/src/features/auth/LoginForm.tsx, apps/web/src/features/auth/CodigoForm.tsx
- Notas: nenhuma sessão nasce antes do segundo fator ser aceito, quando exigido. Código de uso único, com tentativas limitadas, e invalidação do código em aberto ao bloquear. Em desenvolvimento, uma rota isolada por variável de ambiente fornece a conta local de demonstração; ela não é montada em produção.
- Esforço: alto

## T-103 — Sessão com cookie e rotação com detecção de reuso [concluida]

- Refs: US-103, AC-109, AC-110, AC-111
- Arquivos: apps/api/src/modules/auth/sessao.usecase.ts, apps/api/src/modules/auth/sessao.usecase.test.ts, apps/api/src/modules/auth/token.ts, apps/api/src/modules/auth/token.test.ts, apps/web/src/server/sessao.ts, apps/web/src/server/session-cookie.ts, apps/web/src/app/api/auth/[...action]/route.ts, apps/web/tests/sessao-servidor.test.ts
- Notas: cookie inacessível a script e, em produção, no domínio compartilhado do site e da API. Em desenvolvimento sem domínio explícito, o cookie é restrito ao host local para funcionar em `localhost`. Reuso de token de renovação revoga a família inteira e avisa por e-mail. Cliente sem cookie recebe o par no corpo, para os aplicativos nativos futuros.
- Esforço: max

## T-104 — Encerrar sessão atual e todas as sessões [concluida]

- Refs: US-104, AC-112, AC-113
- Arquivos: apps/api/src/modules/auth/logout.usecase.ts, apps/api/src/modules/auth/logout.usecase.test.ts, apps/web/src/app/(conta)/minha-conta/seguranca/page.tsx, apps/web/src/server/actions/auth.ts
- Notas: sair revoga no servidor, não apenas apaga o cookie. Encerrar todas derruba os outros dispositivos na próxima renovação.
- Esforço: medio

## T-105 — Recuperação de senha [concluida]

- Refs: US-105, AC-114, AC-115
- Arquivos: apps/api/src/modules/auth/recuperar-senha.usecase.ts, apps/api/src/modules/auth/recuperar-senha.usecase.test.ts, apps/web/src/app/(conta)/recuperar-senha/page.tsx, apps/web/src/app/(conta)/definir-senha/page.tsx
- Notas: mesma confirmação exista ou não a conta. Nova senha revoga todas as sessões anteriores e o link deixa de funcionar.
- Esforço: medio

## T-106 — Papéis, escopo de acesso e auditoria do administrador [concluida]

- Refs: US-106, AC-116, AC-117, AC-118
- Arquivos: apps/api/src/modules/auth/autorizar.ts, apps/api/src/modules/auth/autorizar.test.ts, apps/api/src/modules/admin/auditoria.repo.ts, apps/api/src/core/acesso-administrativo.ts, apps/api/tests/autorizacao-papel.test.ts, apps/web/src/app/(painel)/painel/layout.tsx, apps/web/src/app/(admin)/admin/layout.tsx, packages/database/migrations/0041_equipe_e_quem_tem_vinculo_ativo.sql, apps/api/tests/isolamento-entre-lojas-dono.test.ts
- Notas: negativa de acesso não revela se o recurso existe do outro lado. Cada acesso da administração a dado de loja fica registrado. A segunda camada é a aplicação; a primeira é o banco.
- Esforço: alto

## T-107 — Aplicativo autenticador e códigos de recuperação [concluida]

- Refs: US-108, AC-121, AC-122, AC-123, AC-124
- Arquivos: apps/api/src/modules/auth/totp.usecase.ts, apps/api/src/modules/auth/totp.usecase.test.ts, apps/api/src/modules/auth/recovery-codes.ts, apps/api/src/modules/auth/recovery-codes.test.ts, apps/web/src/app/(conta)/minha-conta/seguranca/aplicativo/page.tsx, apps/web/src/features/auth/TotpForm.tsx
- Notas: segredo do aplicativo guardado cifrado, não como resumo, porque precisa ser lido para conferir. Obrigatório para a administração. Código já usado não é aceito de novo dentro da janela de validade.
- Esforço: alto

## T-108 — Convite do dono e definição da primeira senha [concluida]

- Refs: US-101, AC-103, AC-200
- Arquivos: apps/api/src/modules/auth/convite.usecase.ts, apps/api/src/modules/auth/convite.usecase.test.ts, apps/web/src/app/(conta)/definir-senha/page.tsx
- Notas: fecha a lacuna apontada pelo crítico — a administração cria a loja e o responsável precisa de um caminho para assumir o acesso. Convite com prazo, uso único e reenvio.
- Esforço: medio

## T-109 — Proteção contra tentativa e erro [concluida]

- Refs: US-107, AC-119, AC-120
- Arquivos: apps/api/src/modules/auth/lockout.ts, apps/api/src/modules/auth/lockout.test.ts, apps/api/tests/limite-login.test.ts
- Notas: bloqueio progressivo por conta, com aviso ao dono da conta, mais limite por origem. Considera o endereço real informado pela borda confiável.
- Esforço: medio

## T-110 — Telas de ponta a ponta de acesso [concluida]

- Refs: US-100, US-102, US-103, AC-100, AC-105, AC-109
- Arquivos: e2e/specs/login-2fa.spec.ts, e2e/specs/cadastro.spec.ts, e2e/specs/recuperar-senha.spec.ts
- Notas: roda também no navegador da Apple, porque o comportamento do cookie de sessão nele é critério de aceite, não detalhe.
- Correção (T-114): a prova original desta tarefa era código morto — três arquivos Vitest com duplos dentro de `e2e/specs`, ignorados pelo Vitest (que exclui `e2e/**`) e pelo Playwright (`testIgnore`). Nunca rodaram. Os três arquivos foram reescritos como Playwright de verdade na T-114, que é onde a prova no navegador mora agora; o navegador da Apple segue pendente (ver T-114).
- Esforço: medio

## T-111 — Persistência da identidade no banco [concluida]

- Refs: US-110, AC-129, AC-130, AC-131, AC-100, AC-101, AC-103, AC-104, AC-105, AC-106, AC-107, AC-110, AC-111, AC-112, AC-113, AC-114, AC-115, AC-116, AC-117, AC-121, AC-122, AC-123, AC-124
- Arquivos: packages/database/migrations/0044_identidade_persistida.sql, packages/database/migrations/0045_identidade_funcoes_antes_da_sessao.sql, packages/database/migrations/0046_identidade_segundo_fator_e_sessao.sql, packages/database/prisma/schema.prisma, apps/api/src/core/cifra.ts, apps/api/src/core/cifra.test.ts, apps/api/src/core/env.ts, apps/api/src/core/env.test.ts, apps/api/src/main.test.ts, apps/api/src/main.redis.test.ts, apps/api/src/modules/auth/identidade.repo.ts, apps/api/src/modules/auth/sessoes.repo.ts, apps/api/src/modules/auth/segundo-fator.repo.ts, apps/api/src/modules/auth/convite.usecase.ts, apps/api/tests/apoio-da-identidade.ts, apps/api/tests/apoio-da-conta.ts, apps/api/tests/apoio-do-segundo-fator.ts, apps/api/tests/identidade-persistida.test.ts, apps/api/tests/recuperacao-e-convite-persistidos.test.ts, apps/api/tests/sessao-persistida.test.ts, apps/api/tests/segundo-fator-persistido.test.ts, apps/api/tests/aplicativo-autenticador-persistido.test.ts, apps/api/tests/isolamento-da-identidade.test.ts, .env.example
- Notas: implementa no banco as portas que os casos de uso já declaram, sem mudar a regra deles. Tabelas novas (sessões e famílias de renovação, códigos de uso único, segredo do aplicativo autenticador, códigos de recuperação) com isolamento ligado e forçado. Tudo pela credencial que atende requisição: os passos anteriores à sessão (cadastro, login, verificação, recuperação, desafio do segundo fator, renovação, aceite de convite) passam por funções dedicadas com caminho de busca fixo e lista fechada de campos; os passos de quem já está logado (aplicativo autenticador, códigos de recuperação, sair, encerrar todas) passam pela política de "só a própria identidade". Só o resumo de token e de código vai ao banco, nunca o valor; o segredo do aplicativo vai cifrado com AES-256-GCM e chave do ambiente, exigida na partida em produção. O banco confere o que a aplicação também confere: papel da sessão igual ao papel real da identidade, código por e-mail recusado para quem tem aplicativo ativo e para a administração, revogação que não volta atrás. O reenvio do link de verificação conta por identidade e trava a conta; a rota da T-112 precisa abrir a autorização e a criação do link novo na mesma transação.
- Esforço: xalto

## T-112 — Rotas reais de identidade na API de produção [concluida]

- Refs: US-110, AC-132, AC-133, AC-100, AC-101, AC-102, AC-103, AC-104, AC-105, AC-106, AC-107, AC-108, AC-109, AC-110, AC-111, AC-112, AC-113, AC-114, AC-115, AC-119, AC-120, AC-121, AC-122, AC-123, AC-124
- Arquivos: apps/api/src/modules/auth/auth.routes.ts, apps/api/src/modules/auth/conta-segura.routes.ts, apps/api/src/modules/auth/servicos-da-identidade.ts, apps/api/src/modules/auth/borda-da-sessao.ts, apps/api/src/modules/auth/emails-de-acesso.ts, apps/api/src/modules/auth/limite-da-identidade.ts, apps/api/src/modules/auth/identidade-auxiliar.repo.ts, apps/api/src/modules/auth/auth.schema.ts, apps/api/src/modules/auth/desenvolvimento.routes.ts, apps/api/src/app.ts, apps/api/src/main.ts, apps/api/src/jobs/email.job.ts, apps/api/src/jobs/email.job.test.ts, packages/contracts/src/auth.ts, packages/contracts/src/auth-rotas.ts, packages/contracts/src/rotas.ts, packages/contracts/src/index.ts, packages/contracts/src/contrato.test.ts, apps/api/src/contracts/gerar.test.ts, contrato/openapi.json, apps/api/tests/apoio-das-rotas-de-identidade.ts, apps/api/tests/rotas-de-identidade.test.ts, apps/api/tests/rotas-da-conta-segura.test.ts, apps/api/tests/limite-do-segundo-fator-e-da-ponte.test.ts, apps/api/src/core/limite.ts, apps/web/src/server/chamada-de-identidade.ts, apps/web/tests/ponte-de-identidade.test.ts, README.md, infra/railway/README.md, .env.example
- Notas: monta em `/v1/auth` as rotas de cadastro, verificação e reenvio, login, segundo fator (e-mail, aplicativo e código de recuperação), renovação, saída e encerrar todas, recuperação de senha, ativação do aplicativo e aceite de convite, compostas com os repositórios da T-111 e uma transação por requisição. Em produção a rota de desenvolvimento não é montada (troca mínima da linha de `/v1/auth` em `app.ts`). Cookie de renovação httpOnly, Secure e SameSite; cliente nativo recebe o par no corpo. Limite por conta e por origem (`core/limite.ts`) montado nas rotas de login e segundo fator, com endereço real vindo da borda confiável. Resposta neutra que não revela se o e-mail existe. E-mail pela porta `EnviadorDeEmail`: sem provedor em produção a resposta diz que o envio está indisponível; fora de produção, adaptador que só registra, sem endereço nem link (P-009). O provedor é decisão pendente do dono (dívida 35).
- Correção da revisão (06/10): dois furos do limite. (1) O limite "por conta" do segundo fator contava por desafio: quem tem a senha recomeçava o login e ganhava mais cinco chances a cada desafio, sem fim. Agora um middleware descobre a conta dona do desafio e os erros de código (inclusive o que bloqueia o desafio) somam nela; dez erros bloqueiam o segundo fator da conta, com espera que cresce (AC-107). (2) O navegador entra pelo servidor do site, e a API via só o endereço dele: todo visitante caía num balde de origem só, e sessenta logins errados por minuto trancavam o login de todo mundo. Agora o site informa o endereço do visitante, e a API só acredita nele com o segredo compartilhado `SEGREDO_DA_PONTE` (AC-120); sem o segredo em produção, a API avisa no registro.
- Esforço: xalto

## T-113 — Telas de acesso ligadas à API real [concluida]

- Refs: US-100, US-101, US-102, US-104, US-105, US-108, AC-100, AC-102, AC-103, AC-104, AC-105, AC-106, AC-107, AC-108, AC-112, AC-113, AC-114, AC-115, AC-121, AC-123
- Arquivos: apps/web/src/server/sessao.ts, apps/web/src/server/session-cookie.ts, apps/web/src/server/chamada-de-identidade.ts, apps/web/src/server/formularios-de-acesso.ts, apps/web/src/server/actions/auth.ts, apps/web/src/app/api/auth/[...action]/route.ts, apps/web/src/app/(conta)/cadastrar/page.tsx, apps/web/src/app/(conta)/entrar/page.tsx, apps/web/src/app/(conta)/entrar/verificacao/page.tsx, apps/web/src/app/(conta)/verificar-email/page.tsx, apps/web/src/app/(conta)/recuperar-senha/page.tsx, apps/web/src/app/(conta)/definir-senha/page.tsx, apps/web/src/app/(conta)/minha-conta/seguranca/page.tsx, apps/web/src/app/(conta)/minha-conta/seguranca/aplicativo/page.tsx, apps/web/src/app/(conta)/minha-conta/seguranca/aplicativo/AtivacaoDoAplicativo.tsx, apps/web/src/features/auth/CadastroForm.tsx, apps/web/src/features/auth/LoginForm.tsx, apps/web/src/features/auth/CodigoForm.tsx, apps/web/src/features/auth/CodigoDeRecuperacaoForm.tsx, apps/web/src/features/auth/TotpForm.tsx, apps/web/src/features/auth/respostas-de-acesso.ts, apps/web/src/lib/routes.ts, .spec/design/mapa-de-telas.md, e2e/specs/manifesto-cobre-arquivos.spec.ts, apps/web/tests/telas-de-acesso.test.tsx, apps/web/tests/ponte-de-identidade.test.ts
- Notas: a ponte de sessão do site passa a falar com as rotas reais da T-112 (cadastrar, verificar, entrar, segundo fator, renovar, sair, recuperar, definir senha e aceitar convite), e a tela de cadastro passa a existir. Formulário de acesso sem animação decorativa, com os quatro estados, celular primeiro e acessível por teclado (skill design-de-front e tokens da identidade visual). Confirmar e-mail, pedir recuperação e definir senha funcionam sem script (formulário para a ponte, que volta por redirecionamento com o estado); abrir o link de verificação não o consome — a pessoa confirma com um botão. O cookie de acesso curto passa a valer também em produção, para o painel e a conta alcançarem a API depois do login real. Sem biblioteca de código QR (nenhuma dependência nova): a chave do aplicativo aparece em texto agrupado e como link `otpauth://`; o desenho do código de barras quadrado fica pendente de decisão (biblioteca ou gerador próprio).
- Esforço: alto

## T-114 — Ponta a ponta de acesso no navegador de verdade [concluida]

- Refs: US-100, US-101, US-102, US-103, US-104, US-105, US-107, AC-100, AC-103, AC-105, AC-106, AC-108, AC-109, AC-110, AC-112, AC-114, AC-115, AC-119
- Arquivos: e2e/specs/cadastro.spec.ts, e2e/specs/login-2fa.spec.ts, e2e/specs/recuperar-senha.spec.ts, e2e/fixtures/caixa-de-email.ts, e2e/fixtures/acesso.ts, e2e/playwright.config.ts, apps/api/src/jobs/caixa-de-email-de-prova.ts, apps/api/src/jobs/email.job.ts, apps/api/src/jobs/email.job.test.ts, apps/web/src/server/sessao.ts, apps/web/src/features/auth/respostas-de-acesso.ts, apps/web/src/server/actions/auth.ts, .env.example
- Notas: substitui a prova da T-110, que exercitava os casos de uso com duplos dentro da pasta de ponta a ponta, por navegação real (Playwright) contra a API montada com banco descartável: cadastro, verificação, login com segundo fator, cookie de sessão protegido, renovação, saída e recuperação de senha, inclusive no navegador da Apple.
- Feito: três arquivos Playwright, rodados pelo `run-isolado` nos projetos `publico` e `celular` (344 px). Cadastro do cliente → não entra antes de confirmar → link da caixa confirma uma vez só → entra direto em /minha-conta/pedidos → cookies HttpOnly/Secure/SameSite e nada no armazenamento do script → sair apaga os cookies e o token antigo recebe 401 da API. Convite do dono (plantado no banco no papel da administração) → primeira senha pela tela → senha pede o código e nenhuma sessão existe → código do e-mail abre o painel e as categorias carregam → o mesmo código é recusado. Renovação pela ponte troca o cookie; o token antigo usado de novo derruba a família (o novo também recebe 401) e o dono recebe o aviso. Dez senhas erradas → a certa é barrada com o tempo de espera e o aviso por e-mail. Recuperação: mesma confirmação para e-mail com e sem conta, só o cadastrado recebe link, senha nova entra, o link não vale de novo, a senha antiga não entra e a sessão aberta em outro navegador não renova mais.
- Como os e-mails são lidos: `CAIXA_DE_EMAIL_DE_PROVA` (só fora de produção; ignorada em production) faz a API gravar cada mensagem como JSON numa pasta, que o `playwright.config.ts` liga na API do ponta a ponta.
- Correções que o navegador de verdade achou: (1) o cliente era mandado para `/minha-conta`, que não tem página (404) — agora vai para `/minha-conta/pedidos`; (2) o site do ponta a ponta roda em modo produção e gravava o cookie de renovação com o domínio `simpleclick.localhost`, recusado em localhost — o config passa `NEXT_PUBLIC_SESSION_COOKIE_DOMAIN=localhost`; (3) sair apagava o cookie de renovação sem o domínio dele, e cookie de domínio só some com o mesmo domínio — agora apaga com `dominioDoCookieDeSessao()`.
- Pendente: o navegador da Apple (WebKit). O projeto só tem o Chromium do Playwright instalado e nenhum projeto `webkit` no config; instalar o navegador e somar o projeto fica para decisão (download de navegador novo na máquina e no CI). Também não há página raiz `/minha-conta` (linha "Meus dados" do manifesto, AC-509, de pedido-checkout), nem atalho para a segurança a partir de /minha-conta/pedidos (AC-108 pede a opção de ativar o segundo fator "na minha área": ela existe em /minha-conta/seguranca).
- Esforço: alto

## T-115 — Loja do dono pela sessão [concluida]

- Refs: US-111, AC-134, AC-135, AC-136
- Arquivos: packages/database/migrations/0046_identidade_segundo_fator_e_sessao.sql, packages/contracts/src/eu.ts, packages/contracts/src/rotas.ts, packages/contracts/src/index.ts, packages/contracts/src/contrato.test.ts, apps/api/src/contracts/gerar.test.ts, contrato/openapi.json, apps/api/src/modules/auth/eu.routes.ts, apps/api/src/app.ts, apps/api/tests/rota-do-eu.test.ts, apps/web/src/server/loja-do-painel.ts, apps/web/src/server/loja-da-pagina.ts, apps/web/src/server/actions/loja.ts, apps/web/src/server/encaminhar-ao-painel.ts, apps/web/src/server/encaminhar-a-loja.ts, apps/web/src/server/cupom.ts, apps/web/src/features/impressao/AvisoDoCupom.tsx, apps/web/src/app/(conta)/escolher-loja/page.tsx, apps/web/src/app/(conta)/escolher-loja/loading.tsx, apps/web/src/app/(painel)/painel/layout.tsx, apps/web/src/app/(painel)/painel/config/contato/page.tsx, apps/web/src/app/(painel)/painel/pedidos/novo/page.tsx, apps/web/src/app/api/catalogo/categorias/route.ts, apps/web/src/app/api/catalogo/categorias/[id]/route.ts, apps/web/src/app/api/catalogo/produtos/route.ts, apps/web/src/app/api/catalogo/produtos/[produtoId]/route.ts, apps/web/src/app/api/catalogo/produtos/[produtoId]/duplicar/route.ts, apps/web/src/app/api/catalogo/produtos/[produtoId]/estoque/route.ts, apps/web/src/app/api/catalogo/produtos/[produtoId]/imagens/route.ts, apps/web/src/app/api/catalogo/produtos/[produtoId]/imagens/[imagemId]/route.ts, apps/web/src/app/api/catalogo/produtos/[produtoId]/imagens/arquivo/route.ts, apps/web/src/app/api/catalogo/produtos/[produtoId]/opcoes/route.ts, apps/web/src/app/api/catalogo/produtos/[produtoId]/opcoes/[grupoId]/route.ts, apps/web/src/app/api/catalogo/produtos/[produtoId]/opcoes/[grupoId]/itens/route.ts, apps/web/src/app/api/catalogo/produtos/[produtoId]/opcoes/[grupoId]/itens/[itemId]/route.ts, apps/web/src/app/api/catalogo/produtos/[produtoId]/precos/route.ts, apps/web/src/app/api/catalogo/produtos/[produtoId]/precos/[precoId]/route.ts, apps/web/src/app/api/catalogo/produtos/[produtoId]/variacoes/route.ts, apps/web/src/app/api/catalogo/produtos/[produtoId]/variacoes/[variacaoId]/route.ts, apps/web/src/app/api/catalogo/produtos/[produtoId]/variacoes/[variacaoId]/estoque/route.ts, apps/web/src/app/api/loja/[secao]/route.ts, apps/web/src/app/api/loja/imagem/[tipo]/route.ts, apps/web/src/app/api/painel/pedidos/route.ts, apps/web/src/app/api/painel/pedidos/[id]/route.ts, apps/web/src/lib/routes.ts, .spec/design/mapa-de-telas.md, apps/web/tests/loja-do-painel.test.ts, apps/web/tests/escolher-loja.test.tsx, apps/web/tests/apoio-da-loja-da-sessao.ts, apps/web/tests/imprimir-cupom.test.tsx, e2e/specs/loja-pela-sessao.spec.ts, e2e/specs/manifesto-cobre-arquivos.spec.ts, e2e/fixtures/painel.ts, .env.example, README.md
- Notas: rota "quem sou eu" (`GET /v1/eu`) com a identidade da sessão e as lojas com vínculo ativo, lidas pela função `app.lojas_da_sessao()` (direitos de quem a definiu, caminho de busca fixo, lista fechada de campos, só a identidade e o papel do contexto, execução só por `sc_app`), acrescentada ao fim da 0046, que ainda não tinha sido aplicada em banco nenhum fora dos descartáveis. O site resolve a loja do painel num ponto só (`server/loja-do-painel.ts`): pergunta à API em cada pedido e usa a escolha do cookie `sc_loja` (HttpOnly, Secure, SameSite=Lax) se ela está na lista da sessão, senão a única loja, senão manda escolher em `/escolher-loja`; escolha que deixou de valer também volta para a escolha. A escolha é uma ação do servidor que só aceita loja da própria sessão. Todas as leituras de `NEXT_PUBLIC_DEV_STORE_SLUG` em `apps/web/src` saíram (um teste varre a pasta); a variável continua só no login local de desenvolvimento da API, fora de produção. A casca do painel mostra a loja da sessão, o link "Ver minha loja" certo e "Trocar de loja" para quem tem mais de uma. O cupom ganhou o estado "escolher a loja" e não emite via sem loja decidida. A prova do cupom (AC-617) passou a responder "quem sou eu" na API de mentira e agora confere que a via sai na loja da sessão.
- Feito: prova da API contra banco (dois donos, segunda loja, suspensa, excluída, vínculo revogado, convite pendente, 401, cliente e administração sem loja, permissão da função); prova do site com dois donos e a variável apontando para uma terceira loja; ponta a ponta com três donos nos projetos `publico` e `celular`.
- Custo conhecido: cada encaminhamento do painel faz uma pergunta a mais à API (`/v1/eu`). Se pesar, o caminho é a loja escolhida entrar na sessão.
- Esforço: alto
