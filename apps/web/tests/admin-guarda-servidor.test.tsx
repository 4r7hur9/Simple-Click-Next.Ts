/**
 * Guarda da administração no servidor (card #163, T-1; card #170, T-6).
 *
 * Nenhuma tela de `/admin` sai do servidor sem a API confirmar, ao vivo, o
 * grant de administração (`adminDaPlataforma` do `GET /v1/eu`). Visitante ou
 * token vencido vão para a entrada própria da administração (`/admin/entrar`,
 * card #11) com o destino conferido (só o caminho);
 * qualquer outra conta é levada para a área do próprio papel (nunca 404 por
 * falta de permissão); qualquer falha da API é erro (fail closed). A
 * varredura no fim trava que toda página e layout do grupo `(admin)` chame a
 * guarda.
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
import { exigirAdministracaoDaPlataforma } from "../src/server/acesso-da-administracao.ts";
import { AreaIndisponivel } from "../src/server/area-do-papel.ts";

const TOKEN = "token-de-acesso-de-teste";
const COOKIE = `sc_access=${TOKEN}`;
const ID_DA_LOJA = "5c1d0e2f-0000-4000-8000-000000000001";

const EU_DO_ADMIN = corpoDoEu({ adminDaPlataforma: true }, "ADMIN");

const LOJA = {
  apelido: "pastelaria-da-vila",
  nome: "Pastelaria da Vila",
  situacao: "ACTIVE",
} as const;

/** O corpo de `GET /v1/eu` que passa pelo contrato do site. */
function corpoDoEu(
  extras: Record<string, unknown> = {},
  papelDoToken = "CUSTOMER",
) {
  return {
    identidade: {
      id: "5d1f0c7a-2b3e-4c5d-8e9f-0a1b2c3d4e5f",
      email: "pessoa@exemplo.test",
      nome: "Pessoa",
      papel: papelDoToken,
    },
    lojas: [],
    ...extras,
  };
}

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

describe("[CA-4] visitante e token vencido vão para /admin/entrar", () => {
  it("[CA-4] sem cookie de acesso não chama a API e manda para /admin/entrar com o destino", async () => {
    const erro = await recusa(exigirAdministracaoDaPlataforma("/admin"));
    expect(erro).toBeInstanceOf(Redirecionou);
    expect((erro as Redirecionou).destino).toBe(
      "/admin/entrar?proximo=%2Fadmin",
    );
    expect(buscar).not.toHaveBeenCalled();
  });

  it("[CA-4] 401 do /v1/eu (token vencido) em /admin/lojas/<id> manda para /admin/entrar com o caminho da ficha", async () => {
    cookieDoPedido.valor = COOKIE;
    buscar.mockResolvedValue(resposta(401, { erro: "vencido" }));
    const caminho = `/admin/lojas/${ID_DA_LOJA}`;

    const erro = await recusa(exigirAdministracaoDaPlataforma(caminho));

    expect(erro).toBeInstanceOf(Redirecionou);
    expect((erro as Redirecionou).destino).toBe(
      `/admin/entrar?proximo=${encodeURIComponent(caminho)}`,
    );
  });

  it("[CA-4] destino que não passa em destinoSeguro é descartado (só /admin/entrar)", async () => {
    const erro = await recusa(
      exigirAdministracaoDaPlataforma("//golpe.example/admin"),
    );
    expect((erro as Redirecionou).destino).toBe("/admin/entrar");
  });

  it("[CA-4] a página da ficha, sem sessão, não devolve a casca nem o texto da administração", async () => {
    const erro = await recusa(
      PaginaDoHistorico({ params: Promise.resolve({ id: ID_DA_LOJA }) }),
    );
    expect(erro).toBeInstanceOf(Redirecionou);
    expect((erro as Redirecionou).destino).toBe(
      `/admin/entrar?proximo=${encodeURIComponent(`/admin/lojas/${ID_DA_LOJA}/historico`)}`,
    );
  });
});

describe("[CA-15] conta logada sem grant vai para a área do próprio papel", () => {
  const SEM_GRANT: readonly (readonly [string, unknown, string])[] = [
    [
      "dono",
      corpoDoEu(
        {
          adminDaPlataforma: false,
          lojas: [{ ...LOJA, papel: "OWNER" }],
          lojasDaConta: [{ ...LOJA, papel: "OWNER" }],
        },
        "OWNER",
      ),
      "/painel",
    ],
    [
      "equipe",
      corpoDoEu({
        adminDaPlataforma: false,
        lojasDaConta: [{ ...LOJA, papel: "STAFF" }],
      }),
      "/painel",
    ],
    [
      "cliente",
      corpoDoEu({ adminDaPlataforma: false }),
      "/explorar/produtos",
    ],
    // O claim do token dizer ADMIN não basta: vale o grant ao vivo.
    [
      "claim ADMIN sem grant",
      corpoDoEu({ adminDaPlataforma: false }, "ADMIN"),
      "/explorar/produtos",
    ],
    [
      "claim ADMIN e grant ausente na resposta",
      corpoDoEu({}, "ADMIN"),
      "/explorar/produtos",
    ],
  ];

  for (const [quem, corpo, destino] of SEM_GRANT) {
    it(`[CA-15] ${quem}: redirect para ${destino}, nunca 404`, async () => {
      cookieDoPedido.valor = COOKIE;
      buscar.mockResolvedValue(resposta(200, corpo));
      const erro = await recusa(exigirAdministracaoDaPlataforma("/admin"));
      expect(erro).toBeInstanceOf(Redirecionou);
      expect((erro as Redirecionou).destino).toBe(destino);
    });
  }

  it("[CA-15] a página inicial de um dono não renderiza o painel: vai para /painel", async () => {
    cookieDoPedido.valor = COOKIE;
    buscar.mockResolvedValue(
      resposta(
        200,
        corpoDoEu({ lojasDaConta: [{ ...LOJA, papel: "OWNER" }] }, "OWNER"),
      ),
    );
    const erro = await recusa(PaginaInicialDaAdministracao());
    expect(erro).toBeInstanceOf(Redirecionou);
    expect((erro as Redirecionou).destino).toBe("/painel");
  });

  it("[CA-15] a ficha de uma loja, para o cliente, também vai para a área dele (sem HTML da administração)", async () => {
    cookieDoPedido.valor = COOKIE;
    buscar.mockResolvedValue(resposta(200, corpoDoEu()));
    const erro = await recusa(
      PaginaDoHistorico({ params: Promise.resolve({ id: ID_DA_LOJA }) }),
    );
    expect(erro).toBeInstanceOf(Redirecionou);
    expect((erro as Redirecionou).destino).toBe("/explorar/produtos");
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

describe("[CA-15] falha da API fecha com erro (nunca 404)", () => {
  const FALHAS: readonly (readonly [string, () => Promise<Response>])[] = [
    ["500", async () => resposta(500, { erro: "interno" })],
    ["403 do /v1/eu", async () => resposta(403, { erro: "proibido" })],
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
    ["identidade ausente", async () => resposta(200, { lojas: [] })],
    [
      "adminDaPlataforma como texto",
      async () => resposta(200, corpoDoEu({ adminDaPlataforma: "true" })),
    ],
  ];

  for (const [falha, simular] of FALHAS) {
    it(`[CA-15] ${falha}: erro de API indisponível`, async () => {
      cookieDoPedido.valor = COOKIE;
      buscar.mockImplementation(simular);
      const erro = await recusa(exigirAdministracaoDaPlataforma("/admin"));
      expect(erro).toBeInstanceOf(AreaIndisponivel);
      expect(erro).not.toBeInstanceOf(NaoEncontrado);
      expect(erro).not.toBeInstanceOf(Redirecionou);
    });
  }

  it("[CA-15] a página inicial não renderiza o painel quando a API não confirma quem é a pessoa", async () => {
    cookieDoPedido.valor = COOKIE;
    buscar.mockResolvedValue(resposta(500, { erro: "interno" }));
    expect(await recusa(PaginaInicialDaAdministracao())).toBeInstanceOf(
      AreaIndisponivel,
    );
  });
});

const RAIZ_DO_REPOSITORIO = join(RAIZ_WEB, "../..");
const GRUPO_ADMIN = join(RAIZ_WEB, "src/app/(admin)");
const HELPER = join(RAIZ_WEB, "src/server/acesso-da-administracao.ts");
const DECISAO = join(RAIZ_WEB, "src/server/area-do-papel.ts");
const LEITURA_DO_EU = join(RAIZ_WEB, "src/server/eu-do-pedido.ts");

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

  it("[CA-15] a guarda decide pelo grant ao vivo, sem claim do JWT, sem e-mail fixo e sem 404", () => {
    expect(existsSync(HELPER)).toBe(true);
    expect(existsSync(DECISAO)).toBe(true);
    expect(existsSync(LEITURA_DO_EU)).toBe(true);
    // A leitura ao vivo: /v1/eu, sem cache, e nada do token é decodificado.
    const leitura = semComentarios(ler(LEITURA_DO_EU));
    expect(leitura).toContain("/v1/eu");
    expect(leitura).toMatch(/cache:\s*"no-store"/);
    // A decisão: o grant que a API informa agora.
    const decisao = semComentarios(ler(DECISAO));
    expect(decisao).toContain("adminDaPlataforma");
    expect(decisao).toContain("euDoPedidoAtual");
    // A guarda pública da administração continua sendo só um delegado.
    const guarda = semComentarios(ler(HELPER));
    expect(guarda).toContain("exigirAreaDaAdministracao");
    for (const codigo of [leitura, decisao, guarda]) {
      expect(codigo).not.toMatch(/jwt|decode|atob|Buffer\.from/i);
      expect(codigo).not.toMatch(/@[a-z0-9-]+\.[a-z]/i);
      expect(codigo).not.toMatch(/notFound/);
    }
  });
});
