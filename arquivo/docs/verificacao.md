# Verificação — o portão de qualidade

Este documento explica **como o portão funciona** e **o que fazer quando cada
etapa reprova**. Ele é a referência que a saída vermelha manda ler.

O portão inteiro roda **nesta máquina**. Não existe fluxo de verificação em
servidor externo, e isso é decisão registrada em `.spec/design/decisoes.md`
(17/08/2026): a verificação que importa é a que a pessoa que escreve o código
consegue rodar antes de mandar o código embora.

---

## 1. Um comando

```bash
bash infra/scripts/verificar.sh
```

É o portão completo (AC-017). Ele percorre todas as etapas, mostra o que cada
uma verificou, e termina com um resumo. Código de saída `0` significa limpo;
qualquer outro significa reprovado, e o resumo diz **quais** etapas reprovaram.

Variações úteis:

| Comando                                           | Para quê                                      |
| ------------------------------------------------- | --------------------------------------------- |
| `bash infra/scripts/verificar.sh --listar`        | só os nomes das etapas, na ordem em que rodam |
| `bash infra/scripts/verificar.sh --somente tipos` | roda só as etapas com `tipos` no nome         |
| `bash infra/scripts/verificar.sh --ajuda`         | o cabeçalho de uso                            |

`--somente` é para consertar: reprovou uma etapa, conserte e rode só ela, em
vez de esperar o portão inteiro de novo. Só não confunda com aprovação —
execução parcial **não** conta como verificação da versão (ver §5).

---

## 2. Como o portão está montado

Dois arquivos, com responsabilidades separadas de propósito:

- **`infra/scripts/portao-lib.sh`** — o motor. Anúncio de etapa, cronometragem,
  contagem, resumo, e o registro de quais versões foram aprovadas.
- **`infra/scripts/verificar.sh`** — a lista de etapas, e nada mais. Cada etapa
  é uma linha:

  ```bash
  portao_etapa "<nome>" "<o que ela verifica>" <comando...>
  ```

O segundo argumento não é enfeite: quem lê a saída precisa saber **o que** foi
verificado, não apenas que "passou". Etapa que não sabe dizer o que verifica é
sinal verde sem conteúdo.

**Para acrescentar uma etapa:** escreva uma linha no bloco a que ela pertence e
não mexa no motor. É o que permite duas tarefas crescerem o portão ao mesmo
tempo sem conflito além da própria linha.

### A ordem das etapas

Barato e revelador primeiro. Quem reprova por uma vírgula fora do lugar
descobre em dois segundos, e não depois de dez minutos de banco de dados. Os
blocos vão do que só lê arquivo até o que precisa de serviço no ar:

| Bloco | O que é                                                                      | Precisa de serviço? |
| ----- | ---------------------------------------------------------------------------- | ------------------- |
| 0     | o que precisa existir antes de tudo (cliente do banco gerado)                | não                 |
| 1     | leitura do repositório: formato, ESLint, segredo, auditoria da especificação | não                 |
| 2     | tipos e contrato publicado                                                   | não                 |
| 3     | testes que rodam só no processo (unidade, site)                              | não                 |
| 4     | testes contra serviço de verdade (Redis, PostgreSQL) e guardas do banco      | sim                 |
| 5     | telas de ponta a ponta (chega com a T-020)                                   | sim                 |

Cada etapa do bloco 4 cobra **um** serviço. Misturar faria a prova do cache
reprovar por PostgreSQL fora do ar — falha por motivo alheio é ruído, não
informação.

---

## 3. Os dois ganchos

Configurados em `lefthook.yml`, instalados por `pnpm install` (o script
`prepare`). A divisão entre eles é de **custo**, não de rigor.

### Antes de registrar no histórico (`pre-commit`) — AC-040

Roda em segundos, sobre o que mudou:

| Comando            | O que faz                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| `formatacao`       | `prettier --write` nos arquivos preparados, e reprepara o que ajustou                                 |
| `qualidade`        | `eslint --max-warnings=0` nos arquivos preparados                                                     |
| `tipos`            | `turbo run typecheck` — o cache do Turborepo faz o recorte: pacote sem alteração sai em milissegundos |
| `segredos`         | busca por chave, senha e cadeia de conexão no que vai entrar                                          |
| `registro-de-pulo` | registra dívida de portão pulado, se houver (§5)                                                      |

Ele não pode ser caro. Gancho caro vira `LEFTHOOK=0` todo dia, e aí não existe
mais gancho.

### A mensagem (`commit-msg`)

`bash infra/scripts/check-mensagem.sh` confere só a primeira linha: 1 tarefa =
1 commit rastreável. Mensagem gerada pelo git (`Merge`, `Revert`, `fixup!`,
`squash!`) passa direto; qualquer outra precisa ter um destes formatos, com um
escopo opcional entre parênteses e um resumo de pelo menos cinco caracteres:

| Formato                                  | Quando                                                                                                                                                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `T-000 <feature>: resumo`                | trabalho de uma tarefa do `tasks.md` da feature — é o caso normal                                                                                                                                        |
| `chore`, `docs`, `infra`, `spec`: resumo | trabalho fora de tarefa: manutenção, documentação, infraestrutura, mudança de spec                                                                                                                       |
| `fix`, `feat`: resumo                    | correção ou funcionalidade fora de tarefa (dívida de `docs/pendencias.md`, por exemplo)                                                                                                                  |
| `test`: resumo                           | uma prova commitada **sozinha, antes da correção**: a falha reproduzida fica no histórico separada do conserto dela (a dívida 92 nasceu assim: `test(isolamento): ...` e depois `fix(autorizacao): ...`) |

O gancho não roda os testes, e é por isso que o commit `test` de uma prova
vermelha passa — o próximo commit é o que a deixa verde.

### Antes de enviar (`pre-push`) — AC-041

Uma linha só: `bash infra/scripts/verificar.sh`. O portão **inteiro**, e ele
bloqueia. A lista de etapas mora no script, e é lá que ela cresce — assim o
gancho nunca fica devendo uma etapa nova.

---

## 4. O que fazer quando cada etapa reprova

### `cliente tipado do banco`

O cliente do Prisma nasce do esquema declarado e não é versionado.

```bash
pnpm --filter @simpleclick/database run gerar
```

Se falhar, o problema está em `packages/database/prisma/schema.prisma`.

### `formatação`

```bash
pnpm prettier --write .
```

Reprovou de novo? Algum arquivo está sendo formatado por ferramenta diferente —
confira `.prettierignore`.

### `qualidade de código`

Leia a regra que o ESLint citou. **Não desligue a regra** para passar: as regras
de fronteira entre camadas (P-004, P-013) e a de cor fora do tema (AC-014) são
requisito, não estilo. `pnpm eslint . --fix` conserta o que é mecânico.

### `segredo no código`

Chave, senha ou cadeia de conexão escrita à mão em arquivo versionado (P-002). A
saída aponta arquivo e linha.

Tire o valor do código e leia de variável de ambiente validada na inicialização
(`apps/api/src/core/env.ts`). Se for falso positivo, **renomeie a variável** —
afrouxar a busca deixa a próxima credencial de verdade passar.

Se o segredo já entrou no histórico, ele precisa ser **rotacionado**: apagar a
linha não desfaz o vazamento.

### `auditoria da especificação`

Acusa **regressão** entre especificação, tarefas e testes: critério que tinha
prova e perdeu, tarefa marcada como concluída sem prova, teste órfão, referência
quebrada. Trabalho que ainda não foi feito é contado como pendência e não
reprova.

- `TASK_CONCLUIDA_SEM_PROVA` — a tarefa se declarou pronta e o critério dela não
  tem prova `pass`. Ou o teste não existe, ou **foi pulado** (AC-019: `skip`
  nunca é prova), ou o `verify` não rodou depois da última mudança.
- `TESTE_ORFAO` — um teste anota `@spec:AC-xxx` que não existe na especificação.
- `REF_QUEBRADA` — tarefa referenciando critério ou história inexistente.

O veredito completo, obrigatório para declarar uma feature pronta, é `make audit`
(AC-018). Ele exige prova para **todos** os critérios e reprova enquanto houver
trabalho pendente — por isso o portão usa a auditoria de regressão, e não ele:
um portão que nunca passa é um portão contornado todo dia.

### `verificação de tipos`

```bash
pnpm turbo run typecheck
```

Teste não exercita todo caminho tipado — foi por isso que esta etapa entrou
(a T-010 descobriu `packages/database` sem compilar havia dias).

### `contrato publicado em dia`

`contrato/openapi.json` é o que os aplicativos Kotlin e Swift leem para gerar o
cliente deles. A etapa regenera o documento a partir dos esquemas e reprova se o
arquivo versionado divergir, apontando o campo.

Ela **não conserta sozinha de propósito**: mudança de contrato se revisa, não se
publica em silêncio. Confira se a mudança é intencional e regenere:

```bash
pnpm --filter @simpleclick/api run contrato:gerar
```

### `testes de unidade` e `testes do site (estados e acessibilidade)`

```bash
pnpm vitest run --project unit
pnpm vitest run --project web
```

Para um arquivo só: `pnpm vitest run <caminho>`. **Nunca** conserte pulando o
teste — teste pulado não conta como prova, e a auditoria acusa.

### `testes do cache (Redis de teste)` e `testes de fila (Redis)`

Precisam do Redis no ar:

```bash
bash infra/scripts/up.sh
```

Cada arquivo isola as próprias chaves num espaço de nomes só dele, então rodar
isto não mexe no ambiente local nem em outra árvore de trabalho desta máquina.

### `testes de integração (banco efêmero)`

Precisam do PostgreSQL de teste (porta 5533) no ar. Cada arquivo recebe um banco
próprio, criado de um molde já migrado e apagado no fim (AC-003).

Erro de conexão: confira `DATABASE_URL_TEST` no `.env` e rode
`bash infra/scripts/up.sh`. Se sobrou banco de execução interrompida, a própria
varredura do apoio de teste apaga o que ficou para trás.

### `guardas estruturais do banco`

As dez guardas de isolamento, índice, imutabilidade e funções com direitos de
quem as definiu, contra um banco criado do
zero e migrado na hora.

```bash
bash infra/scripts/db-guards.sh
```

Reprovou quer dizer que uma tabela nova entrou sem Row Level Security, sem
índice de loja, ou que algo quebrou a imutabilidade de pedido (P-003, P-010).
Conserte na **migração**, nunca no banco à mão: guarda que passa só na sua
máquina não guarda nada.

---

## 5. Pular o portão (AC-043)

A saída existe. Situação excepcional existe.

```bash
LEFTHOOK=0 git push
```

Ela **funciona** — mas não passa em silêncio.

### Como o registro funciona

`LEFTHOOK=0` desliga o lefthook na primeira linha do gancho gerado por ele,
antes de qualquer configuração nossa ser lida. Nenhum comando do `lefthook.yml`
roda nesse envio, e nunca vai rodar: é assim que a saída de emergência funciona,
e mexer nisso transformaria a saída em armadilha.

Então o registro é **reconstruído**, e não emitido:

1. Toda execução limpa e completa do portão anota a versão aprovada em
   `.git/portao-verificados` (fato sobre esta máquina — por isso mora dentro do
   `.git` e não é versionado).
2. O gancho antes do **registro** compara o que já foi **enviado** com o que foi
   **aprovado**.
3. Versão enviada que não consta como aprovada só pode ter passado por fora do
   portão. Vira uma linha em `docs/pendencias.md`, com data, versão, ramo e a
   lista do que ficou sem verificação — e entra no commit, para a dívida ser
   visível para todo mundo, e não só para quem pulou.

O registro **não bloqueia o commit**: dívida que trava trabalho é dívida que
alguém apaga.

### Ponto de partida

O registro nasce vazio a cada clone: ele sabe o que **esta máquina** verificou, e
mais nada. Por isso `pnpm install` marca o ponto de partida
(`registrar-pulo.sh --iniciar`). Sem isso, o primeiro commit depois de um clone
acusaria como contornado todo o histórico que já estava no remoto — e dívida
falsa ensina a ignorar o arquivo de pendências.

### Quitar a dívida

Volte à versão, rode `bash infra/scripts/verificar.sh` até sair limpo, e apague
a linha de `docs/pendencias.md`.

---

## 6. Reprodutibilidade (AC-042)

A mesma versão do código verificada em dois momentos dá o mesmo resultado. O que
sustenta isso:

- **Versão de ferramenta fixada.** `package.json` declara versão exata (sem `^`
  nem `~`), `packageManager` fixa o pnpm, e o catálogo em `pnpm-workspace.yaml`
  garante uma versão por biblioteca no monorepo inteiro. O gancho aponta para o
  lefthook do `node_modules`, e não para um que a máquina tenha instalado.
- **Banco de teste criado do zero.** Cada arquivo de teste recebe um banco
  próprio, copiado de um molde migrado e apagado no fim, inclusive quando o
  teste falha (AC-003). O banco de desenvolvimento nunca é tocado.
- **Nenhum teste depende de dado deixado por execução anterior.** Cada arquivo
  monta o próprio cenário com os construtores de `packages/testing`; as filas e
  o cache isolam as chaves num espaço de nomes por arquivo.
- **Saída estável.** Sem terminal, o portão não emite cor — duas execuções
  capturadas são comparáveis caractere a caractere.

Para conferir na mão:

```bash
bash infra/scripts/verificar.sh > /tmp/portao-1.txt 2>&1
bash infra/scripts/verificar.sh > /tmp/portao-2.txt 2>&1
diff <(sed -E 's/\([0-9]+s\)/(NNs)/; s/tempo: [0-9]+m[0-9]+s/tempo: NNmNNs/' /tmp/portao-1.txt) \
     <(sed -E 's/\([0-9]+s\)/(NNs)/; s/tempo: [0-9]+m[0-9]+s/tempo: NNmNNs/' /tmp/portao-2.txt)
```

Tirando os tempos, a saída é idêntica.

### Quando não é

Teste instável é dívida do portão inteiro: ele ensina a desconfiar do vermelho,
e portão em que ninguém confia é portão que ninguém roda. As instabilidades
conhecidas hoje estão listadas em `docs/pendencias.md`, em "Instabilidade do
portão sob carga" — se a etapa que reprovou está lá, rode de novo antes de
investigar. Se não está, **não é flutuação: é um defeito**, e some quando o
defeito for consertado.

---

## 7. A prova do próprio portão

`infra/tests/portao.test.ts` executa o portão e os ganchos de verdade e olha o
efeito: repositórios git descartáveis com o `lefthook.yml` de verdade instalado,
commits e envios feitos como qualquer pessoa faria, e um projeto de
especificação de mentira onde dá para ter um critério sem teste sem sujar o
projeto de verdade.

Ele não confere que os arquivos existem — portão desligado também existe em
disco. Ele confere que o commit **não entrou**, que o remoto **não recebeu**, e
que a dívida **foi escrita**.
