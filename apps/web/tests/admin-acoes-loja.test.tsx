// @vitest-environment jsdom
/**
 * Suspender, reativar, excluir e restaurar, do lado da tela (AC-209, AC-210,
 * AC-211, P-012).
 *
 * O ato de verdade — vitrine fora do ar, aviso do dono, nada apagado,
 * retenção de 30 dias e remoção definitiva — está provado contra o banco em
 * `apps/api/tests/admin-situacao.test.ts`. Aqui se prova o que só a tela
 * faz: os dois passos de cada ato, o motivo obrigatório antes de suspender,
 * a confirmação que diz o que muda e o que não muda, o botão de excluir que
 * só habilita com o nome digitado, e que nada sai antes da confirmação.
 */
import axe from "axe-core";
import type {
  FichaDaLojaNoContrato,
  RegistroDaTrilhaNoContrato,
} from "@simpleclick/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AcoesLoja,
  consequenciasDoAto,
} from "../src/features/admin/AcoesLoja.tsx";
import { ListaDaTrilha } from "../src/features/admin/ListaDaTrilha.tsx";
import { caminhoPermitido } from "../src/server/admin-api.ts";
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
  type ChamadaDaApi,
  type RespostaSimulada,
} from "./apoio-config.tsx";

const LOJA_ID = "5c1d0e2f-0000-4000-8000-000000000001";

const FICHA: FichaDaLojaNoContrato = {
  id: LOJA_ID,
  codigo: "0007",
  nome: "Pastel da Joi",
  razaoSocial: null,
  documento: { numero: "11222333000181", tipo: "CNPJ" },
  apelido: "pastel-da-joi",
  status: "ACTIVE",
  tipoDeNegocio: {
    codigo: "FOOD_SNACK",
    nome: "Lanchonete",
    controlaEstoque: false,
  },
  contato: { email: null, telefone: null },
  endereco: {
    cep: null,
    logradouro: null,
    numero: null,
    complemento: null,
    bairro: null,
    cidade: null,
    uf: null,
  },
  criadaEm: "2026-09-01T12:00:00.000Z",
  atualizadaEm: "2026-09-01T12:00:00.000Z",
  suspensao: null,
  retencao: null,
  historico: [],
};

const SUSPENSA: FichaDaLojaNoContrato = {
  ...FICHA,
  status: "INACTIVE",
  suspensao: {
    desde: "2026-10-01T12:30:00.000Z",
    motivo: "Mensalidade em atraso",
  },
};

const EXCLUIDA: FichaDaLojaNoContrato = {
  ...FICHA,
  status: "DELETED",
  retencao: {
    excluidaEm: "2026-10-03T12:00:00.000Z",
    removerApos: "2026-11-02T12:00:00.000Z",
  },
};

/** Toda chamada responde com a ficha dada (ou a resposta escrita). */
function api(resposta: RespostaSimulada) {
  return simularApi((_chamada: ChamadaDaApi) => resposta);
}

function envios(chamadas: readonly ChamadaDaApi[]) {
  return chamadas.filter((chamada) => chamada.metodo !== "GET");
}

afterEach(() => {
  desmontar();
  document.body.innerHTML = "";
});

describe("suspender pede o motivo e confirmação (AC-209)", () => {
  it("@spec:AC-209 sem motivo, a tela recusa antes de enviar; com ele, a suspensão só sai depois da confirmação que diz o que muda", async () => {
    const chamadas = api({ status: 200, corpo: SUSPENSA });
    const aoMudar = vi.fn();
    const tela = montar(<AcoesLoja ficha={FICHA} aoMudar={aoMudar} />);
    const formulario = exigir<HTMLFormElement>(
      tela,
      'form[aria-label="Suspensão da loja"]',
    );

    expect(tela.textContent).toContain("A loja está no ar.");
    await enviar(formulario);
    expect(
      tela.querySelector("#ficha-motivo-da-suspensao-erro")?.textContent,
    ).toContain("Informe o motivo da suspensão");
    expect(envios(chamadas)).toEqual([]);

    digitar(
      exigir<HTMLTextAreaElement>(tela, "#ficha-motivo-da-suspensao"),
      "Mensalidade em atraso",
    );
    await enviar(formulario);

    // Pedir a suspensão não envia nada: aparece a confirmação.
    expect(envios(chamadas)).toEqual([]);
    const confirmacao = exigir<HTMLElement>(tela, ".sc-aviso--atencao");
    expect(confirmacao.textContent).toContain("Suspender Pastel da Joi?");
    expect(confirmacao.textContent).toContain(
      "A vitrine e o fechamento saem do ar na hora",
    );
    expect(confirmacao.textContent).toContain(
      "Nenhum produto, pedido ou configuração é apagado",
    );
    expect(confirmacao.textContent).toContain(
      "Motivo que o dono vai ler: Mensalidade em atraso",
    );

    clicar(botao(tela, "Confirmar a suspensão"));
    await esperar();

    expect(envios(chamadas)).toEqual([
      {
        url: `/api/admin/lojas/${LOJA_ID}/suspensao`,
        metodo: "PUT",
        corpo: { motivo: "Mensalidade em atraso" },
      },
    ]);
    expect(aoMudar).toHaveBeenCalledWith(SUSPENSA);
    expect(tela.textContent).toContain("Loja suspensa. A vitrine saiu do ar.");
  });

  it("@spec:AC-209 cancelar a confirmação não envia nada", async () => {
    const chamadas = api({ status: 200, corpo: SUSPENSA });
    const tela = montar(<AcoesLoja ficha={FICHA} aoMudar={() => {}} />);

    digitar(
      exigir<HTMLTextAreaElement>(tela, "#ficha-motivo-da-suspensao"),
      "Uso indevido",
    );
    await enviar(
      exigir<HTMLFormElement>(tela, 'form[aria-label="Suspensão da loja"]'),
    );
    clicar(botao(tela, "Cancelar"));
    await esperar();

    expect(envios(chamadas)).toEqual([]);
    expect(tela.textContent).not.toContain("Suspender Pastel da Joi?");
  });

  it("@spec:AC-209 a loja suspensa mostra desde quando e o motivo, e oferece a reativação", () => {
    api({ status: 200, corpo: FICHA });
    const tela = montar(<AcoesLoja ficha={SUSPENSA} aoMudar={() => {}} />);

    const aviso = exigir<HTMLElement>(tela, ".sc-aviso--atencao");
    expect(aviso.textContent).toContain("Loja suspensa desde 01/10/2026");
    expect(aviso.textContent).toContain("Motivo: Mensalidade em atraso");
    expect(botao(tela, "Reativar loja")).toBeDefined();
    expect(tela.querySelector("#ficha-motivo-da-suspensao")).toBeNull();
  });
});

describe("reativar devolve a loja ao ar (AC-210)", () => {
  it("@spec:AC-210 reativar sai em dois passos, avisa que o catálogo volta igual e que o período fica no histórico", async () => {
    const chamadas = api({ status: 200, corpo: FICHA });
    const aoMudar = vi.fn();
    const tela = montar(<AcoesLoja ficha={SUSPENSA} aoMudar={aoMudar} />);

    clicar(botao(tela, "Reativar loja"));
    expect(envios(chamadas)).toEqual([]);
    const textoDaConfirmacao = tela.textContent ?? "";
    expect(textoDaConfirmacao).toContain("Reativar Pastel da Joi?");
    expect(textoDaConfirmacao).toContain(
      "A vitrine volta a atender com o mesmo catálogo de antes.",
    );
    expect(textoDaConfirmacao).toContain(
      "O período da suspensão fica registrado no histórico.",
    );

    clicar(botao(tela, "Confirmar a reativação"));
    await esperar();

    expect(envios(chamadas)).toEqual([
      {
        url: `/api/admin/lojas/${LOJA_ID}/reativacao`,
        metodo: "PUT",
        corpo: {},
      },
    ]);
    expect(aoMudar).toHaveBeenCalledWith(FICHA);
  });

  it("@spec:AC-210 o histórico mostra o período da suspensão em dia e hora, e a situação pelo nome", () => {
    const registro: RegistroDaTrilhaNoContrato = {
      id: "9",
      quando: "2026-10-03T15:00:00.000Z",
      acao: "LOJA_REATIVADA",
      quem: { id: "a", nome: "Administradora geral" },
      papel: "ADMIN",
      campos: [
        { campo: "status", antes: "INACTIVE", depois: "ACTIVE" },
        {
          campo: "suspensaDesde",
          antes: null,
          depois: "2026-10-01T12:30:00.000Z",
        },
        {
          campo: "suspensaAte",
          antes: null,
          depois: "2026-10-03T15:00:00.000Z",
        },
        { campo: "motivo", antes: null, depois: "Mensalidade em atraso" },
      ],
      sensivel: false,
    };

    const html = renderToStaticMarkup(<ListaDaTrilha registros={[registro]} />);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const linhas = [...doc.querySelectorAll("dl > div")].map((linha) =>
      [linha.querySelector("dt"), linha.querySelector("dd")]
        .map((parte) => (parte?.textContent ?? "").replace(/\s+/g, " ").trim())
        .join(" "),
    );

    expect(doc.body.textContent).toContain("Loja reativada");
    expect(linhas).toEqual([
      "Situação: Desativada → Ativa",
      "Suspensa desde: — → 01/10/2026, 09:30",
      "Suspensa até: — → 03/10/2026, 12:00",
      "Motivo: — → Mensalidade em atraso",
    ]);
  });
});

describe("excluir exige o nome e avisa da retenção (AC-211)", () => {
  it("@spec:AC-211 o botão de excluir só habilita com o nome da loja digitado, e a confirmação diz que os dados ficam retidos por 30 dias", async () => {
    const chamadas = api({ status: 200, corpo: EXCLUIDA });
    const aoMudar = vi.fn();
    const tela = montar(<AcoesLoja ficha={FICHA} aoMudar={aoMudar} />);

    clicar(botao(tela, "Excluir loja…"));
    const confirmacao = exigir<HTMLElement>(tela, ".sc-aviso--atencao");
    expect(confirmacao.textContent).toContain("Excluir Pastel da Joi?");
    expect(confirmacao.textContent).toContain(
      "Os dados ficam retidos por 30 dias, e a loja pode ser restaurada nesse prazo.",
    );
    expect(confirmacao.textContent).toContain(
      "Digite exatamente: Pastel da Joi",
    );
    const excluir = botao(tela, "Excluir a loja");
    expect(excluir.disabled).toBe(true);

    const campo = exigir<HTMLInputElement>(
      tela,
      "#ficha-confirmacao-da-exclusao",
    );
    digitar(campo, "pastel da joi");
    expect(botao(tela, "Excluir a loja").disabled).toBe(true);
    clicar(botao(tela, "Excluir a loja"));
    await esperar();
    expect(envios(chamadas)).toEqual([]);

    digitar(campo, " Pastel da Joi ");
    expect(botao(tela, "Excluir a loja").disabled).toBe(false);
    clicar(botao(tela, "Excluir a loja"));
    await esperar();

    expect(envios(chamadas)).toEqual([
      {
        url: `/api/admin/lojas/${LOJA_ID}`,
        metodo: "DELETE",
        corpo: { confirmacao: " Pastel da Joi " },
      },
    ]);
    expect(aoMudar).toHaveBeenCalledWith(EXCLUIDA);
  });

  it("@spec:AC-211 a recusa da API aparece e a ficha não muda", async () => {
    api({
      status: 422,
      corpo: {
        erro: "confirmacao_diferente",
        campos: [
          {
            onde: "body",
            caminho: "confirmacao",
            mensagem:
              "O nome digitado não é o nome da loja. Nada foi excluído.",
          },
        ],
      },
    });
    const aoMudar = vi.fn();
    const tela = montar(<AcoesLoja ficha={FICHA} aoMudar={aoMudar} />);

    clicar(botao(tela, "Excluir loja…"));
    digitar(
      exigir<HTMLInputElement>(tela, "#ficha-confirmacao-da-exclusao"),
      "Pastel da Joi",
    );
    clicar(botao(tela, "Excluir a loja"));
    await esperar();

    expect(aoMudar).not.toHaveBeenCalled();
    expect(tela.querySelector('[role="alert"]')?.textContent).toContain(
      "Nada foi excluído",
    );
  });

  it("@spec:AC-211 a loja excluída, dentro do prazo, mostra até quando os dados ficam e oferece a restauração", async () => {
    const chamadas = api({ status: 200, corpo: FICHA });
    const aoMudar = vi.fn();
    const tela = montar(
      <AcoesLoja
        ficha={EXCLUIDA}
        aoMudar={aoMudar}
        agora={() => new Date("2026-10-10T12:00:00.000Z")}
      />,
    );

    const aviso = exigir<HTMLElement>(tela, ".sc-aviso--erro");
    expect(aviso.textContent).toContain("Loja excluída em 03/10/2026");
    expect(aviso.textContent).toContain(
      "Os dados ficam retidos até 02/11/2026",
    );
    expect(tela.querySelector("#ficha-motivo-da-suspensao")).toBeNull();

    clicar(botao(tela, "Restaurar loja"));
    expect(tela.textContent).toContain(
      "A loja volta à situação de antes da exclusão",
    );
    clicar(botao(tela, "Confirmar a restauração"));
    await esperar();

    expect(envios(chamadas)).toEqual([
      {
        url: `/api/admin/lojas/${LOJA_ID}/restauracao`,
        metodo: "PUT",
        corpo: {},
      },
    ]);
    expect(aoMudar).toHaveBeenCalledWith(FICHA);
  });

  it("@spec:AC-211 vencido o prazo, ou já removida em definitivo, não há restauração", () => {
    api({ status: 200, corpo: FICHA });
    const vencida = montar(
      <AcoesLoja
        ficha={EXCLUIDA}
        aoMudar={() => {}}
        agora={() => new Date("2026-11-03T12:00:00.000Z")}
      />,
    );
    expect(vencida.textContent).toContain("O prazo de restauração venceu");
    expect(
      [...vencida.querySelectorAll("button")].map((item) => item.textContent),
    ).not.toContain("Restaurar loja");
    desmontar();

    const removida = montar(
      <AcoesLoja
        ficha={{
          ...EXCLUIDA,
          retencao: {
            excluidaEm: "2026-10-03T12:00:00.000Z",
            removerApos: null,
          },
        }}
        aoMudar={() => {}}
      />,
    );
    expect(removida.textContent).toContain(
      "Os dados desta loja já foram removidos em definitivo",
    );
    expect(removida.querySelectorAll("button")).toHaveLength(0);
  });

  it("@spec:AC-211 o que a exclusão faz é dito com o que fica guardado depois do prazo", () => {
    expect(consequenciasDoAto("excluir")).toContain(
      "Depois do prazo, o cadastro, os acessos e os documentos do responsável são removidos em definitivo. Pedidos, contrato e histórico ficam guardados.",
    );
  });
});

describe("o site repassa os atos, e só eles (AC-209, AC-210, AC-211)", () => {
  it("@spec:AC-209 @spec:AC-210 @spec:AC-211 cada ato passa pelo método dele, e nenhum outro", () => {
    expect(caminhoPermitido(`lojas/${LOJA_ID}/suspensao`, "PUT")).toBe(true);
    expect(caminhoPermitido(`lojas/${LOJA_ID}/suspensao`, "DELETE")).toBe(
      false,
    );
    expect(caminhoPermitido(`lojas/${LOJA_ID}/reativacao`, "PUT")).toBe(true);
    expect(caminhoPermitido(`lojas/${LOJA_ID}/reativacao`, "POST")).toBe(false);
    expect(caminhoPermitido(`lojas/${LOJA_ID}/restauracao`, "PUT")).toBe(true);
    expect(caminhoPermitido(`lojas/${LOJA_ID}`, "DELETE")).toBe(true);
    expect(caminhoPermitido("lojas", "DELETE")).toBe(false);
  });
});

describe("acessibilidade das confirmações (P-012)", () => {
  it("@spec:AC-211 @principle:P-012 a confirmação da exclusão não tem violação crítica nem séria", async () => {
    api({ status: 200, corpo: EXCLUIDA });
    const tela = montar(<AcoesLoja ficha={SUSPENSA} aoMudar={() => {}} />);
    clicar(botao(tela, "Excluir loja…"));

    const resultado = await axe.run(tela, {
      rules: { region: { enabled: false } },
    });
    const graves = resultado.violations.filter(
      (violacao) =>
        violacao.impact === "critical" || violacao.impact === "serious",
    );
    expect(graves.map((violacao) => violacao.id)).toEqual([]);
    // O axe percorre a árvore inteira no jsdom e leva segundos com a máquina
    // ocupada: o prazo padrão de 5 s reprovava por tempo, não por violação.
  }, 60_000);

  it("@spec:AC-209 @principle:P-012 o pedido de suspensão, com o motivo recusado, não tem violação crítica nem séria", async () => {
    api({ status: 200, corpo: SUSPENSA });
    const tela = montar(<AcoesLoja ficha={FICHA} aoMudar={() => {}} />);
    await enviar(
      exigir<HTMLFormElement>(tela, 'form[aria-label="Suspensão da loja"]'),
    );

    const resultado = await axe.run(tela, {
      rules: { region: { enabled: false } },
    });
    const graves = resultado.violations.filter(
      (violacao) =>
        violacao.impact === "critical" || violacao.impact === "serious",
    );
    expect(graves.map((violacao) => violacao.id)).toEqual([]);
  }, 60_000);
});
