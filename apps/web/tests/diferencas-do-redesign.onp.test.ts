/**
 * A forma do manifesto de diferenças do redesign (card #114, AC-11402).
 *
 * O manifesto (`e2e/fixtures/diferencas-do-redesign.json`) lista cada
 * diferença entre a tela nova e a referência do Stitch. Este teste prova só a
 * FORMA — não que a lista está completa (isso é a revisão do dono, AC-11403):
 *
 * - toda diferença tem tela, largura, tema, loja, classe, motivo e descrição;
 * - a classe é justificada, pendente ou regressão;
 * - o motivo é um código que EXISTE em `.spec/`: princípio da constituição
 *   (`P-…`), critério de alguma spec (`AC-…`) ou pergunta (`Q-…`);
 * - toda pendente aponta uma pergunta que ainda está ABERTA.
 *
 * JSON lido do disco, sem import: o vitest do site não arrasta nada do e2e.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(import.meta.dirname, "../../..");
const ler = (caminho: string) => readFileSync(join(RAIZ, caminho), "utf8");

interface Diferenca {
  readonly tela: string;
  readonly largura: string;
  readonly tema: string;
  readonly loja: string;
  readonly classe: string;
  readonly motivo: string;
  readonly descricao: string;
}

const manifesto = JSON.parse(
  ler("e2e/fixtures/diferencas-do-redesign.json"),
) as {
  readonly diferencas: readonly Diferenca[];
};

const constituicao = ler(".spec/constituicao.md");
const specs = readdirSync(join(RAIZ, ".spec/features"))
  .map((pasta) => {
    try {
      return ler(`.spec/features/${pasta}/spec.md`);
    } catch {
      return "";
    }
  })
  .join("\n");

const CLASSES = ["justificada", "pendente", "regressao"];

function codigoExiste(codigo: string): boolean {
  if (/^P-\d{3}$/.test(codigo))
    return new RegExp(`\\b${codigo}\\b`).test(constituicao);
  if (/^AC-\d{3,5}$/.test(codigo))
    return new RegExp(`#### ${codigo}\\b`).test(specs);
  if (/^Q-\d{3,5}$/.test(codigo))
    return new RegExp(`\\|\\s*${codigo}\\s*\\|`).test(specs);
  return false;
}

/** A linha da tabela de perguntas diz "aberta" na coluna de status. */
function perguntaAberta(codigo: string): boolean {
  const linha = specs
    .split("\n")
    .find((l) => new RegExp(`^\\|\\s*${codigo}\\s*\\|`).test(l));
  return linha !== undefined && /\|\s*aberta\s*\|/.test(linha);
}

describe("manifesto de diferenças do redesign (AC-11402)", () => {
  it("[CA-31] @spec:AC-11402 o manifesto tem diferenças registradas", () => {
    expect(manifesto.diferencas.length).toBeGreaterThan(0);
  });

  it("[CA-31] @spec:AC-11402 toda diferença tem os campos preenchidos", () => {
    const incompletas = manifesto.diferencas.filter((d) =>
      (
        [
          "tela",
          "largura",
          "tema",
          "loja",
          "classe",
          "motivo",
          "descricao",
        ] as const
      ).some((campo) => typeof d[campo] !== "string" || d[campo].trim() === ""),
    );
    expect(incompletas).toEqual([]);
  });

  it("[CA-31] @spec:AC-11402 toda diferença tem uma classe da rubrica", () => {
    const foraDaRubrica = manifesto.diferencas
      .filter((d) => !CLASSES.includes(d.classe))
      .map((d) => `${d.tela}: ${d.classe}`);
    expect(foraDaRubrica).toEqual([]);
  });

  it("[CA-31] @spec:AC-11402 todo motivo é um código que existe em .spec", () => {
    const semCodigo = manifesto.diferencas
      .filter((d) => !codigoExiste(d.motivo))
      .map((d) => `${d.tela}: ${d.motivo}`);
    expect(semCodigo).toEqual([]);
  });

  it("[CA-31] @spec:AC-11402 toda pendente aponta uma pergunta aberta", () => {
    const pendentesSemPergunta = manifesto.diferencas
      .filter((d) => d.classe === "pendente")
      .filter((d) => !/^Q-/.test(d.motivo) || !perguntaAberta(d.motivo))
      .map((d) => `${d.tela}: ${d.motivo}`);
    expect(pendentesSemPergunta).toEqual([]);
  });

  it("[CA-31] @spec:AC-11402 justificada não usa pergunta como motivo (pergunta é de pendente)", () => {
    const justificadasComPergunta = manifesto.diferencas
      .filter((d) => d.classe === "justificada" && /^Q-/.test(d.motivo))
      .map((d) => `${d.tela}: ${d.motivo}`);
    expect(justificadasComPergunta).toEqual([]);
  });
});
