// @vitest-environment jsdom
/**
 * A troca do endereço da loja na ficha (AC-208, P-012).
 *
 * A troca de verdade e o endereço antigo que continua levando à loja estão
 * provados contra o banco em `apps/api/tests/admin-apelido.test.ts`, e o
 * redirecionamento do site em `apelido-antigo.test.ts`. Aqui se prova a tela:
 * ela avisa que o link antigo continua funcionando, confere o formato antes de
 * enviar, e devolve o apelido ocupado com a variação livre sugerida.
 */
import axe from "axe-core";
import type { FichaDaLojaNoContrato } from "@simpleclick/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EnderecoDaLoja } from "../src/features/admin/EnderecoDaLoja.tsx";
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
} from "./apoio-config.tsx";

const LOJA_ID = "3a3c3d4e-0000-4000-8000-000000000001";

const FICHA: FichaDaLojaNoContrato = {
  id: LOJA_ID,
  codigo: "0001",
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
  historico: [],
};

function formulario(tela: HTMLElement): HTMLFormElement {
  return exigir<HTMLFormElement>(
    tela,
    'form[aria-label="Troca do endereço da loja"]',
  );
}

afterEach(() => {
  desmontar();
  document.body.innerHTML = "";
});

describe("a troca do endereço na ficha (AC-208)", () => {
  it("@spec:AC-208 a tela avisa que o link antigo continua funcionando e, trocado, diz para onde ele leva", async () => {
    const trocada = { ...FICHA, apelido: "pastelaria-joi" };
    const chamadas = simularApi(() => ({ status: 200, corpo: trocada }));
    const aoTrocar = vi.fn();
    const tela = montar(<EnderecoDaLoja ficha={FICHA} aoTrocar={aoTrocar} />);

    expect(tela.textContent).toContain("Endereço atual: /l/pastel-da-joi");
    expect(tela.querySelector("#ficha-apelido-dica")?.textContent).toContain(
      "O endereço antigo continua funcionando",
    );

    digitar(exigir<HTMLInputElement>(tela, "#ficha-apelido"), "pastelaria-joi");
    await enviar(formulario(tela));

    expect(chamadas).toEqual([
      {
        url: `/api/admin/lojas/${LOJA_ID}/apelido`,
        metodo: "PUT",
        corpo: { apelido: "pastelaria-joi" },
      },
    ]);
    expect(aoTrocar).toHaveBeenCalledWith(trocada);
    expect(tela.textContent).toContain(
      "Quem abrir o link antigo, /l/pastel-da-joi, é levado ao endereço novo.",
    );
  });

  it("@spec:AC-208 apelido ocupado volta apontando o campo, com a variação livre pronta para usar", async () => {
    simularApi(() => ({
      status: 409,
      corpo: {
        erro: "apelido_em_uso",
        campos: [
          {
            onde: "body",
            caminho: "apelido",
            mensagem: "Este endereço já está em uso por outra loja.",
          },
        ],
        sugestao: "pastelaria-joi-2",
      },
    }));
    const tela = montar(<EnderecoDaLoja ficha={FICHA} aoTrocar={() => {}} />);

    digitar(exigir<HTMLInputElement>(tela, "#ficha-apelido"), "pastelaria-joi");
    await enviar(formulario(tela));

    expect(tela.querySelector("#ficha-apelido-erro")?.textContent).toContain(
      "já está em uso",
    );
    clicar(botao(tela, "usar pastelaria-joi-2"));
    await esperar();
    expect(exigir<HTMLInputElement>(tela, "#ficha-apelido").value).toBe(
      "pastelaria-joi-2",
    );
  });

  it("@spec:AC-208 endereço fora do formato ou igual ao atual não sai da tela", async () => {
    const chamadas = simularApi(() => ({ status: 200, corpo: FICHA }));
    const tela = montar(<EnderecoDaLoja ficha={FICHA} aoTrocar={() => {}} />);

    digitar(exigir<HTMLInputElement>(tela, "#ficha-apelido"), "Com Espaço");
    await enviar(formulario(tela));
    expect(tela.querySelector("#ficha-apelido-erro")).not.toBeNull();

    digitar(exigir<HTMLInputElement>(tela, "#ficha-apelido"), "pastel-da-joi");
    await enviar(formulario(tela));
    expect(tela.querySelector("#ficha-apelido-erro")?.textContent).toContain(
      "já é o endereço atual",
    );

    expect(chamadas).toEqual([]);
    expect(caminhoPermitido(`lojas/${LOJA_ID}/apelido`, "PUT")).toBe(true);
    expect(caminhoPermitido(`lojas/${LOJA_ID}/apelido`, "DELETE")).toBe(false);
  });

  it("@spec:AC-208 @principle:P-012 a troca de endereço não tem violação crítica nem séria de acessibilidade", async () => {
    const tela = montar(<EnderecoDaLoja ficha={FICHA} aoTrocar={() => {}} />);
    const resultado = await axe.run(tela, {
      rules: { region: { enabled: false } },
    });
    const graves = resultado.violations.filter(
      (violacao) =>
        violacao.impact === "critical" || violacao.impact === "serious",
    );
    expect(graves.map((violacao) => violacao.id)).toEqual([]);
  });
});
