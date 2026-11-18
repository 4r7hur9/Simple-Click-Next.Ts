# .spec — especificações ONP do redesign Stitch

Esta pasta guarda as especificações no método **onp-spec-driven**
(`/Users/stargrupo/.claude/skills/onp-spec-driven/SKILL.md`). Ela foi criada
pelo card #103 em 05/11/2026 e vale para os cards #103–#126.

- Raiz do projeto: `/Users/stargrupo/Projetos/SC`. A pasta do board
  (`/Users/stargrupo/Documents/SC`) está desatualizada: o validador do
  `plan_submit` acusa "arquivo não existe" para caminhos reais. É problema de
  ambiente, confirmado pelo gerente. Não copie código nem crie pastas lá.
- Motor: `node ~/.claude/skills/onp-spec-driven/scripts/onp-spec.mjs <comando>`,
  sempre a partir da raiz do projeto. Abaixo, `onp-spec` abrevia isso.
- Plano e matriz do redesign: `.spec/features/stitch-planejamento/design.md`.

## Fase atual: só especificação

Autorizado: escrever `spec.md`, `tasks.md` e `design.md` da própria pasta.

Proibido nesta fase:

- implementar código, criar ou alterar testes, dependências, banco ou API;
- `git add`, commit, push, PR, merge, rebase, **trocar de branch** (o checkout
  fica em `chore/workflow-ia-instalacao`) ou criar worktree;
- `onp-spec scaffold` (gera teste em `test/`, fora dos globs e do vitest);
- `onp-spec plano ... --paralelizar` e `executar-tarefas.sh` (criam worktrees
  e branches; a execução futura é sequencial e só com plano aprovado);
- editar `.spec/constituicao.md`, `onpspec.config.json`, este README ou a
  pasta de outro card (peça ao gerente com `board_message`);
- tocar `arquivo/spec/` (spec antiga, só histórico), `.workflow-ia/`,
  `CLAUDE.md`, `.gitignore`, `.prettierignore`.

Os arquivos da `.spec/` ficam **sem commit** até o usuário decidir (pergunta
Q-10306). Não inclua `.spec/` nem `onpspec.config.json` em commit de outra
tarefa.

## Pasta e bloco de IDs de cada card

Cada card usa a própria pasta e um **bloco de códigos** de 99 números por
prefixo: card `N` usa `N01` a `N99`. Exemplo do #104: `US-10401…US-10499`,
`AC-10401…`, `T-10401…`, `ASM-10401…`, `Q-10401…`.

| Card | Pasta (`.spec/features/…`)    | Bloco         |
| ---- | ----------------------------- | ------------- |
| #103 | `stitch-planejamento`         | 10301 a 10399 |
| #104 | `stitch-base-visual`          | 10401 a 10499 |
| #105 | `stitch-navegacao-cliente`    | 10501 a 10599 |
| #106 | `stitch-inicio-descoberta`    | 10601 a 10699 |
| #107 | `stitch-vitrine-loja`         | 10701 a 10799 |
| #108 | `stitch-catalogo`             | 10801 a 10899 |
| #109 | `stitch-detalhe-produto`      | 10901 a 10999 |
| #110 | `stitch-sacola-fechamento`    | 11001 a 11099 |
| #111 | `stitch-area-do-cliente`      | 11101 a 11199 |
| #112 | `stitch-painel-lojista`       | 11201 a 11299 |
| #113 | `stitch-admin-plataforma`     | 11301 a 11399 |
| #114 | `stitch-validacao-visual`     | 11401 a 11499 |
| #115 | `decidir-blog`                | 11501 a 11599 |
| #116 | `decidir-posts-de-pensamento` | 11601 a 11699 |
| #117 | `decidir-avaliacoes`          | 11701 a 11799 |
| #118 | `decidir-selos-de-loja`       | 11801 a 11899 |
| #119 | `decidir-cupons`              | 11901 a 11999 |
| #120 | `decidir-avise-me`            | 12001 a 12099 |
| #123 | `decidir-busca-por-camera`    | 12301 a 12399 |
| #124 | `decidir-mais-vendidos`       | 12401 a 12499 |
| #125 | `decidir-fidelidade`          | 12501 a 12599 |
| #126 | `decidir-parcelamento`        | 12601 a 12699 |

Os blocos 121xx e 122xx estão aposentados (cards retirados do escopo). Os
princípios `P-101…P-199` pertencem à constituição; nenhum card cria `P-`.

Por que blocos: os testes atuais já têm cerca de 1.574 marcações legadas
`@spec:` com números de 001 a 951 (da spec arquivada). Números baixos fariam um teste antigo
"provar" um critério novo. E vários cards escrevem ao mesmo tempo.

## Como criar a sua especificação

1. Leia as lições: `onp-spec licoes list`.
2. Crie a pasta: `onp-spec new <sua-pasta>`. **Não confie na numeração que o
   `new` escolhe**: ele usa o maior US/AC existente + 1 (cai no bloco de outro
   card) e deixa `T-001`, `ASM-001`, `Q-001` do template.
3. Reescreva `spec.md` e `tasks.md` usando **só o seu bloco** em US, AC, T,
   ASM e Q. Crie `design.md` se a feature for grande.
4. Confira o prefixo de todos os códigos (troque 104 pelo seu card):

   ```bash
   grep -ohE '(US|AC|T|ASM|Q)-[0-9]+' .spec/features/<sua-pasta>/*.md | sort -u | grep -v -- '-104'
   ```

   Saída vazia = tudo no seu bloco.

5. Procure duplicados no projeto inteiro (o audit não acusa `T-` repetido):

   ```bash
   grep -rhoE '^#+ (US|AC|T)-[0-9]+' .spec/features | sort | uniq -d
   ```

6. Rode o audit e filtre a sua feature (ver "Critério de spec pronta").

## Regras de formato (o motor lê estes arquivos)

- Cabeçalho da spec: `> feature: <sua-pasta>` igual ao nome da pasta e
  `> status: rascunho` enquanto o usuário não revisar.
- História: `### US-10401 — título`. Critério: `#### AC-10401 — título`, com
  `- **Dado** …`, `- **Quando** …`, `- **Então** …` (e `- **E** …`).
- Seções `## Suposições` e `## Perguntas em aberto` são obrigatórias, em
  tabela `| ID | … | Status | … |`. Status: `aberta` (as decisões são do
  usuário; não presuma resposta). **Nunca use `|` dentro de uma célula.**
- Tarefa: `## T-10401 — título [pendente]`, com `- Refs: US-…, AC-…` e
  `- Arquivos: caminho/a.ts, caminho/b.tsx` (separados por vírgula). Glob ou
  regex sempre entre crases.
- Funções "A decidir" (#115–#126) nunca são dependência obrigatória de uma
  tarefa do redesign.
- Dados do Stitch (CNPJ, telefone, notas, prazos, "10x sem juros", cupom,
  imagens) não são copiados como conteúdo real; Universokar/autopeças é só
  exemplo visual. Nada de compatibilidade veicular, placa ou chassi.
- Formate só os seus arquivos: `pnpm exec prettier --write .spec/features/<sua-pasta>`.

## Testes (quando a implementação for autorizada)

- Arquivo: `*.onp.test.ts` ou `*.onp.test.tsx` em `apps/web/tests/`,
  `apps/web/src/`, `packages/*/tests/` ou `packages/*/src/`. Só esses nomes
  são lidos pelo motor (`onpspec.config.json`); testes legados ficam
  invisíveis de propósito.
- Título com as duas convenções: `it("[CA-1] @spec:AC-10401 …")`. O `[CA-n]`
  é do Workflow IA (CLAUDE.md); o `@spec:AC-…` é do ONP.
- `e2e/**/*.onp.spec.ts` conta como teste, mas `onp-spec verify` só roda o
  vitest (projetos `web` e `unit`); a prova e2e fica para o #114 propor.
- `onp-spec verify` roda **um card por vez**: a saída bruta vai para
  `.spec/raw/vitest-onp.json`, apagada antes de cada execução.

## Critério de spec pronta para revisão

```bash
node ~/.claude/skills/onp-spec-driven/scripts/onp-spec.mjs audit --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s.slice(0,s.lastIndexOf("}")+1));const f=process.argv[1];const ok=new Set(["AC_SEM_TESTE","AC_SEM_PROVA","AC_SEM_TASK"]);const x=a.findings.filter(i=>(!i.feature||i.feature===f)&&!ok.has(i.code));console.log(x.length?x:"sem erro estrutural")})' <sua-pasta>
```

A saída do `audit --json` termina com uma linha de texto ("sinais
registrados"); por isso o filtro corta o JSON no último `}`. A auditoria
também acrescenta sinais em `.spec/verification/sinais.json` (arquivo do
motor, não edite).

Sem implementação, `AC_SEM_TESTE` (critério sem teste) é esperado e não
impede a revisão. Qualquer outro código (duplicado, critério incompleto,
seção ausente, referência quebrada, princípio violado) precisa ser corrigido.
`audit --ci` com saída 0 só vale para feature implementada e provada.

## Avisos

- `e2e/specs/manifesto-cobre-arquivos.spec.ts` cita
  `.spec/design/mapa-de-telas.md` numa mensagem de erro: é caminho da spec
  antiga (`arquivo/spec/design/`), não desta pasta.
- Pendência para o usuário/gerente: quando houver `verify`, os JSON gerados
  em `.spec/verification/` e `.spec/raw/` não seguem o prettier e farão
  `pnpm format:check` falhar até entrarem no `.prettierignore`.
