/**
 * A loja do painel vem da sessão, e não da configuração do servidor (T-115,
 * AC-135, AC-136).
 *
 * Sem rede: a API de mentira responde "quem sou eu" conforme o token que
 * recebe — o da dona Ana tem a loja dela, o do Bruno tem a dele — e guarda o
 * que o site encaminhou. A variável `NEXT_PUBLIC_DEV_STORE_SLUG` aponta para
 * uma terceira loja durante toda a prova: se o site ainda a lesse, o
 * encaminhamento iria para ela.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sessaoDoPedido = vi.hoisted(() => ({ cookie: null as string | null }));

// Só as guardas do painel (card #170) leem os cabeçalhos do pedido em curso;
// as provas de AC-135/AC-136 passam o cookie por parâmetro, como sempre.
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers(
      sessaoDoPedido.cookie === null ? {} : { cookie: sessaoDoPedido.cookie },
    ),
  cookies: async () => ({ set: vi.fn(), get: () => undefined }),
}));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`redirecionou:${destino}`);
  },
}));

import PaginaDeEscolhaDaLoja from "../src/app/(conta)/escolher-loja/page";
import { responderLojaPropria } from "../src/app/(conta)/escolher-loja/propria/responder-loja-propria";
import { GET as lerCategorias } from "../src/app/api/catalogo/categorias/route";
import { PUT as gravarSecao } from "../src/app/api/loja/[secao]/route";
import { GET as lerFila } from "../src/app/api/painel/pedidos/route";
import { emitirCupomParaImprimir } from "../src/server/cupom";
import { exigirLojaDaPagina } from "../src/server/loja-da-pagina";
import {
  lojaDoPainel,
  lojaEscolhivel,
  sessaoParaEncaminhar,
} from "../src/server/loja-do-painel";
import {
  LOJA_DA_SESSAO,
  OUTRA_LOJA_DA_SESSAO,
  quemSouEu,
} from "./apoio-da-loja-da-sessao";

const LOJA_DO_BRUNO = {
  apelido: "emporio-do-bruno",
  nome: "Empório do Bruno",
  papel: "OWNER",
  situacao: "ACTIVE",
} as const;

/** As lojas de cada token, como a API responderia a "quem sou eu". */
const LOJAS_POR_TOKEN: Record<string, readonly unknown[]> = {
  "token-da-ana": [LOJA_DA_SESSAO],
  "token-do-bruno": [LOJA_DO_BRUNO],
  "token-de-duas-lojas": [LOJA_DA_SESSAO, OUTRA_LOJA_DA_SESSAO],
  "token-sem-loja": [],
};

interface Chamada {
  readonly url: string;
  readonly autorizacao: string | null;
}

/** API de mentira: "quem sou eu" por token; o resto responde 200 e é guardado. */
function apiDeMentira(opcoes: { readonly foraDoAr?: boolean } = {}) {
  const perguntas: Chamada[] = [];
  const encaminhadas: Chamada[] = [];
  const buscar = (async (url: RequestInfo | URL, init?: RequestInit) => {
    if (opcoes.foraDoAr === true) throw new TypeError("fetch failed");
    const autorizacao = new Headers(init?.headers).get("authorization");
    const chamada = { url: String(url), autorizacao };
    if (String(url).endsWith("/v1/eu")) {
      perguntas.push(chamada);
      const token = autorizacao?.replace(/^Bearer /, "") ?? "";
      const lojas = LOJAS_POR_TOKEN[token];
      return lojas === undefined
        ? Response.json({ erro: "nao_autenticado" }, { status: 401 })
        : Response.json(quemSouEu(lojas));
    }
    encaminhadas.push(chamada);
    return Response.json({ itens: [] });
  }) as typeof fetch;
  return { buscar, perguntas, encaminhadas };
}

/** Um pedido do navegador ao site, com os cookies informados. */
function pedido(caminho: string, cookie?: string, metodo = "GET"): Request {
  return new Request(`https://simpleclick.test${caminho}`, {
    method: metodo,
    headers: {
      ...(cookie === undefined ? {} : { cookie }),
      ...(metodo === "GET"
        ? {}
        : {
            origin: "https://simpleclick.test",
            "sec-fetch-site": "same-origin",
            "content-type": "application/json",
          }),
    },
    ...(metodo === "PUT" ? { body: "{}" } : {}),
  });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.simpleclick.test");
  vi.stubEnv("NEXT_PUBLIC_DEV_STORE_SLUG", "loja-de-mais-ninguem");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("o painel encaminha para a loja da sessão (AC-135)", () => {
  it("@spec:AC-135 dois donos, cada um só alcança a própria loja", async () => {
    const api = apiDeMentira();
    vi.stubGlobal("fetch", api.buscar);

    await lerCategorias(
      pedido("/api/catalogo/categorias", "sc_access=token-da-ana"),
    );
    await lerFila(pedido("/api/painel/pedidos", "sc_access=token-do-bruno"));
    await gravarSecao(
      pedido("/api/loja/entrega", "sc_access=token-da-ana", "PUT"),
      { params: Promise.resolve({ secao: "entrega" }) },
    );

    expect(api.encaminhadas).toEqual([
      {
        url: `https://api.simpleclick.test/v1/lojas/${LOJA_DA_SESSAO.apelido}/catalogo/categorias`,
        autorizacao: "Bearer token-da-ana",
      },
      {
        url: `https://api.simpleclick.test/v1/lojas/${LOJA_DO_BRUNO.apelido}/pedidos`,
        autorizacao: "Bearer token-do-bruno",
      },
      {
        url: `https://api.simpleclick.test/v1/lojas/${LOJA_DA_SESSAO.apelido}/configuracao/entrega`,
        autorizacao: "Bearer token-da-ana",
      },
    ]);
    // Cada encaminhamento perguntou à API de quem é a sessão.
    expect(api.perguntas.map((p) => p.autorizacao)).toEqual([
      "Bearer token-da-ana",
      "Bearer token-do-bruno",
      "Bearer token-da-ana",
    ]);
    expect(JSON.stringify(api.encaminhadas)).not.toContain(
      "loja-de-mais-ninguem",
    );
  });

  it("@spec:AC-135 sem sessão não pergunta nada; sem loja, sessão vencida e API fora do ar não encaminham", async () => {
    const api = apiDeMentira();
    const semSessao = await sessaoParaEncaminhar(pedido("/x"), api.buscar);
    expect(semSessao).toBeInstanceOf(Response);
    expect((semSessao as Response).status).toBe(401);
    expect(api.perguntas).toHaveLength(0);

    const semLoja = await sessaoParaEncaminhar(
      pedido("/x", "sc_access=token-sem-loja"),
      api.buscar,
    );
    expect((semLoja as Response).status).toBe(403);
    expect(await (semLoja as Response).json()).toEqual({ erro: "sem_loja" });

    const vencida = await sessaoParaEncaminhar(
      pedido("/x", "sc_access=token-vencido"),
      api.buscar,
    );
    expect((vencida as Response).status).toBe(401);

    const foraDoAr = await sessaoParaEncaminhar(
      pedido("/x", "sc_access=token-da-ana"),
      apiDeMentira({ foraDoAr: true }).buscar,
    );
    expect((foraDoAr as Response).status).toBe(503);
    expect(api.encaminhadas).toHaveLength(0);
  });

  it("@spec:AC-135 nenhum arquivo do site lê NEXT_PUBLIC_DEV_STORE_SLUG", () => {
    const raiz = fileURLToPath(new URL("../src", import.meta.url));
    const leitores: string[] = [];
    const visitar = (pasta: string) => {
      for (const nome of readdirSync(pasta)) {
        const caminho = join(pasta, nome);
        if (statSync(caminho).isDirectory()) visitar(caminho);
        else if (/\.(ts|tsx|js|mjs)$/.test(nome)) {
          if (
            readFileSync(caminho, "utf8").includes("NEXT_PUBLIC_DEV_STORE_SLUG")
          ) {
            leitores.push(caminho);
          }
        }
      }
    };
    visitar(raiz);
    expect(leitores).toEqual([]);
  });
});

describe("a equipe entra no painel da loja em que trabalha (card #31)", () => {
  it("sessão de cliente sem `lojas` usa `lojasDaConta` e traz o papel e as permissões", async () => {
    const loja = {
      apelido: "pastelaria-da-vila",
      nome: "Pastelaria da Vila",
      papel: "STAFF",
      situacao: "ACTIVE",
      permissoes: ["loja.ver", "clientes"],
    };
    const buscar = (async () =>
      Response.json({
        ...quemSouEu([]),
        lojasDaConta: [loja],
      })) as unknown as typeof fetch;
    const decisao = await lojaDoPainel("sc_access=token-da-equipe", buscar);
    expect(decisao).toMatchObject({
      estado: "pronta",
      loja: { apelido: "pastelaria-da-vila", papel: "STAFF" },
    });
  });
});

describe("dono de mais de uma loja escolhe (AC-136)", () => {
  it("@spec:AC-136 sem escolha, o painel não encaminha e pede a escolha", async () => {
    const api = apiDeMentira();
    const decisao = await lojaDoPainel(
      "sc_access=token-de-duas-lojas",
      api.buscar,
    );
    expect(decisao).toMatchObject({
      estado: "escolher",
      escolhaInvalida: false,
    });

    const resposta = await sessaoParaEncaminhar(
      pedido("/x", "sc_access=token-de-duas-lojas"),
      api.buscar,
    );
    expect((resposta as Response).status).toBe(409);
    expect(await (resposta as Response).json()).toEqual({
      erro: "loja_nao_escolhida",
    });

    // O cupom também não emite via sem saber a loja.
    expect(
      await emitirCupomParaImprimir(
        "pedido-1",
        "sc_access=token-de-duas-lojas",
        api.buscar,
      ),
    ).toEqual({ estado: "escolher-loja" });
    expect(api.encaminhadas).toHaveLength(0);
  });

  it("@spec:AC-136 a escolha guardada vale só se a loja é da sessão; a que deixou de valer volta para a escolha", async () => {
    const api = apiDeMentira();
    const escolhida = await sessaoParaEncaminhar(
      pedido(
        "/x",
        `sc_access=token-de-duas-lojas; sc_loja=${OUTRA_LOJA_DA_SESSAO.apelido}`,
      ),
      api.buscar,
    );
    expect(escolhida).toEqual({
      token: "token-de-duas-lojas",
      apelido: OUTRA_LOJA_DA_SESSAO.apelido,
    });

    // Cookie de outra pessoa (ou de loja que saiu da conta): não abre nada,
    // nem mesmo para quem só tem uma loja — o site pede a escolha de novo.
    for (const token of ["token-de-duas-lojas", "token-da-ana"]) {
      const decisao = await lojaDoPainel(
        `sc_access=${token}; sc_loja=${LOJA_DO_BRUNO.apelido}`,
        api.buscar,
      );
      expect(decisao).toMatchObject({
        estado: "escolher",
        escolhaInvalida: true,
      });
    }
  });

  it("@spec:AC-136 escolher loja que não está na lista da sessão é recusado", async () => {
    const api = apiDeMentira();
    const decisao = await lojaDoPainel(
      "sc_access=token-de-duas-lojas",
      api.buscar,
    );
    expect(lojaEscolhivel(decisao, OUTRA_LOJA_DA_SESSAO.apelido)).toEqual(
      OUTRA_LOJA_DA_SESSAO,
    );
    expect(lojaEscolhivel(decisao, LOJA_DO_BRUNO.apelido)).toBeNull();
    expect(lojaEscolhivel(decisao, undefined)).toBeNull();
    expect(
      lojaEscolhivel({ estado: "sem-sessao" }, LOJA_DA_SESSAO.apelido),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Card #170, T-6 (CA-16): a escolha guardada que não vale mais
// ---------------------------------------------------------------------------

const LOJA_QUE_SAIU = "loja-que-saiu";

/** `GET /v1/eu` de uma pessoa, em qualquer papel, e a API fora do ar. */
function apiComEu(
  corpo: unknown,
  falha: "fora" | undefined = undefined,
): typeof fetch {
  return (async (url: RequestInfo | URL) => {
    if (falha === "fora") throw new TypeError("fetch failed");
    return String(url).endsWith("/v1/eu")
      ? Response.json(corpo)
      : Response.json({ itens: [] });
  }) as typeof fetch;
}

/** Para onde a guarda do painel manda a pessoa, ou "abre" se ela passa. */
async function destinoDaGuarda(cookie: string | null): Promise<string> {
  sessaoDoPedido.cookie = cookie;
  try {
    await exigirLojaDaPagina();
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    if (mensagem.startsWith("redirecionou:")) return mensagem.slice(13);
    throw erro;
  }
  return "abre";
}

describe("cookie sc_loja que não vale mais (card #170, CA-16)", () => {
  beforeEach(() => {
    sessaoDoPedido.cookie = null;
  });

  it("[CA-16] cookie de loja alheia com UMA loja na sessão passa por escolher-loja/propria", async () => {
    vi.stubGlobal("fetch", apiDeMentira().buscar);
    expect(
      await destinoDaGuarda(
        `sc_access=token-da-ana; sc_loja=${LOJA_DO_BRUNO.apelido}`,
      ),
    ).toBe("/escolher-loja/propria");
    // Loja que não existe: o site não diz qual é o caso, e faz o mesmo.
    expect(
      await destinoDaGuarda(`sc_access=token-da-ana; sc_loja=${LOJA_QUE_SAIU}`),
    ).toBe("/escolher-loja/propria");
  });

  it("[CA-16] com várias lojas vai para /escolher-loja, igual para loja inexistente e para loja alheia", async () => {
    vi.stubGlobal("fetch", apiDeMentira().buscar);
    const alheia = await destinoDaGuarda(
      `sc_access=token-de-duas-lojas; sc_loja=${LOJA_DO_BRUNO.apelido}`,
    );
    const inexistente = await destinoDaGuarda(
      `sc_access=token-de-duas-lojas; sc_loja=${LOJA_QUE_SAIU}`,
    );
    const semEscolha = await destinoDaGuarda("sc_access=token-de-duas-lojas");
    expect(alheia).toBe("/escolher-loja");
    expect(inexistente).toBe(alheia);
    expect(semEscolha).toBe(alheia);
    // Neutro: nada no endereço diz se a loja não existe ou é de outra pessoa.
    expect(alheia).not.toMatch(/[?&]/);
  });

  it("[CA-16] o texto da escolha de loja é idêntico para loja inexistente e para loja alheia", async () => {
    vi.stubGlobal("fetch", apiDeMentira().buscar);
    async function html(cookie: string): Promise<string> {
      sessaoDoPedido.cookie = cookie;
      return renderToStaticMarkup(
        await PaginaDeEscolhaDaLoja({ searchParams: Promise.resolve({}) }),
      );
    }
    const alheia = await html(
      `sc_access=token-de-duas-lojas; sc_loja=${LOJA_DO_BRUNO.apelido}`,
    );
    const inexistente = await html(
      `sc_access=token-de-duas-lojas; sc_loja=${LOJA_QUE_SAIU}`,
    );
    expect(alheia).toContain("A loja escolhida antes não abre mais");
    expect(inexistente).toBe(alheia);
    expect(alheia).not.toContain(LOJA_DO_BRUNO.apelido);
    expect(alheia).not.toContain(LOJA_QUE_SAIU);
  });

  it("[CA-16] sessaoParaEncaminhar continua 409 loja_nao_escolhida (as rotas de API não mudam)", async () => {
    const api = apiDeMentira();
    for (const token of ["token-da-ana", "token-de-duas-lojas"]) {
      const resposta = await sessaoParaEncaminhar(
        pedido("/x", `sc_access=${token}; sc_loja=${LOJA_DO_BRUNO.apelido}`),
        api.buscar,
      );
      expect((resposta as Response).status).toBe(409);
      expect(await (resposta as Response).json()).toEqual({
        erro: "loja_nao_escolhida",
      });
    }
    expect(api.encaminhadas).toHaveLength(0);
  });

  it("[CA-16] cliente sem vínculo em /painel vai para /explorar/produtos; administrador sem loja, para /admin", async () => {
    vi.stubGlobal("fetch", apiDeMentira().buscar);
    // A API de mentira devolve lojas vazias para este token: conta de cliente.
    expect(await destinoDaGuarda("sc_access=token-sem-loja")).toBe(
      "/explorar/produtos",
    );
    vi.stubGlobal(
      "fetch",
      apiComEu({
        ...quemSouEu([]),
        identidade: { ...quemSouEu([]).identidade, papel: "ADMIN" },
        adminDaPlataforma: true,
      }),
    );
    expect(await destinoDaGuarda("sc_access=token-do-admin")).toBe("/admin");
  });

  it("[CA-16] visitante vai para /entrar levando só /painel; API fora do ar fecha na escolha da loja", async () => {
    vi.stubGlobal("fetch", apiDeMentira().buscar);
    expect(await destinoDaGuarda(null)).toBe("/entrar?proximo=%2Fpainel");
    expect(await destinoDaGuarda("sc_access=token-vencido")).toBe(
      "/entrar?proximo=%2Fpainel",
    );
    vi.stubGlobal("fetch", apiDeMentira({ foraDoAr: true }).buscar);
    expect(await destinoDaGuarda("sc_access=token-da-ana")).toBe(
      "/escolher-loja",
    );
  });

  it("[CA-16] dono e equipe com a loja certa abrem o painel", async () => {
    vi.stubGlobal("fetch", apiDeMentira().buscar);
    expect(await destinoDaGuarda("sc_access=token-da-ana")).toBe("abre");
    expect(
      await destinoDaGuarda(
        `sc_access=token-da-ana; sc_loja=${LOJA_DA_SESSAO.apelido}`,
      ),
    ).toBe("abre");
  });
});

describe("escolher-loja/propria regrava a escolha com a única loja (card #170, CA-16)", () => {
  function pedidoDaLojaPropria(cookie: string | undefined, busca = ""): Request {
    return new Request(`https://simpleclick.test/escolher-loja/propria${busca}`, {
      headers: cookie === undefined ? {} : { cookie },
    });
  }

  it("[CA-16] regrava sc_loja com a loja da sessão e abre o painel com o aviso", async () => {
    const api = apiDeMentira();
    const resposta = await responderLojaPropria(
      pedidoDaLojaPropria(
        `sc_access=token-da-ana; sc_loja=${LOJA_DO_BRUNO.apelido}`,
      ),
      api.buscar,
    );
    expect(resposta.status).toBe(303);
    expect(resposta.headers.get("location")).toBe(
      "https://simpleclick.test/painel?loja=trocada",
    );
    expect(resposta.headers.get("cache-control")).toBe("no-store");
    const cookie = resposta.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`sc_loja=${LOJA_DA_SESSAO.apelido}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain(`Max-Age=${30 * 24 * 60 * 60}`);
    // A loja alheia do cookie antigo não volta em lugar nenhum.
    expect(JSON.stringify([...resposta.headers])).not.toContain(
      LOJA_DO_BRUNO.apelido,
    );
  });

  it("[CA-16] depois da troca o painel abre sem voltar à escolha (sem laço)", async () => {
    vi.stubGlobal("fetch", apiDeMentira().buscar);
    const resposta = await responderLojaPropria(
      pedidoDaLojaPropria(
        `sc_access=token-da-ana; sc_loja=${LOJA_DO_BRUNO.apelido}`,
      ),
      apiDeMentira().buscar,
    );
    const novoCookie = (resposta.headers.get("set-cookie") ?? "").split(";")[0];
    expect(await destinoDaGuarda(`sc_access=token-da-ana; ${novoCookie}`)).toBe(
      "abre",
    );
  });

  it("[CA-16] nada do endereço escolhe a loja: a consulta é ignorada", async () => {
    const resposta = await responderLojaPropria(
      pedidoDaLojaPropria(
        `sc_access=token-da-ana; sc_loja=${LOJA_DO_BRUNO.apelido}`,
        `?apelido=${LOJA_DO_BRUNO.apelido}&loja=${LOJA_DO_BRUNO.apelido}&proximo=https://golpe.example`,
      ),
      apiDeMentira().buscar,
    );
    expect(resposta.headers.get("set-cookie")).toContain(
      `sc_loja=${LOJA_DA_SESSAO.apelido}`,
    );
    expect(resposta.headers.get("location")).toBe(
      "https://simpleclick.test/painel?loja=trocada",
    );
  });

  it("[CA-16] com várias lojas não grava nada e vai para /escolher-loja", async () => {
    const resposta = await responderLojaPropria(
      pedidoDaLojaPropria(
        `sc_access=token-de-duas-lojas; sc_loja=${LOJA_DO_BRUNO.apelido}`,
      ),
      apiDeMentira().buscar,
    );
    expect(resposta.headers.get("location")).toBe(
      "https://simpleclick.test/escolher-loja",
    );
    expect(resposta.headers.get("set-cookie")).toBeNull();
  });

  it("[CA-16] sem sessão, sem loja ou com a API fora do ar não grava cookie nenhum", async () => {
    const api = apiDeMentira();
    const semSessao = await responderLojaPropria(
      pedidoDaLojaPropria(undefined),
      api.buscar,
    );
    expect(semSessao.headers.get("location")).toBe(
      "https://simpleclick.test/entrar?proximo=%2Fpainel",
    );
    const vencida = await responderLojaPropria(
      pedidoDaLojaPropria("sc_access=token-vencido"),
      api.buscar,
    );
    expect(vencida.headers.get("location")).toBe(
      "https://simpleclick.test/entrar?proximo=%2Fpainel",
    );
    const semLoja = await responderLojaPropria(
      pedidoDaLojaPropria("sc_access=token-sem-loja"),
      api.buscar,
    );
    expect(semLoja.headers.get("location")).toBe(
      "https://simpleclick.test/explorar/produtos",
    );
    const foraDoAr = await responderLojaPropria(
      pedidoDaLojaPropria("sc_access=token-da-ana"),
      apiDeMentira({ foraDoAr: true }).buscar,
    );
    expect(foraDoAr.headers.get("location")).toBe(
      "https://simpleclick.test/escolher-loja",
    );
    for (const r of [semSessao, vencida, semLoja, foraDoAr]) {
      expect(r.headers.get("set-cookie")).toBeNull();
    }
  });
});
