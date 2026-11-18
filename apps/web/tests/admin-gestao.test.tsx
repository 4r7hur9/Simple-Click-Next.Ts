// @vitest-environment jsdom
/**
 * Gestão de lojas e contas na administração (card #29): aprovar e recusar com
 * confirmação, limites editáveis com barra de uso, contas de donos e equipe, e
 * o que o repasse do site deixa passar.
 *
 * A lista de lojas e a ficha têm as provas em `admin-lista-lojas.test.tsx` e
 * `admin-ficha-loja.test.tsx`; os endpoints, em `apps/api`.
 */
import type {
  ContaNaAdministracaoNoContrato,
  FichaDaLojaNoContrato,
  LimitesDaLojaNoContrato,
  ListaDeContasNoContrato,
} from "@simpleclick/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  atosDisponiveis,
  AtosDeAprovacao,
} from "../src/features/admin/AtosDeAprovacao.tsx";
import { usoNaBarra } from "../src/features/admin/apresentacao.ts";
import { BarraDeUso } from "../src/features/admin/BarraDeUso.tsx";
import { lojasDoCampo } from "../src/features/admin/FichaDaConta.tsx";
import {
  LimitesDaLoja,
  corpoDosLimites,
} from "../src/features/admin/LimitesDaLoja.tsx";
import {
  consultaDeContasDoEndereco,
  enderecoDaListaDeContas,
  enderecoDaPaginaDeContas,
  TabelaDeContas,
} from "../src/features/admin/ListaDeContas.tsx";
import { secoesDaAdministracao } from "../src/features/painel/MenuDaAdministracao.tsx";
import { caminhoPermitido } from "../src/server/admin-api.ts";
import {
  botao,
  desmontar,
  digitar,
  esperar,
  exigir,
  montar,
  simularApi,
} from "./apoio-config.tsx";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/lojas",
}));

const LOJA = "3a3c3d4e-0000-4000-8000-000000000009";
const DONO = "9a9b9c9d-0000-4000-8000-000000000001";

afterEach(() => {
  desmontar();
  document.body.innerHTML = "";
});

describe("a barra de uso de um limite", () => {
  it("passa de verde para âmbar aos 80% e para vermelho no limite, e nunca passa de 100%", () => {
    expect(usoNaBarra(10, 100)).toEqual({ percentual: 10, tom: "normal" });
    expect(usoNaBarra(80, 100)).toEqual({ percentual: 80, tom: "atencao" });
    expect(usoNaBarra(100, 100)).toEqual({ percentual: 100, tom: "perigo" });
    expect(usoNaBarra(2, 1)).toEqual({ percentual: 100, tom: "perigo" });
    expect(usoNaBarra(0, 0)).toEqual({ percentual: 0, tom: "normal" });
  });

  it("é uma barra de progresso com nome e valor para o leitor de tela", () => {
    document.body.innerHTML = renderToStaticMarkup(
      <BarraDeUso uso={23} limite={500} rotulo="Produtos" />,
    );
    const barra = document.querySelector('[role="progressbar"]');
    expect(barra?.getAttribute("aria-label")).toBe("Produtos: 23 de 500");
    expect(barra?.getAttribute("aria-valuenow")).toBe("23");
    expect(barra?.getAttribute("aria-valuemax")).toBe("500");
  });
});

describe("aprovar, recusar, ativar e desativar", () => {
  it("cada situação oferece só os atos que a API aceita a partir dela", () => {
    expect(atosDisponiveis("PENDING_APPROVAL")).toEqual(["aprovar", "recusar"]);
    expect(atosDisponiveis("REJECTED")).toEqual(["aprovar"]);
    expect(atosDisponiveis("ACTIVE")).toEqual(["desativar"]);
    expect(atosDisponiveis("INACTIVE")).toEqual(["ativar"]);
    expect(atosDisponiveis("DELETED")).toEqual([]);
  });

  it("recusar abre a janela de confirmação, exige o motivo e só então manda à API", async () => {
    const ficha = {
      id: LOJA,
      status: "REJECTED",
    } as unknown as FichaDaLojaNoContrato;
    const chamadas = simularApi(() => ({ status: 200, corpo: ficha }));
    const aoMudar = vi.fn();
    // A ficha devolvida precisa passar no contrato: usamos a API de mentira só
    // para provar o que SAI; o parse da resposta é provado na ficha.
    const tela = montar(
      <AtosDeAprovacao
        loja={{ id: LOJA, nome: "Doceria da Bia", status: "PENDING_APPROVAL" }}
        aoMudar={aoMudar}
      />,
    );
    // jsdom não implementa a janela modal nativa: a prova usa o que ele tem.
    HTMLDialogElement.prototype.showModal ??= function (
      this: HTMLDialogElement,
    ) {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    };

    botao(tela, "Recusar").click();
    await esperar();
    expect(tela.textContent).toContain("Recusar Doceria da Bia?");
    expect(tela.textContent).toContain("registrada na auditoria");
    expect(chamadas).toEqual([]);

    // Sem motivo, nada sai.
    botao(tela, "Confirmar recusa").click();
    await esperar();
    expect(chamadas).toEqual([]);
    expect(tela.querySelector('[role="alert"]')?.textContent).toContain(
      "motivo da recusa",
    );

    digitar(
      exigir<HTMLTextAreaElement>(tela, "textarea"),
      "Documentos ilegíveis.",
    );
    botao(tela, "Confirmar recusa").click();
    await esperar();
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]).toMatchObject({
      url: `/api/admin/lojas/${LOJA}/recusar`,
      metodo: "POST",
      corpo: { motivo: "Documentos ilegíveis." },
    });
  });
});

const LIMITES: LimitesDaLojaNoContrato = {
  limites: [
    { recurso: "staff", limite: 1, uso: 2, restante: 0 },
    { recurso: "produtos", limite: 500, uso: 23, restante: 477 },
    { recurso: "categorias", limite: 50, uso: 6, restante: 44 },
    { recurso: "clientes", limite: 5000, uso: 11, restante: 4989 },
  ],
  ajustes: { staff: null, produtos: 800, categorias: null, clientes: null },
};

describe("os limites da loja", () => {
  it("vazio volta ao padrão (null), número vira número e texto solto é recusado antes de sair", () => {
    const base = { staff: "", produtos: "800", categorias: "", clientes: "" };
    expect(corpoDosLimites(base)).toEqual({
      corpo: { staff: null, produtos: 800, categorias: null, clientes: null },
    });
    expect(corpoDosLimites({ ...base, staff: "dois" })).toEqual({
      erro: "Pessoas na equipe: informe um número inteiro.",
    });
  });

  it("mostra uso de limite com a barra, marca o que foi ajustado e salva só pelo botão", async () => {
    const chamadas = simularApi((chamada) => {
      if (chamada.url === "/api/admin/limites") {
        return {
          status: 200,
          corpo: {
            lojasPorDono: 2,
            staffPorLoja: 1,
            produtosPorLoja: 500,
            categoriasPorLoja: 50,
            clientesPorLoja: 5000,
          },
        };
      }
      if (chamada.metodo === "PATCH") {
        return {
          status: 200,
          corpo: { ...LIMITES, ajustes: { ...LIMITES.ajustes, staff: 3 } },
        };
      }
      return { status: 200, corpo: LIMITES };
    });
    const tela = montar(<LimitesDaLoja lojaId={LOJA} />);
    await esperar();

    expect(tela.textContent).toContain("2 de 1");
    expect(tela.textContent).toContain("23 de 500");
    expect(tela.textContent).toContain("Ajustado");
    expect(tela.querySelectorAll('[role="progressbar"]')).toHaveLength(4);

    botao(tela, "Editar limites").click();
    await esperar();
    expect(tela.textContent).toContain("Vazio usa o padrão: 500.");
    digitar(exigir<HTMLInputElement>(tela, "#limite-staff"), "3");
    botao(tela, "Salvar limites").click();
    await esperar();

    const envio = chamadas.find((chamada) => chamada.metodo === "PATCH");
    expect(envio?.url).toBe(`/api/admin/lojas/${LOJA}/limites`);
    expect(envio?.corpo).toEqual({
      staff: 3,
      produtos: 800,
      categorias: null,
      clientes: null,
    });
    expect(tela.textContent).toContain("registrados na auditoria");
  });
});

const CONTA: ContaNaAdministracaoNoContrato = {
  identidadeId: DONO,
  nome: "Bia Torres",
  email: "bia@exemplo.test",
  telefone: null,
  criadaEm: "2026-10-16T12:00:00.000Z",
  tipo: "DONO",
  lojas: [
    {
      id: LOJA,
      nome: "Doceria da Bia",
      apelido: "doceria-da-bia",
      status: "PENDING_APPROVAL",
      papel: "OWNER",
    },
  ],
  pendentes: 1,
  lojasEmUso: 1,
  limiteDeLojas: 2,
};

const LISTA_DE_CONTAS: ListaDeContasNoContrato = {
  contas: [CONTA],
  total: 1,
  pagina: 1,
  porPagina: 25,
  contagens: { donos: 7, equipe: 2 },
};

describe("as contas", () => {
  it("a consulta vai e volta do endereço; equipe só aparece quando pedida", () => {
    expect(
      consultaDeContasDoEndereco(
        new URLSearchParams("tipo=equipe&busca=jo&pagina=3"),
      ),
    ).toEqual({ tipo: "equipe", busca: "jo", pagina: 3 });
    expect(consultaDeContasDoEndereco(new URLSearchParams("tipo=x"))).toEqual({
      tipo: "donos",
      busca: "",
      pagina: 1,
    });
    expect(
      enderecoDaPaginaDeContas({ tipo: "donos", busca: "", pagina: 1 }),
    ).toBe("/admin/contas");
    expect(
      enderecoDaListaDeContas({ tipo: "equipe", busca: " jo ", pagina: 2 }),
    ).toBe("/api/admin/contas?tipo=equipe&pagina=2&busca=jo");
  });

  it("a lista de donos mostra lojas contra o limite e as pendentes, e leva à conta", () => {
    document.body.innerHTML = renderToStaticMarkup(
      <TabelaDeContas
        consulta={{ tipo: "donos", busca: "", pagina: 1 }}
        termo=""
        estado={{ fase: "pronta", lista: LISTA_DE_CONTAS }}
        aoMudarTermo={() => undefined}
        aoBuscar={() => undefined}
        aoMudarTipo={() => undefined}
        aoTentarDeNovo={() => undefined}
        aoIrParaPagina={() => undefined}
      />,
    );
    const linha = document.querySelector("tbody tr");
    expect(linha?.textContent).toContain("Bia Torres");
    expect(linha?.textContent).toContain("1 de 2");
    expect(linha?.textContent).toContain("1 pendente");
    expect(
      linha?.querySelector(`a[href="/admin/contas/${DONO}"]`),
    ).not.toBeNull();
    expect(
      document.querySelector('[role="group"][aria-label="Tipo de conta"]')?.textContent,
    ).toContain("Equipe das lojas");
  });

  it("os estados de carregando, erro e vazio têm texto próprio", () => {
    const desenhar = (
      estado: Parameters<typeof TabelaDeContas>[0]["estado"],
    ) => {
      document.body.innerHTML = renderToStaticMarkup(
        <TabelaDeContas
          consulta={{ tipo: "equipe", busca: "", pagina: 1 }}
          termo=""
          estado={estado}
          aoMudarTermo={() => undefined}
          aoBuscar={() => undefined}
          aoMudarTipo={() => undefined}
          aoTentarDeNovo={() => undefined}
          aoIrParaPagina={() => undefined}
        />,
      );
      return document.body.textContent ?? "";
    };
    expect(desenhar({ fase: "carregando" })).toContain("Carregando contas");
    expect(desenhar({ fase: "erro", mensagem: "falhou" })).toContain(
      "As contas não carregaram",
    );
    expect(
      desenhar({
        fase: "pronta",
        lista: { ...LISTA_DE_CONTAS, contas: [], total: 0 },
      }),
    ).toContain("Nenhuma conta encontrada");
  });

  it("o limite de lojas do dono: vazio é o padrão, número é número, o resto é recusado", () => {
    expect(lojasDoCampo("")).toEqual({ lojas: null });
    expect(lojasDoCampo(" 5 ")).toEqual({ lojas: 5 });
    expect(lojasDoCampo("cinco")).toEqual({
      erro: "Informe um número inteiro.",
    });
    expect(lojasDoCampo("2000000")).toEqual({ erro: "No máximo 1.000.000." });
  });
});

describe("o menu da administração", () => {
  it("tem todas as funções à vista, em seções, com o número de lojas pendentes", () => {
    const { secoes, atalhos } = secoesDaAdministracao(3);
    const itens = secoes.flatMap((secao) => secao.itens);
    expect(itens.map((item) => item.rotulo)).toEqual([
      "Início",
      "Todas as lojas",
      "Pendentes",
      "Nova loja",
      "Contas",
      "Auditoria",
    ]);
    expect(itens.find((item) => item.rotulo === "Pendentes")).toMatchObject({
      href: "/admin/lojas?situacao=PENDING_APPROVAL",
      contador: 3,
    });
    expect(itens.every((item) => !("subitens" in item))).toBe(true);
    expect(atalhos).toHaveLength(5);
  });
});

describe("o repasse do site até a administração", () => {
  it("deixa passar o que a gestão usa, com o método certo, e continua barrando o resto", () => {
    expect(caminhoPermitido(`lojas/${LOJA}/aprovar`, "POST")).toBe(true);
    expect(caminhoPermitido(`lojas/${LOJA}/recusar`, "POST")).toBe(true);
    expect(caminhoPermitido(`lojas/${LOJA}/ativar`, "POST")).toBe(true);
    expect(caminhoPermitido(`lojas/${LOJA}/desativar`, "POST")).toBe(true);
    expect(caminhoPermitido(`lojas/${LOJA}/aprovar`, "GET")).toBe(false);
    expect(caminhoPermitido(`lojas/${LOJA}/metricas`, "GET")).toBe(true);
    expect(caminhoPermitido(`lojas/${LOJA}/equipe`, "GET")).toBe(true);
    expect(caminhoPermitido(`lojas/${LOJA}/equipe`, "POST")).toBe(false);
    expect(caminhoPermitido(`lojas/${LOJA}/limites`, "PATCH")).toBe(true);
    expect(caminhoPermitido(`donos/${DONO}/limites`, "PATCH")).toBe(true);
    expect(caminhoPermitido("limites", "GET")).toBe(true);
    expect(caminhoPermitido("limites", "PATCH")).toBe(false);
    expect(caminhoPermitido("contas", "GET")).toBe(true);
    expect(caminhoPermitido(`contas/${DONO}`, "GET")).toBe(true);
    expect(caminhoPermitido(`contas/${DONO}`, "DELETE")).toBe(false);
    expect(caminhoPermitido("contas/qualquer-coisa", "GET")).toBe(false);
  });
});
