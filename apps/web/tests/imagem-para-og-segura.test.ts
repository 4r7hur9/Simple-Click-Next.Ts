/**
 * A foto da imagem de compartilhamento não vira porta para dentro da rede
 * (card #137, achado 3): o endereço vem do dono da loja, então a busca só sai
 * para `https`, para os hosts de imagem conhecidos e para endereço público;
 * redirecionamento é conferido a cada salto; o corpo é lido com limite mesmo
 * sem `Content-Length`; e o build não rastreia a pasta pública inteira.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ehEnderecoInterno,
  enderecoPodeSerBuscado,
  fotoParaOg,
  LIMITE_DA_FOTO_EM_BYTES,
} from "../src/server/imagem-para-og";

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
]);

/** DNS de mentira: o CDN e o site resolvem para endereço público. */
const dnsPublico = vi.fn(async (host: string): Promise<readonly string[]> => {
  if (host === "res.cloudinary.com") return ["151.101.1.137"];
  if (host === "loja.exemplo.com") return ["203.0.113.10"];
  throw new Error(`ENOTFOUND ${host}`);
});

function resposta(corpo: BodyInit | null, init: ResponseInit = {}): Response {
  return new Response(corpo, init);
}

beforeEach(() => {
  vi.stubEnv("URL_DO_SITE", "https://loja.exemplo.com");
  dnsPublico.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe("[CA-3] a busca só sai para onde a foto pode morar", () => {
  it("classifica loopback, rede privada, link-local e IPv4 mapeado como internos", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.9",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "fe80::1",
      "fd00::1",
      "::ffff:10.0.0.1",
      "não-é-ip",
    ]) {
      expect(ehEnderecoInterno(ip), ip).toBe(true);
    }
    expect(ehEnderecoInterno("151.101.1.137")).toBe(false);
    expect(ehEnderecoInterno("2606:4700::1111")).toBe(false);
  });

  it("recusa http, host desconhecido, IP literal e credencial embutida SEM abrir conexão", async () => {
    const buscar = vi.fn<typeof fetch>();
    for (const url of [
      "http://res.cloudinary.com/x/foto.png",
      "https://169.254.169.254/latest/meta-data",
      "https://127.0.0.1/foto.png",
      "https://intranet.local/foto.png",
      "https://evil.example/foto.png",
      "https://user:senha@res.cloudinary.com/foto.png",
      "file:///etc/passwd",
    ]) {
      await expect(
        fotoParaOg(url, { buscar, resolverNome: dnsPublico }),
        url,
      ).resolves.toBeNull();
    }
    expect(buscar).not.toHaveBeenCalled();
  });

  it("recusa host permitido cujo nome resolve para endereço interno (DNS apontado para dentro)", async () => {
    const buscar = vi.fn<typeof fetch>();
    const dnsTraicoeiro = async () => ["203.0.113.10", "10.0.0.5"];
    await expect(
      enderecoPodeSerBuscado(
        new URL("https://res.cloudinary.com/a.png"),
        dnsTraicoeiro,
      ),
    ).resolves.toBe(false);
    await expect(
      fotoParaOg("https://res.cloudinary.com/a.png", {
        buscar,
        resolverNome: dnsTraicoeiro,
      }),
    ).resolves.toBeNull();
    expect(buscar).not.toHaveBeenCalled();
  });

  it("baixa do CDN com redirect manual e devolve o data URI", async () => {
    const buscar = vi.fn<typeof fetch>(async () =>
      resposta(PNG, { status: 200, headers: { "content-type": "image/png" } }),
    );
    const foto = await fotoParaOg("https://res.cloudinary.com/sc/foto.png", {
      buscar,
      resolverNome: dnsPublico,
    });
    expect(foto).toMatch(/^data:image\/png;base64,/);
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(buscar.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" });
    expect(buscar.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("não segue redirecionamento para host fora da lista nem para endereço interno", async () => {
    for (const destino of [
      "https://evil.example/x.png",
      "http://169.254.169.254/latest",
    ]) {
      const buscar = vi.fn<typeof fetch>(async () =>
        resposta(null, { status: 302, headers: { location: destino } }),
      );
      await expect(
        fotoParaOg("https://res.cloudinary.com/sc/foto.png", {
          buscar,
          resolverNome: dnsPublico,
        }),
      ).resolves.toBeNull();
      expect(buscar).toHaveBeenCalledTimes(1);
    }
  });

  it("segue redirecionamento entre hosts permitidos, conferindo cada salto", async () => {
    const buscar = vi.fn<typeof fetch>(async (endereco) =>
      String(endereco).startsWith("https://loja.exemplo.com/")
        ? resposta(null, {
            status: 301,
            headers: { location: "https://res.cloudinary.com/sc/a.png" },
          })
        : resposta(PNG, { status: 200 }),
    );
    await expect(
      fotoParaOg("https://loja.exemplo.com/foto.png", {
        buscar,
        resolverNome: dnsPublico,
      }),
    ).resolves.toMatch(/^data:image\/png/);
    expect(buscar).toHaveBeenCalledTimes(2);
    expect(dnsPublico).toHaveBeenCalledWith("loja.exemplo.com");
    expect(dnsPublico).toHaveBeenCalledWith("res.cloudinary.com");
  });

  it("para de ler o corpo ao passar de 4 MB, mesmo sem Content-Length", async () => {
    const pedaco = new Uint8Array(512 * 1024);
    pedaco.set(PNG);
    let entregues = 0;
    let cancelado = false;
    const corpo = new ReadableStream<Uint8Array>({
      pull(controle) {
        entregues += 1;
        // Corpo "infinito": quem não aborta lê para sempre.
        controle.enqueue(pedaco);
      },
      cancel() {
        cancelado = true;
      },
    });
    const buscar = vi.fn<typeof fetch>(async () =>
      resposta(corpo, { status: 200 }),
    );
    await expect(
      fotoParaOg("https://res.cloudinary.com/sc/grande.png", {
        buscar,
        resolverNome: dnsPublico,
      }),
    ).resolves.toBeNull();
    expect(cancelado).toBe(true);
    expect(entregues * pedaco.byteLength).toBeLessThanOrEqual(
      LIMITE_DA_FOTO_EM_BYTES + 3 * pedaco.byteLength,
    );
  });

  it("recusa pelo Content-Length declarado sem ler o corpo", async () => {
    let lido = false;
    const corpo = new ReadableStream<Uint8Array>(
      {
        pull(controle) {
          lido = true;
          controle.close();
        },
      },
      // Sem leitura antecipada: só puxa quando alguém lê.
      { highWaterMark: 0 },
    );
    const buscar = vi.fn<typeof fetch>(async () =>
      resposta(corpo, {
        status: 200,
        headers: { "content-length": String(LIMITE_DA_FOTO_EM_BYTES + 1) },
      }),
    );
    await expect(
      fotoParaOg("https://res.cloudinary.com/sc/grande.png", {
        buscar,
        resolverNome: dnsPublico,
      }),
    ).resolves.toBeNull();
    expect(lido).toBe(false);
  });
});

describe("[CA-3] o build não rastreia a pasta pública inteira", () => {
  it("todo acesso dinâmico ao disco leva o comentário que o Turbopack pede", () => {
    const fonte = readFileSync(
      path.resolve(__dirname, "../src/server/imagem-para-og.ts"),
      "utf8",
    );
    const acessos = fonte.match(/(?:path\.resolve|readFile)\([^)]*/g) ?? [];
    expect(acessos.length).toBeGreaterThanOrEqual(3);
    for (const acesso of acessos) {
      expect(acesso, acesso).toContain("/*turbopackIgnore: true*/");
    }
  });
});
