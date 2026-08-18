import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ESLint } from "eslint";
import boundaries from "eslint-plugin-boundaries";
import tseslint from "typescript-eslint";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configFronteiras } from "../fronteiras.js";

/**
 * As fronteiras entre camadas são verificadas contra uma árvore real de
 * arquivos, e não contra texto solto: é assim que o plugin resolve o destino
 * de cada importação e classifica a camada de origem e a de destino.
 */
let raiz;

const arquivos = {
  // regra pura: não conhece nada do projeto
  "packages/core/src/dinheiro.ts": `export const centavos = (v: number): number => Math.round(v);\n`,
  "packages/contracts/src/index.ts": `export type Pedido = { id: string };\n`,

  // camada de dados: pode conhecer o contrato
  "packages/database/src/repo.ts": `import type { Pedido } from "../../contracts/src/index.ts";\nexport const buscar = (): Pedido | null => null;\n`,

  // transversais da API: `core/db.ts` É a camada de dados da API, e por isso
  // é o único ponto autorizado a alcançar `packages/database`
  "apps/api/src/core/db.ts": `import { buscar } from "../../../../packages/database/src/repo.ts";\nexport const transacao = async () => buscar();\n`,

  // módulo de domínio tentando alcançar o banco por fora do caminho único: proibido (P-004)
  "apps/api/src/modules/pedidos/atalho.ts": `import { buscar } from "../../../../../packages/database/src/repo.ts";\nexport const atalho = () => buscar();\n`,

  // módulo de domínio: caminho permitido
  "apps/api/src/modules/pedidos/criar.ts": `import { centavos } from "../../../../../packages/core/src/dinheiro.ts";\nimport { transacao } from "../../core/db.ts";\nexport const criar = () => centavos(1) && transacao();\n`,

  // módulo de domínio falando com outro módulo: proibido
  "apps/api/src/modules/catalogo/produto.ts": `export const produto = () => "x";\n`,
  "apps/api/src/modules/pedidos/vizinho.ts": `import { produto } from "../catalogo/produto.ts";\nexport const usa = () => produto();\n`,

  // interface alcançando a camada de servidor: proibido
  "apps/web/src/server/sessao.ts": `export const sessao = () => null;\n`,
  "apps/web/src/features/vitrine/Card.ts": `import { sessao } from "../../server/sessao.ts";\nexport const card = () => sessao();\n`,

  // regra pura importando camada de dados: proibido
  "packages/core/src/vazamento.ts": `import { buscar } from "../../database/src/repo.ts";\nexport const x = () => buscar();\n`,
};

async function lintar(caminhoRelativo) {
  const { settings, rules } = configFronteiras();
  const eslint = new ESLint({
    cwd: raiz,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.ts"],
        plugins: { boundaries },
        languageOptions: { parser: tseslint.parser },
        settings,
        rules,
      },
    ],
  });
  const [resultado] = await eslint.lintFiles([join(raiz, caminhoRelativo)]);
  return resultado.messages.filter(
    (m) => m.ruleId === "boundaries/dependencies",
  );
}

beforeAll(async () => {
  raiz = await mkdtemp(join(tmpdir(), "sc-fronteiras-"));
  for (const [caminho, conteudo] of Object.entries(arquivos)) {
    const destino = join(raiz, caminho);
    await mkdir(destino.slice(0, destino.lastIndexOf("/")), {
      recursive: true,
    });
    await writeFile(destino, conteudo, "utf8");
  }
});

afterAll(async () => {
  if (raiz) await rm(raiz, { recursive: true, force: true });
});

describe("fronteiras entre camadas", () => {
  it("@spec:AC-005 acusa quando a interface importa diretamente a camada de servidor", async () => {
    const violacoes = await lintar("apps/web/src/features/vitrine/Card.ts");

    expect(violacoes).toHaveLength(1);
    expect(violacoes[0].message).toContain("web-features");
    expect(violacoes[0].message).toContain("web-server");
    // A mensagem precisa dizer onde está a regra, senão quem lê não sabe o que fazer.
    expect(violacoes[0].message).toContain("arquitetura.md");
    expect(violacoes[0].line).toBe(1);
  });

  it("@spec:AC-005 acusa quando uma regra pura importa a camada de dados", async () => {
    const violacoes = await lintar("packages/core/src/vazamento.ts");

    expect(violacoes).toHaveLength(1);
    expect(violacoes[0].message).toContain("pkg-core");
    expect(violacoes[0].message).toContain("pkg-database");
  });

  it("@spec:AC-005 acusa quando um módulo de domínio importa outro módulo", async () => {
    const violacoes = await lintar("apps/api/src/modules/pedidos/vizinho.ts");

    expect(violacoes).toHaveLength(1);
    expect(violacoes[0].message).toContain("api-module");
  });

  it("@spec:AC-005 acusa quando um módulo de domínio alcança o banco por fora do caminho único", async () => {
    // P-004: o acesso ao banco passa pelo contexto de requisição, que abre a
    // transação com a variável de sessão da loja. Módulo que fala com a camada
    // de dados direto pula justamente esse passo.
    const violacoes = await lintar("apps/api/src/modules/pedidos/atalho.ts");

    expect(violacoes).toHaveLength(1);
    expect(violacoes[0].message).toContain("api-module");
    expect(violacoes[0].message).toContain("pkg-database");
  });

  it("@spec:AC-005 deixa passar o que a arquitetura autoriza", async () => {
    expect(await lintar("apps/api/src/modules/pedidos/criar.ts")).toHaveLength(
      0,
    );
    expect(await lintar("packages/database/src/repo.ts")).toHaveLength(0);
    // O caminho único até o banco é transversal da API, e é ele — e só ele —
    // que importa a camada de dados.
    expect(await lintar("apps/api/src/core/db.ts")).toHaveLength(0);
  });
});
