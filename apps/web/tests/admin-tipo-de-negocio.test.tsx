// @vitest-environment jsdom
/**
 * A troca do tipo de negócio na ficha da loja (AC-214, P-012).
 *
 * A troca de verdade — vitrine com o vocabulário novo, estoque ligado no
 * painel, nada perdido no banco — está provada contra o banco em
 * `apps/api/tests/admin-tipo-de-negocio.test.ts`. Aqui se prova o que só a
 * tela faz: os dois passos (escolher e confirmar), a confirmação que diz o
 * que muda e o que não muda, e que nada sai antes da confirmação.
 */
import axe from "axe-core";
import type {
  FichaDaLojaNoContrato,
  TipoDeNegocioNoContrato,
} from "@simpleclick/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  consequenciasDaTroca,
  SeletorVertical,
} from "../src/features/admin/SeletorVertical.tsx";
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

const LOJA_ID = "3a3c3d4e-0000-4000-8000-000000000001";

const LANCHONETE: TipoDeNegocioNoContrato = {
  codigo: "FOOD_SNACK",
  nome: "Lanchonete",
  controlaEstoque: false,
};
const ROUPAS: TipoDeNegocioNoContrato = {
  codigo: "APPAREL",
  nome: "Roupas",
  controlaEstoque: true,
};

const FICHA: FichaDaLojaNoContrato = {
  id: LOJA_ID,
  codigo: "0001",
  nome: "Lanches do Zé",
  razaoSocial: null,
  documento: { numero: "11222333000181", tipo: "CNPJ" },
  apelido: "lanches-do-ze",
  status: "ACTIVE",
  tipoDeNegocio: LANCHONETE,
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

const TROCADA: FichaDaLojaNoContrato = {
  ...FICHA,
  tipoDeNegocio: ROUPAS,
  atualizadaEm: "2026-09-27T12:00:00.000Z",
};

/** A API da tela: a lista de tipos e, quando chega, a troca. */
function api(troca: RespostaSimulada = { status: 200, corpo: TROCADA }) {
  return simularApi((chamada: ChamadaDaApi) =>
    chamada.url === "/api/admin/tipos-de-negocio"
      ? { status: 200, corpo: { tipos: [LANCHONETE, ROUPAS] } }
      : troca,
  );
}

async function escolherRoupas(tela: HTMLElement): Promise<void> {
  digitar(exigir<HTMLSelectElement>(tela, "#ficha-tipo-de-negocio"), "APPAREL");
  await enviar(
    exigir<HTMLFormElement>(
      tela,
      'form[aria-label="Troca do tipo de negócio"]',
    ),
  );
}

afterEach(() => {
  desmontar();
  document.body.innerHTML = "";
});

describe("a troca do tipo de negócio na ficha (AC-214)", () => {
  it("@spec:AC-214 a troca só sai depois da confirmação, que diz o que muda e o que não muda", async () => {
    const chamadas = api();
    const aoTrocar = vi.fn();
    const tela = montar(<SeletorVertical ficha={FICHA} aoTrocar={aoTrocar} />);
    await esperar();

    expect(tela.textContent).toContain("Tipo atual: Lanchonete");
    await escolherRoupas(tela);

    // Escolher não envia nada: aparece a confirmação.
    expect(chamadas.filter((chamada) => chamada.metodo === "PUT")).toEqual([]);
    const confirmacao = exigir<HTMLElement>(tela, '[role="status"]');
    expect(confirmacao.textContent).toContain(
      "Trocar Lanches do Zé para Roupas?",
    );
    expect(confirmacao.textContent).toContain(
      "Nenhum produto, categoria, grupo de escolha ou preço é apagado",
    );
    expect(confirmacao.textContent).toContain(
      "O controle de estoque passa a valer",
    );

    clicar(botao(tela, "Confirmar a troca"));
    await esperar();

    const envio = chamadas.find((chamada) => chamada.metodo === "PUT");
    expect(envio?.url).toBe(`/api/admin/lojas/${LOJA_ID}/tipo-de-negocio`);
    expect(envio?.corpo).toEqual({ tipoDeNegocio: "APPAREL" });
    expect(aoTrocar).toHaveBeenCalledWith(TROCADA);
    expect(tela.textContent).toContain("Tipo de negócio trocado para Roupas");
  });

  it("@spec:AC-214 cancelar a confirmação não envia nada", async () => {
    const chamadas = api();
    const tela = montar(<SeletorVertical ficha={FICHA} aoTrocar={() => {}} />);
    await esperar();

    await escolherRoupas(tela);
    clicar(botao(tela, "Cancelar"));
    await esperar();

    expect(chamadas.filter((chamada) => chamada.metodo === "PUT")).toEqual([]);
    expect(tela.textContent).not.toContain("Trocar Lanches do Zé para Roupas?");
  });

  it("@spec:AC-214 troca recusada diz que a loja continua com o tipo de antes", async () => {
    api({ status: 500, corpo: { erro: "interno" } });
    const aoTrocar = vi.fn();
    const tela = montar(<SeletorVertical ficha={FICHA} aoTrocar={aoTrocar} />);
    await esperar();

    await escolherRoupas(tela);
    clicar(botao(tela, "Confirmar a troca"));
    await esperar();

    expect(aoTrocar).not.toHaveBeenCalled();
    expect(tela.querySelector('[role="alert"]')?.textContent).toContain(
      "continua com o tipo de antes",
    );
  });

  it("@spec:AC-214 @principle:P-012 a confirmação não tem violação crítica nem séria de acessibilidade", async () => {
    api();
    const tela = montar(<SeletorVertical ficha={FICHA} aoTrocar={() => {}} />);
    await esperar();
    await escolherRoupas(tela);

    const resultado = await axe.run(tela, {
      rules: { region: { enabled: false } },
    });
    const graves = resultado.violations.filter(
      (violacao) =>
        violacao.impact === "critical" || violacao.impact === "serious",
    );
    expect(graves.map((violacao) => violacao.id)).toEqual([]);
  });

  it("@spec:AC-214 a volta para comida avisa que os saldos ficam guardados, e o site só repassa a troca por PUT", () => {
    expect(consequenciasDaTroca(ROUPAS, LANCHONETE)).toContain(
      "O controle de estoque deixa de ser pedido: a venda passa a ser por disponível ou esgotado. Os saldos já informados ficam guardados.",
    );
    expect(caminhoPermitido(`lojas/${LOJA_ID}/tipo-de-negocio`, "PUT")).toBe(
      true,
    );
    expect(caminhoPermitido(`lojas/${LOJA_ID}/tipo-de-negocio`, "POST")).toBe(
      false,
    );
    expect(caminhoPermitido(`lojas/${LOJA_ID}/tipo-de-negocio`, "GET")).toBe(
      false,
    );
  });
});
