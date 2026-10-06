/**
 * Contrato e documentos da loja, pela API de verdade (AC-203 a AC-205).
 *
 * O arquivo passa pelo caminho inteiro: bytes crus na rota da administração,
 * conferência pelo CONTEÚDO, armazenamento privado (em memória na prova, para
 * conferir o que foi e o que não foi guardado), linha em `store_contracts`
 * pela credencial `sc_admin`, link temporário assinado e a entrega como
 * anexo. E a outra metade, que importa tanto quanto: quem não é da
 * administração não abre nada, o link vence, e o link de uma pessoa não abre
 * para outra.
 */
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  esquemaDoLinkDoDocumento,
  esquemaDosDocumentosDaLoja,
} from "@simpleclick/contracts";
import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarAdministradorDaPlataforma,
  criarLoja,
  criarMembro,
  type IdentidadeDeTeste,
  type LojaDeTeste,
  type MembroDeTeste,
} from "@simpleclick/testing";

import {
  comoPapel,
  ESPERA_DA_ADMINISTRACAO,
  montarApiDaAdministracao,
  ORIGEM_DA_ADMINISTRACAO,
  type ApiDaAdministracao,
} from "./apoio-da-administracao.ts";
import {
  abrirAcessoDaAplicacao,
  codigoDoPostgres,
  comoRequisicao,
  RECUSA_DE_PERMISSAO,
} from "./apoio-de-isolamento.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";

/** Um PDF mínimo de verdade: a assinatura `%PDF-` e um corpo qualquer. */
const PDF = Buffer.concat([
  Buffer.from("%PDF-1.7\n"),
  Buffer.from("1 0 obj << /Type /Catalog >> endobj\n%%EOF\n"),
]);
/** Os oito bytes de assinatura do PNG, e mais alguns. */
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

let migrador: pg.Client;
let api: ApiDaAdministracao;
let acessoDasLojas: AcessoAoBanco;
let administradora: IdentidadeDeTeste;
let outraAdministradora: IdentidadeDeTeste;
let loja: LojaDeTeste;
let dono: MembroDeTeste;
let instante = Date.parse("2026-09-27T12:00:00.000Z");

function enviar(
  arquivo: Buffer,
  nome: string,
  tipo = "CONTRATO",
  tipoDeclarado = "application/pdf",
) {
  return request(api.app)
    .post(`/v1/admin/lojas/${loja.id}/documentos`)
    .query({ tipo })
    .set(comoPapel(administradora.id, "ADMIN"))
    .set("content-type", tipoDeclarado)
    .set("x-nome-do-arquivo", encodeURIComponent(nome))
    .send(arquivo);
}

function gerarLink(documentoId: string, quem = administradora.id) {
  return request(api.app)
    .post(`/v1/admin/lojas/${loja.id}/documentos/${documentoId}/link`)
    .set(comoPapel(quem, "ADMIN"));
}

/** Abre o link como a API o devolveu (`/v1/admin/arquivos/...`). */
function abrir(link: string, cabecalhos: Record<string, string>) {
  return request(api.app)
    .get(link)
    .set(cabecalhos)
    .buffer(true)
    .parse((resposta, pronto) => {
      const partes: Buffer[] = [];
      resposta.on("data", (parte: Buffer) => partes.push(parte));
      resposta.on("end", () => pronto(null, Buffer.concat(partes)));
    });
}

async function linhasDaTrilha(acao: string) {
  const { rows } = await migrador.query<{
    actor_id: string;
    entity: string;
    entity_id: string;
    after_data: unknown;
  }>(
    `SELECT actor_id::text AS actor_id, entity, entity_id, after_data
       FROM app.audit_log WHERE store_id = $1 AND action = $2 ORDER BY id`,
    [loja.id, acao],
  );
  return rows;
}

async function documentosNoBanco(): Promise<number> {
  const { rows } = await migrador.query<{ total: number }>(
    "SELECT count(*)::int AS total FROM app.store_contracts WHERE store_id = $1",
    [loja.id],
  );
  return rows[0]?.total ?? 0;
}

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  api = montarApiDaAdministracao({}, () => new Date(instante));
  acessoDasLojas = abrirAcessoDaAplicacao(bancoDoArquivo().url, {
    maxDeConexoes: 2,
  });
  administradora = await criarAdministradorDaPlataforma({
    nome: "Administradora geral",
  });
  outraAdministradora = await criarAdministradorDaPlataforma({
    nome: "Outra administradora",
  });
  loja = await criarLoja({ nome: "Pastel da Joi" });
  dono = await criarMembro({ loja });
}, ESPERA_DA_ADMINISTRACAO);

afterAll(async () => {
  await acessoDasLojas?.encerrar();
  await api?.encerrar();
  await migrador?.end();
}, ESPERA_DA_ADMINISTRACAO);

describe("contrato em PDF (AC-203)", () => {
  let documentoId: string;

  it(
    "@spec:AC-203 o contrato em PDF é aceito e aparece com nome, tamanho, data de envio e quem enviou",
    async () => {
      const resposta = await enviar(PDF, "Contrato Pastel da Joi.pdf");

      expect(resposta.status).toBe(201);
      expect(resposta.body.documento).toMatchObject({
        tipo: "CONTRATO",
        nomeDoArquivo: "Contrato Pastel da Joi.pdf",
        tamanhoEmBytes: PDF.length,
        tipoDeConteudo: "application/pdf",
        enviadoEm: new Date(instante).toISOString(),
        enviadoPor: { id: administradora.id, nome: "Administradora geral" },
      });
      documentoId = String(resposta.body.documento.id);

      const lista = esquemaDosDocumentosDaLoja.parse(
        (
          await request(api.app)
            .get(`/v1/admin/lojas/${loja.id}/documentos`)
            .set(comoPapel(administradora.id, "ADMIN"))
        ).body,
      );
      expect(lista.documentos.map((documento) => documento.id)).toEqual([
        documentoId,
      ]);

      // Os bytes estão no armazenamento privado, numa chave que não carrega
      // nada do nome que veio do navegador.
      const chaves = api.armazenamentoPrivado.chaves();
      expect(chaves).toHaveLength(1);
      expect(chaves[0]).toMatch(new RegExp(`^${loja.id}/[0-9a-f-]{36}$`));

      // A trilha diz o que entrou, sem o nome do arquivo.
      const [envio] = await linhasDaTrilha("DOCUMENTO_ENVIADO");
      expect(envio).toMatchObject({
        actor_id: administradora.id,
        entity: "store_contracts",
        entity_id: documentoId,
      });
      expect(JSON.stringify(envio)).not.toContain("Pastel da Joi.pdf");
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-203 o arquivo só abre por link temporário gerado no clique, e sai como anexo, com o tipo conferido",
    async () => {
      const gerado = await gerarLink(documentoId);
      expect(gerado.status).toBe(201);
      const { link, expiraEm } = esquemaDoLinkDoDocumento.parse(gerado.body);
      expect(link).toMatch(/^\/v1\/admin\/arquivos\/[\w-]+\.[\w-]+$/);
      expect(Date.parse(expiraEm) - instante).toBe(5 * 60 * 1000);

      const aberto = await abrir(link, comoPapel(administradora.id, "ADMIN"));
      expect(aberto.status).toBe(200);
      expect(Buffer.compare(aberto.body as Buffer, PDF)).toBe(0);
      expect(aberto.headers["content-type"]).toBe("application/pdf");
      expect(aberto.headers["content-disposition"]).toContain("attachment");
      expect(aberto.headers["content-disposition"]).toContain(
        "Contrato%20Pastel%20da%20Joi.pdf",
      );
      expect(aberto.headers["x-content-type-options"]).toBe("nosniff");

      const [abertura] = await linhasDaTrilha("DOCUMENTO_BAIXADO");
      expect(abertura).toMatchObject({
        actor_id: administradora.id,
        entity_id: documentoId,
      });
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});

describe("arquivo com tipo disfarçado (AC-204)", () => {
  it(
    "@spec:AC-204 contrato.pdf que é uma imagem por dentro é recusado, e nada é guardado nem gravado",
    async () => {
      const antes = {
        chaves: api.armazenamentoPrivado.chaves().length,
        linhas: await documentosNoBanco(),
        envios: (await linhasDaTrilha("DOCUMENTO_ENVIADO")).length,
      };

      const resposta = await enviar(PNG, "contrato.pdf");

      expect(resposta.status).toBe(415);
      expect(resposta.body).toMatchObject({
        erro: "arquivo_recusado",
        motivo: "TIPO_NAO_PERMITIDO",
      });
      expect(resposta.body.mensagem).toContain("Tipo de arquivo não permitido");
      expect(api.armazenamentoPrivado.chaves()).toHaveLength(antes.chaves);
      expect(await documentosNoBanco()).toBe(antes.linhas);
      expect(await linhasDaTrilha("DOCUMENTO_ENVIADO")).toHaveLength(
        antes.envios,
      );
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-204 a extensão e o tipo declarado pelo navegador não contam: uma página com nome de PDF também é recusada",
    async () => {
      const pagina = Buffer.from("<html><script>alert(1)</script></html>");
      const resposta = await enviar(
        pagina,
        "contrato.pdf",
        "CONTRATO",
        "application/pdf",
      );
      expect(resposta.status).toBe(415);

      // A foto do documento do responsável pode ser imagem — pelo conteúdo.
      const foto = await enviar(
        PNG,
        "documento.png",
        "DOCUMENTO_DO_RESPONSAVEL",
        "image/png",
      );
      expect(foto.status).toBe(201);
      expect(foto.body.documento.tipoDeConteudo).toBe("image/png");
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-204 arquivo acima do limite é recusado antes de ser guardado",
    async () => {
      const antes = api.armazenamentoPrivado.chaves().length;
      const grande = Buffer.concat([
        Buffer.from("%PDF-1.7\n"),
        Buffer.alloc(10 * 1024 * 1024),
      ]);
      const resposta = await enviar(grande, "contrato-grande.pdf");
      expect(resposta.status).toBe(413);
      expect(api.armazenamentoPrivado.chaves()).toHaveLength(antes);
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});

describe("documento anexado nunca fica público (AC-205)", () => {
  let link: string;

  beforeAll(async () => {
    const enviado = await enviar(PDF, "contrato-2.pdf");
    const gerado = await gerarLink(String(enviado.body.documento.id));
    link = String(gerado.body.link);
  }, ESPERA_DA_ADMINISTRACAO);

  it(
    "@spec:AC-205 sem sessão de administrador o arquivo não abre, nem com o link na mão",
    async () => {
      const semSessao = await abrir(link, { origin: ORIGEM_DA_ADMINISTRACAO });
      expect(semSessao.status).toBe(401);

      const comoDono = await abrir(
        link,
        comoPapel(dono.identidade.id, "OWNER"),
      );
      expect(comoDono.status).toBe(403);

      // Nem a lista o dono alcança pela rota…
      const lista = await request(api.app)
        .get(`/v1/admin/lojas/${loja.id}/documentos`)
        .set(comoPapel(dono.identidade.id, "OWNER"));
      expect(lista.status).toBe(403);

      // …nem pela credencial das lojas, direto no banco.
      let codigo: string | undefined;
      try {
        await comoRequisicao(
          acessoDasLojas,
          { lojaId: loja.id, usuarioId: dono.identidade.id, papel: "OWNER" },
          (tx) => tx.$queryRaw`SELECT id FROM app.store_contracts`,
        );
      } catch (erro) {
        codigo = codigoDoPostgres(erro);
      }
      expect(codigo).toBe(RECUSA_DE_PERMISSAO);
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-205 o link de uma administradora não abre para outra, e link adulterado não abre nada",
    async () => {
      const deOutra = await abrir(
        link,
        comoPapel(outraAdministradora.id, "ADMIN"),
      );
      expect(deOutra.status).toBe(403);

      const [carga = "", assinatura = ""] =
        link.split("/").at(-1)?.split(".") ?? [];
      const trocada = `${assinatura.startsWith("A") ? "B" : "A"}${assinatura.slice(1)}`;
      const adulterado = await abrir(
        `/v1/admin/arquivos/${carga}.${trocada}`,
        comoPapel(administradora.id, "ADMIN"),
      );
      expect(adulterado.status).toBe(404);
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-205 o link deixa de funcionar depois do prazo curto de validade",
    async () => {
      const noPrazo = await abrir(link, comoPapel(administradora.id, "ADMIN"));
      expect(noPrazo.status).toBe(200);

      instante += 5 * 60 * 1000 + 1;
      const vencido = await abrir(link, comoPapel(administradora.id, "ADMIN"));
      expect(vencido.status).toBe(410);
      expect(vencido.headers["content-type"]).toContain("application/json");
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});
