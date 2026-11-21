/**
 * "Voltar à loja" na conta (card #135, AC-11123): quem chega à conta saindo de
 * uma loja ganha o atalho de volta para ELA. O proxy anota o apelido num
 * cookie só do servidor; a conta pergunta à API se a loja existe e o link sai
 * com o apelido da resposta, nunca com o texto do cookie nem do endereço.
 */
import { NextRequest, NextResponse } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ambiente = vi.hoisted(() => ({
  cookie: undefined as string | undefined,
  usuario: { papel: "visitante" } as Record<string, unknown>,
  origem: vi.fn(async () => undefined as unknown),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/conta",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: (nome: string) =>
      nome === "sc_loja_de_origem" && ambiente.cookie !== undefined
        ? { name: nome, value: ambiente.cookie }
        : undefined,
  }),
}));
vi.mock("../src/server/usuario-da-sessao.ts", () => ({
  usuarioDoPedidoAtual: async () => ambiente.usuario,
}));
vi.mock("../src/server/cidade-do-topo.ts", () => ({
  cidadeDoPedidoAtual: async () => null,
}));
vi.mock("../src/server/tutorial-da-sessao.ts", () => ({
  tutorialJaVistoNestePedido: async () => true,
}));
vi.mock("../src/server/actions/auth.ts", () => ({
  sairPelaBarra: vi.fn(),
  sairDaConta: vi.fn(),
  encerrarTodasAsSessoes: vi.fn(),
}));
vi.mock("../src/server/actions/conta.ts", () => ({
  sairDepoisDeExcluirAConta: vi.fn(),
}));

import {
  apelidoDaLojaNoCaminho,
  COOKIE_DA_LOJA_DE_ORIGEM,
} from "../src/lib/loja-de-origem.ts";
import { anotarLojaDeOrigem } from "../src/server/anotar-loja-de-origem.ts";
import { lojaDeOrigemDoPedidoAtual } from "../src/server/loja-de-origem.ts";
import type { buscarVitrine } from "../src/server/vitrine.ts";
import { NavegacaoDaSessao } from "../src/app/_usuario/sessao.tsx";
import { TopoDoCliente } from "../src/features/usuario/TopoDoCliente.tsx";

const CLIENTE = {
  papel: "cliente",
  nome: "Ana Ribeiro",
  primeiroNome: "Ana",
  iniciais: "AR",
  email: "ana@exemplo.test",
  loja: null,
  temOutrasLojas: false,
};

function pedido(
  caminho: string,
  cabecalhos: Record<string, string> = {},
  metodo = "GET",
) {
  return new NextRequest(new URL(caminho, "https://simpleclick.test"), {
    method: metodo,
    headers: cabecalhos,
  });
}

function cookieGravado(resposta: NextResponse) {
  return resposta.cookies.get(COOKIE_DA_LOJA_DE_ORIGEM);
}

/** A vitrine que a API devolveria para um apelido. */
function vitrineDa(apelido: string, nome: string) {
  return vi.fn<typeof buscarVitrine>(
    async () =>
      ({
        estado: "encontrada",
        vitrine: { loja: { apelido, nome } },
      }) as unknown as Awaited<ReturnType<typeof buscarVitrine>>,
  );
}

/** Abre a árvore (componentes de servidor inclusos) até o topo do cliente. */
async function acharTopo(no: ReactNode): Promise<ReactElement | null> {
  if (Array.isArray(no)) {
    const achados = await Promise.all(
      no.map((filho) => acharTopo(filho as ReactNode)),
    );
    return achados.find((achado) => achado !== null) ?? null;
  }
  if (!isValidElement(no)) return null;
  if (no.type === TopoDoCliente) return no;
  const props = no.props as { children?: ReactNode };
  return acharTopo(props.children);
}

beforeEach(() => {
  ambiente.cookie = undefined;
  ambiente.usuario = { papel: "visitante" };
});

describe("o apelido que o proxy aceita anotar", () => {
  it("[CA-2] @spec:AC-11123 vale qualquer página da loja; a TV e o resto do site não", () => {
    expect(apelidoDaLojaNoCaminho("/loja/padaria")).toBe("padaria");
    expect(apelidoDaLojaNoCaminho("/loja/padaria/cardapio")).toBe("padaria");
    expect(apelidoDaLojaNoCaminho("/loja/casa-do-ze/produto/abc")).toBe(
      "casa-do-ze",
    );
    // O código do acompanhamento é senha: só a loja conta.
    expect(apelidoDaLojaNoCaminho("/loja/padaria/pedido/codigo-secreto")).toBe(
      "padaria",
    );
    expect(apelidoDaLojaNoCaminho("/loja/padaria/tv")).toBeUndefined();
    expect(apelidoDaLojaNoCaminho("/explorar")).toBeUndefined();
    expect(apelidoDaLojaNoCaminho("/conta")).toBeUndefined();
  });

  it("[CA-2] @spec:AC-11123 recusa o que não tem formato de apelido ou foge da regra do retorno seguro", () => {
    for (const ruim of [
      "/loja/Padaria",
      "/loja/-padaria",
      "/loja/<script>",
      "/loja/%2e%2e",
      "/loja/a%2fb",
      "//golpe.example/loja/padaria",
      "/loja/" + "a".repeat(64),
    ]) {
      expect(apelidoDaLojaNoCaminho(ruim), ruim).toBeUndefined();
    }
  });
});

describe("o proxy anota a loja aberta", () => {
  it("[CA-2] @spec:AC-11123 abrir a loja grava um cookie só do servidor, que vale para o site todo", () => {
    const resposta = anotarLojaDeOrigem(
      pedido("/loja/padaria/cardapio"),
      NextResponse.next(),
    );
    const cookie = cookieGravado(resposta);
    expect(cookie?.value).toBe("padaria");
    expect(cookie).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
    });
  });

  it("[CA-2] @spec:AC-11123 prefetch, envio de formulário, a mesma loja de novo e outras páginas não gravam", () => {
    const casos = [
      pedido("/loja/padaria", { "next-router-prefetch": "1" }),
      pedido("/loja/padaria", { purpose: "prefetch" }),
      pedido("/loja/padaria", { "sec-purpose": "prefetch;prerender" }),
      pedido("/loja/padaria", {}, "POST"),
      pedido("/loja/padaria", {
        cookie: `${COOKIE_DA_LOJA_DE_ORIGEM}=padaria`,
      }),
      pedido("/explorar"),
      pedido("/loja/padaria/tv"),
    ];
    for (const requisicao of casos) {
      expect(
        cookieGravado(anotarLojaDeOrigem(requisicao, NextResponse.next())),
      ).toBeUndefined();
    }
  });
});

describe("a conta confere a loja na API", () => {
  it("[CA-2] @spec:AC-11123 o apelido e o nome vêm da resposta da API, não do cookie", async () => {
    ambiente.cookie = "padaria";
    const buscar = vitrineDa("padaria-do-ze", "Padaria do Zé");
    expect(await lojaDeOrigemDoPedidoAtual(buscar)).toEqual({
      apelido: "padaria-do-ze",
      nome: "Padaria do Zé",
    });
    expect(buscar).toHaveBeenCalledWith("padaria");
  });

  it("[CA-2] @spec:AC-11123 sem cookie, com cookie forjado, loja inexistente ou API fora do ar: sem a volta", async () => {
    const buscar = vitrineDa("padaria", "Padaria");
    expect(await lojaDeOrigemDoPedidoAtual(buscar)).toBeUndefined();

    ambiente.cookie = "javascript:alert(1)";
    expect(await lojaDeOrigemDoPedidoAtual(buscar)).toBeUndefined();
    ambiente.cookie = "//golpe.example";
    expect(await lojaDeOrigemDoPedidoAtual(buscar)).toBeUndefined();
    expect(buscar).not.toHaveBeenCalled();

    ambiente.cookie = "fechou";
    const sumiu = vi.fn<typeof buscarVitrine>(async () => ({
      estado: "nao-encontrada",
    }));
    expect(await lojaDeOrigemDoPedidoAtual(sumiu)).toBeUndefined();
    const caiu = vi.fn<typeof buscarVitrine>(async () => {
      throw new Error("ECONNREFUSED");
    });
    expect(await lojaDeOrigemDoPedidoAtual(caiu)).toBeUndefined();
  });
});

describe("o menu da conta oferece a volta", () => {
  const PADARIA = { apelido: "padaria", nome: "Padaria" };

  it("[CA-2] @spec:AC-11123 o cliente vê 'Voltar à loja' levando à vitrine da loja de origem, sem a sacola dela", async () => {
    ambiente.usuario = CLIENTE;
    const topo = await acharTopo(
      await NavegacaoDaSessao({ lojaDeOrigem: PADARIA }),
    );
    expect(topo).not.toBeNull();
    const html = renderToStaticMarkup(topo as ReactElement);
    expect(html).toMatch(/href="\/loja\/padaria"[^>]*>[\s\S]*?Voltar à loja/);
    // Fora da loja não há sacola: a origem só entra no menu.
    expect((topo?.props as { sacola?: unknown }).sacola).toBeUndefined();
    expect(html).not.toContain('data-navegacao="sacola"');
  });

  it("[CA-2] @spec:AC-11123 sem loja de origem não há o item, e só o cliente o recebe", async () => {
    ambiente.usuario = CLIENTE;
    const semOrigem = renderToStaticMarkup(
      (await acharTopo(await NavegacaoDaSessao({}))) as ReactElement,
    );
    expect(semOrigem).not.toContain("Voltar à loja");

    ambiente.usuario = {
      ...CLIENTE,
      papel: "dono",
      loja: { apelido: "minha", nome: "Minha" },
    };
    const topoDoDono = await acharTopo(
      await NavegacaoDaSessao({ lojaDeOrigem: PADARIA }),
    );
    expect(
      (topoDoDono?.props as { lojaDeOrigem?: unknown }).lojaDeOrigem,
    ).toBeUndefined();
  });
});
