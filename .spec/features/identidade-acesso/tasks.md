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
- Esforço: medio

## T-111 — Persistência da identidade no banco [concluida]

- Refs: US-110, AC-129, AC-130, AC-131, AC-100, AC-101, AC-103, AC-104, AC-105, AC-106, AC-107, AC-110, AC-111, AC-112, AC-113, AC-114, AC-115, AC-116, AC-117, AC-121, AC-122, AC-123, AC-124
- Arquivos: packages/database/migrations/0044_identidade_persistida.sql, packages/database/migrations/0045_identidade_funcoes_antes_da_sessao.sql, packages/database/migrations/0046_identidade_segundo_fator_e_sessao.sql, packages/database/prisma/schema.prisma, apps/api/src/core/cifra.ts, apps/api/src/core/cifra.test.ts, apps/api/src/core/env.ts, apps/api/src/core/env.test.ts, apps/api/src/main.test.ts, apps/api/src/main.redis.test.ts, apps/api/src/modules/auth/identidade.repo.ts, apps/api/src/modules/auth/sessoes.repo.ts, apps/api/src/modules/auth/segundo-fator.repo.ts, apps/api/src/modules/auth/convite.usecase.ts, apps/api/tests/apoio-da-identidade.ts, apps/api/tests/apoio-da-conta.ts, apps/api/tests/apoio-do-segundo-fator.ts, apps/api/tests/identidade-persistida.test.ts, apps/api/tests/recuperacao-e-convite-persistidos.test.ts, apps/api/tests/sessao-persistida.test.ts, apps/api/tests/segundo-fator-persistido.test.ts, apps/api/tests/aplicativo-autenticador-persistido.test.ts, apps/api/tests/isolamento-da-identidade.test.ts, .env.example
- Notas: implementa no banco as portas que os casos de uso já declaram, sem mudar a regra deles. Tabelas novas (sessões e famílias de renovação, códigos de uso único, segredo do aplicativo autenticador, códigos de recuperação) com isolamento ligado e forçado. Tudo pela credencial que atende requisição: os passos anteriores à sessão (cadastro, login, verificação, recuperação, desafio do segundo fator, renovação, aceite de convite) passam por funções dedicadas com caminho de busca fixo e lista fechada de campos; os passos de quem já está logado (aplicativo autenticador, códigos de recuperação, sair, encerrar todas) passam pela política de "só a própria identidade". Só o resumo de token e de código vai ao banco, nunca o valor; o segredo do aplicativo vai cifrado com AES-256-GCM e chave do ambiente, exigida na partida em produção. O banco confere o que a aplicação também confere: papel da sessão igual ao papel real da identidade, código por e-mail recusado para quem tem aplicativo ativo e para a administração, revogação que não volta atrás. O reenvio do link de verificação conta por identidade e trava a conta; a rota da T-112 precisa abrir a autorização e a criação do link novo na mesma transação.
- Esforço: xalto

## T-112 — Rotas reais de identidade na API de produção [concluida]

- Refs: US-110, AC-132, AC-133, AC-100, AC-101, AC-102, AC-103, AC-104, AC-105, AC-106, AC-107, AC-108, AC-109, AC-110, AC-111, AC-112, AC-113, AC-114, AC-115, AC-119, AC-120, AC-121, AC-122, AC-123, AC-124
- Arquivos: apps/api/src/modules/auth/auth.routes.ts, apps/api/src/modules/auth/conta-segura.routes.ts, apps/api/src/modules/auth/servicos-da-identidade.ts, apps/api/src/modules/auth/borda-da-sessao.ts, apps/api/src/modules/auth/emails-de-acesso.ts, apps/api/src/modules/auth/limite-da-identidade.ts, apps/api/src/modules/auth/identidade-auxiliar.repo.ts, apps/api/src/modules/auth/auth.schema.ts, apps/api/src/modules/auth/desenvolvimento.routes.ts, apps/api/src/app.ts, apps/api/src/main.ts, apps/api/src/jobs/email.job.ts, apps/api/src/jobs/email.job.test.ts, packages/contracts/src/auth.ts, packages/contracts/src/auth-rotas.ts, packages/contracts/src/rotas.ts, packages/contracts/src/index.ts, packages/contracts/src/contrato.test.ts, apps/api/src/contracts/gerar.test.ts, contrato/openapi.json, apps/api/tests/apoio-das-rotas-de-identidade.ts, apps/api/tests/rotas-de-identidade.test.ts, apps/api/tests/rotas-da-conta-segura.test.ts
- Notas: monta em `/v1/auth` as rotas de cadastro, verificação e reenvio, login, segundo fator (e-mail, aplicativo e código de recuperação), renovação, saída e encerrar todas, recuperação de senha, ativação do aplicativo e aceite de convite, compostas com os repositórios da T-111 e uma transação por requisição. Em produção a rota de desenvolvimento não é montada (troca mínima da linha de `/v1/auth` em `app.ts`). Cookie de renovação httpOnly, Secure e SameSite; cliente nativo recebe o par no corpo. Limite por conta e por origem (`core/limite.ts`) montado nas rotas de login e segundo fator, com endereço real vindo da borda confiável. Resposta neutra que não revela se o e-mail existe. E-mail pela porta `EnviadorDeEmail`: sem provedor em produção a resposta diz que o envio está indisponível; fora de produção, adaptador que só registra, sem endereço nem link (P-009). O provedor é decisão pendente do dono (dívida 35).
- Esforço: xalto

## T-113 — Telas de acesso ligadas à API real [concluida]

- Refs: US-100, US-101, US-102, US-104, US-105, US-108, AC-100, AC-102, AC-103, AC-104, AC-105, AC-106, AC-107, AC-108, AC-112, AC-113, AC-114, AC-115, AC-121, AC-123
- Arquivos: apps/web/src/server/sessao.ts, apps/web/src/server/session-cookie.ts, apps/web/src/server/chamada-de-identidade.ts, apps/web/src/server/formularios-de-acesso.ts, apps/web/src/server/actions/auth.ts, apps/web/src/app/api/auth/[...action]/route.ts, apps/web/src/app/(conta)/cadastrar/page.tsx, apps/web/src/app/(conta)/entrar/page.tsx, apps/web/src/app/(conta)/entrar/verificacao/page.tsx, apps/web/src/app/(conta)/verificar-email/page.tsx, apps/web/src/app/(conta)/recuperar-senha/page.tsx, apps/web/src/app/(conta)/definir-senha/page.tsx, apps/web/src/app/(conta)/minha-conta/seguranca/page.tsx, apps/web/src/app/(conta)/minha-conta/seguranca/aplicativo/page.tsx, apps/web/src/app/(conta)/minha-conta/seguranca/aplicativo/AtivacaoDoAplicativo.tsx, apps/web/src/features/auth/CadastroForm.tsx, apps/web/src/features/auth/LoginForm.tsx, apps/web/src/features/auth/CodigoForm.tsx, apps/web/src/features/auth/CodigoDeRecuperacaoForm.tsx, apps/web/src/features/auth/TotpForm.tsx, apps/web/src/features/auth/respostas-de-acesso.ts, apps/web/src/lib/routes.ts, .spec/design/mapa-de-telas.md, e2e/specs/manifesto-cobre-arquivos.spec.ts, apps/web/tests/telas-de-acesso.test.tsx, apps/web/tests/ponte-de-identidade.test.ts
- Notas: a ponte de sessão do site passa a falar com as rotas reais da T-112 (cadastrar, verificar, entrar, segundo fator, renovar, sair, recuperar, definir senha e aceitar convite), e a tela de cadastro passa a existir. Formulário de acesso sem animação decorativa, com os quatro estados, celular primeiro e acessível por teclado (skill design-de-front e tokens da identidade visual). Confirmar e-mail, pedir recuperação e definir senha funcionam sem script (formulário para a ponte, que volta por redirecionamento com o estado); abrir o link de verificação não o consome — a pessoa confirma com um botão. O cookie de acesso curto passa a valer também em produção, para o painel e a conta alcançarem a API depois do login real. Sem biblioteca de código QR (nenhuma dependência nova): a chave do aplicativo aparece em texto agrupado e como link `otpauth://`; o desenho do código de barras quadrado fica pendente de decisão (biblioteca ou gerador próprio).
- Esforço: alto

## T-114 — Ponta a ponta de acesso no navegador de verdade [pendente]

- Refs: US-100, US-102, US-103, US-104, US-105, AC-100, AC-105, AC-106, AC-109, AC-110, AC-112, AC-114, AC-115
- Arquivos: e2e/specs/cadastro.spec.ts, e2e/specs/login-2fa.spec.ts, e2e/specs/recuperar-senha.spec.ts
- Notas: substitui a prova da T-110, que exercitava os casos de uso com duplos dentro da pasta de ponta a ponta, por navegação real (Playwright) contra a API montada com banco descartável: cadastro, verificação, login com segundo fator, cookie de sessão protegido, renovação, saída e recuperação de senha, inclusive no navegador da Apple.
- Esforço: alto
