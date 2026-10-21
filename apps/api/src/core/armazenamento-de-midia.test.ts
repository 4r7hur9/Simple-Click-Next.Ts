/**
 * Prova do armazenamento das imagens da loja e das fotos do catálogo
 * (card #81: "a imagem nova não substitui a antiga").
 *
 * Três coisas que faltavam e faziam o envio falhar em silêncio:
 *
 * 1. fora de produção sem Cloudinary, ENVIAR funciona (disco da API) — antes,
 *    todo envio de logo/capa/fundo/topo respondia 503 e a antiga ficava;
 * 2. cada envio ganha um endereço novo, então nenhum navegador ou CDN entrega
 *    a imagem de antes;
 * 3. trocar apaga o arquivo antigo — mas só o que a própria loja enviou, nunca
 *    uma imagem do seed nem de outra loja.
 */
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  apagarMidiaPelaUrl,
  chaveDaMidiaPelaUrl,
  imagensDaLojaDoAmbiente,
  midiaEmMemoria,
  midiaNoDisco,
} from "./armazenamento-de-midia.ts";
import { ErroDeArmazenamentoIndisponivel } from "./midia.ts";

const LOJA = "61e182a3-4fa4-5612-b4fd-ff3f7e178122";
const OUTRA = "0b9a3f0e-1111-4222-8333-444455556666";
const ARQUIVO = "10c7f682-f293-4dd7-985e-42ab3f866027";
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

let pasta: string;

beforeAll(async () => {
  pasta = await mkdtemp(join(tmpdir(), "sc81-"));
});
afterAll(async () => {
  await rm(pasta, { recursive: true, force: true });
});

describe("chaveDaMidiaPelaUrl — só o que a própria loja enviou", () => {
  it("reconhece o arquivo do disco da API", () => {
    expect(
      chaveDaMidiaPelaUrl(
        `http://localhost:3001/v1/midia/arquivos/${LOJA}/loja/${ARQUIVO}.png`,
        LOJA,
      ),
    ).toBe(`disco:${LOJA}/loja/${ARQUIVO}.png`);
  });

  it("recusa arquivo de OUTRA loja, imagem do seed e endereço colado à mão", () => {
    expect(
      chaveDaMidiaPelaUrl(
        `http://localhost:3001/v1/midia/arquivos/${OUTRA}/loja/${ARQUIVO}.png`,
        LOJA,
      ),
    ).toBeNull();
    expect(chaveDaMidiaPelaUrl("/demo/pastelaria-da-vila/capa.webp", LOJA)).toBeNull();
    expect(chaveDaMidiaPelaUrl("https://exemplo.test/foto.png", LOJA)).toBeNull();
    expect(chaveDaMidiaPelaUrl("", LOJA)).toBeNull();
  });

  it("não aceita sair da pasta da loja por '..'", () => {
    expect(
      chaveDaMidiaPelaUrl(
        `http://localhost:3001/v1/midia/arquivos/${LOJA}/loja/../../${OUTRA}/loja/${ARQUIVO}.png`,
        LOJA,
      ),
    ).toBeNull();
  });

  it("reconhece o Cloudinary da própria loja, com versão e transformações", () => {
    expect(
      chaveDaMidiaPelaUrl(
        `https://res.cloudinary.com/nuvem/image/upload/v1790/lojas/${LOJA}/logo-1790-ab12cd34.png`,
        LOJA,
      ),
    ).toBe(`cloudinary:image:lojas/${LOJA}/logo-1790-ab12cd34`);
    expect(
      chaveDaMidiaPelaUrl(
        `https://res.cloudinary.com/nuvem/image/upload/f_auto,q_auto,w_400/simpleclick/${LOJA}/abc123.jpg`,
        LOJA,
      ),
    ).toBe(`cloudinary:image:simpleclick/${LOJA}/abc123`);
    expect(
      chaveDaMidiaPelaUrl(
        `https://res.cloudinary.com/nuvem/image/upload/v1/lojas/${OUTRA}/logo-1.png`,
        LOJA,
      ),
    ).toBeNull();
  });
});

describe("imagensDaLojaDoAmbiente — enviar, trocar e apagar a antiga", () => {
  const fonte = () => ({ NODE_ENV: "development", MIDIA_LOCAL_DIR: pasta });

  it("fora de produção, sem Cloudinary, GUARDA no disco e devolve o endereço da API", async () => {
    const imagens = imagensDaLojaDoAmbiente(fonte());
    const { url } = await imagens.guardar({
      lojaId: LOJA,
      nome: "logo",
      bytes: PNG,
      tipoDeConteudo: "image/png",
    });
    expect(url).toMatch(
      new RegExp(`^http://localhost:3001/v1/midia/arquivos/${LOJA}/loja/[0-9a-f-]{36}\\.png$`),
    );
    const chave = chaveDaMidiaPelaUrl(url, LOJA) as string;
    expect(existsSync(join(pasta, chave.slice("disco:".length)))).toBe(true);
  });

  it("cada envio ganha um endereço NOVO (nenhum cache entrega a imagem de antes)", async () => {
    const imagens = imagensDaLojaDoAmbiente(fonte());
    const envio = { lojaId: LOJA, nome: "capa", bytes: PNG, tipoDeConteudo: "image/png" };
    const a = await imagens.guardar(envio);
    const b = await imagens.guardar(envio);
    expect(a.url).not.toBe(b.url);
  });

  it("apagar remove o arquivo antigo, e só o da própria loja", async () => {
    const imagens = imagensDaLojaDoAmbiente(fonte());
    const { url } = await imagens.guardar({
      lojaId: LOJA,
      nome: "logo",
      bytes: PNG,
      tipoDeConteudo: "image/png",
    });
    const caminho = join(pasta, (chaveDaMidiaPelaUrl(url, LOJA) as string).slice(6));

    // Outra loja pedindo para apagar não encontra nada seu: o arquivo fica.
    await imagens.apagar?.(url, OUTRA);
    expect(existsSync(caminho)).toBe(true);

    await imagens.apagar?.(url, LOJA);
    expect(existsSync(caminho)).toBe(false);

    // Apagar o que já não existe, o seed ou um endereço de fora não é erro.
    await expect(imagens.apagar?.(url, LOJA)).resolves.toBeUndefined();
    await expect(
      imagens.apagar?.("/demo/pastelaria-da-vila/logo.webp", LOJA),
    ).resolves.toBeUndefined();
  });

  it("em produção sem Cloudinary, o envio responde indisponível (nunca finge que guardou)", async () => {
    const imagens = imagensDaLojaDoAmbiente({ NODE_ENV: "production" });
    await expect(
      imagens.guardar({ lojaId: LOJA, nome: "logo", bytes: PNG, tipoDeConteudo: "image/png" }),
    ).rejects.toBeInstanceOf(ErroDeArmazenamentoIndisponivel);
  });

  it("recusa formato fora de jpeg/png/webp", async () => {
    const imagens = imagensDaLojaDoAmbiente(fonte());
    await expect(
      imagens.guardar({ lojaId: LOJA, nome: "logo", bytes: PNG, tipoDeConteudo: "image/gif" }),
    ).rejects.toThrow(/Formato de imagem/);
  });
});

describe("apagarMidiaPelaUrl", () => {
  it("apaga pela chave do endereço e engole a falha do armazenamento", async () => {
    const memoria = midiaEmMemoria();
    const guardada = await memoria.guardar({
      lojaId: LOJA,
      pasta: "loja",
      tipo: "imagem",
      bytes: PNG,
      tipoDeConteudo: "image/png",
      extensao: "png",
    });
    expect(memoria.arquivos.has(guardada.chave)).toBe(true);
    await apagarMidiaPelaUrl(memoria, LOJA, guardada.url);
    expect(memoria.arquivos.has(guardada.chave)).toBe(false);

    const quebrado = {
      apagar: async () => {
        throw new Error("rede caiu");
      },
    };
    const falhas: unknown[] = [];
    await apagarMidiaPelaUrl(quebrado, LOJA, guardada.url, (c) => falhas.push(c));
    expect(falhas).toHaveLength(1);
  });

  it("o disco só aceita chave no formato conhecido (nada de sair da pasta)", async () => {
    const disco = midiaNoDisco(pasta, "http://localhost:3001");
    await expect(disco.apagar("disco:../../etc/passwd")).resolves.toBeUndefined();
  });
});
