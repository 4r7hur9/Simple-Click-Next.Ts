import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pluginCores, corLiteralEm } from "../cores.js";

/**
 * AC-014: a verificação de qualidade acusa cor escrita direto no componente.
 *
 * A regra é exercitada contra arquivos de verdade, e não contra texto solto,
 * porque é assim que ela roda no portão: o mesmo motor, a mesma configuração,
 * o mesmo formato de mensagem que quem programa vai ler.
 */
let raiz;

const arquivos = {
  // hexadecimal cru no atributo de estilo
  "hex-no-estilo.tsx": `export const Botao = () => <button style={{ color: "#ff0000" }}>ok</button>;\n`,

  // hexadecimal escondido em classe utilitária arbitrária
  "hex-na-classe.tsx": `export const Cartao = () => <div className="rounded bg-[#1a4fd6] p-4" />;\n`,

  // função de cor do CSS
  "funcao-de-cor.tsx": `export const Sombra = () => <div style={{ boxShadow: "0 1px 2px rgba(0, 0, 0, 0.2)" }} />;\n`,

  // nome de cor do CSS como valor de propriedade de cor
  "nome-de-cor.tsx": `export const Aviso = () => <p style={{ backgroundColor: "red" }}>erro</p>;\n`,

  // declaração de CSS dentro de texto
  "css-em-texto.ts": `export const estilo = "display: flex; border-color: navy;";\n`,

  // literal de gabarito
  "gabarito.ts": `const tom = "escuro";\nexport const regra = \`.tema { background: #0d1015; }\`;\nexport const outro = tom;\n`,

  // o caminho certo: valor declarado do tema
  "com-token.tsx": `export const Botao = () => <button className="sc-botao" style={{ color: "var(--cor-em-primaria)" }}>ok</button>;\n`,

  // palavras que não são cor escolhida
  "sem-cor.ts": `export const heranca = { color: "inherit", borderColor: "currentcolor", background: "transparent" };\nexport const texto = "O molho de tomate leva orégano.";\n`,
};

async function lintar(nomeDoArquivo) {
  const eslint = new ESLint({
    cwd: raiz,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.{ts,tsx}"],
        plugins: { cores: pluginCores },
        languageOptions: {
          parser: tseslint.parser,
          parserOptions: { ecmaFeatures: { jsx: true } },
        },
        rules: { "cores/sem-cor-literal": "error" },
      },
    ],
  });
  const [resultado] = await eslint.lintFiles([join(raiz, nomeDoArquivo)]);
  return resultado.messages.filter((m) => m.ruleId === "cores/sem-cor-literal");
}

beforeAll(async () => {
  raiz = await mkdtemp(join(tmpdir(), "sc-cores-"));
  await mkdir(raiz, { recursive: true });
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    await writeFile(join(raiz, nome), conteudo, "utf8");
  }
});

afterAll(async () => {
  if (raiz) await rm(raiz, { recursive: true, force: true });
});

describe("cor escrita direto no componente", () => {
  it("@spec:AC-014 acusa hexadecimal escrito no atributo de estilo, apontando a linha", async () => {
    const violacoes = await lintar("hex-no-estilo.tsx");

    expect(violacoes).toHaveLength(1);
    expect(violacoes[0].severity).toBe(2);
    expect(violacoes[0].line).toBe(1);
    expect(violacoes[0].message).toContain("#ff0000");
    // Sem dizer qual é o caminho certo, quem leva o erro não sabe o que fazer.
    expect(violacoes[0].message).toContain("var(--cor-");
    expect(violacoes[0].message).toContain("AC-014");
  });

  it("@spec:AC-014 acusa hexadecimal escondido em classe utilitária arbitrária", async () => {
    const violacoes = await lintar("hex-na-classe.tsx");

    // `bg-[#1a4fd6]` é a saída de emergência mais comum do Tailwind, e é por
    // ela que a identidade visual escapa do tema.
    expect(violacoes).toHaveLength(1);
    expect(violacoes[0].message).toContain("#1a4fd6");
  });

  it("@spec:AC-014 acusa função de cor do CSS, mesmo dentro de uma sombra", async () => {
    const violacoes = await lintar("funcao-de-cor.tsx");

    expect(violacoes).toHaveLength(1);
    expect(violacoes[0].message).toContain("rgba(");
  });

  it("@spec:AC-014 acusa nome de cor do CSS quando ele é valor de propriedade de cor", async () => {
    const violacoes = await lintar("nome-de-cor.tsx");

    expect(violacoes).toHaveLength(1);
    expect(violacoes[0].message).toContain("red");
  });

  it("@spec:AC-014 acusa declaração de CSS escrita dentro de texto", async () => {
    const violacoes = await lintar("css-em-texto.ts");

    expect(violacoes).toHaveLength(1);
    expect(violacoes[0].message).toContain("navy");
  });

  it("@spec:AC-014 acusa cor dentro de literal de gabarito", async () => {
    const violacoes = await lintar("gabarito.ts");

    expect(violacoes).toHaveLength(1);
    expect(violacoes[0].message).toContain("#0d1015");
  });
});

describe("o que a regra deixa passar", () => {
  it("@spec:AC-014 não acusa quem usa o valor declarado do tema", async () => {
    expect(await lintar("com-token.tsx")).toEqual([]);
  });

  it("@spec:AC-014 não acusa palavra-chave de herança nem texto comum", async () => {
    // `currentcolor` e `transparent` não são cor escolhida, e acusar texto de
    // produto transformaria a regra em ruído que todo mundo desliga.
    expect(await lintar("sem-cor.ts")).toEqual([]);
  });
});

describe("o detector, isolado", () => {
  it("@spec:AC-014 aponta qual trecho denuncia a cor, para a mensagem ser acionável", () => {
    expect(corLiteralEm("bg-[#ff0000]")).toBe("#ff0000");
    expect(corLiteralEm("oklch(0.7 0.1 200)")).toBe("oklch(");
    expect(corLiteralEm("red", { propriedade: "color" })).toBe("red");
    // O mesmo "red" fora de propriedade de cor é só uma palavra.
    expect(corLiteralEm("red", { propriedade: "titulo" })).toBeNull();
    expect(corLiteralEm("var(--cor-primaria)")).toBeNull();
  });
});
