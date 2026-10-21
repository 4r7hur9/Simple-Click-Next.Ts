/**
 * Card #81 — "as imagens que testei não estão sendo substituídas".
 *
 * Provas, pela aplicação inteira e contra banco de verdade, do que o dono vive
 * ao TROCAR uma imagem (logo, fundo da vitrine, topo do cardápio, foto do
 * produto):
 *
 * - a imagem nova entra e a vitrine passa a mostrá-la, sem cair em validação
 *   (o seed guarda `/demo/...` e o envio local devolve `http://localhost`;
 *   antes só `https://` passava e o "Salvar" respondia 400);
 * - o arquivo ANTIGO sai do armazenamento — mas nunca o do seed, o de outra
 *   loja nem o que ainda está em uso em outro lugar;
 * - a foto do produto pode ser TROCADA no lugar: mesma posição, mesma capa.
 */
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarIdentidade,
  criarLoja,
} from "@simpleclick/testing";
import type { IdentidadeDeTeste, LojaDeTeste } from "@simpleclick/testing";

import {
  gravarSecao,
  montarAppDaConfiguracao,
  ORIGEM_DO_PAINEL,
  tokenDoDono,
} from "./apoio-de-configuracao.ts";
import { abrirAcessoDaAplicacao, ESPERA_LONGA } from "./apoio-de-isolamento.ts";
import {
  caminhoDoPainel,
  criarCategoriaPeloPainel,
  criarProdutoPeloPainel,
  lojaComDonoNoPainel,
} from "./apoio-do-painel.ts";
import {
  apagarMidiaPelaUrl,
  midiaEmMemoria,
} from "../src/core/armazenamento-de-midia.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import type { ArmazenamentoDeImagens } from "../src/core/midia.ts";
import type { HospedarImagem } from "../src/modules/catalog/hospedagem-de-imagem.ts";

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const SEED_LOGO = "/demo/pastelaria-da-vila/logo.webp";
const SEED_CAPA = "/demo/pastelaria-da-vila/capa.webp";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let dono: IdentidadeDeTeste;
let token: string;
let memoria: ReturnType<typeof midiaEmMemoria>;
let armazenamento: ArmazenamentoDeImagens;
let app: ReturnType<typeof montarAppDaConfiguracao>;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  memoria = midiaEmMemoria();
  // Um armazenamento que guarda de verdade (em memória) e apaga pela chave do
  // endereço, como o do disco e o do Cloudinary fazem.
  armazenamento = {
    async guardar(imagem) {
      const guardada = await memoria.guardar({
        lojaId: imagem.lojaId,
        pasta: "loja",
        tipo: "imagem",
        bytes: imagem.bytes,
        tipoDeConteudo: imagem.tipoDeConteudo,
        extensao: "png",
      });
      return { url: guardada.url };
    },
    apagar: (url, lojaId) => apagarMidiaPelaUrl(memoria, lojaId, url),
  };
  app = montarAppDaConfiguracao(acesso, {
    configuracoes: { armazenamento },
    gestaoDaLoja: { armazenamento, acesso },
  });
  dono = await criarIdentidade({ nome: "Dona Zica" });
  token = tokenDoDono(dono.id);
}, ESPERA_LONGA);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

function apresentacao(extras: Record<string, unknown> = {}) {
  return {
    nome: "Pastelaria da Vila",
    boasVindas: null,
    sobre: null,
    logo: SEED_LOGO,
    capa: SEED_CAPA,
    corPrimaria: "#b3261e",
    ...extras,
  };
}

function publicar(loja: LojaDeTeste, corpo: unknown) {
  return gravarSecao(app, { apelido: loja.apelido, secao: "aparencia", corpo, token });
}

function enviar(loja: LojaDeTeste, tipo: string) {
  return request(app)
    .put(`/v1/lojas/${loja.apelido}/configuracao/aparencia/imagem/${tipo}`)
    .set("Origin", ORIGEM_DO_PAINEL)
    .set("Authorization", `Bearer ${token}`)
    .set("Content-Type", "image/png")
    .send(Buffer.from(PNG));
}

function gravarTema(loja: LojaDeTeste, corpo: unknown) {
  return request(app)
    .put(`/v1/lojas/${loja.apelido}/tema`)
    .set("Origin", ORIGEM_DO_PAINEL)
    .set("Authorization", `Bearer ${token}`)
    .send(corpo as object);
}

async function vitrine(loja: LojaDeTeste) {
  const resposta = await request(app).get(`/v1/vitrine/${loja.apelido}`);
  expect(resposta.status).toBe(200);
  return resposta.body.loja as {
    logo: string | null;
    capa: string | null;
    tema: { fundoVitrine: string | null; topoCardapio: string | null };
  };
}

const arquivosDaLoja = (loja: LojaDeTeste) =>
  [...memoria.arquivos.keys()].filter((chave) => chave.includes(loja.id));

describe("loja de demonstração (imagens do seed em /demo/...)", () => {
  it(
    "salvar a apresentação e o tema com imagem do seed funciona (antes: 400 e nada era salvo)",
    async () => {
      const loja = await criarLoja({ nome: "Pastelaria Demo", dono });
      expect((await publicar(loja, apresentacao())).status).toBe(204);
      const tema = await gravarTema(loja, {
        fundoVitrine: SEED_CAPA,
        coresDasImagens: { [SEED_CAPA]: "#334455" },
      });
      expect(tema.status).toBe(200);
      const publica = await vitrine(loja);
      expect(publica.logo).toBe(SEED_LOGO);
      expect(publica.tema.fundoVitrine).toBe(SEED_CAPA);
    },
    ESPERA_LONGA,
  );
});

describe("trocar a logo", () => {
  it(
    "a logo nova entra, a vitrine a mostra e o arquivo da logo antiga é apagado",
    async () => {
      const loja = await criarLoja({ nome: "Pastelaria da Logo", dono });
      await publicar(loja, apresentacao());

      const primeira = await enviar(loja, "logo");
      expect(primeira.status).toBe(200);
      expect((await vitrine(loja)).logo).toBe(primeira.body.url);
      expect(arquivosDaLoja(loja)).toHaveLength(1);

      const segunda = await enviar(loja, "logo");
      expect(segunda.status).toBe(200);
      expect(segunda.body.url).not.toBe(primeira.body.url);
      expect((await vitrine(loja)).logo).toBe(segunda.body.url);
      // Só o arquivo novo ficou.
      expect(arquivosDaLoja(loja)).toHaveLength(1);
      expect(arquivosDaLoja(loja)[0]).toContain(
        String(segunda.body.url).split("/").pop(),
      );
    },
    ESPERA_LONGA,
  );

  it(
    "trocar a logo do seed não apaga nada (o arquivo do seed é de todos)",
    async () => {
      const loja = await criarLoja({ nome: "Pastelaria do Seed", dono });
      await publicar(loja, apresentacao());
      const enviada = await enviar(loja, "logo");
      expect(enviada.status).toBe(200);
      expect((await vitrine(loja)).logo).toBe(enviada.body.url);
      expect(arquivosDaLoja(loja)).toHaveLength(1);
    },
    ESPERA_LONGA,
  );

  it(
    "tirar a logo pelo formulário (salvar sem ela) apaga o arquivo enviado",
    async () => {
      const loja = await criarLoja({ nome: "Pastelaria sem Logo", dono });
      await publicar(loja, apresentacao());
      const enviada = await enviar(loja, "logo");
      expect(arquivosDaLoja(loja)).toHaveLength(1);

      expect((await publicar(loja, apresentacao({ logo: enviada.body.url }))).status).toBe(204);
      expect(arquivosDaLoja(loja)).toHaveLength(1);

      expect((await publicar(loja, apresentacao({ logo: null }))).status).toBe(204);
      expect(arquivosDaLoja(loja)).toHaveLength(0);
      expect((await vitrine(loja)).logo).toBeNull();
    },
    ESPERA_LONGA,
  );
});

describe("trocar o fundo da vitrine e o topo do cardápio", () => {
  it(
    "o fundo novo entra pelo tema e o arquivo do fundo antigo é apagado",
    async () => {
      const loja = await criarLoja({ nome: "Pastelaria do Fundo", dono });
      await publicar(loja, apresentacao());

      const a = await enviar(loja, "fundo");
      expect(a.status).toBe(200);
      expect((await gravarTema(loja, { fundoVitrine: a.body.url })).status).toBe(200);
      expect((await vitrine(loja)).tema.fundoVitrine).toBe(a.body.url);

      const b = await enviar(loja, "fundo");
      // Enviar não publica nem apaga: a antiga ainda está no ar até salvar.
      expect(arquivosDaLoja(loja)).toHaveLength(2);
      expect((await vitrine(loja)).tema.fundoVitrine).toBe(a.body.url);

      expect((await gravarTema(loja, { fundoVitrine: b.body.url })).status).toBe(200);
      expect((await vitrine(loja)).tema.fundoVitrine).toBe(b.body.url);
      expect(arquivosDaLoja(loja)).toHaveLength(1);
    },
    ESPERA_LONGA,
  );

  it(
    "o mesmo arquivo usado como fundo e como topo só é apagado quando nenhum dos dois o usa",
    async () => {
      const loja = await criarLoja({ nome: "Pastelaria Dois Usos", dono });
      await publicar(loja, apresentacao());
      const a = await enviar(loja, "fundo");
      await gravarTema(loja, { fundoVitrine: a.body.url, topoCardapio: a.body.url });

      const b = await enviar(loja, "fundo");
      await gravarTema(loja, { fundoVitrine: b.body.url });
      // O topo ainda usa o arquivo antigo: ele fica.
      expect(arquivosDaLoja(loja)).toHaveLength(2);

      await gravarTema(loja, { topoCardapio: null });
      expect(arquivosDaLoja(loja)).toHaveLength(1);
    },
    ESPERA_LONGA,
  );
});

describe("foto do produto: trocar no lugar e apagar o arquivo", () => {
  async function produtoComFoto() {
    const apagadas: string[] = [];
    const hospedadas: string[] = [];
    const hospedarImagem: HospedarImagem = async ({ lojaId }) => {
      const url = `https://midia.teste/${lojaId}/fotos/${hospedadas.length + 1}.png`;
      hospedadas.push(url);
      return { url, largura: null, altura: null };
    };
    const contexto = await lojaComDonoNoPainel(acesso, {
      hospedarImagem,
      apagarArquivo: async (_loja, url) => {
        apagadas.push(url);
      },
    });
    const categoria = await criarCategoriaPeloPainel(contexto.app, contexto.loja, "Pastéis");
    const produto = await criarProdutoPeloPainel(contexto.app, contexto.loja, {
      categoriaId: categoria.id,
      nome: "Pastel de queijo",
    });
    return { ...contexto, produto, apagadas, hospedadas };
  }

  const enviarFoto = (
    c: Awaited<ReturnType<typeof produtoComFoto>>,
    principal = true,
  ) =>
    request(c.app)
      .post(
        `${caminhoDoPainel(c.loja, `produtos/${c.produto.id}/imagens/arquivo`)}?principal=${String(principal)}`,
      )
      .set("content-type", "image/png")
      .send(Buffer.from(PNG));

  it(
    "PUT .../imagens/:id/arquivo troca a foto no lugar: mesmo id, mesma capa, endereço novo, arquivo velho apagado",
    async () => {
      const c = await produtoComFoto();
      const primeira = await enviarFoto(c);
      expect(primeira.status).toBe(201);

      const trocada = await request(c.app)
        .put(
          caminhoDoPainel(c.loja, `produtos/${c.produto.id}/imagens/${primeira.body.id}/arquivo`),
        )
        .set("content-type", "image/png")
        .send(Buffer.from(PNG));

      expect(trocada.status).toBe(200);
      expect(trocada.body.id).toBe(primeira.body.id);
      expect(trocada.body.principal).toBe(true);
      expect(trocada.body.url).toBe(c.hospedadas[1]);
      expect(trocada.body.url).not.toBe(primeira.body.url);
      expect(c.apagadas).toEqual([primeira.body.url]);

      const lista = await request(c.app).get(
        caminhoDoPainel(c.loja, `produtos/${c.produto.id}/imagens`),
      );
      expect(lista.body.imagens).toHaveLength(1);
      expect(lista.body.imagens[0].url).toBe(trocada.body.url);
    },
    ESPERA_LONGA,
  );

  it(
    "arquivo que não é imagem não troca nada: a foto anterior continua",
    async () => {
      const c = await produtoComFoto();
      const primeira = await enviarFoto(c);
      const recusada = await request(c.app)
        .put(
          caminhoDoPainel(c.loja, `produtos/${c.produto.id}/imagens/${primeira.body.id}/arquivo`),
        )
        .set("content-type", "image/png")
        .send(Buffer.from("isto é um texto"));
      expect(recusada.status).toBe(400);
      expect(c.apagadas).toEqual([]);
      const lista = await request(c.app).get(
        caminhoDoPainel(c.loja, `produtos/${c.produto.id}/imagens`),
      );
      expect(lista.body.imagens[0].url).toBe(primeira.body.url);
    },
    ESPERA_LONGA,
  );

  it(
    "remover a foto apaga o arquivo; mas não se outro produto usa o mesmo endereço",
    async () => {
      const c = await produtoComFoto();
      const primeira = await enviarFoto(c);
      // Um segundo produto aponta para a MESMA foto (é o que "duplicar" faz).
      const outro = await criarProdutoPeloPainel(c.app, c.loja, {
        categoriaId: (
          await criarCategoriaPeloPainel(c.app, c.loja, "Doces")
        ).id,
        nome: "Pastel doce",
      });
      const copia = await request(c.app)
        .post(caminhoDoPainel(c.loja, `produtos/${outro.id}/imagens`))
        .send({ url: primeira.body.url, altText: null, principal: true });
      expect(copia.status).toBe(201);

      const remover = (produtoId: string, imagemId: string) =>
        request(c.app).delete(
          caminhoDoPainel(c.loja, `produtos/${produtoId}/imagens/${imagemId}`),
        );

      expect((await remover(c.produto.id, primeira.body.id)).status).toBe(204);
      // O outro produto ainda usa o arquivo: ele fica.
      expect(c.apagadas).toEqual([]);

      expect((await remover(outro.id, copia.body.id)).status).toBe(204);
      expect(c.apagadas).toEqual([primeira.body.url]);
    },
    ESPERA_LONGA,
  );
});
