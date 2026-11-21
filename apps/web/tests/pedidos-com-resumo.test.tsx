// @vitest-environment jsdom
/**
 * Meus pedidos com o resumo da antiga Visão geral no topo (card #151): o
 * resumo vem ANTES dos filtros e da lista, sem repetir blocos ("Últimos
 * pedidos" saiu), com um só estado vazio; os filtros da lista e o período do
 * resumo preservam um ao outro; e Favoritos segue sem sidebar.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PedidoDaContaNoContrato } from "@simpleclick/contracts";

const ambiente = vi.hoisted(() => ({
  pedidos: { estado: "ok", pedidos: [] } as unknown,
  consulta: "" as string,
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => ({ value: "tok" }) }),
}));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  },
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(ambiente.consulta),
}));
vi.mock("../src/lib/meus-pedidos.ts", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  buscarMeusPedidos: async () => ambiente.pedidos,
}));
vi.mock("../src/lib/conta-do-cliente.ts", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  buscarMetricasDaConta: async () => ({
    estado: "ok",
    dados: {
      periodo: { de: "2026-09-18", ate: "2026-10-17", fuso: "America/Sao_Paulo" },
      anterior: { de: "2026-08-19", ate: "2026-09-17" },
      resumo: { pedidos: 2, gastoCentavos: 10_000, ticketMedioCentavos: 5_000, cancelados: 0, lojasDistintas: 1, entregues: 1, retiradas: 1 },
      resumoAnterior: { pedidos: 1, gastoCentavos: 4_000, ticketMedioCentavos: 4_000 },
      topProdutos: [],
      topLojas: [],
      gastoPorMes: [],
      pedidosPorDiaDaSemana: [0, 1, 0, 0, 0, 1, 0],
      pedidosPorHora: Array.from({ length: 24 }, () => 0),
    },
  }),
  buscarFavoritos: async () => ({ estado: "ok", dados: { lojas: [], produtos: [] } }),
  buscarRecentes: async () => ({ estado: "ok", dados: [] }),
}));

import PaginaDeFavoritos from "../src/app/(conta)/conta/favoritos/page.tsx";
import PaginaDeMeusPedidos from "../src/app/(conta)/conta/pedidos/page.tsx";
import { FiltrosDePedidos } from "../src/features/conta/FiltrosDePedidos.tsx";
import { enderecoDoResumo } from "../src/features/conta/SeletorDoPeriodoDaConta.tsx";
import { lerPeriodoDaVisao } from "../src/lib/conta-do-cliente.ts";

function pedido(numero: number, status = "COMPLETED"): PedidoDaContaNoContrato {
  return {
    id: `6e2f3a4b-1c2d-4e5f-8a9b-0c1d2e3f4a0${numero}`,
    loja: { nome: "Livraria da Esquina", apelido: "livraria-da-esquina" },
    numero,
    codigo: `L-00${numero}`,
    status,
    entrega: "PICKUP",
    totalCentavos: 5_000,
    quantidadeDeItens: 2,
    criadoEm: new Date().toISOString(),
    atualizadoEm: new Date().toISOString(),
  };
}

async function pagina(consulta: Record<string, string | string[]> = {}): Promise<string> {
  return renderToStaticMarkup(
    await PaginaDeMeusPedidos({ searchParams: Promise.resolve(consulta) }),
  );
}

beforeEach(() => {
  ambiente.pedidos = { estado: "ok", pedidos: [pedido(1), pedido(2, "PREPARING")] };
  ambiente.consulta = "";
});

describe("Pedidos traz o resumo no topo", () => {
  it("[CA-3] o resumo (andamento, período, cartões) vem antes dos filtros e da lista", async () => {
    const html = await pagina();
    const ordem = [
      html.indexOf("data-visao-geral"),
      html.indexOf("data-seletor-de-periodo"),
      html.indexOf("data-metrica"),
      html.indexOf('id="todos-os-pedidos"'),
      html.indexOf("sc-meus-pedidos__filtros"),
      html.indexOf("data-meus-pedidos"),
    ];
    expect(ordem.every((i) => i >= 0)).toBe(true);
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
    expect(html).toContain("Pedido em andamento");
    expect(html).toContain("Todos os pedidos");
    expect(html.match(/<h1/g)).toHaveLength(1);
  });

  it("[CA-3] sem blocos repetidos: nada de 'Últimos pedidos' e cada pedido aparece uma vez", async () => {
    const html = await pagina();
    expect(html).not.toContain("Últimos pedidos");
    expect(html).not.toContain("Ver todos");
    // O pedido em andamento aparece no destaque (Acompanhar) e na lista, uma vez cada.
    expect(html.match(/data-pedido="6e2f3a4b-1c2d-4e5f-8a9b-0c1d2e3f4a02"/g)).toHaveLength(2);
    expect(html.match(/data-pedido="6e2f3a4b-1c2d-4e5f-8a9b-0c1d2e3f4a01"/g)).toHaveLength(1);
    expect(html).not.toContain('nav aria-label="Seções da conta"');
  });

  it("[CA-3] sem nenhum pedido: um só estado vazio e nem o resumo nem os filtros", async () => {
    ambiente.pedidos = { estado: "ok", pedidos: [] };
    const html = await pagina();
    expect(html.match(/Você ainda não fez nenhum pedido/g)).toHaveLength(1);
    expect(html).not.toContain("data-visao-geral");
    expect(html).not.toContain("sc-meus-pedidos__filtros");
  });

  it("[CA-3] lista indisponível: só o erro, sem resumo", async () => {
    ambiente.pedidos = { estado: "indisponivel" };
    const html = await pagina();
    expect(html).toContain("Não deu para carregar seus pedidos");
    expect(html).not.toContain("data-visao-geral");
  });

  it("[CA-3] o período do resumo vem de ?resumo=, e o filtro da lista de ?periodo= (sem colisão)", async () => {
    const html = await pagina({ resumo: "90d", periodo: "7" });
    expect(html).toContain('data-atalho="90d"');
    // Os links dos filtros da lista levam o período 7 E o resumo de 90 dias.
    expect(html).toMatch(/href="\/conta\/pedidos\?resumo=90d&amp;periodo=7[^"]*"/);
  });

  it("[CA-4] Favoritos tem o h1 e as três seções, sem sidebar", async () => {
    const html = renderToStaticMarkup(await PaginaDeFavoritos());
    expect(html).toContain("<h1");
    expect(html).toContain(">Favoritos<");
    for (const secao of ["Produtos favoritos", "Lojas favoritas", "Vistas recentemente"]) {
      expect(html).toContain(secao);
    }
    expect(html).not.toContain("sc-secoes-da-conta");
    expect(html).not.toContain("Seções da conta");
  });
});

describe("filtros e período do resumo preservam um ao outro", () => {
  const filtro = { situacao: "andamento", periodo: "30", loja: "livraria-da-esquina" } as const;

  it("[CA-3] os chips, o formulário e 'Limpar filtros' levam o resumo (e só ele)", () => {
    const resumo = lerPeriodoDaVisao({ periodo: "personalizado", de: "2026-05-01", ate: "2026-05-31" }, "2026-10-17");
    const html = renderToStaticMarkup(
      <FiltrosDePedidos filtro={filtro} lojas={[{ apelido: "livraria-da-esquina", nome: "Livraria" }]} resumo={resumo} />,
    );
    expect(html).toContain("resumo=personalizado");
    expect(html).toContain("de=2026-05-01");
    expect(html).toContain("ate=2026-05-31");
    expect(html).toContain('<input type="hidden" name="resumo" value="personalizado"/>');
    expect(html).toContain('action="/conta/pedidos"');
    // "Limpar filtros" zera a lista, mas fica com o período do resumo.
    expect(html).toMatch(/href="\/conta\/pedidos\?resumo=personalizado&amp;de=2026-05-01&amp;ate=2026-05-31">Limpar filtros/);
  });

  it("[CA-3] sem resumo escolhido (30 dias) os filtros não inventam parâmetro", () => {
    const html = renderToStaticMarkup(
      <FiltrosDePedidos filtro={filtro} lojas={[]} resumo={lerPeriodoDaVisao({}, "2026-10-17")} />,
    );
    expect(html).not.toContain("resumo=");
    expect(html).not.toContain('name="resumo"');
  });

  it("[CA-3] trocar o período do resumo mantém situação, loja e período da lista; limpa conta e estado", () => {
    const atual = new URLSearchParams("situacao=andamento&periodo=30&loja=padaria&conta=seguranca&estado=erro");
    const novo = new URL(enderecoDoResumo(atual, { resumo: "90d" }), "https://x.test");
    expect(novo.pathname).toBe("/conta/pedidos");
    expect(Object.fromEntries(novo.searchParams)).toEqual({
      situacao: "andamento",
      periodo: "30",
      loja: "padaria",
      resumo: "90d",
    });
    const padrao = enderecoDoResumo(new URLSearchParams("resumo=90d&loja=padaria"), { resumo: "30d" });
    expect(padrao).toBe("/conta/pedidos?loja=padaria");
    const livre = new URL(
      enderecoDoResumo(new URLSearchParams(), { resumo: "personalizado", de: "2026-05-01", ate: "2026-05-31" }),
      "https://x.test",
    );
    expect(Object.fromEntries(livre.searchParams)).toEqual({ resumo: "personalizado", de: "2026-05-01", ate: "2026-05-31" });
  });
});
