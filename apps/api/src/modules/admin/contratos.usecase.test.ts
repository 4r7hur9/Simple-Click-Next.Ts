import { describe, expect, it } from "vitest";

import { armazenamentoPrivadoEmMemoria } from "../../core/arquivo-privado.ts";
import {
  conferirArquivo,
  enviarDocumento,
  nomeParaMostrar,
  type DocumentoParaGravar,
  type RepositorioDosDocumentos,
} from "./contratos.usecase.ts";
import {
  assinarLink,
  chaveDosLinks,
  conferirLink,
  PRAZO_DO_LINK_EM_MS,
} from "./link-do-documento.ts";
import { formatoPeloConteudo } from "./tipo-de-arquivo.ts";

const LOJA = "3a3c3d4e-0000-4000-8000-000000000001";
const ADMIN = "9a9c9d9e-0000-4000-8000-000000000003";
const PDF = new Uint8Array(Buffer.from("%PDF-1.7\n%%EOF\n"));
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);
const AGORA = new Date("2026-09-27T12:00:00.000Z");

/** Repositório em memória, que pode falhar na gravação como o banco falharia. */
function repositorio(opcoes: { existe?: boolean; falhar?: boolean } = {}) {
  const gravados: DocumentoParaGravar[] = [];
  const repo: RepositorioDosDocumentos = {
    lojaExiste: async () => opcoes.existe ?? true,
    gravarDocumento: async (documento) => {
      if (opcoes.falhar === true) throw new Error("banco fora do ar");
      gravados.push(documento);
      return {
        id: "doc-1",
        tipo: documento.tipo,
        nomeDoArquivo: documento.nomeDoArquivo,
        tamanhoEmBytes: documento.tamanhoEmBytes,
        tipoDeConteudo: documento.tipoDeConteudo,
        enviadoEm: documento.enviadoEm.toISOString(),
        enviadoPor: { id: documento.enviadoPor, nome: "Administradora" },
      };
    },
  };
  return { repo, gravados };
}

describe("o tipo do arquivo vem dos bytes (AC-204)", () => {
  it("@spec:AC-204 reconhece PDF, PNG e JPEG pela assinatura no byte zero, e nada mais", () => {
    expect(formatoPeloConteudo(PDF)).toBe("PDF");
    expect(formatoPeloConteudo(PNG)).toBe("PNG");
    expect(formatoPeloConteudo(JPEG)).toBe("JPEG");
    // A assinatura deslocada não conta: lixo antes dela é recusa.
    expect(
      formatoPeloConteudo(new Uint8Array([0x20, ...PDF.slice(0, 8)])),
    ).toBeNull();
    expect(
      formatoPeloConteudo(new Uint8Array(Buffer.from("<html></html>"))),
    ).toBeNull();
  });

  it("@spec:AC-204 contrato que é imagem por dentro é recusado; o documento do responsável aceita a foto", () => {
    expect(conferirArquivo("CONTRATO", PNG)).toMatchObject({
      ok: false,
      motivo: "TIPO_NAO_PERMITIDO",
    });
    expect(conferirArquivo("DOCUMENTO_DO_RESPONSAVEL", PNG)).toEqual({
      ok: true,
      formato: "PNG",
      tipoDeConteudo: "image/png",
    });
    expect(conferirArquivo("CONTRATO", new Uint8Array())).toMatchObject({
      ok: false,
      motivo: "VAZIO",
    });
  });

  it("@spec:AC-204 cada formato tem o próprio limite: 10 MB o PDF, 5 MB a imagem", () => {
    const pdfGrande = new Uint8Array(10 * 1024 * 1024 + 1);
    pdfGrande.set(PDF);
    expect(conferirArquivo("CONTRATO", pdfGrande)).toMatchObject({
      ok: false,
      motivo: "GRANDE_DEMAIS",
    });
    const fotoGrande = new Uint8Array(5 * 1024 * 1024 + 1);
    fotoGrande.set(PNG);
    expect(
      conferirArquivo("COMPROVANTE_DE_ENDERECO", fotoGrande),
    ).toMatchObject({ ok: false, motivo: "GRANDE_DEMAIS" });
  });

  it("@spec:AC-204 o arquivo recusado não chega ao armazenamento nem ao banco", async () => {
    const armazenamento = armazenamentoPrivadoEmMemoria();
    const { repo, gravados } = repositorio();
    const resultado = await enviarDocumento(
      {
        lojaId: LOJA,
        tipo: "CONTRATO",
        nomeDoArquivo: "contrato.pdf",
        bytes: PNG,
        administradorId: ADMIN,
      },
      { repositorio: repo, armazenamento, agora: () => AGORA },
    );
    expect(resultado).toMatchObject({
      ok: false,
      motivo: "TIPO_NAO_PERMITIDO",
    });
    expect(armazenamento.chaves()).toEqual([]);
    expect(gravados).toEqual([]);
  });
});

describe("o envio aceito (AC-203)", () => {
  it("@spec:AC-203 guarda numa chave gerada pelo servidor, com o resumo, o relógio da API e o nome só como metadado", async () => {
    const armazenamento = armazenamentoPrivadoEmMemoria();
    const { repo, gravados } = repositorio();
    const resultado = await enviarDocumento(
      {
        lojaId: LOJA,
        tipo: "CONTRATO",
        nomeDoArquivo: encodeURIComponent("../../etc/Contrato da Joi.pdf"),
        bytes: PDF,
        administradorId: ADMIN,
      },
      { repositorio: repo, armazenamento, agora: () => AGORA },
    );

    expect(resultado.ok).toBe(true);
    const [gravado] = gravados;
    expect(gravado?.chave).toMatch(new RegExp(`^${LOJA}/[0-9a-f-]{36}$`));
    expect(gravado?.nomeDoArquivo).toBe("Contrato da Joi.pdf");
    expect(gravado?.resumo).toHaveLength(32);
    expect(gravado?.enviadoEm).toEqual(AGORA);
    expect(armazenamento.chaves()).toEqual([gravado?.chave]);
  });

  it("@spec:AC-203 se o banco falha depois de guardar, o arquivo guardado é apagado", async () => {
    const armazenamento = armazenamentoPrivadoEmMemoria();
    const { repo } = repositorio({ falhar: true });
    await expect(
      enviarDocumento(
        {
          lojaId: LOJA,
          tipo: "CONTRATO",
          nomeDoArquivo: "contrato.pdf",
          bytes: PDF,
          administradorId: ADMIN,
        },
        { repositorio: repo, armazenamento, agora: () => AGORA },
      ),
    ).rejects.toThrow("banco fora do ar");
    expect(armazenamento.chaves()).toEqual([]);
  });

  it("o nome que veio do navegador perde caminho e caractere de controle", () => {
    expect(nomeParaMostrar("C:\\Users\\joi\\contrato.pdf")).toBe(
      "contrato.pdf",
    );
    expect(nomeParaMostrar("rg\u0000\u001f.pdf")).toBe("rg.pdf");
    expect(nomeParaMostrar(undefined)).toBe("documento");
    expect(nomeParaMostrar("%E0%A4%A")).toBe("%E0%A4%A");
  });
});

describe("o link temporário (AC-205)", () => {
  const chave = chaveDosLinks("s".repeat(48));
  const conteudo = {
    documentoId: "7b7c7d7e-0000-4000-8000-000000000002",
    lojaId: LOJA,
    administradorId: ADMIN,
    expiraEm: AGORA.getTime() + PRAZO_DO_LINK_EM_MS,
  };

  it("@spec:AC-205 vale cinco minutos, e vencido ou adulterado não abre", () => {
    expect(PRAZO_DO_LINK_EM_MS).toBe(5 * 60 * 1000);
    const link = assinarLink(conteudo, chave);

    expect(conferirLink(link, chave, AGORA.getTime())).toEqual({
      ok: true,
      conteudo,
    });
    expect(conferirLink(link, chave, conteudo.expiraEm)).toEqual({
      ok: false,
      motivo: "EXPIRADO",
    });

    const [carga = "", assinatura = ""] = link.split(".");
    const trocada = `${assinatura.startsWith("A") ? "B" : "A"}${assinatura.slice(1)}`;
    expect(conferirLink(`${carga}.${trocada}`, chave, AGORA.getTime())).toEqual(
      { ok: false, motivo: "INVALIDO" },
    );
    // Assinado com outro segredo não abre aqui.
    const deOutroSegredo = assinarLink(conteudo, chaveDosLinks("x".repeat(48)));
    expect(conferirLink(deOutroSegredo, chave, AGORA.getTime())).toEqual({
      ok: false,
      motivo: "INVALIDO",
    });
  });

  it("segredo das sessões ausente ou curto não vira chave de link", () => {
    expect(() => chaveDosLinks("")).toThrow("JWT_SECRET");
    expect(() => chaveDosLinks("curto")).toThrow("JWT_SECRET");
  });
});
