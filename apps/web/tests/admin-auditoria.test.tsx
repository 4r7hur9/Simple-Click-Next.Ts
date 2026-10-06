// @vitest-environment jsdom
/**
 * Histórico de auditoria na tela da administração (AC-215, P-011).
 *
 * A consulta de verdade está provada contra o banco em
 * `apps/api/tests/admin-auditoria.test.ts`. Aqui se prova o que só a tela
 * mostra: os quatro estados, o destaque do sensível, a loja de cada ato, e
 * que os filtros escolhidos são os que vão para a API.
 */
import type { PaginaDaAuditoriaNoContrato } from "@simpleclick/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import {
  enderecoDoHistorico,
  HistoricoDeAuditoria,
  MENSAGEM_DE_PERIODO,
  MENSAGEM_DE_SESSAO,
  PainelDaAuditoria,
  SEM_FILTROS,
  type PainelDaAuditoriaProps,
} from "../src/features/admin/HistoricoDeAuditoria.tsx";
import {
  botao,
  clicar,
  desmontar,
  digitar,
  enviar,
  esperar,
  exigir,
  montar,
  simularApi,
} from "./apoio-config.tsx";

const PASTEL = {
  id: "5b0c0000-0000-4000-8000-000000000001",
  codigo: "0001",
  nome: "Pastel da Joi",
};

const PAGINA: PaginaDaAuditoriaNoContrato = {
  registros: [
    {
      id: "12",
      quando: "2026-10-01T15:00:00.000Z",
      acao: "CONFIG_SENSIVEL_ALTERADA",
      quem: { id: "5b0c0000-0000-4000-8000-0000000000aa", nome: "Joi" },
      papel: "OWNER",
      campos: [{ campo: "pix.chave", antes: "…8909", depois: "…1234" }],
      sensivel: true,
      loja: PASTEL,
    },
    {
      id: "11",
      quando: "2026-09-30T12:00:00.000Z",
      acao: "LOJA_SUSPENSA",
      quem: { id: "5b0c0000-0000-4000-8000-0000000000bb", nome: "Ana" },
      papel: "ADMIN",
      campos: [{ campo: "motivo", antes: null, depois: "Pagamento atrasado" }],
      sensivel: false,
      loja: {
        id: "5b0c0000-0000-4000-8000-000000000002",
        codigo: "0002",
        nome: "Açaí do Zé",
      },
    },
  ],
  total: 31,
  pagina: 1,
  porPagina: 25,
};

function desenhar(sobrescrita: Partial<PainelDaAuditoriaProps> = {}): Document {
  const props: PainelDaAuditoriaProps = {
    rascunho: SEM_FILTROS,
    nomeDaLojaFiltrada: null,
    estado: { fase: "pronto", pagina: PAGINA },
    periodoInvalido: false,
    aoMudar: () => undefined,
    aoFiltrar: () => undefined,
    aoLimpar: () => undefined,
    aoFiltrarLoja: () => undefined,
    aoTirarLoja: () => undefined,
    aoTentarDeNovo: () => undefined,
    aoIrParaPagina: () => undefined,
    ...sobrescrita,
  };
  document.body.innerHTML = renderToStaticMarkup(
    <PainelDaAuditoria {...props} />,
  );
  return document;
}

afterEach(() => {
  desmontar();
  document.body.innerHTML = "";
});

describe("o histórico de auditoria na tela", () => {
  it("@spec:AC-215 @principle:P-011 cobre carregando, vazio, erro e sucesso, cada um com o papel de acessibilidade certo", () => {
    const carregando = desenhar({ estado: { fase: "carregando" } });
    expect(carregando.querySelector('[role="status"]')?.textContent).toContain(
      "Carregando o histórico",
    );

    const vazio = desenhar({
      rascunho: { ...SEM_FILTROS, ato: "LOJA_SUSPENSA" },
      estado: {
        fase: "pronto",
        pagina: { ...PAGINA, registros: [], total: 0 },
      },
    });
    expect(vazio.body.textContent).toContain("Nenhum ato encontrado");
    expect(vazio.body.textContent).toContain("limpe os filtros");

    const erro = desenhar({
      estado: { fase: "erro", mensagem: MENSAGEM_DE_SESSAO },
    });
    const alerta = erro.querySelector('[role="alert"]');
    expect(alerta?.textContent).toContain("O histórico não carregou");
    expect(alerta?.textContent).toContain(MENSAGEM_DE_SESSAO);
    expect(alerta?.querySelector("button")?.textContent).toContain(
      "Tentar de novo",
    );

    const sucesso = desenhar();
    expect(sucesso.querySelector('[role="status"]')?.textContent).toContain(
      "31 atos encontrados",
    );
    expect(sucesso.querySelectorAll("li")).toHaveLength(2);
  });

  it("@spec:AC-215 cada ato mostra quem, quando, a loja com caminho até a ficha e o antes e depois; o sensível sai destacado", () => {
    const tela = desenhar();
    const [pix, suspensao] = [...tela.querySelectorAll("li")];

    expect(pix?.getAttribute("data-sensivel")).toBe("true");
    expect(pix?.textContent).toContain("Dado sensível alterado");
    expect(pix?.textContent).toContain("Alteração sensível");
    expect(pix?.textContent).toContain("Por Joi (OWNER)");
    expect(pix?.textContent).toContain("01/10/2026");
    expect(pix?.textContent).toContain("…8909 → …1234");
    expect(pix?.textContent).toContain("0001 · Pastel da Joi");
    expect(
      pix?.querySelector(`a[href="/admin/lojas/${PASTEL.id}"]`),
    ).not.toBeNull();

    expect(suspensao?.hasAttribute("data-sensivel")).toBe(false);
    expect(suspensao?.textContent).toContain("Loja suspensa");
    expect(suspensao?.textContent).toContain("— → Pagamento atrasado");

    // 31 atos em páginas de 25: a segunda página existe.
    expect(
      tela.querySelector('nav[aria-label="Páginas do histórico"]')?.textContent,
    ).toContain("Página 1 de 2");
  });

  it("@spec:AC-215 o endereço da consulta leva só os filtros escolhidos", () => {
    expect(enderecoDoHistorico(SEM_FILTROS, 1)).toBe(
      "/api/admin/auditoria?pagina=1",
    );
    expect(
      enderecoDoHistorico(
        {
          loja: PASTEL.id,
          ato: "CONFIG_SENSIVEL_ALTERADA",
          de: "2026-10-01",
          ate: "2026-10-02",
        },
        2,
      ),
    ).toBe(
      `/api/admin/auditoria?pagina=2&loja=${PASTEL.id}&ato=CONFIG_SENSIVEL_ALTERADA&de=2026-10-01&ate=2026-10-02`,
    );
  });

  it("@spec:AC-215 a tela consulta ao abrir, filtra por ato e período, e por loja a partir do próprio ato", async () => {
    const chamadas = simularApi(() => ({ status: 200, corpo: PAGINA }));
    const tela = montar(<HistoricoDeAuditoria />);
    await esperar();
    expect(chamadas.map((chamada) => chamada.url)).toEqual([
      "/api/admin/auditoria?pagina=1",
    ]);

    digitar(exigir<HTMLSelectElement>(tela, "#filtro-ato"), "LOJA_SUSPENSA");
    digitar(exigir<HTMLInputElement>(tela, "#filtro-de"), "2026-09-01");
    digitar(exigir<HTMLInputElement>(tela, "#filtro-ate"), "2026-09-30");
    await enviar(
      exigir<HTMLFormElement>(tela, 'form[aria-label="Filtros do histórico"]'),
    );
    expect(chamadas.at(-1)?.url).toBe(
      "/api/admin/auditoria?pagina=1&ato=LOJA_SUSPENSA&de=2026-09-01&ate=2026-09-30",
    );

    clicar(botao(tela, "Só desta loja"));
    await esperar();
    expect(chamadas.at(-1)?.url).toContain(`loja=${PASTEL.id}`);
    expect(tela.textContent).toContain("Só a loja Pastel da Joi");

    clicar(botao(tela, "Mostrar todas as lojas"));
    await esperar();
    expect(chamadas.at(-1)?.url).not.toContain("loja=");
  });

  it("@spec:AC-215 período invertido não vai para a API e explica o que corrigir", async () => {
    const chamadas = simularApi(() => ({ status: 200, corpo: PAGINA }));
    const tela = montar(<HistoricoDeAuditoria lojaInicial={PASTEL.id} />);
    await esperar();
    expect(chamadas[0]?.url).toBe(
      `/api/admin/auditoria?pagina=1&loja=${PASTEL.id}`,
    );

    digitar(exigir<HTMLInputElement>(tela, "#filtro-de"), "2026-10-05");
    digitar(exigir<HTMLInputElement>(tela, "#filtro-ate"), "2026-10-01");
    await enviar(
      exigir<HTMLFormElement>(tela, 'form[aria-label="Filtros do histórico"]'),
    );
    expect(chamadas).toHaveLength(1);
    expect(tela.querySelector('[role="alert"]')?.textContent).toContain(
      MENSAGEM_DE_PERIODO,
    );
    expect(
      exigir<HTMLInputElement>(tela, "#filtro-ate").getAttribute(
        "aria-invalid",
      ),
    ).toBe("true");
  });

  it("@spec:AC-215 sessão sem acesso vira o estado de erro com a frase que explica, e não um histórico vazio", async () => {
    simularApi(() => ({ status: 403, corpo: { erro: "acesso_negado" } }));
    const tela = montar(<HistoricoDeAuditoria />);
    await esperar();
    expect(tela.querySelector("ol")).toBeNull();
    expect(tela.querySelector('[role="alert"]')?.textContent).toContain(
      MENSAGEM_DE_SESSAO,
    );
  });
});
