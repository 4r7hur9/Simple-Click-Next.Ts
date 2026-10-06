/**
 * Histórico de auditoria consultável, sem banco (AC-215).
 *
 * O que se prova aqui é a TRADUÇÃO: o período em dias de Brasília vira
 * instantes, a falta de filtro de ato deixa de fora as consultas, e a leitura
 * mascara de novo o campo pessoal que tenha escapado da gravação (P-009). A
 * consulta contra o banco de verdade está em `tests/admin-auditoria.test.ts`.
 */
import { esquemaDaConsultaDaAuditoria } from "@simpleclick/contracts";
import { describe, expect, it } from "vitest";

import {
  campoPessoal,
  consultarAuditoria,
  lojasDaPagina,
  prepararBuscaNaAuditoria,
  registroDaAuditoria,
  type BuscaNaAuditoria,
  type LinhaDaAuditoria,
} from "./auditoria.usecase.ts";

const LOJA = {
  id: "5b0c0000-0000-4000-8000-000000000001",
  codigo: "0001",
  nome: "Pastel da Joi",
};

function linha(sobrescrita: Partial<LinhaDaAuditoria> = {}): LinhaDaAuditoria {
  return {
    id: "1",
    quando: new Date("2026-10-01T15:00:00.000Z"),
    acao: "CONFIG_SENSIVEL_ALTERADA",
    atorId: "5b0c0000-0000-4000-8000-0000000000aa",
    atorNome: "Joi",
    papel: "OWNER",
    antes: { campos: { "pix.chave": "…8909" } },
    depois: {
      campos: { "pix.chave": "…1234" },
      sensivel: true,
      camposSensiveis: ["pix.chave"],
    },
    loja: LOJA,
    ...sobrescrita,
  };
}

describe("consulta do histórico de auditoria (AC-215)", () => {
  it("@spec:AC-215 o período em dias vira instantes de Brasília, com o último dia inteiro", () => {
    const consulta = esquemaDaConsultaDaAuditoria.parse({
      de: "2026-10-01",
      ate: "2026-10-02",
      pagina: "3",
      porPagina: "10",
    });
    const busca = prepararBuscaNaAuditoria(consulta);
    expect(busca.desde?.toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(busca.antesDe?.toISOString()).toBe("2026-10-03T03:00:00.000Z");
    expect(busca.limite).toBe(10);
    expect(busca.deslocamento).toBe(20);
  });

  it("@spec:AC-215 sem filtro de ato as consultas da administração ficam de fora; pedidas, aparecem", () => {
    const sem = prepararBuscaNaAuditoria(
      esquemaDaConsultaDaAuditoria.parse({}),
    );
    expect(sem).toMatchObject({
      lojaId: null,
      acao: null,
      desde: null,
      antesDe: null,
      semConsultas: true,
    });
    const com = prepararBuscaNaAuditoria(
      esquemaDaConsultaDaAuditoria.parse({ ato: "ADMIN_ACCESS", loja: "" }),
    );
    expect(com).toMatchObject({ acao: "ADMIN_ACCESS", semConsultas: false });
  });

  it("@spec:AC-215 filtro inválido é recusado na borda: período invertido, ato fora do formato, loja que não é uuid", () => {
    expect(
      esquemaDaConsultaDaAuditoria.safeParse({
        de: "2026-10-05",
        ate: "2026-10-01",
      }).success,
    ).toBe(false);
    expect(
      esquemaDaConsultaDaAuditoria.safeParse({ ato: "drop table" }).success,
    ).toBe(false);
    expect(
      esquemaDaConsultaDaAuditoria.safeParse({ loja: "0001" }).success,
    ).toBe(false);
    expect(
      esquemaDaConsultaDaAuditoria.safeParse({ de: "01/10/2026" }).success,
    ).toBe(false);
  });

  it("@spec:AC-215 a troca da chave PIX sai destacada, com a loja, o antes e o depois mascarados", () => {
    const registro = registroDaAuditoria(linha());
    expect(registro.sensivel).toBe(true);
    expect(registro.loja).toEqual(LOJA);
    expect(registro.quem).toEqual({
      id: "5b0c0000-0000-4000-8000-0000000000aa",
      nome: "Joi",
    });
    expect(registro.campos).toEqual([
      { campo: "pix.chave", antes: "…8909", depois: "…1234" },
    ]);
  });

  it("@spec:AC-215 dado pessoal gravado em claro por fora da regra é mascarado na leitura (P-009)", () => {
    const registro = registroDaAuditoria(
      linha({
        acao: "LOJA_ALTERADA",
        antes: {
          campos: {
            email: "joi@pastel.test",
            documento: "11222333000181",
            "whatsapp.numero": "+5511988887777",
            nome: "Pastel da Joi",
            numero: "100",
          },
        },
        depois: {
          campos: {
            email: "contato@pastel.test",
            documento: { tipo: "CNPJ", valor: "11222333000181" },
            "whatsapp.numero": "…7777",
            nome: "Pastelaria Joi",
            numero: "200",
          },
        },
      }),
    );
    const texto = JSON.stringify(registro);
    expect(texto).not.toContain("joi@pastel.test");
    expect(texto).not.toContain("contato@pastel.test");
    expect(texto).not.toContain("11222333000181");
    expect(texto).not.toContain("988887777");
    expect(registro.campos).toEqual([
      { campo: "email", antes: "…test", depois: "…test" },
      { campo: "documento", antes: "…0181", depois: "…" },
      { campo: "whatsapp.numero", antes: "…7777", depois: "…7777" },
      { campo: "nome", antes: "Pastel da Joi", depois: "Pastelaria Joi" },
      { campo: "numero", antes: "100", depois: "200" },
    ]);
  });

  it("@spec:AC-215 o nome do campo diz se ele é pessoal; o número da casa não é contato", () => {
    for (const campo of [
      "pix.chave",
      "responsavel.email",
      "telefone1",
      "cep",
      "whatsapp.numero",
    ]) {
      expect(campoPessoal(campo), campo).toBe(true);
    }
    for (const campo of ["nome", "numero", "status", "pix.tipo", "formas"]) {
      expect(campoPessoal(campo), campo).toBe(false);
    }
  });

  it("@spec:AC-215 a página volta no formato do contrato e lista cada loja uma vez só", async () => {
    let recebida: BuscaNaAuditoria | undefined;
    const pagina = await consultarAuditoria(
      esquemaDaConsultaDaAuditoria.parse({ pagina: 2, porPagina: 2 }),
      {
        async buscarNaAuditoria(busca) {
          recebida = busca;
          return {
            linhas: [linha({ id: "9" }), linha({ id: "8" })],
            total: 7,
          };
        },
      },
    );
    expect(recebida?.deslocamento).toBe(2);
    expect(pagina).toMatchObject({ total: 7, pagina: 2, porPagina: 2 });
    expect(pagina.registros.map((registro) => registro.id)).toEqual(["9", "8"]);
    expect(lojasDaPagina(pagina)).toEqual([LOJA.id]);
  });
});
