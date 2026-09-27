/**
 * Prova das fotos do produto pelo painel (AC-305, AC-306), contra banco de
 * verdade.
 *
 * O dono envia as fotos, escolhe e troca a principal; a prova confere o cartão
 * da vitrine (que mostra só a principal) e a página do produto (que mostra
 * todas). O envio de ARQUIVO passa pela conferência de conteúdo e por uma
 * hospedagem de mentira — a de verdade depende de credencial de mídia, e o que
 * se prova aqui é o caminho da API, não o do Cloudinary.
 */
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { bancoDoArquivo, conectarNoBancoDoArquivo } from "@simpleclick/testing";
import type { LojaDeTeste } from "@simpleclick/testing";

import { abrirAcessoDaAplicacao, ESPERA_LONGA } from "./apoio-de-isolamento.ts";
import {
  caminhoDoPainel,
  catalogoPublico,
  criarCategoriaPeloPainel,
  criarProdutoPeloPainel,
  lojaComDonoNoPainel,
} from "./apoio-do-painel.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import type { HospedarImagem } from "../src/modules/catalog/hospedagem-de-imagem.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
}, ESPERA_LONGA);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

type App = Awaited<ReturnType<typeof lojaComDonoNoPainel>>["app"];

function foto(nome: string): string {
  return `https://res.cloudinary.com/simpleclick/image/upload/v1/${nome}.jpg`;
}

interface ImagemNoPainel {
  readonly id: string;
  readonly url: string;
  readonly principal: boolean;
  readonly largura: number | null;
  readonly altura: number | null;
}

async function enviarUrl(
  app: App,
  loja: LojaDeTeste,
  produtoId: string,
  { url, principal }: { readonly url: string; readonly principal: boolean },
) {
  return request(app)
    .post(caminhoDoPainel(loja, `produtos/${produtoId}/imagens`))
    .send({ url, altText: null, principal });
}

async function imagensDoPainel(
  app: App,
  loja: LojaDeTeste,
  produtoId: string,
): Promise<ImagemNoPainel[]> {
  const resposta = await request(app).get(
    caminhoDoPainel(loja, `produtos/${produtoId}/imagens`),
  );
  expect(resposta.status).toBe(200);
  return (resposta.body as { imagens: ImagemNoPainel[] }).imagens;
}

async function fotoDoCartao(app: App, loja: LojaDeTeste) {
  const catalogo = await catalogoPublico(app, loja);
  return catalogo.secoes[0]?.produtos[0]?.imagem ?? null;
}

async function fotosDaPagina(app: App, loja: LojaDeTeste, produtoId: string) {
  const resposta = await request(app).get(
    `/v1/vitrine/${loja.apelido}/produto/${produtoId}`,
  );
  expect(resposta.status).toBe(200);
  return (
    resposta.body as {
      imagens: { url: string; largura: number | null; altura: number | null }[];
    }
  ).imagens;
}

async function produtoNovo(extras: { hospedarImagem?: HospedarImagem } = {}) {
  const contexto = await lojaComDonoNoPainel(acesso, extras);
  const categoria = await criarCategoriaPeloPainel(
    contexto.app,
    contexto.loja,
    "Pastéis",
  );
  const produto = await criarProdutoPeloPainel(contexto.app, contexto.loja, {
    categoriaId: categoria.id,
    nome: "Pastel de queijo",
  });
  return { ...contexto, produto };
}

describe("produto aceita várias imagens com uma principal (AC-305)", () => {
  it(
    "@spec:AC-305 com três fotos, o cartão mostra a principal e a página mostra as três",
    async () => {
      const { app, loja, produto } = await produtoNovo();

      expect(
        (
          await enviarUrl(app, loja, produto.id, {
            url: foto("um"),
            principal: false,
          })
        ).status,
      ).toBe(201);
      expect(
        (
          await enviarUrl(app, loja, produto.id, {
            url: foto("dois"),
            principal: false,
          })
        ).status,
      ).toBe(201);
      expect(
        (
          await enviarUrl(app, loja, produto.id, {
            url: foto("tres"),
            principal: true,
          })
        ).status,
      ).toBe(201);

      const noPainel = await imagensDoPainel(app, loja, produto.id);
      expect(noPainel.map((imagem) => [imagem.url, imagem.principal])).toEqual([
        [foto("um"), false],
        [foto("dois"), false],
        [foto("tres"), true],
      ]);
      expect(await fotoDoCartao(app, loja)).toBe(foto("tres"));
      // A página do produto abre pela principal, e mostra as três.
      expect(
        (await fotosDaPagina(app, loja, produto.id)).map((item) => item.url),
      ).toEqual([foto("tres"), foto("um"), foto("dois")]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-305 trocar a principal depois muda o cartão, e apagar a principal promove outra",
    async () => {
      const { app, loja, produto } = await produtoNovo();
      await enviarUrl(app, loja, produto.id, {
        url: foto("um"),
        principal: true,
      });
      await enviarUrl(app, loja, produto.id, {
        url: foto("dois"),
        principal: false,
      });
      await enviarUrl(app, loja, produto.id, {
        url: foto("tres"),
        principal: false,
      });
      const [primeira, segunda] = await imagensDoPainel(app, loja, produto.id);

      const trocada = await request(app)
        .patch(
          caminhoDoPainel(
            loja,
            `produtos/${produto.id}/imagens/${segunda!.id}`,
          ),
        )
        .send({ principal: true });
      expect(trocada.status).toBe(200);
      expect(await fotoDoCartao(app, loja)).toBe(foto("dois"));
      expect(
        (await imagensDoPainel(app, loja, produto.id)).filter(
          (imagem) => imagem.principal,
        ),
      ).toHaveLength(1);

      const apagada = await request(app).delete(
        caminhoDoPainel(loja, `produtos/${produto.id}/imagens/${segunda!.id}`),
      );
      expect(apagada.status).toBe(204);
      expect(await fotoDoCartao(app, loja)).toBe(foto("um"));
      expect(primeira!.url).toBe(foto("um"));
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-305 a sexta foto é recusada: cinco bastam (ASM-303)",
    async () => {
      const { app, loja, produto } = await produtoNovo();
      for (const nome of ["a", "b", "c", "d", "e"]) {
        expect(
          (
            await enviarUrl(app, loja, produto.id, {
              url: foto(nome),
              principal: false,
            })
          ).status,
        ).toBe(201);
      }
      const sexta = await enviarUrl(app, loja, produto.id, {
        url: foto("f"),
        principal: false,
      });
      expect(sexta.status).toBe(400);
      expect(sexta.body).toEqual({ erro: "limite_de_imagens" });
      expect(await imagensDoPainel(app, loja, produto.id)).toHaveLength(5);
    },
    ESPERA_LONGA,
  );
});

describe("imagem grande é aceita, imagem falsa é recusada (AC-306)", () => {
  it(
    "@spec:AC-306 JPEG de 6 MB é aceito, hospedado e aparece na vitrine com a dimensão original",
    async () => {
      const hospedar = vi.fn<HospedarImagem>(async () => ({
        url: foto("grande"),
        largura: 4000,
        altura: 3000,
      }));
      const { app, loja, produto } = await produtoNovo({
        hospedarImagem: hospedar,
      });
      const grande = Buffer.alloc(6 * 1024 * 1024);
      grande.set([0xff, 0xd8, 0xff, 0xe0]);

      const enviada = await request(app)
        .post(
          `${caminhoDoPainel(loja, `produtos/${produto.id}/imagens/arquivo`)}?principal=true`,
        )
        .set("content-type", "image/jpeg")
        .send(grande);

      expect(enviada.status).toBe(201);
      expect(enviada.body).toMatchObject({
        url: foto("grande"),
        principal: true,
        largura: 4000,
        altura: 3000,
      });
      expect(hospedar).toHaveBeenCalledTimes(1);
      expect(hospedar.mock.calls[0]?.[0]).toMatchObject({
        formato: "jpeg",
        lojaId: loja.id,
        produtoId: produto.id,
      });
      expect(hospedar.mock.calls[0]?.[0].bytes.byteLength).toBe(grande.length);

      expect(await fotoDoCartao(app, loja)).toBe(foto("grande"));
      expect(await fotosDaPagina(app, loja, produto.id)).toEqual([
        expect.objectContaining({
          url: foto("grande"),
          largura: 4000,
          altura: 3000,
        }),
      ]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-306 texto disfarçado de .jpg é recusado com aviso, sem gastar hospedagem nem gravar nada",
    async () => {
      const hospedar = vi.fn<HospedarImagem>();
      const { app, loja, produto } = await produtoNovo({
        hospedarImagem: hospedar,
      });

      const recusada = await request(app)
        .post(caminhoDoPainel(loja, `produtos/${produto.id}/imagens/arquivo`))
        .set("content-type", "image/jpeg")
        .send(Buffer.from("isto é um texto, e o nome dizia foto.jpg"));

      expect(recusada.status).toBe(400);
      expect(recusada.body.erro).toBe("imagem_invalida");
      expect(String(recusada.body.mensagem)).toContain(
        "a checagem considera o conteúdo, não a extensão",
      );
      expect(hospedar).not.toHaveBeenCalled();
      expect(await imagensDoPainel(app, loja, produto.id)).toEqual([]);
    },
    ESPERA_LONGA,
  );
});
