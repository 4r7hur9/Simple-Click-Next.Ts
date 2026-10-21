/**
 * Prova do endereço de imagem que a loja aceita guardar (card #81).
 *
 * O defeito: as lojas de demonstração guardam as imagens como `/demo/...` e o
 * envio de desenvolvimento devolve `http://localhost:3001/...`. Os dois eram
 * recusados no "Salvar e publicar" (só `https://` passava), a resposta era 400
 * e a imagem nova nunca chegava a ser salva.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { ehEnderecoDeImagem } from "./endereco-de-imagem.ts";
import {
  esquemaDaEdicaoDoTema,
  temaDaLoja,
} from "./tema.ts";
import { esquemaDaConfiguracaoDeAparencia } from "./store-settings.ts";

afterEach(() => {
  vi.unstubAllEnvs();
});

const LOCAL = "http://localhost:3001/v1/midia/arquivos/l/loja/a.png";
const DEMO = "/demo/pastelaria-da-vila/capa.webp";

describe("ehEnderecoDeImagem", () => {
  it("https vale em qualquer ambiente", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(ehEnderecoDeImagem("https://res.cloudinary.com/n/image/upload/a.png")).toBe(true);
    expect(ehEnderecoDeImagem("http://exemplo.test/a.png")).toBe(false);
  });

  it("fora de produção, vale o arquivo guardado pela própria API e o caminho do seed", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(ehEnderecoDeImagem(LOCAL)).toBe(true);
    expect(ehEnderecoDeImagem(DEMO)).toBe(true);
    expect(ehEnderecoDeImagem("http://exemplo.test/a.png")).toBe(false);
    expect(ehEnderecoDeImagem("/demo/../etc/passwd")).toBe(false);
    expect(ehEnderecoDeImagem("/api/qualquer-coisa")).toBe(false);
    expect(ehEnderecoDeImagem(null)).toBe(false);
  });

  it("em produção, nada disso vale", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(ehEnderecoDeImagem(LOCAL)).toBe(false);
    expect(ehEnderecoDeImagem(DEMO)).toBe(false);
  });
});

describe("o que a loja de demonstração e o envio local precisam salvar", () => {
  it("o tema aceita fundo e topo enviados (endereço local) e do seed (/demo)", () => {
    vi.stubEnv("NODE_ENV", "development");
    const lido = esquemaDaEdicaoDoTema.safeParse({
      fundoVitrine: LOCAL,
      topoCardapio: DEMO,
      coresDasImagens: { [LOCAL]: "#112233", [DEMO]: "#445566" },
    });
    expect(lido.success).toBe(true);
  });

  it("a apresentação aceita logo e capa do seed e enviadas", () => {
    vi.stubEnv("NODE_ENV", "development");
    const lido = esquemaDaConfiguracaoDeAparencia.safeParse({
      nome: "Pastelaria da Vila",
      boasVindas: null,
      sobre: null,
      logo: "/demo/pastelaria-da-vila/logo.webp",
      capa: LOCAL,
      corPrimaria: "#B3261E",
    });
    expect(lido.success).toBe(true);
  });

  it("em produção a recusa continua, com a frase que ensina", () => {
    vi.stubEnv("NODE_ENV", "production");
    const lido = esquemaDaEdicaoDoTema.safeParse({ fundoVitrine: DEMO });
    expect(lido.success).toBe(false);
    expect(JSON.stringify(lido.error?.issues)).toContain("https://");
  });

  it("a vitrine lê o fundo enviado: não o descarta por não ser https", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(temaDaLoja({ fundoVitrine: LOCAL, topoCardapio: DEMO }).fundoVitrine).toBe(LOCAL);
    expect(temaDaLoja({ fundoVitrine: LOCAL, topoCardapio: DEMO }).topoCardapio).toBe(DEMO);
  });
});
