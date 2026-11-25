/**
 * A matriz de papéis × áreas (card #170, T-6, D-10; CA-15).
 *
 * Quem abre uma área que não é a sua é levado pelo SERVIDOR para a área do
 * próprio papel, sem 404 e sem nenhum HTML da área pedida. O destino sai de
 * uma lista fixa (`DESTINO_DO_PAPEL`) e nunca do endereço, e nenhum desvio
 * leva de volta à própria área de origem. As guardas reais (a da
 * administração, a do painel, o layout do explorar e as páginas de /conta)
 * rodam contra uma API de mentira que responde "quem sou eu" por pessoa.
 *
 * Papéis: administrador, administrador que também é dono, dono, equipe e
 * cliente; mais o visitante, o token vencido e a API fora do ar.
 * Áreas: /admin, /painel, /explorar, /conta/pedidos, /conta/favoritos e
 * /conta/dados.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ler, RAIZ_WEB } from "./apoio-painel-lojista.ts";

const ambiente = vi.hoisted(() => ({
  cookie: null as string | null,
  /** O que o `cache` do React guarda no pedido em curso. */
  memorias: new Set<() => void>(),
}));

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers(ambiente.cookie === null ? {} : { cookie: ambiente.cookie }),
  cookies: async () => ({
    get: (nome: string) => {
      for (const par of (ambiente.cookie ?? "").split(";")) {
        const [chave, ...valor] = par.trim().split("=");
        if (chave === nome) return { value: valor.join("=") };
      }
      return undefined;
    },
  }),
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
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

// Fora do servidor de componentes o `cache` do React não guarda nada. Aqui ele
// guarda por "pedido": cada abertura de área zera a memória, como um pedido novo.
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

const indisponivel = vi.hoisted(() => async () => ({
  estado: "indisponivel" as const,
}));

vi.mock("../src/lib/meus-pedidos.ts", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  buscarMeusPedidos: indisponivel,
  buscarMeuPedido: indisponivel,
}));
vi.mock("../src/lib/conta-do-cliente.ts", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  buscarMetricasDaConta: indisponivel,
  buscarDadosDaConta: indisponivel,
  buscarFavoritos: indisponivel,
  buscarRecentes: indisponivel,
  buscarSessoesAbertas: indisponivel,
  buscarAceites: indisponivel,
}));
vi.mock("../src/server/actions/conta.ts", () => ({
  sairDepoisDeExcluirAConta: vi.fn(),
}));
vi.mock("../src/server/actions/auth.ts", () => ({
  sairPelaBarra: vi.fn(),
  sairDaConta: vi.fn(),
  encerrarTodasAsSessoes: vi.fn(),
}));
vi.mock("../src/server/actions/loja.ts", () => ({
  escolherLojaDoPainel: vi.fn(),
}));

import PaginaDoExplorar from "../src/app/(explorar)/explorar/page.tsx";
import PaginaDeLojasDoExplorar from "../src/app/(explorar)/explorar/lojas/page.tsx";
import PaginaDeProdutosDoExplorar from "../src/app/(explorar)/explorar/produtos/page.tsx";
import LayoutDoExplorar from "../src/app/(explorar)/explorar/layout.tsx";
import PaginaInicialDaConta from "../src/app/(conta)/conta/page.tsx";
import PaginaDeDados from "../src/app/(conta)/conta/dados/page.tsx";
import PaginaDosMeusEnderecos from "../src/app/(conta)/conta/enderecos/page.tsx";
import PaginaDeFavoritos from "../src/app/(conta)/conta/favoritos/page.tsx";
import LayoutDeMeusPedidos from "../src/app/(conta)/conta/pedidos/layout.tsx";
import PaginaDeMeusPedidos from "../src/app/(conta)/conta/pedidos/page.tsx";
import PaginaDeSeguranca from "../src/app/(conta)/conta/seguranca/page.tsx";
import {
  AreaIndisponivel,
  caminhoDoProximo,
  decidirArea,
  DESTINO_DO_PAPEL,
  papelDoEu,
  temLojaNaConta,
  type AreaDoSite,
} from "../src/server/area-do-papel.ts";
import { exigirAdministracaoDaPlataforma } from "../src/server/acesso-da-administracao.ts";
import { exigirLojaDaPagina } from "../src/server/loja-da-pagina.ts";
import { DESTINO_DO_CLIENTE, destinoDoPapel } from "../src/server/sessao.ts";
import type { EuDoPedido } from "../src/server/eu-do-pedido.ts";

// ---------------------------------------------------------------------------
// As pessoas e a API de mentira
// ---------------------------------------------------------------------------

const TOKEN = "token-de-acesso-de-teste";
const COOKIE = `sc_access=${TOKEN}`;

function loja(papel: "OWNER" | "STAFF") {
  return {
    apelido: "pastelaria-da-vila",
    nome: "Pastelaria da Vila",
    papel,
    situacao: "ACTIVE" as const,
  };
}

/** O corpo de `GET /v1/eu`, conferido pelo contrato do site. */
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

const PESSOAS = {
  admin: corpoDoEu({ adminDaPlataforma: true, papelEfetivo: "ADMIN" }, "ADMIN"),
  "admin que também é dono": corpoDoEu(
    {
      adminDaPlataforma: true,
      papelEfetivo: "ADMIN",
      lojas: [loja("OWNER")],
      lojasDaConta: [loja("OWNER")],
    },
    "ADMIN",
  ),
  dono: corpoDoEu(
    {
      papelEfetivo: "DONO",
      adminDaPlataforma: false,
      lojas: [loja("OWNER")],
      lojasDaConta: [loja("OWNER")],
    },
    "OWNER",
  ),
  equipe: corpoDoEu({
    papelEfetivo: "EQUIPE",
    adminDaPlataforma: false,
    lojas: [],
    lojasDaConta: [loja("STAFF")],
  }),
  cliente: corpoDoEu({ papelEfetivo: "CLIENTE", adminDaPlataforma: false }),
} as const;

type Pessoa = keyof typeof PESSOAS;
type Cenario = Pessoa | "visitante" | "token vencido" | "API fora do ar";

const CENARIOS: readonly Cenario[] = [
  "admin",
  "admin que também é dono",
  "dono",
  "equipe",
  "cliente",
  "visitante",
  "token vencido",
  "API fora do ar",
];

let leiturasDoEu = 0;

/** Liga a API de mentira e o cookie do cenário. */
function prepararCenario(cenario: Cenario): void {
  ambiente.cookie = cenario === "visitante" ? null : COOKIE;
  vi.stubGlobal("fetch", (async (url: RequestInfo | URL) => {
    if (!String(url).endsWith("/v1/eu")) {
      return Response.json({ erro: "indisponivel" }, { status: 503 });
    }
    leiturasDoEu += 1;
    if (cenario === "API fora do ar") throw new TypeError("fetch failed");
    if (cenario === "token vencido") {
      return Response.json({ erro: "nao_autenticado" }, { status: 401 });
    }
    if (cenario === "visitante") throw new Error("visitante não chama a API");
    return Response.json(PESSOAS[cenario]);
  }) as typeof fetch);
}

// ---------------------------------------------------------------------------
// As áreas: cada uma abre pela guarda REAL
// ---------------------------------------------------------------------------

type Area =
  | "/admin"
  | "/painel"
  | "/explorar"
  | "/conta/pedidos"
  | "/conta/favoritos"
  | "/conta/dados";

const AREAS: readonly Area[] = [
  "/admin",
  "/painel",
  "/explorar",
  "/conta/pedidos",
  "/conta/favoritos",
  "/conta/dados",
];

const ABRIR: Readonly<Record<Area, () => Promise<unknown>>> = {
  "/admin": () => exigirAdministracaoDaPlataforma("/admin"),
  "/painel": () => exigirLojaDaPagina(),
  "/explorar": async () => LayoutDoExplorar({ children: null }),
  "/conta/pedidos": async () =>
    PaginaDeMeusPedidos({ searchParams: Promise.resolve({}) }),
  "/conta/favoritos": async () => PaginaDeFavoritos(),
  "/conta/dados": async () => PaginaDeDados(),
};

type Resultado =
  | { readonly tipo: "passa" }
  | { readonly tipo: "vai"; readonly destino: string }
  | { readonly tipo: "erro-de-api" };

/** Abre a área como um pedido novo e diz o que aconteceu. */
async function abrir(
  area: Area,
  executar: () => Promise<unknown> = ABRIR[area],
): Promise<Resultado> {
  for (const limpar of ambiente.memorias) limpar();
  leiturasDoEu = 0;
  try {
    await executar();
    return { tipo: "passa" };
  } catch (erro) {
    if (erro instanceof Redirecionou) {
      return { tipo: "vai", destino: erro.destino };
    }
    if (erro instanceof AreaIndisponivel) return { tipo: "erro-de-api" };
    throw erro;
  }
}

const vai = (destino: string): Resultado => ({ tipo: "vai", destino });
const PASSA: Resultado = { tipo: "passa" };
const ERRO_DE_API: Resultado = { tipo: "erro-de-api" };

const ENTRAR = (caminho: string) =>
  `/entrar?proximo=${encodeURIComponent(caminho)}`;

/** A entrada própria da administração (card #11): só o `/admin` usa. */
const ENTRAR_NA_ADMINISTRACAO = (caminho: string) =>
  `/admin/entrar?proximo=${encodeURIComponent(caminho)}`;

/** O que cada cenário encontra em cada área (a matriz da decisão D-10). */
const ESPERADO: Readonly<Record<Area, Readonly<Record<Cenario, Resultado>>>> = {
  "/admin": {
    admin: PASSA,
    "admin que também é dono": PASSA,
    dono: vai("/painel"),
    equipe: vai("/painel"),
    cliente: vai("/explorar/produtos"),
    visitante: vai(ENTRAR_NA_ADMINISTRACAO("/admin")),
    "token vencido": vai(ENTRAR_NA_ADMINISTRACAO("/admin")),
    "API fora do ar": ERRO_DE_API,
  },
  "/painel": {
    admin: vai("/admin"),
    "admin que também é dono": PASSA,
    dono: PASSA,
    equipe: PASSA,
    cliente: vai("/explorar/produtos"),
    visitante: vai(ENTRAR("/painel")),
    "token vencido": vai(ENTRAR("/painel")),
    // Fecha: o painel não abre, e a escolha da loja explica a falha.
    "API fora do ar": vai("/escolher-loja"),
  },
  "/explorar": {
    admin: vai("/admin"),
    "admin que também é dono": vai("/admin"),
    dono: PASSA,
    equipe: PASSA,
    cliente: PASSA,
    // Abre na falha: só o administrador confirmado é desviado.
    visitante: PASSA,
    "token vencido": PASSA,
    "API fora do ar": PASSA,
  },
  "/conta/pedidos": {
    admin: vai("/admin"),
    "admin que também é dono": vai("/admin"),
    dono: PASSA,
    equipe: PASSA,
    cliente: PASSA,
    visitante: vai(ENTRAR("/conta/pedidos")),
    "token vencido": PASSA,
    "API fora do ar": PASSA,
  },
  "/conta/favoritos": {
    admin: vai("/admin"),
    "admin que também é dono": vai("/admin"),
    dono: PASSA,
    equipe: PASSA,
    cliente: PASSA,
    visitante: vai(ENTRAR("/conta/favoritos")),
    "token vencido": PASSA,
    "API fora do ar": PASSA,
  },
  "/conta/dados": {
    admin: vai("/admin?conta=dados"),
    "admin que também é dono": vai("/admin?conta=dados"),
    dono: vai("/conta/pedidos?conta=dados"),
    equipe: vai("/conta/pedidos?conta=dados"),
    cliente: vai("/conta/pedidos?conta=dados"),
    visitante: vai(ENTRAR("/conta/dados")),
    "token vencido": vai("/conta/pedidos?conta=dados"),
    "API fora do ar": vai("/conta/pedidos?conta=dados"),
  },
};

beforeEach(() => {
  ambiente.cookie = null;
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.simpleclick.test");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("[CA-15] a matriz de papéis × áreas", () => {
  for (const area of AREAS) {
    for (const cenario of CENARIOS) {
      it(`[CA-15] ${cenario} em ${area}`, async () => {
        prepararCenario(cenario);
        expect(await abrir(area)).toEqual(ESPERADO[area][cenario]);
      });
    }
  }

  it("[CA-15] a matriz cobre todas as áreas e todos os cenários", () => {
    expect(Object.keys(ESPERADO).sort()).toEqual([...AREAS].sort());
    for (const area of AREAS) {
      expect(Object.keys(ESPERADO[area]).sort()).toEqual([...CENARIOS].sort());
    }
  });
});

describe("[CA-15] os destinos vêm só da lista fixa, e nunca da própria área", () => {
  it("[CA-15] a lista fixa de destinos por papel", () => {
    expect(DESTINO_DO_PAPEL).toEqual({
      admin: "/admin",
      dono: "/painel",
      equipe: "/painel",
      cliente: "/explorar/produtos",
    });
    // Uma lista só: o destino de depois do login diz o mesmo.
    expect(destinoDoPapel("ADMIN")).toBe(DESTINO_DO_PAPEL.admin);
    expect(destinoDoPapel("OWNER")).toBe(DESTINO_DO_PAPEL.dono);
    expect(DESTINO_DO_CLIENTE).toBe(DESTINO_DO_PAPEL.cliente);
  });

  const PERMITIDOS = new Set<string>([
    ...Object.values(DESTINO_DO_PAPEL),
    "/escolher-loja",
    "/entrar",
    "/admin/entrar",
  ]);

  it("[CA-15] todo desvio da matriz aponta para a lista fixa, para /entrar ou para a escolha da loja", () => {
    for (const area of AREAS) {
      for (const cenario of CENARIOS) {
        const esperado = ESPERADO[area][cenario];
        if (esperado.tipo !== "vai") continue;
        const caminho = new URL(esperado.destino, "https://x.test").pathname;
        const aprovado =
          PERMITIDOS.has(caminho) ||
          // O modal "Minha conta" sobre a área do papel (ou sobre Pedidos).
          caminho === "/conta/pedidos";
        expect(aprovado, `${cenario} em ${area} → ${esperado.destino}`).toBe(
          true,
        );
      }
    }
  });

  it("[CA-15] nenhum desvio leva à própria área de origem", () => {
    for (const area of AREAS) {
      for (const cenario of CENARIOS) {
        const esperado = ESPERADO[area][cenario];
        if (esperado.tipo !== "vai") continue;
        const destino = new URL(esperado.destino, "https://x.test").pathname;
        expect(destino, `${cenario} em ${area}`).not.toBe(area);
      }
    }
  });

  it("[CA-15] nenhum cenário recebe 404 por falta de permissão", async () => {
    for (const area of AREAS) {
      for (const cenario of CENARIOS) {
        prepararCenario(cenario);
        // `abrir` relança qualquer erro que não seja redirect nem API fora:
        // um `notFound()` apareceria aqui como NaoEncontrado.
        await expect(
          abrir(area),
          `${cenario} em ${area}`,
        ).resolves.toBeDefined();
      }
    }
  });

  it("[CA-15] visitante e token vencido levam só o caminho em proximo, nunca consulta", async () => {
    for (const cenario of ["visitante", "token vencido"] as const) {
      prepararCenario(cenario);
      for (const area of ["/admin", "/painel"] as const) {
        const resultado = await abrir(area);
        expect(resultado.tipo).toBe("vai");
        if (resultado.tipo !== "vai") continue;
        const destino = new URL(resultado.destino, "https://x.test");
        expect(destino.pathname).toBe(
          area === "/admin" ? "/admin/entrar" : "/entrar",
        );
        expect([...destino.searchParams.keys()]).toEqual(["proximo"]);
        expect(destino.searchParams.get("proximo")).toBe(area);
        expect(resultado.destino).not.toMatch(/%3F|%23/i);
      }
    }
  });

  it("[CA-15] caminho com consulta ou de fora vira só o caminho seguro, ou nada", async () => {
    expect(caminhoDoProximo("/admin")).toBe("/admin");
    expect(
      caminhoDoProximo("/admin/lojas?situacao=PENDING_APPROVAL&pagina=2"),
    ).toBe("/admin/lojas");
    expect(caminhoDoProximo("/admin#topo")).toBe("/admin");
    expect(caminhoDoProximo("//golpe.example/admin")).toBeUndefined();
    expect(caminhoDoProximo("https://golpe.example")).toBeUndefined();
    expect(caminhoDoProximo("/api/admin/lojas")).toBeUndefined();
    expect(caminhoDoProximo("/entrar")).toBeUndefined();

    prepararCenario("visitante");
    expect(
      await abrir("/admin", () =>
        exigirAdministracaoDaPlataforma(
          "/admin/lojas?proximo=https://golpe.example",
        ),
      ),
    ).toEqual(vai(ENTRAR_NA_ADMINISTRACAO("/admin/lojas")));
    expect(
      await abrir("/admin", () =>
        exigirAdministracaoDaPlataforma("//golpe.example/admin"),
      ),
    ).toEqual(vai("/admin/entrar"));
  });

  it("[CA-15] o endereço, o cookie da loja e os cabeçalhos do pedido não escolhem o destino", async () => {
    prepararCenario("cliente");
    ambiente.cookie = `${COOKIE}; sc_loja=https://golpe.example/painel`;
    expect(await abrir("/painel")).toEqual(vai("/explorar/produtos"));
    expect(await abrir("/admin")).toEqual(vai("/explorar/produtos"));
  });
});

describe("[CA-15] sem laço: cada caminho termina em no máximo três endereços", () => {
  /** Quem trata cada endereço: a guarda real, ou nada (tela aberta). */
  function guardaDe(endereco: string): { area: Area } | null {
    const caminho = new URL(endereco, "https://x.test").pathname;
    if (caminho === "/admin") return { area: "/admin" };
    if (caminho === "/painel") return { area: "/painel" };
    if (caminho.startsWith("/explorar")) return { area: "/explorar" };
    if (caminho === "/conta/pedidos") return { area: "/conta/pedidos" };
    if (caminho === "/conta/favoritos") return { area: "/conta/favoritos" };
    if (caminho === "/conta/dados") return { area: "/conta/dados" };
    return null;
  }

  async function seguir(inicio: string): Promise<string[]> {
    const trajeto = [inicio];
    for (let salto = 0; salto < 6; salto += 1) {
      const guarda = guardaDe(trajeto[trajeto.length - 1] ?? "");
      if (guarda === null) return trajeto;
      const resultado = await abrir(guarda.area);
      if (resultado.tipo !== "vai") return trajeto;
      trajeto.push(resultado.destino);
    }
    throw new Error(`laço: ${trajeto.join(" → ")}`);
  }

  for (const cenario of CENARIOS) {
    it(`[CA-15] ${cenario}: qualquer área termina sem laço`, async () => {
      prepararCenario(cenario);
      for (const area of AREAS) {
        const trajeto = await seguir(area);
        expect(
          trajeto.length,
          `${area}: ${trajeto.join(" → ")}`,
        ).toBeLessThanOrEqual(3);
      }
    });
  }
});

describe("[CA-15] uma leitura de /v1/eu por pedido", () => {
  it("[CA-15] nenhuma área lê /v1/eu mais de uma vez no mesmo pedido (e o visitante, nenhuma)", async () => {
    for (const cenario of CENARIOS) {
      prepararCenario(cenario);
      for (const area of AREAS) {
        await abrir(area);
        expect(leiturasDoEu, `${cenario} em ${area}`).toBeLessThanOrEqual(
          cenario === "visitante" ? 0 : 1,
        );
      }
    }
  });
});

describe("[CA-15] as demais páginas das áreas de cliente também desviam o administrador", () => {
  const CHAMADAS: readonly (readonly [
    string,
    () => Promise<unknown>,
    string,
  ])[] = [
    [
      "/explorar",
      async () => PaginaDoExplorar({ searchParams: Promise.resolve({}) }),
      "/admin",
    ],
    [
      "/explorar/lojas",
      async () =>
        PaginaDeLojasDoExplorar({ searchParams: Promise.resolve({}) }),
      "/admin",
    ],
    [
      "/explorar/produtos",
      async () =>
        PaginaDeProdutosDoExplorar({ searchParams: Promise.resolve({}) }),
      "/admin",
    ],
    [
      "/conta",
      async () => PaginaInicialDaConta({ searchParams: Promise.resolve({}) }),
      "/admin",
    ],
    [
      "/conta/enderecos",
      async () => PaginaDosMeusEnderecos(),
      "/admin?conta=enderecos",
    ],
    [
      "/conta/seguranca",
      async () => PaginaDeSeguranca({ searchParams: Promise.resolve({}) }),
      "/admin?conta=seguranca",
    ],
  ];

  for (const [nome, chamar, destino] of CHAMADAS) {
    it(`[CA-15] ${nome} → ${destino}`, async () => {
      prepararCenario("admin");
      expect(await abrir("/explorar", chamar)).toEqual(vai(destino));
    });
  }

  it("[CA-15] o estado de erro da Segurança e a aba do modal em Pedidos seguem para o /admin", async () => {
    prepararCenario("admin");
    expect(
      await abrir("/conta/pedidos", async () =>
        PaginaDeSeguranca({
          searchParams: Promise.resolve({ estado: "erro" }),
        }),
      ),
    ).toEqual(vai("/admin?conta=seguranca&estado=erro"));
    expect(
      await abrir("/conta/pedidos", async () =>
        PaginaDeMeusPedidos({
          searchParams: Promise.resolve({ conta: "dados" }),
        }),
      ),
    ).toEqual(vai("/admin?conta=dados"));
    expect(
      await abrir("/conta/pedidos", async () =>
        PaginaDeMeusPedidos({
          searchParams: Promise.resolve({ conta: "seguranca", estado: "erro" }),
        }),
      ),
    ).toEqual(vai("/admin?conta=seguranca&estado=erro"));
  });

  it("[CA-15] valor livre na consulta não vira destino: aba fora da lista e estado qualquer caem fora", async () => {
    prepararCenario("admin");
    for (const conta of [
      "excluida",
      "<script>",
      "dados&estado=erro",
      ["dados", "dados"],
    ]) {
      expect(
        await abrir("/conta/pedidos", async () =>
          PaginaDeMeusPedidos({ searchParams: Promise.resolve({ conta }) }),
        ),
      ).toEqual(vai("/admin"));
    }
    for (const estado of ["erro&conta=dados", "outro", ["erro", "erro"]]) {
      expect(
        await abrir("/conta/pedidos", async () =>
          PaginaDeSeguranca({ searchParams: Promise.resolve({ estado }) }),
        ),
      ).toEqual(vai("/admin?conta=seguranca"));
    }
  });
});

describe("[CA-15] Meus pedidos desvia o administrador acima do loading.tsx", () => {
  // `redirect()` abaixo de um `loading.tsx` não vira 307: o desvio de verdade
  // mora no layout, que fica acima da fronteira de carregamento.
  it("[CA-15] o layout leva o administrador a /admin e deixa os outros passarem", async () => {
    for (const cenario of CENARIOS) {
      prepararCenario(cenario);
      const esperado =
        cenario === "admin" || cenario === "admin que também é dono"
          ? vai("/admin")
          : PASSA;
      expect(
        await abrir("/conta/pedidos", async () =>
          LayoutDeMeusPedidos({ children: null }),
        ),
        cenario,
      ).toEqual(esperado);
    }
  });

  it("[CA-15] o layout não lê nada além da guarda e devolve os filhos", async () => {
    prepararCenario("cliente");
    const filho = "filho";
    const arvore = (await LayoutDeMeusPedidos({ children: filho })) as {
      props: { children: string };
    };
    expect(arvore.props.children).toBe(filho);
  });
});

describe("[CA-15] a decisão pura (decidirArea) e o papel da conta", () => {
  const ok = (corpo: unknown): EuDoPedido => ({
    estado: "ok",
    token: TOKEN,
    eu: corpo as never,
  });

  it("[CA-15] a ordem dos papéis é administração > dono > equipe > cliente", () => {
    expect(papelDoEu(PESSOAS.admin as never)).toBe("admin");
    expect(papelDoEu(PESSOAS["admin que também é dono"] as never)).toBe(
      "admin",
    );
    expect(papelDoEu(PESSOAS.dono as never)).toBe("dono");
    expect(papelDoEu(PESSOAS.equipe as never)).toBe("equipe");
    expect(papelDoEu(PESSOAS.cliente as never)).toBe("cliente");
    // Dono em uma loja e equipe em outra: dono.
    expect(
      papelDoEu(
        corpoDoEu({ lojasDaConta: [loja("STAFF"), loja("OWNER")] }) as never,
      ),
    ).toBe("dono");
  });

  it("[CA-15] administração é o grant que a API informa, e não o papel do token", () => {
    // O token diz ADMIN, mas a API não confirma o grant: não é administrador.
    expect(
      papelDoEu(corpoDoEu({ adminDaPlataforma: false }, "ADMIN") as never),
    ).toBe("cliente");
    expect(papelDoEu(corpoDoEu({}, "ADMIN") as never)).toBe("cliente");
  });

  it("[CA-15] só a lista de lojas da conta (ou, na falta dela, a da sessão) decide o painel", () => {
    expect(temLojaNaConta(PESSOAS.cliente as never)).toBe(false);
    expect(temLojaNaConta(PESSOAS.admin as never)).toBe(false);
    expect(temLojaNaConta(PESSOAS.equipe as never)).toBe(true);
    expect(temLojaNaConta(corpoDoEu({ lojas: [loja("OWNER")] }) as never)).toBe(
      true,
    );
  });

  const SEM_SESSAO: EuDoPedido = { estado: "sem-sessao" };
  const INDISPONIVEL: EuDoPedido = { estado: "indisponivel" };

  it("[CA-15] /admin e /painel fecham na falha; /explorar e /conta abrem", () => {
    for (const area of [
      "admin",
      "painel",
    ] as const satisfies readonly AreaDoSite[]) {
      expect(decidirArea(area, SEM_SESSAO)).toEqual({ acao: "entrar" });
      expect(decidirArea(area, INDISPONIVEL)).toEqual({ acao: "falhar" });
    }
    expect(decidirArea("cliente", SEM_SESSAO)).toEqual({ acao: "ficar" });
    expect(decidirArea("cliente", INDISPONIVEL)).toEqual({ acao: "ficar" });
  });

  it("[CA-15] o administrador que também é dono acessa /painel, mas é desviado das áreas de cliente", () => {
    const duplo = ok(PESSOAS["admin que também é dono"]);
    expect(decidirArea("painel", duplo)).toEqual({ acao: "ficar" });
    expect(decidirArea("admin", duplo)).toEqual({ acao: "ficar" });
    expect(decidirArea("cliente", duplo)).toEqual({
      acao: "ir",
      destino: "/admin",
    });
  });

  it("[CA-15] cada papel que erra de área vai para a área que é dele", () => {
    expect(decidirArea("admin", ok(PESSOAS.dono))).toEqual({
      acao: "ir",
      destino: "/painel",
    });
    expect(decidirArea("admin", ok(PESSOAS.equipe))).toEqual({
      acao: "ir",
      destino: "/painel",
    });
    expect(decidirArea("admin", ok(PESSOAS.cliente))).toEqual({
      acao: "ir",
      destino: "/explorar/produtos",
    });
    expect(decidirArea("painel", ok(PESSOAS.admin))).toEqual({
      acao: "ir",
      destino: "/admin",
    });
    expect(decidirArea("painel", ok(PESSOAS.cliente))).toEqual({
      acao: "ir",
      destino: "/explorar/produtos",
    });
  });
});

describe("[CA-15] prova estrutural", () => {
  const SERVIDOR = `${RAIZ_WEB}/src/server`;
  const APP = `${RAIZ_WEB}/src/app`;

  function semComentarios(codigo: string): string {
    return codigo
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
  }

  it("[CA-15] nenhuma guarda devolve 404 nem lê o claim do JWT", () => {
    for (const arquivo of [
      "area-do-papel.ts",
      "acesso-da-administracao.ts",
      "loja-da-pagina.ts",
      "eu-do-pedido.ts",
    ]) {
      const codigo = semComentarios(ler(`${SERVIDOR}/${arquivo}`));
      expect(codigo, arquivo).not.toMatch(/notFound/);
      expect(codigo, arquivo).not.toMatch(/jwt|decode|atob|Buffer\.from/i);
    }
  });

  it("[CA-15] todo redirect da matriz sai de uma fonte fixa (nada de URL, cabeçalho ou consulta)", () => {
    const codigo = semComentarios(ler(`${SERVIDOR}/area-do-papel.ts`));
    const redirects = [...codigo.matchAll(/\bredirect\(([\s\S]*?)\);/g)].map(
      (m) => (m[1] ?? "").replace(/\s+/g, " ").trim(),
    );
    expect(redirects.length).toBeGreaterThan(0);
    for (const argumento of redirects) {
      expect(argumento).toMatch(
        /^(?:decisao\.destino|enderecoParaEntrar\(caminho\)|enderecoParaEntrarNaAdministracao\(caminho\)|modal === undefined \? decisao\.destino : enderecoDoModal\(modal\.aba, modal\.estado, DESTINO_DO_PAPEL\.admin\),?)$/,
      );
    }
    expect(codigo).not.toMatch(/searchParams|req\.url|\.url\b|headers\(/);
  });

  it("[CA-15] não existe middleware.ts (a decisão é de cada guarda, no servidor)", async () => {
    const { existsSync } = await import("node:fs");
    expect(existsSync(`${RAIZ_WEB}/src/middleware.ts`)).toBe(false);
    expect(existsSync(`${RAIZ_WEB}/middleware.ts`)).toBe(false);
  });

  const COM_A_GUARDA_DO_CLIENTE = [
    "(explorar)/explorar/layout.tsx",
    "(explorar)/explorar/page.tsx",
    "(explorar)/explorar/lojas/page.tsx",
    "(explorar)/explorar/produtos/page.tsx",
    "(conta)/conta/page.tsx",
    "(conta)/conta/pedidos/page.tsx",
    "(conta)/conta/pedidos/layout.tsx",
    "(conta)/conta/favoritos/page.tsx",
    "(conta)/conta/dados/page.tsx",
    "(conta)/conta/enderecos/page.tsx",
    "(conta)/conta/seguranca/page.tsx",
  ] as const;

  it.each(COM_A_GUARDA_DO_CLIENTE)(
    "[CA-15] %s chama a guarda das áreas de cliente antes de qualquer leitura",
    (arquivo) => {
      const codigo = semComentarios(ler(`${APP}/${arquivo}`));
      expect(codigo).toMatch(/from\s+["'][./]+server\/area-do-papel\.ts["']/);
      const guarda = codigo.search(
        /\bawait\s+desviarAdministradorDasAreasDeCliente\s*\(/,
      );
      expect(guarda, "a guarda não é chamada").toBeGreaterThan(-1);
      // Antes de qualquer outra leitura da página (token da conta, dados, feed).
      for (const leitura of [
        "await buscar",
        "await tokenDaSessao",
        "await usuarioDoPedidoAtual",
        "Promise.all",
      ]) {
        const posicao = codigo.indexOf(leitura);
        if (posicao !== -1) expect(guarda, leitura).toBeLessThan(posicao);
      }
    },
  );
});
