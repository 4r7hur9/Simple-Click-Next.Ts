# De cenários Gherkin a testes com `[CA-n]`, prova de RED e detecção de teste enfraquecido

Referência aprofundada da skill `testes-qualidade`. Leia ao transformar critérios de aceite em testes, montar a matriz de rastreabilidade, registrar a prova de RED ou revisar um diff de testes em busca de enfraquecimento.

Exemplos com Vitest, Supertest e Git. Em outro stack, aplique o equivalente (o nome do teste carrega o ID; o commit de RED é a linha de base).

## 1. Formato dos critérios

A spec da task (produzida pela etapa de extração de specs) traz os critérios em Gherkin, em português, cada cenário com um ID estável `CA-n`. O ID pode vir como tag ou no título; trate os dois como equivalentes.

```gherkin
# language: pt
Funcionalidade: Registrar venda no PDV

  Contexto:
    Dado uma loja com um caixa aberto pela operadora "Ana"

  @CA-1
  Cenário: Venda com estoque suficiente baixa o estoque
    Dado o produto "Camiseta P" com estoque 3 e preço R$ 49,90
    Quando a operadora registra a venda de 2 unidades de "Camiseta P"
    Então a venda é criada com total R$ 99,80
    E o estoque de "Camiseta P" passa a ser 1
    E o caixa recebe um movimento de R$ 99,80

  @CA-2
  Cenário: Venda sem estoque é recusada
    Dado o produto "Camiseta P" com estoque 1
    Quando a operadora tenta registrar a venda de 2 unidades de "Camiseta P"
    Então a venda é recusada com o erro "estoque insuficiente"
    Mas o estoque de "Camiseta P" continua 1
    E nenhum movimento de caixa é criado

  @CA-3
  Esquema do Cenário: Desconto por papel
    Dado um carrinho de R$ <subtotal>
    Quando um usuário com papel "<papel>" aplica <desconto>% de desconto
    Então o resultado é "<resultado>"

    Exemplos:
      | subtotal | papel    | desconto | resultado     |
      | 100,00   | operador | 5        | total 95,00   |
      | 100,00   | operador | 15       | sem permissão |
      | 100,00   | gerente  | 15       | total 85,00   |
```

Se um critério chegar ambíguo, sem ID ou sem resultado verificável, não invente a regra: registre a dúvida conforme a política de autonomia do projeto e teste apenas o que está escrito.

## 2. Regras de mapeamento

| Gherkin | Teste |
|---|---|
| `Funcionalidade` | `describe` do arquivo (ou do use case/rota) |
| `Contexto` | `beforeEach` (ou factory chamada no início de cada teste) |
| `Cenário` `@CA-n` | pelo menos um `it('[CA-n] ...')` |
| `Esquema do Cenário` + `Exemplos` | `it.each` com uma linha por exemplo, todas com `[CA-n]` |
| `Dado` / `E` antes do `Quando` | arrange: factories, seed, sessão |
| `Quando` | act: uma única ação (chamada do use case, request, clique) |
| `Então` / `E` depois do `Quando` | assert: pelo menos um `expect` por linha |
| `Mas` | assert negativo (o que não pode acontecer) |
| Valores monetários "R$ 49,90" | centavos inteiros no teste (`4_990`) |

### Nível de cada cenário
| O cenário fala de... | Nível |
|---|---|
| cálculo, regra, validação, estado, sem depender de banco | unitário |
| persistência, estoque, transação, constraint, permissão, rota, concorrência | integração com Postgres real |
| o que o usuário vê/clica, navegação, fluxo ponta a ponta crítico | E2E Playwright |

Um cenário pode gerar testes em mais de um nível (ex.: regra no unitário + persistência na integração). Todos levam o mesmo `[CA-n]`.

### Casos que o Gherkin não escreve, mas o teste cobre
Para cada critério que envolve recurso de usuário, acrescente os testes de autorização (401, outro tenant 404, 403) com o mesmo `[CA-n]` e sufixo descritivo. Eles fazem parte da prova de que o critério foi atendido com segurança.

## 3. Nomeação

- Formato: `[CA-n] <comportamento esperado em linguagem de negócio>`.
- O ID vem no início, entre colchetes, exatamente como na spec: `[CA-2]`, nunca `CA2`, `[ca-2]` ou `(CA-2)`.
- Vários testes do mesmo critério repetem o ID: `[CA-1] cria a venda com total...`, `[CA-1] baixa o estoque...`.
- Teste que prova dois critérios: `[CA-1][CA-4] ...`. Use com moderação; prefira um teste por critério.
- Testes que não correspondem a critério (regressão, borda técnica) ficam sem ID.

Rodar só um critério no Vitest: `-t` recebe regex, então escape os colchetes para `CA-1` não casar com `CA-12`.
```bash
npx vitest run -t "\[CA-1\]"
```
Use o comando de teste definido em `.workflow-ia/config.json` e acrescente o filtro.

## 4. Exemplo completo

```ts
// src/modules/vendas/application/registrar-venda.int.test.ts
import { beforeEach, describe, expect, it } from 'vitest';

describe('Registrar venda no PDV', () => {
  let ctx: ContextoAuth;
  let caixaId: string;

  beforeEach(async () => {
    // Contexto: uma loja com um caixa aberto pela operadora "Ana"
    const loja = await criarLojaComOperadora({ nome: 'Ana', papel: 'operador' });
    ctx = loja.ctx;
    caixaId = (await abrirCaixa(ctx)).id;
  });

  it('[CA-1] cria a venda com o total calculado pelo servidor', async () => {
    const produto = await criarProduto(ctx, { nome: 'Camiseta P', estoque: 3, precoCentavos: 4_990 });

    const venda = await registrarVendaUseCase(ctx, { caixaId, itens: [{ produtoId: produto.id, quantidade: 2 }] });

    expect(venda.totalCentavos).toBe(9_980);
  });

  it('[CA-1] baixa o estoque e lança o movimento de caixa', async () => {
    const produto = await criarProduto(ctx, { estoque: 3, precoCentavos: 4_990 });

    await registrarVendaUseCase(ctx, { caixaId, itens: [{ produtoId: produto.id, quantidade: 2 }] });

    expect(await estoqueDe(produto.id)).toBe(1);
    expect(await movimentosDoCaixa(caixaId)).toEqual([expect.objectContaining({ valorCentavos: 9_980 })]);
  });

  it('[CA-2] recusa a venda sem estoque e não altera nada', async () => {
    const produto = await criarProduto(ctx, { estoque: 1, precoCentavos: 4_990 });

    await expect(
      registrarVendaUseCase(ctx, { caixaId, itens: [{ produtoId: produto.id, quantidade: 2 }] }),
    ).rejects.toBeInstanceOf(EstoqueInsuficienteError);

    expect(await estoqueDe(produto.id)).toBe(1);
    expect(await movimentosDoCaixa(caixaId)).toEqual([]);
  });

  it('[CA-2] duas vendas simultâneas da última unidade: só uma é aceita', async () => {
    const produto = await criarProduto(ctx, { estoque: 1, precoCentavos: 4_990 });
    const entrada = { caixaId, itens: [{ produtoId: produto.id, quantidade: 1 }] };

    const resultados = await Promise.allSettled([
      registrarVendaUseCase(ctx, entrada),
      registrarVendaUseCase(ctx, entrada),
    ]);

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await estoqueDe(produto.id)).toBe(0);
  });
});
```

Observe: `expect.objectContaining` aparece dentro de `toEqual([...])`, que ainda exige exatamente um movimento. Isso é aceitável; o que não é aceitável é trocar um `toEqual` exato por `objectContaining` para o teste passar.

### Esquema do Cenário com `it.each`
```ts
describe('Desconto por papel', () => {
  it.each([
    { papel: 'operador', desconto: 5, esperado: { ok: true, totalCentavos: 9_500 } },
    { papel: 'operador', desconto: 15, esperado: { ok: false, erro: 'sem-permissao' } },
    { papel: 'gerente', desconto: 15, esperado: { ok: true, totalCentavos: 8_500 } },
  ] as const)('[CA-3] $papel aplicando $desconto%', ({ papel, desconto, esperado }) => {
    const resultado = aplicarDesconto({ subtotalCentavos: 10_000, papel, percentual: desconto });
    expect(resultado).toEqual(esperado);
  });
});
```
Cada linha de `Exemplos` vira uma linha do `each`. Não resuma a tabela em menos linhas.

## 5. Matriz de rastreabilidade

Todo critério aparece na matriz; ela vai para o pacote de provas.

| CA | Cenário | Nível | Arquivo | Testes | RED (motivo da falha) | GREEN |
|---|---|---|---|---|---|---|
| CA-1 | Venda com estoque suficiente | integração | `registrar-venda.int.test.ts` | 2 | `expected 9980, received undefined` | ok |
| CA-2 | Venda sem estoque é recusada | integração | `registrar-venda.int.test.ts` | 2 | `expected EstoqueInsuficienteError, received Error: não implementado` | ok |
| CA-3 | Desconto por papel | unitário | `desconto.test.ts` | 3 | `expected { ok: false ... }, received { ok: true ... }` | ok |

### Conferir cobertura de IDs
```bash
SPEC=<caminho da spec da task>
comm -23 \
  <(grep -oE 'CA-[0-9]+' "$SPEC" | sort -u) \
  <(grep -rhoE '\[CA-[0-9]+\]' --include='*.test.ts' --include='*.spec.ts' --exclude-dir=node_modules . | tr -d '[]' | sort -u)
```
Qualquer linha na saída é um critério sem teste (finding `alto`).

## 6. Prova de RED

### Procedimento
1. Escreva os testes a partir dos critérios, antes da implementação.
2. Crie apenas o esqueleto necessário para compilar: tipos, assinatura do use case, rota registrada, lançando `new Error('não implementado')` ou retornando valor neutro. Assim a falha acontece no assert, não no import.
3. Rode só os testes novos (filtro por arquivo ou `-t`).
4. Confirme que **cada** teste novo falhou e que o motivo é o esperado.
5. Faça um commit só com testes e esqueleto: `test(<ID>): cenários CA-1..CA-3 (RED)`. O SHA desse commit é a linha de base para detectar enfraquecimento.
6. Registre a saída (resumo por teste) no pacote de provas.

### Motivos de falha válidos e inválidos
| Válido (RED de verdade) | Inválido (refazer) |
|---|---|
| assert com valor diferente (`expected 9980, received undefined`) | módulo não encontrado, erro de sintaxe, erro de TypeScript |
| erro de tipo diferente do esperado | container/banco não subiu, variável de ambiente ausente |
| status HTTP diferente (`expected 404, received 200`) | timeout por infraestrutura |
| elemento não encontrado na tela no E2E, porque a funcionalidade não existe | seletor errado para um elemento que já existe |

### Teste novo que passa no RED
Significa uma de duas coisas:
- **O comportamento já existe.** Confirme lendo o código; registre na matriz como "já atendido antes da task" com a evidência. O teste fica como proteção de regressão.
- **O teste é fraco.** Não prova o critério. Reescreva até falhar pelo motivo certo.

Nunca siga para a implementação com teste novo verde sem uma dessas duas conclusões registradas.

## 7. GREEN sem mexer no que o teste exige

- A implementação faz os testes do commit RED passarem **sem alterá-los**.
- Mudança em arquivo de teste depois do RED só é legítima quando:
  - o teste contradizia o critério escrito (cite o `[CA-n]` e o trecho da spec);
  - havia erro no arrange que não muda o comportamento verificado (ex.: factory sem campo obrigatório);
  - refatoração de estrutura/nome mantendo asserts iguais ou mais fortes.
- Toda mudança legítima é explicada no relatório da task. Qualquer outra é enfraquecimento.

## 8. Detectar teste enfraquecido

### Sinais no diff
| Sinal (linhas adicionadas ou alteradas em teste) | Por que é suspeito |
|---|---|
| linha com `expect(` removida | menos verificação |
| literal do valor esperado alterado (`toBe(8_991)` → `toBe(8_990)`) | esperado ajustado ao obtido |
| `toEqual`/`toStrictEqual` → `toMatchObject`/`objectContaining` | ignora campos que antes eram verificados |
| matcher exato → `toBeDefined`, `toBeTruthy`, `toBeGreaterThan(0)`, `not.toThrow` | aceita quase qualquer resultado |
| `rejects.toBeInstanceOf(X)`/`toThrow(X)` → `rejects.toThrow()` | aceita qualquer erro |
| status exato → faixa (`expect(res.status).toBeLessThan(500)`) | aceita 200 onde deveria ser 404 |
| `.skip`, `.only`, `.todo`, `xit`, `xdescribe`, `test.fixme` | teste desligado |
| teste (`it(`/`test(`) removido | critério pode ter ficado sem prova |
| `vi.mock`/`vi.spyOn(...).mockReturnValue` no módulo que implementa o critério | testa o mock |
| `try { ... } catch {}` ou `if (...) expect(...)` | assert pode não rodar |
| `expect.assertions(n)` removido ou com `n` menor | asserts em callbacks deixam de ser exigidos |
| arrange alterado para fugir da borda (estoque 1 → 100, dois requests → um) | o cenário deixa de ser o do critério |
| `timeout`, `retries`, `waitForTimeout` aumentados | intermitência escondida |
| `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, `as any` | gate contornado |
| snapshot atualizado (`-u`) com mudança grande | aceitação cega do novo resultado |

### Procedimento de verificação
```bash
RED=<sha do commit RED>
BASE=<branch base, ex.: origin/main>
TESTES=(-- '*.test.ts' '*.spec.ts' '*.test.tsx' 'e2e/**')

# 1. testes alterados desde o RED (o esperado é: nenhum ou poucos, justificados)
git diff --stat "$RED"..HEAD "${TESTES[@]}"

# 2. asserts removidos ou alterados desde o RED
git diff -U0 "$RED"..HEAD "${TESTES[@]}" | grep -E '^-.*(expect\(|\.to[A-Z]|rejects|resolves)'

# 3. padrões suspeitos adicionados desde a base (pega também testes antigos enfraquecidos)
git diff -U0 "$BASE"...HEAD "${TESTES[@]}" | grep -nE '^\+.*(\.(only|skip|todo)\(|\bx(it|describe)\(|test\.fixme|toBeDefined\(\)|toBeTruthy\(\)|toBeGreaterThan\(0\)|expect\.anything\(\)|@ts-(ignore|expect-error)|eslint-disable|as any|waitForTimeout|retries)'

# 4. contagem de expects por arquivo, antes e depois do RED
for f in $(git diff --name-only --diff-filter=M "$RED" HEAD "${TESTES[@]}"); do
  echo "$f: $(git show "$RED:$f" | grep -c 'expect(') -> $(grep -c 'expect(' "$f")"
done

# 5. testes existentes apagados em relação à base
git diff --name-only --diff-filter=D "$BASE"...HEAD "${TESTES[@]}"
```

### Verificação forte: testes do RED contra a implementação final
Os testes como estavam no commit RED precisam passar com o código final. Se não passam, alguém mudou o que o teste exigia.
```bash
git worktree add ../verificacao-red HEAD
cd ../verificacao-red
git checkout "$RED" -- $(git diff --name-only --diff-filter=M "$RED" HEAD "${TESTES[@]}")
# instale as dependências e rode o comando de teste de .workflow-ia/config.json
cd - && git worktree remove --force ../verificacao-red
```

### Mutation testing (módulos críticos)
- Stryker (`@stryker-mutator/core` com o runner do Vitest/Jest) altera o código (troca `>=` por `>`, remove linhas) e verifica se algum teste falha.
- Mutante sobrevivente em regra coberta por `[CA-n]` indica teste fraco.
- Rode apenas nos arquivos alterados da task (`--mutate`), porque é lento.

### Classificação dos achados
| Situação | Severidade |
|---|---|
| Assert do critério removido/afrouxado ou esperado trocado pelo obtido, sem justificativa | `urgente` |
| `.only` commitado ou teste do RED falhando contra a implementação final | `urgente` |
| `.skip`/remoção de teste existente (a CLI bloqueia qualquer skip novo depois do RED) | `alto` |
| Arrange alterado para evitar a borda do cenário | `alto` |
| Mudança legítima de teste sem explicação no relatório | `medio` |
