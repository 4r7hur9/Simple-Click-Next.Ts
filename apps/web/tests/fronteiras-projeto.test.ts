import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdir, rm, rmdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { promisify } from "node:util";

/**
 * AC-005 no projeto de verdade.
 *
 * A T-001 já provou as regras de fronteira contra uma árvore de mentira, em
 * pasta temporária. O que falta provar é o que o critério promete: que **este**
 * repositório, com **esta** configuração, reprova uma importação proibida. Por
 * isso o arquivo que viola a fronteira nasce dentro de `apps/web`, é passado
 * pelo mesmo comando que o portão de qualidade roda — o executável do ESLint,
 * da raiz do repositório — e é apagado ao final.
 *
 * Chamar o ESLint por linha de comando, e não pela biblioteca, não é capricho:
 * o plugin de fronteiras compara o caminho do arquivo com padrões que começam
 * em `apps/`, e esse cálculo parte do diretório de trabalho do processo. Rodar
 * de dentro de `apps/web` faria a regra não reconhecer camada nenhuma e o teste
 * passaria por engano.
 */
const executar = promisify(execFile);

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));
const ESLINT = join(RAIZ, "node_modules/eslint/bin/eslint.js");

const PASTA_ALVO = "apps/web/src/server/__fronteira-temp";
const PASTA_VIOLACAO = "apps/web/src/features/__fronteira-temp";
const ARQUIVO_VIOLACAO = join(PASTA_VIOLACAO, "viola.ts");
const ARQUIVO_ALVO = join(PASTA_ALVO, "alvo.ts");

type MensagemDoEslint = {
  ruleId: string | null;
  message: string;
  severity: number;
};
type ResultadoDoEslint = {
  filePath: string;
  errorCount: number;
  messages: MensagemDoEslint[];
};
type Veredito = { resultado: ResultadoDoEslint; codigoDeSaida: number };

async function limpar(): Promise<void> {
  await rm(join(RAIZ, PASTA_ALVO), { recursive: true, force: true });
  await rm(join(RAIZ, PASTA_VIOLACAO), { recursive: true, force: true });
  // As camadas `server` e `features` ainda não têm conteúdo nesta fase: se o
  // teste as criou, ele também as leva embora. Quando tiverem código de
  // verdade, a remoção falha e é ignorada.
  for (const camada of ["apps/web/src/server", "apps/web/src/features"]) {
    try {
      await rmdir(join(RAIZ, camada));
    } catch {
      // pasta com conteúdo ou inexistente: nada a fazer
    }
  }
}

/** Roda o ESLint do projeto e devolve o parecer junto com o código de saída. */
async function verificar(caminhoRelativo: string): Promise<Veredito> {
  const argumentos = [ESLINT, "--format", "json", caminhoRelativo];
  let saida: string;
  let codigoDeSaida = 0;

  try {
    const { stdout } = await executar(process.execPath, argumentos, {
      cwd: RAIZ,
    });
    saida = stdout;
  } catch (erro) {
    const falha = erro as { code?: number; stdout?: string };
    if (typeof falha.stdout !== "string" || falha.stdout.length === 0)
      throw erro;
    saida = falha.stdout;
    codigoDeSaida = falha.code ?? 1;
  }

  const resultados = JSON.parse(saida) as ResultadoDoEslint[];
  const resultado = resultados[0];
  if (resultado === undefined) {
    throw new Error(`o ESLint não olhou ${caminhoRelativo}`);
  }
  return { resultado, codigoDeSaida };
}

const violacoesDeFronteira = (resultado: ResultadoDoEslint) =>
  resultado.messages.filter(
    (mensagem) => mensagem.ruleId === "boundaries/dependencies",
  );

beforeAll(async () => {
  await limpar();
  await mkdir(join(RAIZ, PASTA_ALVO), { recursive: true });
  await mkdir(join(RAIZ, PASTA_VIOLACAO), { recursive: true });

  await writeFile(
    join(RAIZ, ARQUIVO_ALVO),
    'export const sessaoDaVez = (): string => "fingindo ser a camada de servidor";\n',
    "utf8",
  );
  await writeFile(
    join(RAIZ, ARQUIVO_VIOLACAO),
    'import { sessaoDaVez } from "../../server/__fronteira-temp/alvo";\n' +
      "export const usar = (): string => sessaoDaVez();\n",
    "utf8",
  );
});

afterAll(limpar);

describe("fronteiras no repositório real", () => {
  it("@spec:AC-005 o portão acusa a interface que alcança a camada de servidor, apontando arquivo e regra", async () => {
    const { resultado } = await verificar(ARQUIVO_VIOLACAO);
    const violacoes = violacoesDeFronteira(resultado);

    expect(violacoes).toHaveLength(1);
    expect(resultado.filePath).toBe(join(RAIZ, ARQUIVO_VIOLACAO));
    expect(violacoes[0]?.severity).toBe(2);
    expect(violacoes[0]?.message).toContain("web-features");
    expect(violacoes[0]?.message).toContain("web-server");
    // Sem dizer onde a regra está escrita, quem leva o erro não sabe o que fazer.
    expect(violacoes[0]?.message).toContain("arquitetura.md");
  }, 60000);

  it("@spec:AC-005 a violação reprova o portão: a verificação sai com erro", async () => {
    const { resultado, codigoDeSaida } = await verificar(ARQUIVO_VIOLACAO);

    // É o que faz a mudança não passar: o comando do portão sai diferente de
    // zero, e o gancho de envio interrompe.
    expect(codigoDeSaida).toBeGreaterThan(0);
    expect(resultado.errorCount).toBeGreaterThan(0);
  }, 60000);

  it("@spec:AC-005 o mesmo portão deixa passar o arquivo que respeita a fronteira", async () => {
    const { resultado, codigoDeSaida } = await verificar(ARQUIVO_ALVO);

    expect(violacoesDeFronteira(resultado)).toEqual([]);
    expect(resultado.errorCount).toBe(0);
    expect(codigoDeSaida).toBe(0);
  }, 60000);
});
