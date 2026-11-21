/**
 * A leitura única de `GET /v1/eu` por pedido (card #170, T-6; arquitetura 9).
 *
 * As guardas de /admin, /painel, /explorar e /conta decidem pelo que a API diz
 * agora. Aqui se prova o contrato dessa leitura: sem cookie não há chamada,
 * 401 é "sem sessão", qualquer falha é "indisponível" (quem chama decide se
 * fecha ou abre), a resposta é conferida pelo contrato, a espera é limitada, e
 * o `cache` do React faz layout e página dividirem a mesma pergunta.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ler, RAIZ_WEB } from "./apoio-painel-lojista.ts";

const ambiente = vi.hoisted(() => ({
  cookie: null as string | null,
  /** O que o `cache` do React guarda no pedido em curso (zerado a cada teste). */
  memorias: new Set<() => void>(),
}));

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers(ambiente.cookie === null ? {} : { cookie: ambiente.cookie }),
}));

// Fora do servidor de componentes o `cache` do React não guarda nada. Aqui ele
// guarda por "pedido" (zerado a cada teste), como o Next faz, para provar que
// as guardas do mesmo pedido dividem uma pergunta só.
vi.mock("react", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  cache: <A extends unknown[], R>(funcao: (...argumentos: A) => R) => {
    let guardado: { readonly valor: R } | undefined;
    ambiente.memorias.add(() => {
      guardado = undefined;
    });
    return (...argumentos: A): R => {
      guardado ??= { valor: funcao(...argumentos) };
      return guardado.valor;
    };
  },
}));

import {
  ESPERA_MAXIMA_DO_EU_EM_MS,
  euDoPedidoAtual,
  lerEuDosCookies,
} from "../src/server/eu-do-pedido.ts";

const TOKEN = "token-de-acesso-de-teste";
const COOKIE = `sc_access=${TOKEN}`;

const LOJA = {
  apelido: "pastelaria-da-vila",
  nome: "Pastelaria da Vila",
  papel: "OWNER",
  situacao: "ACTIVE",
} as const;

/** O corpo de `GET /v1/eu` que passa pelo contrato. */
function corpoDoEu(extras: Record<string, unknown> = {}) {
  return {
    identidade: {
      id: "5d1f0c7a-2b3e-4c5d-8e9f-0a1b2c3d4e5f",
      email: "pessoa@exemplo.test",
      nome: "Pessoa",
      papel: "CUSTOMER",
    },
    lojas: [],
    ...extras,
  };
}

function resposta(status: number, corpo: unknown): Response {
  return new Response(
    typeof corpo === "string" ? corpo : JSON.stringify(corpo),
    { status, headers: { "content-type": "application/json" } },
  );
}

let buscar: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  ambiente.cookie = null;
  for (const limpar of ambiente.memorias) limpar();
  buscar = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", buscar);
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.simpleclick.test");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("[CA-15] quem pediu a página, lido da API", () => {
  it("[CA-15] sem cookie de acesso não chama a API (o visitante não paga por isso)", async () => {
    expect(await lerEuDosCookies(null, buscar)).toEqual({
      estado: "sem-sessao",
    });
    // Só o cookie da loja, sem o de acesso: também é visitante.
    expect(await lerEuDosCookies("sc_loja=pastelaria", buscar)).toEqual({
      estado: "sem-sessao",
    });
    expect(buscar).not.toHaveBeenCalled();
  });

  it("[CA-15] pergunta ao /v1/eu com o token do cookie, sem cache e com espera limitada", async () => {
    buscar.mockResolvedValue(
      resposta(200, corpoDoEu({ adminDaPlataforma: true })),
    );

    const lido = await lerEuDosCookies(`sc_loja=x; ${COOKIE}`, buscar);

    expect(lido).toMatchObject({
      estado: "ok",
      token: TOKEN,
      eu: { adminDaPlataforma: true },
    });
    expect(buscar).toHaveBeenCalledTimes(1);
    const [url, opcoes] = buscar.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.simpleclick.test/v1/eu");
    expect(opcoes.method).toBe("GET");
    expect(opcoes.cache).toBe("no-store");
    expect(opcoes.signal).toBeInstanceOf(AbortSignal);
    expect(opcoes.signal?.aborted).toBe(false);
    expect(ESPERA_MAXIMA_DO_EU_EM_MS).toBe(2500);
    expect(new Headers(opcoes.headers).get("authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
  });

  it("[CA-15] 401 (token vencido, conta desativada ou anonimizada) é sem sessão", async () => {
    buscar.mockResolvedValue(resposta(401, { erro: "nao_autenticado" }));
    expect(await lerEuDosCookies(COOKIE, buscar)).toEqual({
      estado: "sem-sessao",
    });
  });

  const FALHAS: readonly (readonly [string, () => Promise<Response>])[] = [
    ["500", async () => resposta(500, { erro: "interno" })],
    ["403", async () => resposta(403, { erro: "proibido" })],
    ["503", async () => resposta(503, { erro: "indisponivel" })],
    [
      "tempo esgotado",
      async () => {
        throw new DOMException("tempo esgotado", "TimeoutError");
      },
    ],
    ["rede fora", async () => Promise.reject(new TypeError("fetch failed"))],
    ["JSON malformado", async () => resposta(200, "{não é json")],
    ["corpo nulo", async () => resposta(200, "null")],
    ["corpo que é lista", async () => resposta(200, [true])],
    ["sem identidade", async () => resposta(200, { lojas: [] })],
    [
      "campo fora do contrato",
      async () => resposta(200, corpoDoEu({ campoInventado: 1 })),
    ],
    [
      "adminDaPlataforma como texto",
      async () => resposta(200, corpoDoEu({ adminDaPlataforma: "true" })),
    ],
  ];

  for (const [falha, simular] of FALHAS) {
    it(`[CA-15] ${falha}: indisponível (quem chama decide se fecha ou abre)`, async () => {
      buscar.mockImplementation(simular);
      expect(await lerEuDosCookies(COOKIE, buscar)).toEqual({
        estado: "indisponivel",
      });
    });
  }

  it("[CA-15] a lista de lojas da conta chega como a API mandou", async () => {
    buscar.mockResolvedValue(
      resposta(200, corpoDoEu({ lojasDaConta: [LOJA], lojas: [LOJA] })),
    );
    const lido = await lerEuDosCookies(COOKIE, buscar);
    expect(lido.estado).toBe("ok");
    if (lido.estado === "ok") expect(lido.eu.lojasDaConta).toEqual([LOJA]);
  });
});

describe("[CA-15] uma pergunta por pedido", () => {
  it("[CA-15] layout, página e guardas do mesmo pedido dividem uma chamada só", async () => {
    ambiente.cookie = COOKIE;
    buscar.mockImplementation(async () => resposta(200, corpoDoEu()));

    const respostas = await Promise.all([
      euDoPedidoAtual(),
      euDoPedidoAtual(),
      euDoPedidoAtual(),
    ]);

    expect(buscar).toHaveBeenCalledTimes(1);
    expect(respostas[0]).toBe(respostas[1]);
    expect(respostas[1]).toBe(respostas[2]);
    expect(respostas[0]).toMatchObject({ estado: "ok", token: TOKEN });
  });

  it("[CA-15] um pedido novo pergunta de novo (nada é guardado entre pedidos)", async () => {
    ambiente.cookie = COOKIE;
    buscar.mockImplementation(async () => resposta(200, corpoDoEu()));
    await euDoPedidoAtual();
    for (const limpar of ambiente.memorias) limpar();
    await euDoPedidoAtual();
    expect(buscar).toHaveBeenCalledTimes(2);
  });

  it("[CA-15] visitante: o pedido não chama a API nenhuma vez", async () => {
    expect(await euDoPedidoAtual()).toEqual({ estado: "sem-sessao" });
    expect(buscar).not.toHaveBeenCalled();
  });
});

describe("[CA-15] prova estrutural", () => {
  const fonte = ler(`${RAIZ_WEB}/src/server/eu-do-pedido.ts`)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");

  it("[CA-15] decide pela API ao vivo: sem claim do JWT e com o cache do React por pedido", () => {
    expect(fonte).toContain("/v1/eu");
    expect(fonte).toMatch(/cache:\s*"no-store"/);
    expect(fonte).toMatch(/export const euDoPedidoAtual\s*=\s*cache\(/);
    expect(fonte).not.toMatch(/jwt|decode|atob|Buffer\.from/i);
  });
});
