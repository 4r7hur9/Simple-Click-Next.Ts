import { describe, expect, it } from "vitest";

import {
  CABECALHO_DE_REVALIDACAO,
  CAMINHO_DE_REVALIDACAO,
  type ClienteDeCache,
  chaveDeCache,
  criarAvisoDoSite,
  criarCache,
  ErroDeChaveDeCache,
  ErroDeConfiguracaoDoAviso,
  ErroDeEnderecoDoCache,
  type FalhaDeCache,
  lerConfiguracaoDoAviso,
  lerEnderecoDoCache,
  prefixoDaLoja,
} from "./cache.ts";

/**
 * Prova do cache com identificação de loja (AC-027) e da invalidação dentro do
 * prazo (AC-028), sem depender de servidor nenhum.
 *
 * O cliente falso guarda de verdade, expira de verdade e falha quando mandado
 * — o que permite provar aqui a REGRA (chave por loja, invalidação, prazo,
 * degradação) de forma determinística. A prova de que a mesma regra vale contra
 * um Redis real está em `cache.redis.test.ts`, que fala com o servidor no ar.
 */

/** Identificadores no formato que o banco produz: sem dois-pontos, sem espaço. */
const LOJA_A = "11111111-1111-4111-8111-111111111111";
const LOJA_B = "22222222-2222-4222-8222-222222222222";

/** Segredo de prova, montado por repetição para não parecer credencial (P-002). */
const SEGREDO_DE_PROVA = "s".repeat(48);

/** Relógio de mentira: o teste anda com o tempo em vez de esperar por ele. */
function criarRelogio(inicio = 1_000_000) {
  let momento = inicio;
  return {
    agora: () => momento,
    avancarSegundos: (segundos: number) => {
      momento += segundos * 1000;
    },
    avancarMs: (ms: number) => {
      momento += ms;
    },
  };
}

interface EntradaGuardada {
  readonly valor: string;
  readonly expiraEm: number;
}

/** Cliente de cache em memória, com prazo de validade e falha sob comando. */
function criarClienteFalso(agora: () => number) {
  const guardado = new Map<string, EntradaGuardada>();
  const chavesEscritas: string[] = [];
  let defeito: Error | undefined;

  function conferirSaude(): void {
    if (defeito !== undefined) throw defeito;
  }

  function vivo(chave: string): EntradaGuardada | undefined {
    const entrada = guardado.get(chave);
    if (entrada === undefined) return undefined;
    if (entrada.expiraEm <= agora()) {
      guardado.delete(chave);
      return undefined;
    }
    return entrada;
  }

  const cliente: ClienteDeCache = {
    buscar(chave) {
      conferirSaude();
      return Promise.resolve(vivo(chave)?.valor);
    },
    guardar(chave, valor, ttlSegundos) {
      conferirSaude();
      chavesEscritas.push(chave);
      guardado.set(chave, { valor, expiraEm: agora() + ttlSegundos * 1000 });
      return Promise.resolve();
    },
    remover(chaves) {
      conferirSaude();
      let apagadas = 0;
      for (const chave of chaves) if (guardado.delete(chave)) apagadas += 1;
      return Promise.resolve(apagadas);
    },
    listarPorPrefixo(prefixo) {
      conferirSaude();
      const achadas = [...guardado.keys()].filter((chave) =>
        chave.startsWith(prefixo),
      );
      return Promise.resolve(achadas);
    },
    encerrar() {
      return Promise.resolve();
    },
  };

  return {
    cliente,
    chavesEscritas,
    chavesVivas: () => [...guardado.keys()],
    quebrar(erro: Error) {
      defeito = erro;
    },
    consertar() {
      defeito = undefined;
    },
  };
}

/** Uma fonte de dados que conta quantas vezes foi consultada. */
function criarFonte(valorInicial: string) {
  let valor = valorInicial;
  let consultas = 0;
  return {
    ler: async () => {
      consultas += 1;
      return Promise.resolve({ nome: valor });
    },
    alterarPara: (novo: string) => {
      valor = novo;
    },
    consultas: () => consultas,
  };
}

// ---------------------------------------------------------------------------
// AC-027 — cache acelera sem servir dado de outra loja
// ---------------------------------------------------------------------------

describe("chave de cache", () => {
  it("@spec:AC-027 toda chave começa pelo identificador da loja", () => {
    const chave = chaveDeCache(LOJA_A, "catalogo");

    expect(chave.startsWith(`${LOJA_A}:`)).toBe(true);
    expect(chave).toBe(`${LOJA_A}:catalogo`);
  });

  it("@spec:AC-027 recusa montar chave sem loja, em vez de montar uma compartilhada", () => {
    expect(() => chaveDeCache("", "catalogo")).toThrow(ErroDeChaveDeCache);
    expect(() => chaveDeCache("   ", "catalogo")).toThrow(ErroDeChaveDeCache);

    try {
      chaveDeCache("", "catalogo");
    } catch (erro) {
      expect((erro as Error).message).toContain("identificador da loja");
      expect((erro as Error).message).toContain("AC-027");
    }
  });

  it("@spec:AC-027 recusa parte que permitiria uma loja forjar a chave de outra", () => {
    // Sem esta recusa, a loja "a" com o dado "b:catalogo" e a loja "a:b" com o
    // dado "catalogo" produziriam a mesma chave — e uma leria o dado da outra.
    expect(() => chaveDeCache("a", "b:catalogo")).toThrow(ErroDeChaveDeCache);
    expect(() => chaveDeCache("a:b", "catalogo")).toThrow(ErroDeChaveDeCache);
    expect(() => chaveDeCache(LOJA_A, "catalogo", "pagina 2")).toThrow(
      ErroDeChaveDeCache,
    );
  });

  it("@spec:AC-027 o prefixo de uma loja não é prefixo de nenhuma outra", () => {
    expect(prefixoDaLoja(LOJA_A)).toBe(`${LOJA_A}:`);
    expect(
      chaveDeCache(LOJA_B, "catalogo").startsWith(prefixoDaLoja(LOJA_A)),
    ).toBe(false);
  });
});

describe("cache com identificação de loja", () => {
  it("@spec:AC-027 duas lojas consultando o mesmo tipo de dado recebem cada uma o seu", async () => {
    const relogio = criarRelogio();
    const falso = criarClienteFalso(relogio.agora);
    const cache = criarCache({ cliente: falso.cliente, agora: relogio.agora });

    const catalogoA = await cache.lembrar(LOJA_A, "catalogo", async () =>
      Promise.resolve({ loja: "A", produtos: ["pastel"] }),
    );
    const catalogoB = await cache.lembrar(LOJA_B, "catalogo", async () =>
      Promise.resolve({ loja: "B", produtos: ["pneu"] }),
    );

    // E, o que importa mais: a segunda leitura de A vem do cache e continua
    // sendo o catálogo de A, mesmo depois de B ter passado pelo mesmo nome.
    const catalogoADeNovo = await cache.lembrar(LOJA_A, "catalogo", async () =>
      Promise.reject(
        new Error("não deveria recalcular: o valor está em cache"),
      ),
    );

    expect(catalogoA).toEqual({ loja: "A", produtos: ["pastel"] });
    expect(catalogoB).toEqual({ loja: "B", produtos: ["pneu"] });
    expect(catalogoADeNovo).toEqual({ loja: "A", produtos: ["pastel"] });
  });

  it("@spec:AC-027 nenhuma chave escrita deixa de começar pela loja que a pediu", async () => {
    const relogio = criarRelogio();
    const falso = criarClienteFalso(relogio.agora);
    const cache = criarCache({ cliente: falso.cliente, agora: relogio.agora });

    await cache.lembrar(LOJA_A, "catalogo", async () => Promise.resolve(1));
    await cache.lembrar(LOJA_A, "produto", async () => Promise.resolve(2), {
      partes: ["abc-123"],
    });
    await cache.lembrar(LOJA_B, "catalogo", async () => Promise.resolve(3));

    expect(falso.chavesEscritas).toEqual([
      `${LOJA_A}:catalogo`,
      `${LOJA_A}:produto:abc-123`,
      `${LOJA_B}:catalogo`,
    ]);
  });

  it("@spec:AC-027 invalidar uma loja não toca no cache da outra", async () => {
    const relogio = criarRelogio();
    const falso = criarClienteFalso(relogio.agora);
    const cache = criarCache({ cliente: falso.cliente, agora: relogio.agora });

    await cache.lembrar(LOJA_A, "catalogo", async () => Promise.resolve("A"));
    await cache.lembrar(LOJA_A, "vitrine", async () => Promise.resolve("A"));
    await cache.lembrar(LOJA_B, "catalogo", async () => Promise.resolve("B"));

    const apagadas = await cache.invalidarLoja(LOJA_A);

    expect(apagadas).toBe(2);
    expect(falso.chavesVivas()).toEqual([`${LOJA_B}:catalogo`]);
  });
});

// ---------------------------------------------------------------------------
// AC-028 — cache é invalidado quando o dado muda
// ---------------------------------------------------------------------------

describe("invalidação do cache", () => {
  it("@spec:AC-028 a alteração aparece na leitura seguinte, sem reinício de serviço nem limpeza manual", async () => {
    const relogio = criarRelogio();
    const falso = criarClienteFalso(relogio.agora);
    const cache = criarCache({ cliente: falso.cliente, agora: relogio.agora });
    const fonte = criarFonte("pastel de carne");

    // grava
    const primeira = await cache.lembrar(LOJA_A, "catalogo", fonte.ler);
    // lê do cache: a fonte não é consultada de novo
    const doCache = await cache.lembrar(LOJA_A, "catalogo", fonte.ler);
    expect(primeira).toEqual({ nome: "pastel de carne" });
    expect(doCache).toEqual({ nome: "pastel de carne" });
    expect(fonte.consultas()).toBe(1);

    // altera — como o dono faria pelo painel
    fonte.alterarPara("pastel de queijo");
    await cache.invalidarLoja(LOJA_A);

    // a próxima leitura reflete, no MESMO processo: nada foi reiniciado e
    // ninguém apagou chave à mão.
    const depois = await cache.lembrar(LOJA_A, "catalogo", fonte.ler);

    expect(depois).toEqual({ nome: "pastel de queijo" });
    expect(fonte.consultas()).toBe(2);
  });

  it("@spec:AC-028 sem aviso nenhum, o dado velho morre no prazo definido", async () => {
    const relogio = criarRelogio();
    const falso = criarClienteFalso(relogio.agora);
    const cache = criarCache({
      cliente: falso.cliente,
      ttlSegundos: 60,
      agora: relogio.agora,
    });
    const fonte = criarFonte("aberto");

    await cache.lembrar(LOJA_A, "vitrine", fonte.ler);
    fonte.alterarPara("fechado");

    // Dentro do prazo, o cache ainda responde o valor de antes.
    relogio.avancarSegundos(59);
    expect(await cache.lembrar(LOJA_A, "vitrine", fonte.ler)).toEqual({
      nome: "aberto",
    });

    // Passado o prazo, a leitura seguinte reflete — sem ninguém intervir.
    relogio.avancarSegundos(2);
    expect(await cache.lembrar(LOJA_A, "vitrine", fonte.ler)).toEqual({
      nome: "fechado",
    });
  });

  it("@spec:AC-028 o prazo é por entrada quando a leitura pede um diferente", async () => {
    const relogio = criarRelogio();
    const falso = criarClienteFalso(relogio.agora);
    const cache = criarCache({
      cliente: falso.cliente,
      ttlSegundos: 600,
      agora: relogio.agora,
    });
    const fonte = criarFonte("primeiro");

    await cache.lembrar(LOJA_A, "vitrine", fonte.ler, { ttlSegundos: 5 });
    fonte.alterarPara("segundo");
    relogio.avancarSegundos(6);

    expect(await cache.lembrar(LOJA_A, "vitrine", fonte.ler)).toEqual({
      nome: "segundo",
    });
  });

  it("@spec:AC-028 esquecer um dado só apaga aquele dado da loja", async () => {
    const relogio = criarRelogio();
    const falso = criarClienteFalso(relogio.agora);
    const cache = criarCache({ cliente: falso.cliente, agora: relogio.agora });

    await cache.lembrar(LOJA_A, "catalogo", async () => Promise.resolve("c"));
    await cache.lembrar(LOJA_A, "vitrine", async () => Promise.resolve("v"));

    await cache.esquecer(LOJA_A, "catalogo");

    expect(falso.chavesVivas()).toEqual([`${LOJA_A}:vitrine`]);
  });

  it("@spec:AC-028 valor legitimamente nulo fica em cache, e não vira consulta a cada visita", async () => {
    const relogio = criarRelogio();
    const falso = criarClienteFalso(relogio.agora);
    const cache = criarCache({ cliente: falso.cliente, agora: relogio.agora });
    let consultas = 0;

    const ler = async () => {
      consultas += 1;
      return Promise.resolve(null);
    };

    expect(await cache.lembrar(LOJA_A, "catalogo", ler)).toBeNull();
    expect(await cache.lembrar(LOJA_A, "catalogo", ler)).toBeNull();
    expect(consultas).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Degradação: o cache cai, a loja continua vendendo
// ---------------------------------------------------------------------------

describe("queda do cache", () => {
  it("@spec:AC-027 com o cache fora do ar a leitura vai à fonte e a loja continua vendendo", async () => {
    const relogio = criarRelogio();
    const falso = criarClienteFalso(relogio.agora);
    const falhas: FalhaDeCache[] = [];
    const cache = criarCache({
      cliente: falso.cliente,
      agora: relogio.agora,
      aoDegradar: (falha) => falhas.push(falha),
    });
    const fonte = criarFonte("pastel");

    falso.quebrar(new Error("connect ECONNREFUSED 127.0.0.1:6379"));

    const catalogo = await cache.lembrar(LOJA_A, "catalogo", fonte.ler);

    expect(catalogo).toEqual({ nome: "pastel" });
    expect(fonte.consultas()).toBe(1);
    expect(cache.degradado()).toBe(true);
    expect(falhas[0]?.operacao).toBe("buscar");
    expect(falhas[0]?.chave).toBe(`${LOJA_A}:catalogo`);
  });

  it("@spec:AC-027 a queda do cache não derruba a invalidação nem a remoção", async () => {
    const relogio = criarRelogio();
    const falso = criarClienteFalso(relogio.agora);
    const cache = criarCache({ cliente: falso.cliente, agora: relogio.agora });

    falso.quebrar(new Error("cache fora do ar"));

    await expect(cache.invalidarLoja(LOJA_A)).resolves.toBe(0);
    await expect(cache.esquecer(LOJA_A, "catalogo")).resolves.toBeUndefined();
  });

  it("@spec:AC-028 passada a espera o cache volta sozinho, sem reinício de serviço", async () => {
    const relogio = criarRelogio();
    const falso = criarClienteFalso(relogio.agora);
    const cache = criarCache({
      cliente: falso.cliente,
      agora: relogio.agora,
      esperaAposFalhaMs: 5_000,
    });
    const fonte = criarFonte("pastel");

    falso.quebrar(new Error("cache fora do ar"));
    await cache.lembrar(LOJA_A, "catalogo", fonte.ler);
    expect(cache.degradado()).toBe(true);

    // Enquanto a espera corre, nem se tenta o cache: insistir a cada leitura
    // trocaria "sem cache" por "lento".
    falso.consertar();
    relogio.avancarMs(1_000);
    await cache.lembrar(LOJA_A, "catalogo", fonte.ler);
    expect(falso.chavesEscritas).toEqual([]);

    relogio.avancarMs(5_000);
    await cache.lembrar(LOJA_A, "catalogo", fonte.ler);

    expect(cache.degradado()).toBe(false);
    expect(falso.chavesEscritas).toEqual([`${LOJA_A}:catalogo`]);
  });
});

// ---------------------------------------------------------------------------
// O aviso ao site — a chamada autenticada de AC-028
// ---------------------------------------------------------------------------

describe("aviso de invalidação ao site", () => {
  const configuracao = {
    urlDoSite: "https://simpleclick.localhost",
    segredo: SEGREDO_DE_PROVA,
  };

  it("@spec:AC-028 avisa o site apresentando o segredo compartilhado e a loja que mudou", async () => {
    const chamadas: Array<{ url: string; opcoes: RequestInit | undefined }> =
      [];
    const avisar = criarAvisoDoSite({
      configuracao,
      enviar: (async (url: string, opcoes?: RequestInit) => {
        chamadas.push({ url, opcoes });
        return Promise.resolve(new Response(null, { status: 200 }));
      }) as unknown as typeof fetch,
    });

    const resultado = await avisar({ lojaId: LOJA_A, nomes: ["catalogo"] });

    expect(resultado).toBe("enviado");
    expect(chamadas[0]?.url).toBe(
      `https://simpleclick.localhost${CAMINHO_DE_REVALIDACAO}`,
    );
    const cabecalhos = chamadas[0]?.opcoes?.headers as Record<string, string>;
    expect(cabecalhos[CABECALHO_DE_REVALIDACAO]).toBe(SEGREDO_DE_PROVA);
    expect(JSON.parse(String(chamadas[0]?.opcoes?.body))).toEqual({
      lojaId: LOJA_A,
      nomes: ["catalogo"],
    });
  });

  it("@spec:AC-028 site fora do ar não derruba a alteração do catálogo", async () => {
    const avisar = criarAvisoDoSite({
      configuracao,
      enviar: (() =>
        Promise.reject(new Error("fetch failed"))) as unknown as typeof fetch,
    });

    await expect(avisar({ lojaId: LOJA_A })).resolves.toBe("indisponivel");
  });

  it("@spec:AC-028 site que recusa o segredo é reportado como recusa, não como queda", async () => {
    const avisar = criarAvisoDoSite({
      configuracao,
      enviar: (() =>
        Promise.resolve(
          new Response(null, { status: 401 }),
        )) as unknown as typeof fetch,
    });

    await expect(avisar({ lojaId: LOJA_A })).resolves.toBe("recusado");
  });

  it("@spec:AC-028 sem configuração o aviso não sai, e o prazo de validade assume", async () => {
    const avisar = criarAvisoDoSite({ configuracao: undefined });

    await expect(avisar({ lojaId: LOJA_A })).resolves.toBe("nao_configurado");
  });

  it("@spec:AC-028 lê a configuração do ambiente, e nunca de valor escrito no código", () => {
    expect(lerConfiguracaoDoAviso({})).toBeUndefined();
    expect(
      lerConfiguracaoDoAviso({
        URL_DO_SITE: "https://simpleclick.localhost",
        SEGREDO_DE_REVALIDACAO: SEGREDO_DE_PROVA,
      }),
    ).toEqual(configuracao);
  });

  it("@spec:AC-028 recusa configuração pela metade, que pareceria ligada e nunca funcionaria", () => {
    expect(() =>
      lerConfiguracaoDoAviso({ URL_DO_SITE: "https://simpleclick.localhost" }),
    ).toThrow(ErroDeConfiguracaoDoAviso);
    expect(() =>
      lerConfiguracaoDoAviso({ SEGREDO_DE_REVALIDACAO: SEGREDO_DE_PROVA }),
    ).toThrow(ErroDeConfiguracaoDoAviso);
  });

  it("@spec:AC-028 recusa segredo curto demais para ser segredo", () => {
    expect(() =>
      lerConfiguracaoDoAviso({
        URL_DO_SITE: "https://simpleclick.localhost",
        SEGREDO_DE_REVALIDACAO: "curto",
      }),
    ).toThrow(ErroDeConfiguracaoDoAviso);
  });
});

// ---------------------------------------------------------------------------
// Endereço do cache
// ---------------------------------------------------------------------------

describe("endereço do cache", () => {
  it("separa máquina, porta, credencial e índice do endereço do ambiente", () => {
    const destino = lerEnderecoDoCache("redis://:umasenha@localhost:6379/1");

    expect(destino.maquina).toBe("localhost");
    expect(destino.porta).toBe(6379);
    expect(destino.senha).toBe("umasenha");
    expect(destino.indice).toBe("1");
  });

  it("recusa endereço que não é de cache, em vez de tentar conectar", () => {
    expect(() => lerEnderecoDoCache("postgresql://localhost:5432/x")).toThrow(
      ErroDeEnderecoDoCache,
    );
    expect(() => lerEnderecoDoCache("nao é url")).toThrow(
      ErroDeEnderecoDoCache,
    );
  });
});
