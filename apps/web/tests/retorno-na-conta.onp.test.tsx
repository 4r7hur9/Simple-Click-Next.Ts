/**
 * Retorno ao destino nas áreas de conta (card #105): quem abre direto uma
 * página que pede sessão entra e volta para ela. A verificação em duas
 * etapas mantém o destino, e a orientação da API vem antes dele.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ambiente = vi.hoisted(() => ({ token: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: () =>
      ambiente.token === undefined ? undefined : { value: ambiente.token },
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

const naoAutenticado = vi.hoisted(() => async () => ({
  estado: "nao-autenticado" as const,
}));

vi.mock("../src/lib/meus-pedidos.ts", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  buscarMeusPedidos: naoAutenticado,
  buscarMeuPedido: naoAutenticado,
}));

vi.mock("../src/lib/conta-do-cliente.ts", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  buscarMetricasDaConta: naoAutenticado,
  buscarDadosDaConta: naoAutenticado,
  buscarFavoritos: naoAutenticado,
  buscarRecentes: naoAutenticado,
  buscarSessoesAbertas: naoAutenticado,
  buscarAceites: naoAutenticado,
}));

vi.mock("../src/server/loja-da-pagina.ts", () => ({
  lojaDoPedidoAtual: async () => ({ estado: "sem-sessao" }),
}));

vi.mock("../src/server/actions/conta.ts", () => ({
  sairDepoisDeExcluirAConta: vi.fn(),
}));
vi.mock("../src/server/actions/auth.ts", () => ({
  sairDaConta: vi.fn(),
  encerrarTodasAsSessoes: vi.fn(),
}));
vi.mock("../src/server/actions/loja.ts", () => ({
  escolherLojaDoPainel: vi.fn(),
}));

import { tokenOuEntrar } from "../src/app/(conta)/conta/_token.ts";
import PaginaInicialDaConta from "../src/app/(conta)/conta/page.tsx";
import PaginaDeDados from "../src/app/(conta)/conta/dados/page.tsx";
import PaginaDosMeusEnderecos from "../src/app/(conta)/conta/enderecos/page.tsx";
import PaginaDeFavoritos from "../src/app/(conta)/conta/favoritos/page.tsx";
import PaginaDeMeusPedidos from "../src/app/(conta)/conta/pedidos/page.tsx";
import PaginaDoMeuPedido from "../src/app/(conta)/conta/pedidos/[id]/page.tsx";
import PaginaDeSeguranca from "../src/app/(conta)/conta/seguranca/page.tsx";
import PaginaDoAplicativoAutenticador from "../src/app/(conta)/conta/seguranca/aplicativo/page.tsx";
import PaginaDeEscolhaDaLoja from "../src/app/(conta)/escolher-loja/page.tsx";
import PaginaDeNovaLoja from "../src/app/(conta)/escolher-loja/nova/page.tsx";
import { destinoDepoisDoSegundoFator } from "../src/features/auth/respostas-de-acesso.ts";

async function paraOndeVai(execucao: () => unknown): Promise<string> {
  try {
    await execucao();
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    if (mensagem.startsWith("REDIRECT:")) return mensagem.slice(9);
    throw erro;
  }
  throw new Error("a página não redirecionou");
}

const parametros = <T,>(valor: T) => Promise.resolve(valor);

const PAGINAS: readonly {
  readonly nome: string;
  readonly caminho: string;
  readonly abrir: () => unknown;
}[] = [
  {
    nome: "conta (agora um redirect)",
    caminho: "/conta",
    abrir: () => PaginaInicialDaConta({ searchParams: parametros({}) }),
  },
  { nome: "dados", caminho: "/conta/dados", abrir: () => PaginaDeDados() },
  {
    nome: "endereços",
    caminho: "/conta/enderecos",
    abrir: () => PaginaDosMeusEnderecos(),
  },
  {
    nome: "favoritos",
    caminho: "/conta/favoritos",
    abrir: () => PaginaDeFavoritos(),
  },
  {
    nome: "pedidos",
    caminho: "/conta/pedidos",
    abrir: () => PaginaDeMeusPedidos({ searchParams: parametros({}) }),
  },
  {
    nome: "segurança",
    caminho: "/conta/seguranca",
    abrir: () => PaginaDeSeguranca({ searchParams: parametros({}) }),
  },
  {
    nome: "aplicativo autenticador",
    caminho: "/conta/seguranca/aplicativo",
    abrir: () => PaginaDoAplicativoAutenticador(),
  },
  {
    nome: "escolher loja",
    caminho: "/escolher-loja",
    abrir: () => PaginaDeEscolhaDaLoja({ searchParams: parametros({}) }),
  },
  {
    nome: "nova loja",
    caminho: "/escolher-loja/nova",
    abrir: () => PaginaDeNovaLoja(),
  },
];

const ir = (caminho: string) =>
  `/entrar?proximo=${encodeURIComponent(caminho)}`;

describe("sem sessão", () => {
  beforeEach(() => {
    ambiente.token = undefined;
  });

  it.each(PAGINAS)(
    "[CA-4] @spec:AC-10512 $nome sem cookie entra e volta para $caminho",
    async ({ caminho, abrir }) => {
      expect(await paraOndeVai(abrir)).toBe(ir(caminho));
    },
  );

  it("[CA-4] @spec:AC-10512 o pedido leva o número codificado", async () => {
    expect(
      await paraOndeVai(() =>
        PaginaDoMeuPedido({ params: parametros({ id: "a b" }) }),
      ),
    ).toBe(ir("/conta/pedidos/a%20b"));
  });

  it("[CA-4] @spec:AC-10513 número com barra codificada não vira destino", async () => {
    expect(
      await paraOndeVai(() =>
        PaginaDoMeuPedido({ params: parametros({ id: "a/../../api" }) }),
      ),
    ).toBe("/entrar");
  });

  it("[CA-4] @spec:AC-10512 tokenOuEntrar devolve o token quando há sessão", async () => {
    ambiente.token = "tok";
    expect(await tokenOuEntrar("/conta")).toBe("tok");
  });
});

describe("com cookie vencido (a API diz não-autenticado)", () => {
  beforeEach(() => {
    ambiente.token = "vencido";
  });

  it.each(
    PAGINAS.filter((p) =>
      ["/conta/favoritos", "/conta/pedidos"].includes(p.caminho),
    ),
  )(
    "[CA-4] @spec:AC-10512 $nome volta para a própria página depois de entrar",
    async ({ caminho, abrir }) => {
      expect(await paraOndeVai(abrir)).toBe(ir(caminho));
    },
  );

  it("[CA-7] o login volta para Pedidos COM a aba do modal, só se ela for válida", async () => {
    for (const [conta, esperado] of [
      ["seguranca", "/conta/pedidos?conta=seguranca"],
      ["dados", "/conta/pedidos?conta=dados"],
      ["excluida", "/conta/pedidos"],
      ["<script>", "/conta/pedidos"],
    ] as const) {
      expect(
        await paraOndeVai(() =>
          PaginaDeMeusPedidos({ searchParams: parametros({ conta }) }),
        ),
      ).toBe(ir(esperado));
    }
  });

  it("[CA-4] @spec:AC-10512 o detalhe do pedido volta ao próprio pedido", async () => {
    expect(
      await paraOndeVai(() =>
        PaginaDoMeuPedido({ params: parametros({ id: "p1" }) }),
      ),
    ).toBe(ir("/conta/pedidos/p1"));
  });
});

describe("prova estrutural", () => {
  function arquivos(pasta: string): string[] {
    return readdirSync(pasta).flatMap((nome) => {
      const caminho = join(pasta, nome);
      if (statSync(caminho).isDirectory()) return arquivos(caminho);
      return /\.(ts|tsx)$/.test(nome) ? [caminho] : [];
    });
  }

  it("[CA-5] @spec:AC-10512 nenhuma saída para /entrar sem destino em app/(conta)", () => {
    const pasta = join(__dirname, "../src/app/(conta)");
    const sozinha = /(?:redirect|replace|push)\(\s*["'`]\/entrar["'`]\s*\)/;
    const culpados = arquivos(pasta).filter((arquivo) =>
      sozinha.test(readFileSync(arquivo, "utf8")),
    );
    expect(culpados).toEqual([]);
  });

  it("[CA-5] @spec:AC-10512 a página de verificação não recomeça sem o destino", () => {
    const fonte = readFileSync(
      join(__dirname, "../src/app/(conta)/entrar/verificacao/page.tsx"),
      "utf8",
    );
    expect(fonte.match(/comDestino\("\/entrar", destino\)/g)?.length).toBe(1);
    expect(fonte).not.toMatch(/replace\(\s*["'`]\/entrar/);
  });
});

describe("destino depois do segundo fator", () => {
  it("[CA-6] @spec:AC-10512 sem orientação, o destino da pessoa vence o do papel", () => {
    expect(
      destinoDepoisDoSegundoFator({
        redirecionarPara: "/explorar/produtos",
        destino: "/conta/pedidos",
      }),
    ).toBe("/conta/pedidos");
    expect(destinoDepoisDoSegundoFator({ redirecionarPara: "/painel" })).toBe(
      "/painel",
    );
  });

  it("[CA-6] @spec:AC-10512 a orientação (códigos de recuperação) vem antes do destino", () => {
    expect(
      destinoDepoisDoSegundoFator({
        orientarPara: "/conta/seguranca/aplicativo",
        redirecionarPara: "/explorar/produtos",
        destino: "/conta/pedidos",
      }),
    ).toBe("/conta/seguranca/aplicativo");
  });

  it("[CA-6] @spec:AC-10513 valor de fora ou tela de acesso cai no destino do papel", () => {
    expect(
      destinoDepoisDoSegundoFator({
        orientarPara: "//evil.com",
        redirecionarPara: "https://evil.com",
        destino: undefined,
      }),
    ).toBe("/explorar/produtos");
    expect(
      destinoDepoisDoSegundoFator({
        orientarPara: "/entrar",
        redirecionarPara: "/painel",
        destino: "/entrar/verificacao",
      }),
    ).toBe("/painel");
  });
});

describe("com sessão, /conta e as rotas antigas viram redirect (card #151)", () => {
  beforeEach(() => {
    ambiente.token = "tok";
  });

  it("[CA-2] /conta vai para /conta/pedidos", async () => {
    expect(
      await paraOndeVai(() => PaginaInicialDaConta({ searchParams: parametros({}) })),
    ).toBe("/conta/pedidos");
  });

  it("[CA-2] o período da antiga Visão geral vira ?resumo=, já conferido", async () => {
    const ir90 = await paraOndeVai(() =>
      PaginaInicialDaConta({ searchParams: parametros({ periodo: "90d" }) }),
    );
    expect(ir90).toBe("/conta/pedidos?resumo=90d");
    const livre = await paraOndeVai(() =>
      PaginaInicialDaConta({
        searchParams: parametros({ periodo: "personalizado", de: "2026-05-01", ate: "2026-05-31" }),
      }),
    );
    expect(livre).toBe("/conta/pedidos?resumo=personalizado&de=2026-05-01&ate=2026-05-31");
    // Lixo na URL não é repassado: cai no padrão.
    expect(
      await paraOndeVai(() =>
        PaginaInicialDaConta({
          searchParams: parametros({ periodo: "90d&conta=seguranca", de: ["a", "b"] }),
        }),
      ),
    ).toBe("/conta/pedidos");
  });

  it.each([
    ["dados", () => PaginaDeDados()],
    ["enderecos", () => PaginaDosMeusEnderecos()],
    ["seguranca", () => PaginaDeSeguranca({ searchParams: parametros({}) })],
  ] as const)("[CA-7] /conta/%s abre o modal na aba, sobre Pedidos", async (aba, abrir) => {
    expect(await paraOndeVai(abrir)).toBe(`/conta/pedidos?conta=${aba}`);
  });

  it("[CA-7] /conta/seguranca leva ?estado=erro, e só esse valor exato", async () => {
    expect(
      await paraOndeVai(() =>
        PaginaDeSeguranca({ searchParams: parametros({ estado: "erro" }) }),
      ),
    ).toBe("/conta/pedidos?conta=seguranca&estado=erro");
    for (const estado of ["erro&conta=dados", ["erro", "erro"], "outro"]) {
      expect(
        await paraOndeVai(() =>
          PaginaDeSeguranca({ searchParams: parametros({ estado }) }),
        ),
      ).toBe("/conta/pedidos?conta=seguranca");
    }
  });
});
