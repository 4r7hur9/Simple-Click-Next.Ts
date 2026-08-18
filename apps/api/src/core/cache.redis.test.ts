import { existsSync } from "node:fs";
import net from "node:net";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  type Cache,
  type ClienteDeCache,
  criarCache,
  criarClienteRedis,
  prefixoDaLoja,
} from "./cache.ts";

/**
 * A mesma regra de `cache.test.ts`, agora contra o Redis de verdade.
 *
 * O cliente falso prova a REGRA; este arquivo prova que ela sobrevive ao
 * PROTOCOLO: resposta partida pelo TCP no meio de um valor grande, prazo de
 * validade aplicado pelo servidor (e não pelo relógio do teste), varredura por
 * prefixo no espaço de chaves compartilhado, e conexão recusada quando não há
 * ninguém do outro lado. Nada disso um substituto em memória mostraria.
 *
 * Roda no índice de teste do Redis (`REDIS_URL_TEST`), nunca no da aplicação, e
 * cada execução usa identificadores de loja novos — assim duas árvores de
 * trabalho na mesma máquina não se atrapalham.
 */

const RAIZ_DO_REPOSITORIO = fileURLToPath(
  new URL("../../../../", import.meta.url),
);
const ARQUIVO_DE_AMBIENTE = join(RAIZ_DO_REPOSITORIO, ".env");
if (existsSync(ARQUIVO_DE_AMBIENTE)) process.loadEnvFile(ARQUIVO_DE_AMBIENTE);

/**
 * Variável obrigatória. Sem ela o teste FALHA dizendo o que fazer — nunca é
 * pulado: um cache que ninguém provou é um cache que ninguém sabe se isola.
 */
function exigirVariavel(nome: string): string {
  const valor = process.env[nome]?.trim();
  if (valor === undefined || valor === "") {
    throw new Error(
      [
        `${nome} não está definida, e sem ela não há como provar o cache contra um Redis real.`,
        "Suba o ambiente e preencha o arquivo de ambiente:",
        "  bash infra/scripts/up.sh core",
        "  cp .env.example .env   # e complete REDIS_URL e REDIS_URL_TEST",
      ].join("\n"),
    );
  }
  return valor;
}

const URL_DO_CACHE_DE_TESTE = exigirVariavel("REDIS_URL_TEST");

/** Identificadores novos a cada execução: nada de sobra de execução anterior. */
const LOJA_A = randomUUID();
const LOJA_B = randomUUID();

let cliente: ClienteDeCache;
let cache: Cache;

/** Porta em que ninguém está escutando, descoberta abrindo e fechando uma. */
async function portaFechada(): Promise<number> {
  return new Promise((resolver, rejeitar) => {
    const servidor = net.createServer();
    servidor.once("error", rejeitar);
    servidor.listen(0, "127.0.0.1", () => {
      const endereco = servidor.address();
      const porta =
        typeof endereco === "object" && endereco !== null ? endereco.port : 0;
      servidor.close(() => resolver(porta));
    });
  });
}

/** Espera de verdade — o prazo de validade quem aplica é o servidor. */
function esperar(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

beforeAll(() => {
  cliente = criarClienteRedis({ url: URL_DO_CACHE_DE_TESTE });
  cache = criarCache({ cliente, ttlSegundos: 60 });
});

afterAll(async () => {
  // Limpeza: as chaves das duas lojas saem do índice de teste.
  for (const loja of [LOJA_A, LOJA_B]) {
    const chaves = await cliente.listarPorPrefixo(prefixoDaLoja(loja));
    if (chaves.length > 0) await cliente.remover(chaves);
  }
  await cache.encerrar();
});

describe("cache contra o Redis de verdade", () => {
  it("@spec:AC-027 duas lojas consultando o mesmo tipo de dado recebem cada uma o seu", async () => {
    const catalogoA = await cache.lembrar(LOJA_A, "catalogo", async () =>
      Promise.resolve({
        loja: "A",
        produtos: [{ nome: "pastel", precoEmCentavos: 850 }],
      }),
    );
    const catalogoB = await cache.lembrar(LOJA_B, "catalogo", async () =>
      Promise.resolve({
        loja: "B",
        produtos: [{ nome: "pneu", precoEmCentavos: 32000 }],
      }),
    );

    // A releitura de A não recalcula: se ela devolvesse o valor de B, o teste
    // morreria aqui — que é exatamente o vazamento que AC-027 existe para pegar.
    const deNovoA = await cache.lembrar(LOJA_A, "catalogo", async () =>
      Promise.reject(
        new Error("não deveria recalcular: o valor está no Redis"),
      ),
    );
    const deNovoB = await cache.lembrar(LOJA_B, "catalogo", async () =>
      Promise.reject(
        new Error("não deveria recalcular: o valor está no Redis"),
      ),
    );

    expect(catalogoA).toEqual(deNovoA);
    expect(catalogoB).toEqual(deNovoB);
    expect(deNovoA).toEqual({
      loja: "A",
      produtos: [{ nome: "pastel", precoEmCentavos: 850 }],
    });
    expect(deNovoB).toEqual({
      loja: "B",
      produtos: [{ nome: "pneu", precoEmCentavos: 32000 }],
    });
  });

  it("@spec:AC-027 no servidor, toda chave da loja está sob o prefixo dela e sob nenhum outro", async () => {
    await cache.lembrar(LOJA_A, "vitrine", async () => Promise.resolve("A"));
    await cache.lembrar(LOJA_B, "vitrine", async () => Promise.resolve("B"));

    const doA = await cliente.listarPorPrefixo(prefixoDaLoja(LOJA_A));
    const doB = await cliente.listarPorPrefixo(prefixoDaLoja(LOJA_B));

    expect(doA.length).toBeGreaterThan(0);
    expect(doB.length).toBeGreaterThan(0);
    expect(doA.every((chave) => chave.startsWith(`${LOJA_A}:`))).toBe(true);
    expect(doB.every((chave) => chave.startsWith(`${LOJA_B}:`))).toBe(true);
    expect(doA.some((chave) => doB.includes(chave))).toBe(false);
  });

  it("@spec:AC-027 valor grande atravessa o protocolo inteiro, sem se misturar com o da outra loja", async () => {
    // 200 mil caracteres não cabem em um pedaço de TCP: o cliente precisa
    // juntar os pedaços para devolver o valor certo — e devolver o valor certo
    // ao pedido certo.
    const grandeA = "a".repeat(200_000);
    const grandeB = "b".repeat(200_000);

    await cache.lembrar(LOJA_A, "catalogo.grande", async () =>
      Promise.resolve(grandeA),
    );
    await cache.lembrar(LOJA_B, "catalogo.grande", async () =>
      Promise.resolve(grandeB),
    );

    const lidoA = await cache.lembrar(LOJA_A, "catalogo.grande", async () =>
      Promise.reject(new Error("não deveria recalcular")),
    );
    const lidoB = await cache.lembrar(LOJA_B, "catalogo.grande", async () =>
      Promise.reject(new Error("não deveria recalcular")),
    );

    expect(lidoA).toBe(grandeA);
    expect(lidoB).toBe(grandeB);
  });

  it("@spec:AC-028 alterou o produto: a leitura seguinte reflete, sem reinício de serviço nem limpeza manual", async () => {
    let nome = "pastel de carne";
    const ler = async () => Promise.resolve({ nome });

    expect(
      await cache.lembrar(LOJA_A, "produto", ler, { partes: ["p1"] }),
    ).toEqual({
      nome: "pastel de carne",
    });

    nome = "pastel de queijo";
    // Ainda em cache: sem invalidação, a alteração não apareceria agora.
    expect(
      await cache.lembrar(LOJA_A, "produto", ler, { partes: ["p1"] }),
    ).toEqual({
      nome: "pastel de carne",
    });

    const apagadas = await cache.invalidarLoja(LOJA_A);
    expect(apagadas).toBeGreaterThan(0);

    expect(
      await cache.lembrar(LOJA_A, "produto", ler, { partes: ["p1"] }),
    ).toEqual({
      nome: "pastel de queijo",
    });
  });

  it("@spec:AC-028 a invalidação de uma loja não apaga o cache da outra no mesmo servidor", async () => {
    await cache.lembrar(LOJA_A, "menu", async () => Promise.resolve("A"));
    await cache.lembrar(LOJA_B, "menu", async () => Promise.resolve("B"));

    await cache.invalidarLoja(LOJA_A);

    expect(await cliente.listarPorPrefixo(prefixoDaLoja(LOJA_A))).toEqual([]);
    expect(await cliente.buscar(`${LOJA_B}:menu`)).toBeDefined();
  });

  it("@spec:AC-028 o prazo é o do servidor: passado ele, a leitura reflete sem ninguém intervir", async () => {
    let situacao = "aberto";
    const ler = async () => Promise.resolve(situacao);

    await cache.lembrar(LOJA_B, "situacao", ler, { ttlSegundos: 1 });
    situacao = "fechado";

    expect(
      await cache.lembrar(LOJA_B, "situacao", ler, { ttlSegundos: 1 }),
    ).toBe("aberto");

    await esperar(1_300);

    expect(
      await cache.lembrar(LOJA_B, "situacao", ler, { ttlSegundos: 1 }),
    ).toBe("fechado");
  });
});

describe("cache fora do ar", () => {
  it("@spec:AC-027 com o Redis inalcançável a leitura vai à fonte e a loja continua vendendo", async () => {
    const porta = await portaFechada();
    const clienteMorto = criarClienteRedis({
      url: `redis://127.0.0.1:${porta}/0`,
      tempoLimiteMs: 500,
    });
    const cacheMorto = criarCache({ cliente: clienteMorto });
    let consultas = 0;

    const catalogo = await cacheMorto.lembrar(LOJA_A, "catalogo", async () => {
      consultas += 1;
      return Promise.resolve({ nome: "pastel" });
    });

    expect(catalogo).toEqual({ nome: "pastel" });
    expect(consultas).toBe(1);
    expect(cacheMorto.degradado()).toBe(true);

    // E a invalidação também não explode: quem altera o catálogo não pode
    // depender do cache estar de pé.
    await expect(cacheMorto.invalidarLoja(LOJA_A)).resolves.toBe(0);
    await cacheMorto.encerrar();
  });
});
