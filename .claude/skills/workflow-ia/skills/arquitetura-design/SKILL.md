---
name: arquitetura-design
description: "Arquitetura e design: camadas rota, caso de uso e repository, fronteiras de módulo num monólito modular, direção das dependências, contratos Zod nas fronteiras, erros de domínio versus técnicos, dinheiro sem float, datas em UTC, multi-tenancy com tenant_id, config validada no boot, KISS/YAGNI/SOLID/DRY e ADRs. Use quando a task cria módulo, caso de uso, service, repository ou entidade, mexe em regra de negócio, valores monetários, datas ou isolamento por tenant, ou quando o diff põe lógica em componente React, handler ou Server Action. Não use para convenções de Git, pastas e naming (use stack-e-convencoes), formato de endpoints (use api-design-integracoes) nem schema e migrations (use banco-modelagem)."
---

# Arquitetura e design

Mantém a regra de negócio isolada, testável e correta: camadas com responsabilidades claras, dependências apontando para o domínio e decisões estruturais registradas.
`implementer` e `fixer` usam as regras para decidir onde cada código mora. `quality-reviewer` e `security-reviewer` usam o checklist para gerar findings de design. Exemplos em Next.js + Prisma + Zod; em outro stack, aplique o equivalente.

## Regras inegociáveis

1. **Regra de negócio mora no domínio ou no caso de uso, nunca em componente React, route handler, Server Action ou repository.** Regra espalhada diverge entre telas e não tem teste unitário.
2. **Dependências apontam para o domínio: `domain` não importa Prisma, Next, SDKs nem `process.env`.** Domínio acoplado à infra não é testável sem banco e quebra a cada troca de fornecedor.
3. **Toda fronteira tem contrato explícito validado (Zod): entrada de rota, action, webhook, fila, resposta de fornecedor e env.** Dado não validado vira estado inválido dentro do sistema.
4. **Dinheiro nunca em `float`/`number` com casas decimais: centavos inteiros ou `Decimal`.** `0.1 + 0.2 !== 0.3` vira diferença de caixa e disputa com cliente.
5. **Instantes em UTC (`timestamptz`); conversão para fuso só na borda de exibição ou em regra que depende do fuso do tenant.** Horário local gravado quebra relatórios, filtros de "hoje" e horário de verão.
6. **Multi-tenancy obrigatório em todo caso de uso e query: `tenantId` vem da sessão autenticada, nunca do body, query ou params.** `tenantId` do cliente é vazamento entre lojas (IDOR entre tenants).
7. **Nunca engolir exceção: todo `catch` trata, converte com `cause` ou relança.** Erro engolido vira dado corrompido silencioso e incidente sem rastro.
8. **Erros de domínio são tipados e distintos de erros técnicos.** Sem essa distinção, a borda devolve 500 para regra violada ou 422 para banco fora do ar.
9. **Operação que altera vários agregados de forma atômica é um único caso de uso dentro de uma transação.** Venda sem transação deixa estoque baixado e venda inexistente.
10. **Config por variáveis de ambiente, validada no boot, acessada por um único módulo.** Config ausente deve derrubar o deploy, não a primeira venda do dia.
11. **Módulos se comunicam pela API pública (`index.ts`), nunca importando internals nem escrevendo na tabela do outro módulo.** Acoplamento oculto impede evoluir um módulo sem quebrar outro.
12. **KISS e YAGNI: monólito modular antes de microsserviços; nenhuma abstração sem segundo uso concreto.** Complexidade especulativa custa manutenção e esconde bugs.
13. **Sem god objects: service ou arquivo com várias responsabilidades de negócio deve ser dividido.** Classes gigantes concentram conflitos e regressões.
14. **Decisão estrutural (novo módulo, padrão de persistência, fornecedor, estratégia de tenancy, cache, fila) gera ADR curto.** Sem registro, a decisão é refeita ou desfeita por quem não conhece o contexto.

## Como construir

### Camadas
- **Borda** (`app/`: page, route handler, Server Action, consumer de fila): autentica, extrai contexto (usuário, `tenantId`), valida entrada com Zod, chama um caso de uso, mapeia resultado e erro para a resposta. Sem `if` de negócio.
- **Caso de uso** (`application/`): orquestra uma intenção do usuário (`registrarVenda`). Carrega agregados pelo repository, aplica regras do domínio, persiste, abre transação quando há mais de uma escrita.
- **Domínio** (`domain/`): funções e tipos puros com as regras (cálculo de total, limite de desconto, transição de estado). Sem I/O.
- **Infra** (`infra/`): repositories Prisma e adapters de fornecedores. Traduz entre modelo de banco/fornecedor e modelo de domínio. Sem regra de negócio.
- Injeção de dependência simples: passe dependências por parâmetro ou fábrica. Container de DI só se o projeto já usa.
- Detalhes, exemplos completos e fronteiras de módulo: [references/camadas-e-modulos.md](references/camadas-e-modulos.md).

### Contratos e erros
- Schema Zod por fronteira; tipo com `z.infer`. O mesmo schema pode ser compartilhado com o front para validação dupla.
- Resposta nunca expõe o model Prisma diretamente: mapeie para um DTO de saída.
- Hierarquia: `ErroDominio` (base, com `codigo` estável) e subclasses (`EstoqueInsuficienteError`, `RecursoNaoEncontradoError`, `TransicaoInvalidaError`). Erros técnicos (rede, banco) propagam e são tratados no handler central.
- Detalhes: [references/erros-e-contratos.md](references/erros-e-contratos.md).

### Dinheiro, datas e tenancy
- Dinheiro: inteiro em centavos no domínio (`number` inteiro seguro até 2^53) ou `Prisma.Decimal`; nunca misture os dois no mesmo módulo.
- Arredondamento definido em um único lugar; rateio de desconto distribui os centavos restantes.
- Formate moeda só na UI: `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.
- Datas: `DateTime @db.Timestamptz(6)` para instantes; `@db.Date` para datas de calendário (vencimento, aniversário).
- "Hoje" e "mês" de relatório usam o fuso do tenant (ex.: `America/Fortaleza`), convertido para limites UTC na consulta.
- Tenancy: escolha e registre em ADR (coluna `tenantId` + filtro obrigatório, com RLS como segunda linha). Todo repository recebe `tenantId` e o aplica em toda query, inclusive `update` e `delete`.
- Detalhes: [references/dinheiro-datas-tenancy.md](references/dinheiro-datas-tenancy.md).

### Princípios com bom senso
- **SOLID**: responsabilidade única e inversão de dependência são as mais úteis aqui (portas em `application`, implementação em `infra`). Não crie interface para tudo.
- **DRY com regra de três**: duplicou duas vezes, tolere; na terceira, extraia. Duplicação de regra de negócio (ex.: cálculo de total em dois lugares) se extrai já na segunda.
- **Estado explícito**: entidades com ciclo de vida (venda, pedido, caixa) têm estados nomeados e transições permitidas definidas no domínio.
- **Consistência eventual só declarada**: se um efeito acontece depois (fila, webhook), o estado intermediário aparece no modelo (`PENDENTE`).

### ADR
- Arquivo em `docs/adr/NNNN-titulo.md` (ou onde o projeto já guarda).
- Contexto, decisão, alternativas consideradas, consequências. Uma página.
- Modelo em [references/camadas-e-modulos.md](references/camadas-e-modulos.md#modelo-de-adr).

## Checklist de revisão

| # | Verificação | Severidade padrão |
|---|---|---|
| 1 | `tenantId` lido de body, query, params ou header controlado pelo cliente | `urgente` |
| 2 | Query de repository sem filtro por `tenantId` (incluindo `update`, `delete`, `count`) | `urgente` |
| 3 | Valor monetário calculado ou armazenado em `float`/`number` fracionário | `urgente` |
| 4 | Operação com múltiplas escritas relacionadas (venda + estoque + caixa) fora de transação | `urgente` |
| 5 | `catch` vazio, ou que só loga e segue como se tivesse dado certo | `alto` |
| 6 | Regra de negócio em componente React, route handler, Server Action ou repository | `alto` |
| 7 | Entrada de fronteira (rota, action, webhook, fila) sem validação por schema | `alto` |
| 8 | Instante gravado sem fuso (`timestamp` sem tz) ou construído com hora local do servidor | `alto` |
| 9 | Resposta devolve o model do banco inteiro em vez de DTO | `alto` |
| 10 | Erro de regra de negócio lançado como `Error` genérico (vira 500) | `medio` |
| 11 | `domain/` importa Prisma, Next, SDK ou `process.env` | `medio` |
| 12 | Módulo importa `infra/` ou `domain/` interno de outro módulo, ou escreve em tabela alheia | `medio` |
| 13 | `process.env` lido fora do módulo de config ou config sem validação no boot | `medio` |
| 14 | Mesma regra de negócio implementada em dois lugares | `medio` |
| 15 | Arredondamento monetário feito em pontos diferentes ou sem regra explícita | `medio` |
| 16 | Filtro de "hoje"/"mês" calculado em UTC puro para tenant em outro fuso | `medio` |
| 17 | Estados de entidade como strings soltas, sem transições validadas | `medio` |
| 18 | Service ou arquivo com múltiplas responsabilidades de negócio (god object) | `medio` |
| 19 | Decisão estrutural nova sem ADR | `medio` |
| 20 | Erro convertido sem preservar `cause` | `baixo` |
| 21 | Abstração especulativa sem segundo uso (repository genérico, factory, interface única) | `baixo` |
| 22 | Microsserviço, fila ou event bus introduzido sem necessidade descrita na spec | `medio` |
| 23 | Tipos duplicados à mão em vez de `z.infer` do schema | `baixo` |
| 24 | Nome de caso de uso ou entidade que não reflete a linguagem do negócio | `baixo` |

## Anti-padrões (errado → certo)

**Regra de negócio na Server Action**
```ts
// errado: app/(loja)/vendas/actions.ts
'use server';
export async function finalizarVenda(form: FormData) {
  const itens = JSON.parse(String(form.get('itens')));
  let total = 0;
  for (const i of itens) total += i.preco * i.qtd; // preço vindo do cliente, float, sem tenant
  await prisma.venda.create({ data: { total, itens: { create: itens } } });
}

// certo: action fina, regra no caso de uso
'use server';
export async function finalizarVenda(input: unknown) {
  const sessao = await exigirSessao();                        // autentica
  const dados = finalizarVendaSchema.parse(input);            // valida
  return registrarVenda({ tenantId: sessao.tenantId, operadorId: sessao.userId, ...dados });
}
```

**Dinheiro em float**
```ts
// errado
const total = itens.reduce((s, i) => s + i.preco * i.quantidade, 0); // 19.9 * 3 = 59.699999...

// certo: centavos inteiros
const totalCentavos = itens.reduce((s, i) => s + i.precoCentavos * i.quantidade, 0);
```

**Tenant vindo do cliente**
```ts
// errado
const { tenantId, produtoId } = await req.json();
await prisma.produto.findUnique({ where: { id: produtoId } });

// certo
const sessao = await exigirSessao();
await prisma.produto.findFirst({ where: { id: produtoId, tenantId: sessao.tenantId } });
```

**Exceção engolida**
```ts
// errado
try { await estoque.baixar(itens); } catch (e) { console.error(e); }

// certo
try {
  await estoque.baixar(itens);
} catch (e) {
  throw new Error('Falha ao baixar estoque da venda', { cause: e });
}
```

**Domínio acoplado ao Prisma**
```ts
// errado: modules/vendas/domain/venda.ts
import { prisma } from '@/lib/prisma';
export async function podeCancelar(id: string) { /* consulta banco */ }

// certo: domínio puro, dados chegam por parâmetro
export function podeCancelar(venda: { status: StatusVenda; criadaEm: Date }, agora: Date): boolean {
  return venda.status === 'CONCLUIDA' && agora.getTime() - venda.criadaEm.getTime() <= 7 * 86_400_000;
}
```

## Referências

- [references/camadas-e-modulos.md](references/camadas-e-modulos.md): leia ao criar módulo, caso de uso, repository ou adapter, ao decidir fronteiras entre módulos ou ao escrever um ADR.
- [references/erros-e-contratos.md](references/erros-e-contratos.md): leia ao definir schemas de entrada/saída, DTOs, hierarquia de erros ou o mapeamento de erro para resposta.
- [references/dinheiro-datas-tenancy.md](references/dinheiro-datas-tenancy.md): leia sempre que a task tocar valores monetários, descontos, impostos, datas, fusos, relatórios por período ou isolamento entre tenants.
