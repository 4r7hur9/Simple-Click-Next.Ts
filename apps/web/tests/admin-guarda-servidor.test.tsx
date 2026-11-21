/**
 * Guarda da administração no servidor (card #163, T-1).
 *
 * Nenhuma tela de `/admin` sai do servidor sem a API confirmar, ao vivo, o
 * grant de administração (`adminDaPlataforma` do `GET /v1/eu`). Visitante ou
 * token vencido vão para `/entrar` com o destino conferido; qualquer outra
 * conta, ou qualquer falha da API, recebe 404 (fail closed). A varredura no
 * fim trava que toda página e layout do grupo `(admin)` chame a guarda.
 */
import { existsSync } from "node:fs";
import { join, relative } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { arquivos, ler, RAIZ_WEB } from "./apoio-painel-lojista.ts";

const { cookieDoPedido } = vi.hoisted(() => ({
  cookieDoPedido: { valor: null as string | null },
}));

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers(
      cookieDoPedido.valor === null ? {} : { cookie: cookieDoPedido.valor },
    ),
}));

/** Como o Next: `redirect` e `notFound` interrompem a renderização. */
class Redirecionou extends Error {
  constructor(readonly destino: string) {
    super(`NEXT_REDIRECT;${destino}`);
  }
}
class NaoEncontrado extends Error {
  constructor() {
    super("NEXT_HTTP_ERROR_FALLBACK;404");
  }
}

vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Redirecionou(destino);
  },
  notFound: () => {
    throw new NaoEncontrado();
  },
}));

vi.mock("../src/features/admin-dashboard/DashboardDoAdmin.tsx", () => ({
  DashboardDoAdmin: () => "painel de crescimento",
}));
vi.mock("../src/features/admin/HistoricoDaLoja.tsx", () => ({
  HistoricoDaLoja: () => "histórico da loja",
}));

import PaginaInicialDaAdministracao from "../src/app/(admin)/admin/page.tsx";
import PaginaDoHistorico from "../src/app/(admin)/admin/lojas/[id]/historico/page.tsx";
import {
  acessoDaAdministracao,
  exigirAdministracaoDaPlataforma,
} from "../src/server/acesso-da-administracao.ts";

const TOKEN = "token-de-acesso-de-teste";
const COOKIE = `sc_access=${TOKEN}`;
const ID_DA_LOJA = "5c1d0e2f-0000-4000-8000-000000000001";

const EU_DO_ADMIN = {
  identidade: { id: "1", email: "admin@exemplo.test", papel: "ADMIN" },
  lojas: [],
  adminDaPlataforma: true,
};

function resposta(status: number, corpo: unknown): Response {
  return new Response(
    typeof corpo === "string" ? corpo : JSON.stringify(corpo),
    {
      status,
      headers: { "content-type": "application/json" },
    },
  );
}

let buscar: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  cookieDoPedido.valor = null;
  buscar = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", buscar);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function recusa(promessa: Promise<unknown>): Promise<unknown> {
  try {
    await promessa;
  } catch (erro) {
    return erro;
  }
  throw new Error("a guarda deixou passar");
}

describe("[CA-1] visitante e token vencido vão para /entrar", () => {
  it("[CA-1] sem cookie de acesso não chama a API e manda para /entrar com o destino", async () => {
    const erro = await recusa(exigirAdministracaoDaPlataforma("/admin"));
    expect(erro).toBeInstanceOf(Redirecionou);
    expect((erro as Redirecionou).destino).toBe("/entrar?proximo=%2Fadmin");
    expect(buscar).not.toHaveBeenCalled();
  });

  it("[CA-1] 401 do /v1/eu (token vencido) em /admin/lojas/<id> manda para /entrar com o caminho da ficha", async () => {
    cookieDoPedido.valor = COOKIE;
    buscar.mockResolvedValue(resposta(401, { erro: "vencido" }));
    const caminho = `/admin/lojas/${ID_DA_LOJA}`;

    const erro = await recusa(exigirAdministracaoDaPlataforma(caminho));

    expect(erro).toBeInstanceOf(Redirecionou);
    expect((erro as Redirecionou).destino).toBe(
      `/entrar?proximo=${encodeURIComponent(caminho)}`,
    );
  });

  it("[CA-1] destino que não passa em destinoSeguro é descartado (só /entrar)", async () => {
    const erro = await recusa(
      exigirAdministracaoDaPlataforma("//golpe.example/admin"),
    );
    expect((erro as Redirecionou).destino).toBe("/entrar");
  });

  it("[CA-1] a página da ficha, sem sessão, não devolve a casca nem o texto da administração", async () => {
    const erro = await recusa(
      PaginaDoHistorico({ params: Promise.resolve({ id: ID_DA_LOJA }) }),
    );
    expect(erro).toBeInstanceOf(Redirecionou);
    expect((erro as Redirecionou).destino).toBe(
      `/entrar?proximo=${encodeURIComponent(`/admin/lojas/${ID_DA_LOJA}/historico`)}`,
    );
  });
});

describe("[CA-2] conta logada sem grant recebe 404 neutro", () => {
  const SEM_GRANT: readonly (readonly [string, unknown])[] = [
    ["dono", { identidade: { papel: "OWNER" }, adminDaPlataforma: false }],
    ["equipe", { identidade: { papel: "STAFF" }, adminDaPlataforma: false }],
    [
      "cliente",
      { identidade: { papel: "CUSTOMER" }, adminDaPlataforma: false },
    ],
    // O claim do token dizer ADMIN não basta: vale o grant ao vivo.
    [
      "claim ADMIN sem grant",
      { identidade: { papel: "ADMIN" }, adminDaPlataforma: false },
    ],
  ];

  for (const [quem, corpo] of SEM_GRANT) {
    it(`[CA-2] ${quem}: notFound, sem redirect`, async () => {
      cookieDoPedido.valor = COOKIE;
      buscar.mockResolvedValue(resposta(200, corpo));
      const erro = await recusa(exigirAdministracaoDaPlataforma("/admin"));
      expect(erro).toBeInstanceOf(NaoEncontrado);
    });
  }

  it("[CA-2] 403 do /v1/eu também é 404", async () => {
    cookieDoPedido.valor = COOKIE;
    buscar.mockResolvedValue(resposta(403, { erro: "proibido" }));
    expect(
      await recusa(exigirAdministracaoDaPlataforma("/admin")),
    ).toBeInstanceOf(NaoEncontrado);
  });

  it("[CA-2] a página inicial de um dono não renderiza o painel", async () => {
    cookieDoPedido.valor = COOKIE;
    buscar.mockResolvedValue(resposta(200, { adminDaPlataforma: false }));
    expect(await recusa(PaginaInicialDaAdministracao())).toBeInstanceOf(
      NaoEncontrado,
    );
  });
});

describe("[CA-3] conta com grant ativo passa", () => {
  it("[CA-3] pergunta ao /v1/eu com o token do cookie, sem cache, e deixa passar", async () => {
    cookieDoPedido.valor = COOKIE;
    buscar.mockResolvedValue(resposta(200, EU_DO_ADMIN));

    await expect(
      exigirAdministracaoDaPlataforma("/admin/lojas"),
    ).resolves.toBeUndefined();

    expect(buscar).toHaveBeenCalledTimes(1);
    const [url, opcoes] = buscar.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/v1\/eu$/);
    expect(opcoes.cache).toBe("no-store");
    expect(opcoes.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(opcoes.headers).get("authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
  });

  it("[CA-3] a página inicial do admin renderiza o painel", async () => {
    cookieDoPedido.valor = COOKIE;
    buscar.mockResolvedValue(resposta(200, EU_DO_ADMIN));
    const arvore = await PaginaInicialDaAdministracao();
    expect(arvore).not.toBeNull();
  });
});

describe("[CA-4] falha da API fecha (404)", () => {
  const FALHAS: readonly (readonly [string, () => Promise<Response>])[] = [
    ["500", async () => resposta(500, { erro: "interno" })],
    [
      "tempo esgotado",
      async () => {
        throw new DOMException("tempo esgotado", "TimeoutError");
      },
    ],
    ["rede fora", async () => Promise.reject(new TypeError("fetch failed"))],
    ["JSON malformado", async () => resposta(200, "{não é json")],
    ["corpo não objeto", async () => resposta(200, [true])],
    ["corpo nulo", async () => resposta(200, "null")],
    ["adminDaPlataforma ausente", async () => resposta(200, { lojas: [] })],
    [
      "adminDaPlataforma como texto",
      async () => resposta(200, { adminDaPlataforma: "true" }),
    ],
  ];

  for (const [falha, simular] of FALHAS) {
    it(`[CA-4] ${falha}: 404`, async () => {
      cookieDoPedido.valor = COOKIE;
      buscar.mockImplementation(simular);
      expect(await acessoDaAdministracao(COOKIE, buscar)).toBe("negado");
      expect(
        await recusa(exigirAdministracaoDaPlataforma("/admin")),
      ).toBeInstanceOf(NaoEncontrado);
    });
  }
});

const RAIZ_DO_REPOSITORIO = join(RAIZ_WEB, "../..");
const GRUPO_ADMIN = join(RAIZ_WEB, "src/app/(admin)");
const HELPER = join(RAIZ_WEB, "src/server/acesso-da-administracao.ts");

function semComentarios(codigo: string): string {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}

/** Toda página e layout do grupo que precisa chamar a guarda. */
function telasSemGuarda(
  fontes: readonly { readonly caminho: string; readonly codigo: string }[],
): string[] {
  return fontes
    .filter(({ caminho }) => /\/(page|layout)\.tsx$/.test(caminho))
    .filter(({ codigo }) => {
      const limpo = semComentarios(codigo);
      return !(
        /from\s+["'][./]+server\/acesso-da-administracao\.ts["']/.test(limpo) &&
        /\bawait\s+exigirAdministracaoDaPlataforma\s*\(/.test(limpo)
      );
    })
    .map(({ caminho }) => caminho);
}

describe("[CA-4] varredura: todo page/layout de (admin) chama a guarda", () => {
  const fontes = arquivos(GRUPO_ADMIN, [".ts", ".tsx"]).map((arquivo) => ({
    caminho: relative(RAIZ_DO_REPOSITORIO, arquivo).replaceAll("\\", "/"),
    codigo: ler(arquivo),
  }));

  it("[CA-4] há telas para varrer, inclusive o layout raiz e o da ficha", () => {
    const caminhos = fontes.map((f) => f.caminho);
    expect(
      caminhos.filter((c) => /\/(page|layout)\.tsx$/.test(c)).length,
    ).toBeGreaterThanOrEqual(13);
    expect(caminhos).toContain("apps/web/src/app/(admin)/admin/layout.tsx");
    expect(caminhos).toContain(
      "apps/web/src/app/(admin)/admin/lojas/[id]/layout.tsx",
    );
  });

  it("[CA-4] nenhuma página ou layout sem a guarda", () => {
    expect(telasSemGuarda(fontes)).toEqual([]);
  });

  it("[CA-4] a varredura reprova tela nova sem guarda (caso sintético)", () => {
    expect(
      telasSemGuarda([
        {
          caminho: "apps/web/src/app/(admin)/admin/nova/page.tsx",
          codigo: "export default function P() { return null }",
        },
        {
          caminho: "apps/web/src/app/(admin)/admin/comentada/page.tsx",
          codigo:
            'import { exigirAdministracaoDaPlataforma } from "../../../../server/acesso-da-administracao.ts";\n// await exigirAdministracaoDaPlataforma("/x");\nexport default function P() { return null }',
        },
      ]),
    ).toEqual([
      "apps/web/src/app/(admin)/admin/nova/page.tsx",
      "apps/web/src/app/(admin)/admin/comentada/page.tsx",
    ]);
  });

  it("[CA-4] sem 'use server' nem loading.tsx no grupo (nada responde antes da guarda)", () => {
    const comUseServer = fontes
      .filter(({ codigo }) => /["']use server["']/.test(semComentarios(codigo)))
      .map((f) => f.caminho);
    expect(comUseServer).toEqual([]);
    const todos = arquivos(GRUPO_ADMIN, [".ts", ".tsx", ".js", ".jsx"]);
    expect(todos.filter((a) => /\/loading\.(t|j)sx?$/.test(a))).toEqual([]);
  });

  it("[CA-4] a guarda decide pelo grant ao vivo, sem claim do JWT nem e-mail fixo", () => {
    expect(existsSync(HELPER)).toBe(true);
    const codigo = semComentarios(ler(HELPER));
    expect(codigo).toContain("/v1/eu");
    expect(codigo).toContain('"adminDaPlataforma"');
    expect(codigo).toMatch(/cache:\s*"no-store"/);
    expect(codigo).not.toMatch(/jwt|decode|atob|Buffer\.from|papel/i);
    expect(codigo).not.toMatch(/@[a-z0-9-]+\.[a-z]/i);
  });
});
