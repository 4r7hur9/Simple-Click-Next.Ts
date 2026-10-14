# Constituição — SimpleClick v2 — v1.1.0

<!--
  Princípios inegociáveis do projeto. Não são estilo: são restrições.
  P-xxx = princípio (código de rastreio, como US/AC/T).
  Níveis: [DEVE] obrigatório · [RECOMENDADO] forte · [PODE] permitido/explícito.
  Todo [DEVE] precisa de verificação executável — senão o audit acusa
  "princípio sem verificação" (PRINCIPIO_SEM_VERIFICACAO). Formatos:
    - verificação(gate): satisfeita pelo próprio audit (só p/ princípios "meta")
    - verificação(teste): @principle:P-xxx
    - verificação(proibido): `regex` em `glob`
    - verificação(obrigatório): `regex` em `glob`

  NOTA DE FASE: os princípios com verificação por regex/glob apontam para
  `apps/**` e `packages/**`, que passam a existir na feature `fundacao`.
  Até lá, o audit acusa "verificação não olha nenhum arquivo"
  (GLOB_SEM_ARQUIVOS) nesses princípios — é esperado e some quando o
  código nasce. Não afrouxe o glob para calar o audit.
-->

## P-001 [DEVE] Todo requisito tem prova executável

Nenhuma feature é declarada pronta sem o audit em modo CI sair limpo (exit 0).
Este princípio é verificado pelo próprio mecanismo do audit (AC_SEM_TESTE,
AC_SEM_PROVA, TASK_CONCLUIDA_SEM_PROVA) — não precisa de teste extra seu.

- verificação(gate): intrínseca ao audit

## P-002 [DEVE] Segredos nunca em código

Chaves, senhas, tokens e URLs de banco vêm de variáveis de ambiente validadas
na inicialização. Nunca hard-coded, nem em exemplo, nem em teste.

- verificação(proibido): `(api[_-]?key|secret|senha|password|DATABASE_URL)\s*[:=]\s*['"][^'"$\{][^'"]{7,}` em `apps/**/*.ts`

## P-003 [DEVE] Isolamento entre lojas provado por teste

Toda tabela com dados de loja tem Row Level Security ativa e existe teste que
prova que a loja A não consegue ler, alterar nem apagar dados da loja B. A
checagem de autorização na aplicação é a segunda camada, nunca a única.

- verificação(teste): @principle:P-003

## P-004 [DEVE] Acesso ao banco só pela camada de dados

Nenhum módulo de domínio, rota ou componente instancia cliente de banco por
conta própria. O acesso passa pelo contexto de requisição, que abre a transação
com a variável de sessão da loja — é isso que faz a Row Level Security valer.

- verificação(proibido): `new PrismaClient\(` em `apps/api/src/modules/**/*.ts`

## P-005 [DEVE] Dinheiro é inteiro em centavos

Nenhum valor monetário trafega ou é persistido como ponto flutuante. Preço,
desconto, taxa e total são inteiros em centavos; a formatação em reais acontece
só na borda de apresentação.

- verificação(proibido): `\b(Float|Double)\b` em `packages/database/prisma/schema.prisma`

## P-006 [DEVE] Preço e total vêm do servidor

O cliente nunca calcula nem envia preço. O pedido é criado com os valores que a
API busca no banco no momento da compra. Nada de ler preço do DOM (erro do v1).

- verificação(teste): @principle:P-006

## P-007 [DEVE] Toda entrada externa é validada na borda

Todo corpo, parâmetro e query de rota da API é validado por esquema declarado
antes de chegar ao domínio. Entrada não validada é bug de segurança.

- verificação(obrigatório): `z\.(object|string|number|coerce|enum)` em `apps/api/src/modules/**/*.schema.ts`

## P-008 [DEVE] Token de sessão nunca fica acessível a script

O refresh token vive em cookie httpOnly. Nada de token de sessão em
localStorage ou sessionStorage no cliente web.

- verificação(proibido): `(local|session)Storage\.(set|get)Item\(\s*['"`][^'"`]*(token|jwt|auth|refresh)` em `apps/web/**/*.tsx`

## P-009 [DEVE] Dado pessoal não vai para log

Telefone, e-mail, CPF/CNPJ, endereço e chave PIX são dados pessoais (LGPD).
Log estruturado registra identificador, nunca o dado em si.

- verificação(proibido): `(console\.(log|info|warn|error)|logger\.\w+)\([^)]*\b(cpf|cnpj|telefone|phone|whatsapp|pixKey|chavePix)\b` em `apps/**/*.ts`

## P-010 [DEVE] Pedido é registro imutável

Item, preço, opção escolhida e dados da loja no pedido são cópia congelada do
momento da compra. Alterar um produto depois nunca muda um pedido já feito.

- verificação(teste): @principle:P-010

## P-011 [DEVE] Toda tela cobre carregando, vazio, erro e sucesso

Nenhuma tela que carrega dados entra em produção sem os quatro estados. É
requisito de interface do projeto, não preferência visual.

- verificação(teste): @principle:P-011

## P-012 [DEVE] Interface acessível e mobile-first

Nenhuma tela pode ter violação de acessibilidade de nível crítico ou sério na
verificação automatizada, nem estouro horizontal no menor breakpoint suportado.

- verificação(teste): @principle:P-012

## P-013 [RECOMENDADO] Função com uma responsabilidade

Função faz uma coisa e o nome diz qual. Regra de negócio não mora em
controlador nem em componente. Módulo novo declara o que pode importar.

## P-014 [RECOMENDADO] Nada de dependência sem benefício demonstrável

Antes de somar biblioteca, mostre o que ela resolve que a stack atual não
resolve, e o custo de manutenção que ela traz.
