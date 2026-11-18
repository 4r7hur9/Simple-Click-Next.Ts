/**
 * Varreduras de segurança e de consistência da administração (card #113,
 * T-11301). Leem o CÓDIGO e travam o que a reforma visual não pode mudar:
 * nada de cache em dado administrativo, título fixo, nada de dado pessoal no
 * console, nenhum link de documento aberto fora do clique, nenhuma cor solta
 * e nenhum contrato `admin-*` fora das pastas da administração.
 *
 * São provas de regressão, verdes contra o código de hoje. Não provam
 * autorização (a API decide e tem os próprios testes).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { arquivos, ler, RAIZ_WEB } from "./apoio-painel-lojista.ts";

const SRC = join(RAIZ_WEB, "src");
const CONTRATOS = join(RAIZ_WEB, "../../packages/contracts/src");

const PASTAS_DA_ADMINISTRACAO = [
  join(SRC, "features/admin"),
  join(SRC, "features/admin-dashboard"),
  join(SRC, "app/(admin)"),
  join(SRC, "app/api/admin"),
];

const CODIGO = [".ts", ".tsx"];

function doRepositorio(caminho: string): string {
  return relative(join(RAIZ_WEB, "../.."), caminho).replaceAll("\\", "/");
}

function semComentarios(codigo: string): string {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}

const todos = PASTAS_DA_ADMINISTRACAO.flatMap((pasta) =>
  arquivos(pasta, CODIGO),
);

function achados(padrao: RegExp, fontes = todos): string[] {
  return fontes
    .filter((arquivo) => padrao.test(semComentarios(ler(arquivo))))
    .map(doRepositorio);
}

describe("administração: dado administrativo nunca fica em cache", () => {
  it("[CA-4] @spec:AC-11307 há arquivos para varrer (a varredura não passa vazia)", () => {
    expect(todos.length).toBeGreaterThan(40);
    expect(
      todos.some((f) => f.endsWith("app/api/admin/[...caminho]/route.ts")),
    ).toBe(true);
  });

  it("[CA-4] @spec:AC-11307 sem use cache (aspas simples ou duplas) nem unstable_cache", () => {
    expect(achados(/["']use cache(?::[a-z-]+)?["']/)).toEqual([]);
    expect(achados(/unstable_cache|cacheLife|cacheTag/)).toEqual([]);
  });

  it("[CA-4] @spec:AC-11307 sem revalidate, rota estática nem geração estática", () => {
    expect(achados(/export\s+const\s+revalidate\b/)).toEqual([]);
    expect(achados(/force-static|generateStaticParams/)).toEqual([]);
  });

  it("[CA-4] @spec:AC-11307 as páginas do servidor não buscam dado nenhum (o dado vem do cliente, pela ponte, com no-store)", () => {
    const paginas = arquivos(join(SRC, "app/(admin)"), CODIGO);
    expect(achados(/\bfetch\s*\(/, paginas)).toEqual([]);
  });

  it("[CA-4] @spec:AC-11307 a leitura do cliente pede cache no-store", () => {
    const apresentacao = ler(join(SRC, "features/admin/apresentacao.ts"));
    expect(apresentacao).toMatch(/fetch\(url,\s*\{\s*cache:\s*"no-store"/);
  });
});

describe("administração: título fixo e nada de dado pessoal no console", () => {
  it("[CA-4] @spec:AC-11310 sem generateMetadata, document.title nem <title> de página", () => {
    expect(achados(/generateMetadata/)).toEqual([]);
    expect(achados(/document\.title/)).toEqual([]);
    // O <title> dentro de um SVG nomeia o gráfico; só o de página importa.
    const foraDeSvg = todos.filter((arquivo) =>
      /<title[\s>]/.test(
        semComentarios(ler(arquivo)).replace(/<svg[\s\S]*?<\/svg>/g, ""),
      ),
    );
    expect(foraDeSvg.map(doRepositorio)).toEqual([]);
  });

  it("[CA-4] @spec:AC-11310 todo metadata.title é um texto literal, sem nome de loja, e-mail nem documento", () => {
    const paginas = arquivos(join(SRC, "app/(admin)"), [".tsx"]).filter(
      (arquivo) => /export const metadata/.test(ler(arquivo)),
    );
    expect(paginas.length).toBeGreaterThanOrEqual(10);
    for (const pagina of paginas) {
      const codigo = ler(pagina);
      const titulo = /title:\s*("([^"]*)"|'([^']*)')/.exec(codigo);
      expect(titulo, doRepositorio(pagina)).not.toBeNull();
      const texto = titulo?.[2] ?? titulo?.[3] ?? "";
      expect(texto, doRepositorio(pagina)).toMatch(
        /Administração SimpleClick$/,
      );
      expect(texto).not.toMatch(/[@]|\d{5,}|\$\{/);
    }
  });

  it("[CA-4] @spec:AC-11310 nenhum console.* nas telas da administração", () => {
    expect(achados(/\bconsole\s*\./)).toEqual([]);
  });

  it("[CA-4] @spec:AC-11309 nenhuma tela abre documento por janela nova nem por navegação do script", () => {
    expect(
      achados(/\bwindow\.open\b|\blocation\.(assign|replace|href)\b/),
    ).toEqual([]);
  });

  it("[CA-4] @spec:AC-11309 sem iframe, object nem embed no código da administração", () => {
    expect(achados(/<(iframe|object|embed)[\s>]/i)).toEqual([]);
  });
});

describe("administração: cor, tema e verde antigo", () => {
  const COR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

  it("[CA-4] @spec:AC-11330 sem cor literal nem o verde antigo b2f800 (cores vêm dos tokens)", () => {
    expect(achados(COR_LITERAL)).toEqual([]);
    expect(
      todos.filter((f) => /b2f800/i.test(ler(f))).map(doRepositorio),
    ).toEqual([]);
  });

  it("[CA-4] @spec:AC-11331 nenhuma tela da administração troca o tema (data-tema)", () => {
    expect(achados(/data-tema|dataset\.tema/)).toEqual([]);
  });
});

/* ── Contratos admin-* só nas pastas da administração ──────────────────── */

/** Todo nome exportado pelos contratos `packages/contracts/src/admin-*.ts`. */
function simbolosDosContratosAdmin(): Set<string> {
  const nomes = new Set<string>();
  for (const arquivo of readdirSync(CONTRATOS).filter((f) =>
    /^admin-.*\.ts$/.test(f),
  )) {
    const codigo = readFileSync(join(CONTRATOS, arquivo), "utf8");
    for (const m of codigo.matchAll(
      /export\s+(?:declare\s+)?(?:const|function|type|interface|class|enum|let)\s+([A-Za-z0-9_]+)/g,
    )) {
      if (m[1] !== undefined) nomes.add(m[1]);
    }
    for (const lista of codigo.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
      for (const parte of (lista[1] ?? "").split(",")) {
        const nome = parte
          .trim()
          .replace(/^type\s+/, "")
          .split(/\s+as\s+/)
          .pop();
        if (nome !== undefined && nome !== "") nomes.add(nome);
      }
    }
  }
  return nomes;
}

/** Os nomes que um arquivo traz do barril `@simpleclick/contracts`. */
export function nomesDoBarril(codigo: string): string[] {
  const nomes: string[] = [];
  const limpo = semComentarios(codigo);
  const padrao =
    /(?:import|export)\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']@simpleclick\/contracts["']/g;
  for (const m of limpo.matchAll(padrao)) {
    for (const parte of (m[1] ?? "").split(",")) {
      const nome = parte
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)[0]
        ?.trim();
      if (nome !== undefined && nome !== "") nomes.push(nome);
    }
  }
  return nomes;
}

const PERMITIDOS = [
  "apps/web/src/app/(admin)/",
  "apps/web/src/features/admin/",
  "apps/web/src/features/admin-dashboard/",
  "apps/web/src/server/admin-api.ts",
  "apps/web/src/features/painel/MenuDaAdministracao.tsx",
];

/**
 * O que já existe fora das pastas da administração, por par (arquivo, nome).
 * São contratos "para o dono", públicos por desenho (a situação e as
 * funcionalidades que o dono vê, e o formato do apelido). Nada novo entra
 * aqui sem decisão: acrescentar uma linha exige editar este teste.
 */
const EXCECOES: Readonly<Record<string, readonly string[]>> = {
  "apps/web/src/app/api/conta/[...resto]/route.ts": ["FORMATO_DO_APELIDO"],
  "apps/web/src/features/config/AvisoDeSuspensao.tsx": [
    "esquemaDaSituacaoParaODono",
    "SituacaoParaODonoNoContrato",
  ],
  "apps/web/src/features/config/NavegacaoDaConfiguracao.tsx": [
    "esquemaDasFuncionalidadesParaODono",
  ],
};

function violacoes(
  fontes: readonly { readonly caminho: string; readonly codigo: string }[],
  simbolos: ReadonlySet<string>,
): { readonly caminho: string; readonly nome: string }[] {
  const achadas: { caminho: string; nome: string }[] = [];
  for (const { caminho, codigo } of fontes) {
    if (PERMITIDOS.some((p) => caminho.startsWith(p))) continue;
    for (const nome of nomesDoBarril(codigo)) {
      if (!simbolos.has(nome)) continue;
      if (EXCECOES[caminho]?.includes(nome) === true) continue;
      achadas.push({ caminho, nome });
    }
  }
  return achadas;
}

describe("administração: o contrato da ficha não sai da administração", () => {
  const simbolos = simbolosDosContratosAdmin();
  const fontes = arquivos(SRC, CODIGO).map((arquivo) => ({
    caminho: doRepositorio(arquivo),
    codigo: ler(arquivo),
  }));

  it("[CA-4] @spec:AC-11308 a lista de nomes dos contratos admin-* é montada dos exports reais", () => {
    expect(simbolos.size).toBeGreaterThan(50);
    for (const nome of [
      "esquemaDaFichaDaLoja",
      "esquemaDaSituacaoDaLoja",
      "FichaDaLojaNoContrato",
    ]) {
      expect(simbolos.has(nome), nome).toBe(true);
    }
  });

  it("[CA-4] @spec:AC-11308 nenhum arquivo fora da administração importa contrato admin-* (além das exceções nomeadas)", () => {
    expect(violacoes(fontes, simbolos)).toEqual([]);
  });

  it("[CA-4] @spec:AC-11308 cada exceção listada ainda existe (lista velha é removida)", () => {
    for (const [caminho, nomes] of Object.entries(EXCECOES)) {
      const fonte = fontes.find((f) => f.caminho === caminho);
      expect(fonte, `${caminho} sumiu: tire a exceção`).toBeDefined();
      const trazidos = nomesDoBarril(fonte?.codigo ?? "");
      for (const nome of nomes) {
        expect(trazidos, `${caminho} já não importa ${nome}`).toContain(nome);
      }
    }
  });

  it("[CA-4] @spec:AC-11308 a varredura FALHA quando um import novo aparece (caso sintético)", () => {
    const sintetico = [
      {
        caminho: "apps/web/src/features/loja/Nova.tsx",
        codigo: `import { esquemaDaFichaDaLoja, outraCoisa } from "@simpleclick/contracts";`,
      },
      {
        caminho: "apps/web/src/features/loja/Tipo.tsx",
        codigo: `import type {\n  FichaDaLojaNoContrato as Ficha,\n} from "@simpleclick/contracts";`,
      },
      {
        caminho: "apps/web/src/features/loja/Reexporta.ts",
        codigo: `export { esquemaDaSituacaoDaLoja } from "@simpleclick/contracts";`,
      },
      {
        // Um arquivo já liberado não ganha import de outro contrato admin.
        caminho: "apps/web/src/features/config/AvisoDeSuspensao.tsx",
        codigo: `import { esquemaDaFichaDaLoja } from "@simpleclick/contracts";`,
      },
    ];
    expect(violacoes(sintetico, simbolos)).toEqual([
      {
        caminho: "apps/web/src/features/loja/Nova.tsx",
        nome: "esquemaDaFichaDaLoja",
      },
      {
        caminho: "apps/web/src/features/loja/Tipo.tsx",
        nome: "FichaDaLojaNoContrato",
      },
      {
        caminho: "apps/web/src/features/loja/Reexporta.ts",
        nome: "esquemaDaSituacaoDaLoja",
      },
      {
        caminho: "apps/web/src/features/config/AvisoDeSuspensao.tsx",
        nome: "esquemaDaFichaDaLoja",
      },
    ]);
  });

  it("[CA-4] @spec:AC-11308 um nome local igual ao do contrato não é import (sem falso positivo)", () => {
    const local = [
      {
        caminho: "apps/web/src/features/loja/ApresentacaoDaLoja.tsx",
        codigo: `function SituacaoDaLoja() { return null }\nconst SITUACOES_DA_LOJA = [];`,
      },
    ];
    expect(violacoes(local, simbolos)).toEqual([]);
  });
});
