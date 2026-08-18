import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

/**
 * AC-006 provado do jeito que o critério pede: mexendo num campo do contrato e
 * mandando a verificação de tipos do SITE rodar.
 *
 * Por que uma árvore de arquivos e não um `expectTypeOf`: o critério fala do
 * comando que o portão roda (`tsc`), e não de uma afirmação de tipo escrita à
 * mão. A montagem copia os arquivos DE VERDADE — os esquemas de
 * `packages/contracts/src` e o consumidor de `apps/web/src/lib` —, aplica a
 * mudança de campo em cima da cópia e chama o mesmo `tsc` do repositório. Se o
 * site tivesse um tipo próprio redigitado, a mudança não apareceria e o caso
 * abaixo falharia.
 *
 * A cópia mora dentro de `packages/contracts/` porque é de lá que o `zod` é
 * resolvido pela subida de `node_modules`. Ela nasce e morre neste arquivo.
 */
const executar = promisify(execFile);

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));
const TSC = join(RAIZ, "node_modules/typescript/bin/tsc");
const FONTE_DO_CONTRATO = join(RAIZ, "packages/contracts/src");
const CONSUMIDOR_DO_SITE = join(RAIZ, "apps/web/src/lib/api-contrato.ts");
const OFICINA = join(RAIZ, "packages/contracts/.provas-de-tipo");

/** Campo do contrato que o caso mexe, e o nome que ele passa a ter. */
const CAMPO_ORIGINAL = '  status: z.literal("viva"),';
const CAMPO_RENOMEADO = '  situacao: z.literal("viva"),';

/**
 * Mesmas opções que `apps/web/tsconfig.json` usa para o que importa aqui:
 * modo estrito e resolução de empacotador. O apelido do pacote aponta para a
 * cópia, que é o único desvio em relação ao projeto de verdade.
 */
const TSCONFIG = {
  compilerOptions: {
    target: "ES2023",
    lib: ["ES2023", "DOM", "DOM.Iterable"],
    module: "ESNext",
    moduleResolution: "bundler",
    moduleDetection: "force",
    strict: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    verbatimModuleSyntax: true,
    isolatedModules: true,
    allowImportingTsExtensions: true,
    skipLibCheck: true,
    noEmit: true,
    types: [],
    paths: { "@simpleclick/contracts": ["./contrato/index.ts"] },
  },
  include: ["site/**/*.ts", "contrato/**/*.ts"],
};

interface Veredito {
  readonly saida: string;
  readonly codigoDeSaida: number;
}

/** Monta uma cópia do contrato e do consumidor, com ou sem a mudança. */
async function montarCaso(
  nome: string,
  renomearCampo: boolean,
): Promise<string> {
  const caso = join(OFICINA, nome);
  await mkdir(join(caso, "site"), { recursive: true });
  await cp(FONTE_DO_CONTRATO, join(caso, "contrato"), { recursive: true });

  // Teste do contrato não entra na cópia: ele importa `vitest`, que não existe
  // nesta árvore de mentira.
  for (const arquivo of await readdir(join(caso, "contrato"))) {
    if (arquivo.endsWith(".test.ts")) {
      await rm(join(caso, "contrato", arquivo));
    }
  }

  if (renomearCampo) {
    const caminho = join(caso, "contrato", "saude.ts");
    const original = await readFile(caminho, "utf8");
    if (!original.includes(CAMPO_ORIGINAL)) {
      throw new Error(
        `packages/contracts/src/saude.ts não tem mais a linha ${CAMPO_ORIGINAL.trim()}. ` +
          "Esta prova mexe num campo REAL do contrato: ajuste CAMPO_ORIGINAL para o campo atual — nunca remova o caso.",
      );
    }
    await writeFile(
      caminho,
      original.replace(CAMPO_ORIGINAL, CAMPO_RENOMEADO),
      "utf8",
    );
  }

  await cp(CONSUMIDOR_DO_SITE, join(caso, "site", "api-contrato.ts"));
  await writeFile(
    join(caso, "tsconfig.json"),
    `${JSON.stringify(TSCONFIG, null, 2)}\n`,
    "utf8",
  );
  return caso;
}

/** Roda o mesmo `tsc` do repositório sobre a cópia montada. */
async function verificarTipos(caso: string): Promise<Veredito> {
  try {
    const { stdout } = await executar(
      process.execPath,
      [TSC, "-p", join(caso, "tsconfig.json")],
      { cwd: caso },
    );
    return { saida: stdout, codigoDeSaida: 0 };
  } catch (erro) {
    const falha = erro as { code?: number; stdout?: string };
    return { saida: falha.stdout ?? "", codigoDeSaida: falha.code ?? 1 };
  }
}

beforeAll(async () => {
  await rm(OFICINA, { recursive: true, force: true });
});

afterAll(async () => {
  await rm(OFICINA, { recursive: true, force: true });
});

describe("contrato como fonte única dos tipos", () => {
  it("@spec:AC-006 sem mexer no contrato, a verificação de tipos do site passa limpa", async () => {
    // O contraprova do caso seguinte: sem ele, uma montagem quebrada faria o
    // teste "passar" reprovando por motivo errado.
    const caso = await montarCaso("sem-mudanca", false);

    const veredito = await verificarTipos(caso);

    expect(veredito.saida).toBe("");
    expect(veredito.codigoDeSaida).toBe(0);
  }, 120000);

  it("@spec:AC-006 mudar um campo do contrato faz a verificação de tipos do site acusar, apontando arquivo e campo", async () => {
    const caso = await montarCaso("campo-renomeado", true);

    const veredito = await verificarTipos(caso);

    expect(veredito.codigoDeSaida).toBeGreaterThan(0);
    // O erro precisa cair no arquivo DO SITE: é isso que significa "o web
    // acusa erro de tipo nos pontos afetados".
    expect(veredito.saida).toContain("site/api-contrato.ts");
    expect(veredito.saida).toContain("status");
    // E precisa ser erro de propriedade inexistente, não erro de montagem.
    expect(veredito.saida).toMatch(/TS2339|TS2551/);
  }, 120000);

  it("@spec:AC-006 o site não redigita nenhum tipo que o contrato já declara", async () => {
    const arquivos = await listarArquivosDoSite(join(RAIZ, "apps/web/src"));
    const redigitados: string[] = [];

    for (const arquivo of arquivos) {
      const conteudo = await readFile(arquivo, "utf8");
      // Importar o tipo é o certo; declarar de novo é o defeito. Por isso as
      // importações saem do texto antes da busca.
      const semImportacoes = conteudo.replace(
        /import[\s\S]*?from\s+"[^"]*";/g,
        "",
      );
      const declara =
        /(?:type|interface)\s+(IdentificacaoDaApi|ErroDaApi)\b/.test(
          semImportacoes,
        );
      if (declara) redigitados.push(arquivo.slice(RAIZ.length));
    }

    // Tipo duplicado é o defeito que AC-006 existe para impedir: ele volta a
    // compilar sozinho depois de uma mudança de contrato, e a divergência só
    // aparece em produção.
    expect(redigitados).toEqual([]);
  });
});

/** Todo arquivo TypeScript do site, sem entrar em pasta de ferramenta. */
async function listarArquivosDoSite(pasta: string): Promise<string[]> {
  const entradas = await readdir(pasta, { withFileTypes: true });
  const achados: string[] = [];
  for (const entrada of entradas) {
    const caminho = join(pasta, entrada.name);
    if (entrada.isDirectory()) {
      achados.push(...(await listarArquivosDoSite(caminho)));
    } else if (/\.tsx?$/.test(entrada.name)) {
      achados.push(caminho);
    }
  }
  return achados;
}
