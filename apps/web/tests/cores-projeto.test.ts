import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdir, rm, rmdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { promisify } from "node:util";

/**
 * AC-014 no projeto de verdade.
 *
 * A T-016 já provou a regra de cor contra arquivos em pasta temporária, com
 * configuração montada à mão. O que falta provar é o que o critério promete:
 * que **esta** verificação de qualidade, rodando sobre **estas** telas, acusa
 * cor escrita direto no componente — e reprova o portão por causa disso.
 *
 * Por isso o componente que viola nasce dentro de `apps/web`, passa pelo mesmo
 * executável do ESLint que o portão roda, a partir da raiz do repositório, e é
 * apagado ao final. Rodar de dentro de `apps/web` faria os padrões que começam
 * em `apps/` não reconhecerem camada nenhuma, e o teste passaria por engano.
 */
const executar = promisify(execFile);

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));
const ESLINT = join(RAIZ, "node_modules/eslint/bin/eslint.js");

const PASTA = "apps/web/src/features/__cores-temp";
const ARQUIVO_VIOLACAO = join(PASTA, "cor-solta.tsx");
const ARQUIVO_CORRETO = join(PASTA, "cor-do-tema.tsx");

type MensagemDoEslint = {
  ruleId: string | null;
  message: string;
  severity: number;
  line: number;
};
type ResultadoDoEslint = {
  filePath: string;
  errorCount: number;
  messages: MensagemDoEslint[];
};
type Veredito = { resultado: ResultadoDoEslint; codigoDeSaida: number };

async function limpar(): Promise<void> {
  await rm(join(RAIZ, PASTA), { recursive: true, force: true });
  // A camada `features` ainda não tem conteúdo nesta fase: se o teste a criou,
  // ele também a leva embora. Quando tiver código de verdade, a remoção falha
  // e é ignorada.
  try {
    await rmdir(join(RAIZ, "apps/web/src/features"));
  } catch {
    // pasta com conteúdo ou inexistente: nada a fazer
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

const violacoesDeCor = (resultado: ResultadoDoEslint) =>
  resultado.messages.filter(
    (mensagem) => mensagem.ruleId === "cores/sem-cor-literal",
  );

beforeAll(async () => {
  await limpar();
  await mkdir(join(RAIZ, PASTA), { recursive: true });

  await writeFile(
    join(RAIZ, ARQUIVO_VIOLACAO),
    "export const Selo = () => (\n" +
      '  <span className="rounded px-2" style={{ backgroundColor: "#ff0000" }}>\n' +
      "    Novo\n" +
      "  </span>\n" +
      ");\n",
    "utf8",
  );
  await writeFile(
    join(RAIZ, ARQUIVO_CORRETO),
    "export const Selo = () => (\n" +
      '  <span className="rounded px-2" style={{ backgroundColor: "var(--cor-erro)" }}>\n' +
      "    Novo\n" +
      "  </span>\n" +
      ");\n",
    "utf8",
  );
});

afterAll(limpar);

describe("cor escrita direto na tela, no repositório real", () => {
  it("@spec:AC-014 @spec:AC-948 a verificação de qualidade acusa a cor solta, apontando arquivo, linha e o caminho certo", async () => {
    const { resultado } = await verificar(ARQUIVO_VIOLACAO);
    const violacoes = violacoesDeCor(resultado);

    expect(violacoes).toHaveLength(1);
    expect(resultado.filePath).toBe(join(RAIZ, ARQUIVO_VIOLACAO));
    expect(violacoes[0]?.severity).toBe(2);
    expect(violacoes[0]?.line).toBe(2);
    expect(violacoes[0]?.message).toContain("#ff0000");
    expect(violacoes[0]?.message).toContain("var(--cor-");
  }, 60000);

  it("@spec:AC-014 a cor solta reprova o portão: a verificação sai com erro", async () => {
    const { resultado, codigoDeSaida } = await verificar(ARQUIVO_VIOLACAO);

    // É o que faz a mudança não passar: o comando do portão sai diferente de
    // zero, e o gancho de envio interrompe.
    expect(codigoDeSaida).toBeGreaterThan(0);
    expect(resultado.errorCount).toBeGreaterThan(0);
  }, 60000);

  it("@spec:AC-014 o mesmo portão deixa passar quem usa o valor declarado no tema", async () => {
    const { resultado, codigoDeSaida } = await verificar(ARQUIVO_CORRETO);

    expect(violacoesDeCor(resultado)).toEqual([]);
    expect(resultado.errorCount).toBe(0);
    expect(codigoDeSaida).toBe(0);
  }, 60000);

  it("@spec:AC-014 o design system publicado não tem nenhuma cor solta", async () => {
    // A regra só vale alguma coisa se o próprio pacote que ela protege estiver
    // limpo — inclusive a vitrine de componentes, que é a tela mais tentada a
    // escrever cor para "só demonstrar".
    const { resultado, codigoDeSaida } = await verificar("packages/ui/src");
    const vitrine = await verificar("apps/web/src/app");

    expect(codigoDeSaida).toBe(0);
    expect(resultado.errorCount).toBe(0);
    expect(vitrine.codigoDeSaida).toBe(0);
  }, 120000);
});
