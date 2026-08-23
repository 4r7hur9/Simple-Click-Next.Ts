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
- Arquivos: apps/api/src/modules/auth/login.usecase.ts, apps/api/src/modules/auth/login.usecase.test.ts, apps/api/src/modules/auth/segundo-fator.usecase.ts, apps/api/src/modules/auth/segundo-fator.usecase.test.ts, apps/web/src/app/(conta)/entrar/page.tsx, apps/web/src/app/(conta)/entrar/verificacao/page.tsx, apps/web/src/features/auth/LoginForm.tsx, apps/web/src/features/auth/CodigoForm.tsx
- Notas: nenhuma sessão nasce antes do segundo fator ser aceito, quando exigido. Código de uso único, com tentativas limitadas, e invalidação do código em aberto ao bloquear.
- Esforço: alto

## T-103 — Sessão com cookie e rotação com detecção de reuso [concluida]
- Refs: US-103, AC-109, AC-110, AC-111
- Arquivos: apps/api/src/modules/auth/sessao.usecase.ts, apps/api/src/modules/auth/sessao.usecase.test.ts, apps/api/src/modules/auth/token.ts, apps/api/src/modules/auth/token.test.ts, apps/web/src/server/sessao.ts, apps/web/src/server/session-cookie.ts, apps/web/src/app/api/auth/[...action]/route.ts
- Notas: cookie inacessível a script, no domínio compartilhado do site e da API. Reuso de token de renovação revoga a família inteira e avisa por e-mail. Cliente sem cookie recebe o par no corpo, para os aplicativos nativos futuros.
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

## T-106 — Papéis, escopo de acesso e auditoria do administrador [pendente]
- Refs: US-106, AC-116, AC-117, AC-118
- Arquivos: apps/api/src/modules/auth/autorizar.ts, apps/api/src/modules/auth/autorizar.test.ts, apps/api/src/modules/admin/auditoria.repo.ts, apps/api/tests/autorizacao-papel.test.ts, apps/web/src/app/(painel)/painel/layout.tsx, apps/web/src/app/(admin)/admin/layout.tsx
- Notas: negativa de acesso não revela se o recurso existe do outro lado. Cada acesso da administração a dado de loja fica registrado. A segunda camada é a aplicação; a primeira é o banco.
- Esforço: alto

## T-107 — Aplicativo autenticador e códigos de recuperação [pendente]
- Refs: US-108, AC-121, AC-122, AC-123, AC-124
- Arquivos: apps/api/src/modules/auth/totp.usecase.ts, apps/api/src/modules/auth/totp.usecase.test.ts, apps/api/src/modules/auth/recovery-codes.ts, apps/api/src/modules/auth/recovery-codes.test.ts, apps/web/src/app/(conta)/minha-conta/seguranca/aplicativo/page.tsx, apps/web/src/features/auth/TotpForm.tsx
- Notas: segredo do aplicativo guardado cifrado, não como resumo, porque precisa ser lido para conferir. Obrigatório para a administração. Código já usado não é aceito de novo dentro da janela de validade.
- Esforço: alto

## T-108 — Convite do dono e definição da primeira senha [concluida]
- Refs: US-101, AC-103, AC-200
- Arquivos: apps/api/src/modules/auth/convite.usecase.ts, apps/api/src/modules/auth/convite.usecase.test.ts, apps/web/src/app/(conta)/definir-senha/page.tsx
- Notas: fecha a lacuna apontada pelo crítico — a administração cria a loja e o responsável precisa de um caminho para assumir o acesso. Convite com prazo, uso único e reenvio.
- Esforço: medio

## T-109 — Proteção contra tentativa e erro [pendente]
- Refs: US-107, AC-119, AC-120
- Arquivos: apps/api/src/modules/auth/lockout.ts, apps/api/src/modules/auth/lockout.test.ts, apps/api/tests/limite-login.test.ts
- Notas: bloqueio progressivo por conta, com aviso ao dono da conta, mais limite por origem. Considera o endereço real informado pela borda confiável.
- Esforço: medio

## T-110 — Telas de ponta a ponta de acesso [pendente]
- Refs: US-100, US-102, US-103, AC-100, AC-105, AC-109
- Arquivos: e2e/specs/login-2fa.spec.ts, e2e/specs/cadastro.spec.ts, e2e/specs/recuperar-senha.spec.ts
- Notas: roda também no navegador da Apple, porque o comportamento do cookie de sessão nele é critério de aceite, não detalhe.
- Esforço: medio
