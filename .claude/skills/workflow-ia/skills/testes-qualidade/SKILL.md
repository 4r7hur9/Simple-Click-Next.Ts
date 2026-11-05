---
name: testes-qualidade
description: Estratégia e qualidade de testes automatizados. Cobre pirâmide (unitário, integração com Postgres real via Testcontainers, E2E Playwright em fluxos críticos), TDD, critérios Gherkin convertidos em testes com IDs [CA-n], RED/GREEN comprovado, testes de autorização entre tenants e de concorrência, detecção de teste enfraquecido e gate de typecheck, lint, cobertura e segurança no CI (SAST, SCA, secrets, DAST). Use quando o diff criar ou alterar .test.ts, .spec.ts, e2e/, fixtures, factories, config de Vitest/Jest/Playwright ou CI, ou para provar critério de aceite. Não use para definir regras de segurança (use backend-seguranca) nem teste de carga (use backend-performance).
---

# Testes e qualidade

Regras para que os testes provem que cada critério de aceite foi atendido e continuem provando depois. O `test-writer` escreve os testes (fase RED) a partir dos critérios; o `implementer` e o `fixer` fazem passar (GREEN) sem tocar no que o teste exige; o `test-reviewer` e o `quality-reviewer` usam o "Checklist de revisão" para gerar findings com a severidade padrão.

Exemplos com Vitest, Testcontainers, Supertest e Playwright. Em outro stack (Jest, pytest, JUnit), aplique o equivalente. Os comandos reais de teste, lint e typecheck do projeto estão em `.workflow-ia/config.json` (campo `comandos`): leia esse arquivo antes de executar qualquer coisa e não invente comandos.

## Regras inegociáveis

1. **Todo critério de aceite `[CA-n]` tem pelo menos um teste cujo nome contém o ID.** Critério sem teste não tem prova; nome sem ID quebra a rastreabilidade do pacote de provas. Os IDs são por task: a rastreabilidade (`wf matriz`) só conta tags em linhas de teste adicionadas ou alteradas no branch da task, então tags iguais de tasks antigas não contam. Escreva testes novos para os critérios da task; não reaproveite testes antigos.
2. **Teste novo falha antes da implementação (RED), pelo motivo certo, e a falha é registrada.** Teste que nunca falhou pode não testar nada.
3. **Nunca enfraquecer um teste para ele passar.** Remover assert, trocar o esperado pelo obtido, `skip`, afrouxar matcher ou mockar a unidade testada falsifica a prova; se o teste está errado, o ajuste é justificado explicitamente contra o critério.
4. **Nada de `.only`, `.skip`, `skipIf`, `{ skip: true }` ou `it.todo` depois do RED.** A CLI trata qualquer skip novo como teste enfraquecido e a verificação reprova. `.only` desliga silenciosamente o resto da suíte. Tag `[CA-n]` só vale no nome do teste, nunca em comentário.
5. **Todo teste tem assert específico sobre o comportamento: valor exato, estado final do banco, erro com tipo/código.** `toBeDefined()` e "não lançou" sozinhos não provam o critério.
6. **Toda promessa em teste é aguardada, inclusive `expect(...).rejects`/`.resolves`.** Promessa solta faz o teste passar antes de o assert rodar.
7. **Regra de negócio tem teste unitário; o que depende de SQL, transação, constraint ou lock é testado contra Postgres real (Testcontainers).** Mock do Prisma não prova query, constraint nem concorrência.
8. **Toda rota, Route Handler ou Server Action protegida tem teste de autorização: sem sessão → 401, outro tenant → 404, papel sem permissão → 403.** IDOR não aparece em teste de caminho feliz.
9. **Operação concorrente (estoque, saldo, idempotência, cupom) tem teste que dispara requisições simultâneas.** Race condition só aparece sob concorrência.
10. **Testes são determinísticos e independentes: sem hora real, aleatório sem semente, rede externa ou ordem de execução.** Teste intermitente destrói a confiança no gate.
11. **Mocks só nas fronteiras externas (gateway, e-mail, relógio, fornecedor), nunca na unidade sob teste.** Mockar o que se testa produz teste que passa com qualquer implementação.
12. **Typecheck strict, lint e testes são gate; não desligue regra, não use `@ts-ignore`/`eslint-disable` para passar, não remova etapa do CI.** Gate burlado é gate quebrado.
13. **E2E Playwright só nos fluxos críticos, com seletores por papel/rótulo e espera por estado, nunca `waitForTimeout`.** E2E demais e frágil vira ruído e lentidão.
14. **Dados de teste são sintéticos; nada de dados reais de clientes ou segredos reais em fixture.** Fixture é versionada e circula.

## Como construir

### Pirâmide
- **Unitário** (maioria): cálculo de preço/margem/troco, validações, máquina de estados, mapeamento de erros. Rápido, sem I/O.
- **Integração** (camada do meio): use case + Prisma + Postgres real; rotas com Supertest ou chamando o handler; autorização; concorrência; constraints.
- **E2E** (poucos): login, venda no PDV, pagamento, fluxo principal da task quando o critério é de UI.
- TDD onde a regra é densa (cálculo, estados, permissões): escreva o teste do próximo caso, veja falhar, implemente o mínimo.

### Do critério ao teste
- Cada `Cenário` Gherkin vira pelo menos um `it`, com `[CA-n]` no início do nome.
- `Esquema do Cenário` com `Exemplos` vira `it.each`, uma linha por exemplo.
- `Dado` → arrange, `Quando` → act, `Então` → assert. Cada `Então`/`E` vira pelo menos um `expect`.
- Detalhes, formato da matriz de rastreabilidade e prova de RED em [references/gherkin-para-testes.md](references/gherkin-para-testes.md).

### Asserts que provam
- Resultado exato (`toEqual` com o objeto esperado, `toBe` com o número em centavos).
- Estado do banco após a operação (estoque final, linhas criadas, nada alterado no tenant B).
- Erro esperado por tipo ou código (`rejects.toBeInstanceOf(EstoqueInsuficienteError)`, status 409 e `type` do Problem Details).
- Efeitos colaterais nas fronteiras (`toHaveBeenCalledWith` com argumentos, não só `toHaveBeenCalled`).
- Caso negativo junto do positivo: o que não deve acontecer também é critério.

### Dados e isolamento
- Factories (`criarProduto({ estoque: 1 })`) com valores padrão válidos e sobrescrita do que importa no teste.
- Cada teste cria seus dados; isolamento por tenant novo por teste ou limpeza entre testes.
- Relógio controlado: `vi.useFakeTimers()` + `vi.setSystemTime()` ou relógio injetado no use case.
- Aleatoriedade com semente ou valores fixos.

### Integração, autorização, concorrência e E2E
- Testcontainers com a mesma versão maior do Postgres de produção e `prisma migrate deploy` no setup.
- Matriz de autorização por rota nova/alterada.
- Concorrência com `Promise.allSettled` e verificação do estado final.
- Playwright com `getByRole`/`getByLabel`, `storageState` para login, dados semeados pela API/banco.
- Detalhes e código em [references/integracao-e2e-ci.md](references/integracao-e2e-ci.md).

### Gate e CI
- Ordem sugerida: install com lockfile → typecheck → lint → unit → integração → E2E crítico → SAST/SCA/secret scan.
- Cobertura é indicador: não pode cair nos módulos alterados, mas 100% sem asserts não vale nada.
- Mutation testing (Stryker) é o jeito objetivo de medir força dos testes em módulos críticos.

## Checklist de revisão

Valores exatos para o campo severidade dos findings: `urgente`, `alto`, `medio`, `baixo`.

| # | Verificação | Severidade padrão |
|---|---|---|
| 1 | Algum teste falhando, ou typecheck/lint com erro | urgente |
| 2 | Assert removido, valor esperado trocado pelo obtido ou matcher afrouxado sem justificativa ligada ao critério | alto |
| 3 | `.only` commitado, ou etapa de gate removida/desativada no CI | urgente |
| 4 | Teste que cobre `[CA-n]` passa sem que o comportamento do critério exista (teste vazio, sem assert, assert tautológico) | urgente |
| 5 | Critério de aceite sem nenhum teste com o ID `[CA-n]` | alto |
| 6 | Sem evidência de RED para teste novo que cobre critério | alto |
| 7 | `.skip`/`it.todo` novo ou teste existente apagado sem justificativa | alto |
| 8 | Promessa não aguardada no teste (`expect(p).rejects` sem `await`, `forEach` async) | alto |
| 9 | Rota/Server Action protegida sem teste de 401, outro tenant e 403 | alto |
| 10 | Operação concorrente (estoque, idempotência, cupom) sem teste de concorrência | alto |
| 11 | `try/catch` no teste que engole a falha do assert | alto |
| 12 | Mock da própria unidade sob teste ou do módulo que implementa o critério | alto |
| 13 | `@ts-ignore`, `@ts-expect-error`, `eslint-disable` ou `any` adicionados para passar o gate | alto |
| 14 | Fixture com dado real de cliente, credencial ou token real | alto |
| 15 | Mock do Prisma em teste que deveria provar query, constraint ou transação | medio |
| 16 | Assert fraco como única verificação (`toBeDefined`, `toBeTruthy`, `toHaveBeenCalled` sem argumentos) | medio |
| 17 | RED registrado por motivo errado (erro de import/sintaxe em vez de assert) | medio |
| 18 | Teste depende de hora real, aleatório sem semente ou rede externa | medio |
| 19 | Teste depende da ordem de execução ou de estado deixado por outro | medio |
| 20 | Timeout, `retries` ou `waitForTimeout` aumentados para esconder intermitência | medio |
| 21 | Snapshot grande criado/atualizado sem revisão do conteúdo | medio |
| 22 | Teste que cobre critério sem `[CA-n]` no nome | medio |
| 23 | Cobertura caiu nos módulos alterados | medio |
| 24 | E2E para regra que caberia em teste unitário/integração | baixo |
| 25 | Seletores E2E por classe CSS/XPath em vez de papel/rótulo | baixo |
| 26 | Setup duplicado entre arquivos em vez de factory/helper | baixo |
| 27 | Nome de teste que não descreve comportamento ("funciona", "teste 1") | baixo |

## Anti-padrões (errado → certo)

### Enfraquecer para passar
```ts
// [CA-2] 10% de desconto sobre 9.990 centavos = 8.991. A implementação devolve 8.990.
expect(calcularTotal(carrinho)).toBe(8_991);

// errado: ajustar o teste ao que o código produz
expect(calcularTotal(carrinho)).toBe(8_990);
expect(calcularTotal(carrinho)).toBeGreaterThan(0);

// certo: manter o assert e corrigir o cálculo na implementação.
// Só se o valor esperado contrariar o critério escrito, corrija o teste, citando o [CA-n] no commit/relatório.
expect(calcularTotal(carrinho)).toBe(8_991);
```

### Promessa não aguardada
```ts
// errado: o teste termina antes da rejeição; passa sempre
it('[CA-3] recusa venda sem estoque', () => {
  expect(registrarVenda(ctx, entrada)).rejects.toThrow();
});

// certo
it('[CA-3] recusa venda sem estoque', async () => {
  await expect(registrarVenda(ctx, entrada)).rejects.toBeInstanceOf(EstoqueInsuficienteError);
  expect(await estoqueDe(produtoId)).toBe(0);
});
```

### Mock da unidade sob teste
```ts
// errado: o teste prova que o mock retorna o que o mock retorna
vi.spyOn(precos, 'calcularDesconto').mockReturnValue(1_000);
expect(precos.calcularDesconto(pedido)).toBe(1_000);

// certo: mock só na fronteira; a regra roda de verdade
const gateway = { cobrar: vi.fn().mockResolvedValue({ status: 'aprovado', id: 'pg_1' }) };
const venda = await finalizarVenda({ gateway, prisma }, ctx, entrada);
expect(venda.status).toBe('paga');
expect(gateway.cobrar).toHaveBeenCalledWith(expect.objectContaining({ valorCentavos: 8_991 }));
```

### Caminho feliz sem autorização
```ts
// insuficiente sozinho
it('[CA-1] retorna a venda', async () => {
  await request(app).get(`/v1/vendas/${vendaA.id}`).set(auth(usuarioA)).expect(200);
});

// obrigatório junto
it('[CA-1] não expõe venda de outro tenant', async () => {
  await request(app).get(`/v1/vendas/${vendaA.id}`).set(auth(usuarioB)).expect(404);
});
```

### Espera fixa no E2E
```ts
// errado
await page.click('.btn-primary');
await page.waitForTimeout(3000);

// certo
await page.getByRole('button', { name: 'Finalizar venda' }).click();
await expect(page.getByRole('status')).toHaveText('Venda concluída');
```

## Referências

- [references/gherkin-para-testes.md](references/gherkin-para-testes.md) — leia ao transformar critérios Gherkin em testes, montar a matriz de rastreabilidade `[CA-n]`, registrar a prova de RED ou revisar um diff de teste em busca de enfraquecimento.
- [references/integracao-e2e-ci.md](references/integracao-e2e-ci.md) — leia ao configurar Testcontainers, escrever testes de integração, autorização entre tenants ou concorrência, testes Playwright, ou ao alterar o pipeline de CI e as ferramentas de segurança.
