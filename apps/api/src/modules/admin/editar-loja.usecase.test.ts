import { esquemaDaEdicaoDaLoja } from "@simpleclick/contracts";
import { describe, expect, it } from "vitest";

import {
  aplicarEdicao,
  editarLoja,
  mudancasDoCadastro,
  registroDaEdicao,
  type CadastroEditavel,
  type RepositorioDaEdicao,
} from "./editar-loja.usecase.ts";
import { camposDoRegistro, registroDaTrilha } from "./trilha.ts";

const ATUAL: CadastroEditavel = {
  nome: "Pastel da Joi",
  razaoSocial: "Joice Almeida Pastelaria ME",
  documento: "11222333000181",
  tipoDoDocumento: "CNPJ",
  email: "joice@exemplo.test",
  telefone: "+5511988887777",
  cep: "01310100",
  logradouro: "Avenida Paulista",
  numero: "1000",
  complemento: "Loja 2",
  bairro: "Bela Vista",
  cidade: "São Paulo",
  uf: "SP",
};

/** A edição como a borda a entrega: validada e normalizada pelo contrato. */
function edicao(bruta: Record<string, unknown>) {
  return esquemaDaEdicaoDaLoja.parse(bruta);
}

/** Repositório em memória que anota o que foi gravado e registrado. */
function repositorio(atual: CadastroEditavel | null) {
  const gravados: CadastroEditavel[] = [];
  const registrados: Parameters<RepositorioDaEdicao["registrar"]>[0][] = [];
  const repo: RepositorioDaEdicao = {
    lerParaEditar: async () => atual,
    gravarCadastro: async (_lojaId, cadastro) => {
      gravados.push(cadastro);
    },
    registrar: async (ato) => {
      registrados.push(ato);
    },
  };
  return { repo, gravados, registrados };
}

describe("edição do cadastro da loja (AC-207)", () => {
  it("@spec:AC-207 só o que mudou vira diferença, na ordem da tela, com o valor anterior", () => {
    const editado = aplicarEdicao(
      ATUAL,
      edicao({ nome: "Pastelaria da Joi", telefone: "(11) 97777-6666" }),
    );
    expect(mudancasDoCadastro(ATUAL, editado)).toEqual([
      { campo: "nome", antes: "Pastel da Joi", depois: "Pastelaria da Joi" },
      {
        campo: "telefone",
        antes: "+5511988887777",
        depois: "+5511977776666",
      },
    ]);
  });

  it("@spec:AC-207 o documento trocado de CNPJ para CPF muda também o tipo, pelo número de dígitos", () => {
    const editado = aplicarEdicao(
      ATUAL,
      edicao({ documento: "529.982.247-25" }),
    );
    expect(editado.documento).toBe("52998224725");
    expect(editado.tipoDoDocumento).toBe("CPF");
  });

  it("@spec:AC-207 a trilha guarda o dado pessoal mascarado e o dado da loja por extenso (P-009)", () => {
    const registro = registroDaEdicao(
      mudancasDoCadastro(
        ATUAL,
        aplicarEdicao(
          ATUAL,
          edicao({ nome: "Pastelaria da Joi", documento: "529.982.247-25" }),
        ),
      ),
    );
    expect(registro.antes.campos).toEqual({
      nome: "Pastel da Joi",
      documento: "…0181",
    });
    expect(registro.depois.campos).toEqual({
      nome: "Pastelaria da Joi",
      documento: "…4725",
    });
    expect(JSON.stringify(registro)).not.toContain("52998224725");
  });

  it("@spec:AC-207 editar registra quem alterou e grava o cadastro novo, na mesma unidade de trabalho", async () => {
    const { repo, gravados, registrados } = repositorio(ATUAL);
    const resultado = await editarLoja(
      "loja-1",
      edicao({ endereco: { ...enderecoDe(ATUAL), numero: "1200" } }),
      "admin-1",
      repo,
    );

    expect(resultado).toMatchObject({ ok: true });
    expect(gravados).toHaveLength(1);
    expect(gravados[0]?.numero).toBe("1200");
    expect(registrados).toEqual([
      {
        lojaId: "loja-1",
        atorId: "admin-1",
        acao: "LOJA_ALTERADA",
        // Valor curto não deixa final nenhum à mostra: o registro diz QUE o
        // número mudou, sem dizer qual era.
        antes: { campos: { numero: "…" } },
        depois: { campos: { numero: "…" } },
      },
    ]);
  });

  it("@spec:AC-207 salvar sem mudar nada não grava nem vira linha na trilha", async () => {
    const { repo, gravados, registrados } = repositorio(ATUAL);
    const resultado = await editarLoja(
      "loja-1",
      edicao({ nome: "Pastel da Joi" }),
      "admin-1",
      repo,
    );
    expect(resultado).toEqual({ ok: true, mudancas: [] });
    expect(gravados).toEqual([]);
    expect(registrados).toEqual([]);
  });

  it("@spec:AC-207 loja inexistente não grava nada", async () => {
    const { repo, gravados, registrados } = repositorio(null);
    const resultado = await editarLoja(
      "loja-x",
      edicao({ nome: "Qualquer" }),
      "admin-1",
      repo,
    );
    expect(resultado).toEqual({ ok: false, motivo: "NAO_ENCONTRADA" });
    expect(gravados).toEqual([]);
    expect(registrados).toEqual([]);
  });

  it("@spec:AC-207 edição vazia ou com campo que não é do cadastro é recusada pelo contrato", () => {
    expect(esquemaDaEdicaoDaLoja.safeParse({}).success).toBe(false);
    expect(
      esquemaDaEdicaoDaLoja.safeParse({ apelido: "outro-endereco" }).success,
    ).toBe(false);
    expect(
      esquemaDaEdicaoDaLoja.safeParse({ tipoDeNegocio: "APPAREL" }).success,
    ).toBe(false);
    expect(
      esquemaDaEdicaoDaLoja.safeParse({ documento: "111.222.333-44" }).success,
    ).toBe(false);
  });
});

describe("leitura da trilha (AC-207)", () => {
  it("@spec:AC-207 os dois formatos da trilha viram a mesma lista de campos com antes e depois", () => {
    expect(
      camposDoRegistro(
        { campos: { nome: "A" } },
        { campos: { nome: "B" }, sensivel: false, camposSensiveis: [] },
      ),
    ).toEqual([{ campo: "nome", antes: "A", depois: "B" }]);

    expect(
      camposDoRegistro(null, { codigo: "0001", apelido: "pastel-da-joi" }),
    ).toEqual([
      { campo: "codigo", antes: null, depois: "0001" },
      { campo: "apelido", antes: null, depois: "pastel-da-joi" },
    ]);
  });

  it("@spec:AC-207 o registro diz quem, quando e o quê, e destaca o que a configuração marcou como sensível", () => {
    const registro = registroDaTrilha({
      id: "7",
      quando: new Date("2026-09-27T12:00:00.000Z"),
      acao: "CONFIG_SENSIVEL_ALTERADA",
      atorId: "dono-1",
      atorNome: "Joice",
      papel: "OWNER",
      antes: { campos: { "pix.chave": "…7777" } },
      depois: { campos: { "pix.chave": "…6666" }, sensivel: true },
    });
    expect(registro).toEqual({
      id: "7",
      quando: "2026-09-27T12:00:00.000Z",
      acao: "CONFIG_SENSIVEL_ALTERADA",
      quem: { id: "dono-1", nome: "Joice" },
      papel: "OWNER",
      campos: [{ campo: "pix.chave", antes: "…7777", depois: "…6666" }],
      sensivel: true,
    });
  });
});

function enderecoDe(cadastro: CadastroEditavel) {
  return {
    cep: cadastro.cep ?? "",
    logradouro: cadastro.logradouro ?? "",
    numero: cadastro.numero ?? "",
    complemento: cadastro.complemento,
    bairro: cadastro.bairro ?? "",
    cidade: cadastro.cidade ?? "",
    uf: cadastro.uf ?? "",
  };
}
