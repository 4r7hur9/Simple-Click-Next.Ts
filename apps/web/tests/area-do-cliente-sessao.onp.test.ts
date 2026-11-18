/**
 * Sair (card #111, AC-11119): o `auth.ts` de verdade, com `next/headers` e a
 * API trocados por dublês. Os dois cookies da sessão são apagados mesmo
 * quando a revogação falha, e o destino diz o que aconteceu.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apagados: { name: string; path?: string; domain?: string }[] = [];
const redirecionado = vi.hoisted(() => ({ para: "" }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nome: string) =>
      nome === "sc_access" || nome === "sc_refresh"
        ? { value: "valor" }
        : undefined,
    delete: (opcoes: { name: string; path?: string; domain?: string }) => {
      apagados.push(opcoes);
    },
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (para: string) => {
    redirecionado.para = para;
    throw new Error("NEXT_REDIRECT");
  },
}));

import {
  encerrarTodasAsSessoes,
  sairDaConta,
  sairPelaBarra,
} from "../src/server/actions/auth.ts";

beforeEach(() => {
  apagados.length = 0;
  redirecionado.para = "";
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function rodar(acao: () => Promise<void>): Promise<void> {
  await expect(acao()).rejects.toThrow("NEXT_REDIRECT");
}

const nomes = () => apagados.map((c) => c.name).sort();

describe("Sair sempre apaga os cookies deste navegador (AC-11119)", () => {
  it("[CA-19] @spec:AC-11119 com a API confirmando, sai e vai para a entrada", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ encerrada: true }));
    await rodar(() => sairDaConta());
    expect(nomes()).toEqual(["sc_access", "sc_refresh"]);
    expect(redirecionado.para).toBe("/entrar");
  });

  it.each([
    ["a rede cai", () => Promise.reject(new Error("rede"))],
    [
      "a API responde 503",
      () => Promise.resolve(new Response("{}", { status: 503 })),
    ],
    [
      "a API estoura o tempo",
      () => Promise.reject(new DOMException("tempo", "TimeoutError")),
    ],
  ])(
    "[CA-19] @spec:AC-11119 quando %s, os cookies somem e o aviso é pedido",
    async (_nome, resposta) => {
      vi.stubGlobal("fetch", resposta);
      await rodar(() => sairDaConta());
      expect(nomes()).toEqual(["sc_access", "sc_refresh"]);
      expect(redirecionado.para).toBe("/entrar?saida=parcial");
    },
  );

  it("[CA-19] @spec:AC-11119 a revogação tem tempo limite", async () => {
    let sinal: AbortSignal | null | undefined;
    vi.stubGlobal("fetch", async (_url: unknown, init?: RequestInit) => {
      sinal = init?.signal;
      return Response.json({});
    });
    await rodar(() => sairDaConta());
    expect(sinal).toBeInstanceOf(AbortSignal);
  });

  it("[CA-19] @spec:AC-11119 o Sair da barra (também usado no painel) segue a mesma regra", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 500 }));
    await rodar(() => sairPelaBarra("/painel/pedidos"));
    expect(nomes()).toEqual(["sc_access", "sc_refresh"]);
    expect(redirecionado.para).toBe("/entrar?saida=parcial");

    apagados.length = 0;
    vi.stubGlobal("fetch", async () => Response.json({}));
    await rodar(() => sairPelaBarra("/loja/padaria"));
    expect(redirecionado.para).toBe("/loja/padaria");
  });

  it("[CA-19] @spec:AC-11119 'Encerrar todas' mantém os cookies se falhar, para tentar de novo", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 500 }));
    await rodar(() => encerrarTodasAsSessoes());
    expect(apagados).toEqual([]);
    expect(redirecionado.para).toBe("/conta/seguranca?estado=erro");
  });
});

/** Arquivos de `apps/web/src`, lidos como texto. */
const ler = (caminho: string) =>
  readFileSync(join(__dirname, "../src", caminho), "utf8");

const PAGINAS_DA_CONTA = [
  "app/(conta)/conta/page.tsx",
  "app/(conta)/conta/pedidos/page.tsx",
  "app/(conta)/conta/pedidos/[id]/page.tsx",
  "app/(conta)/conta/favoritos/page.tsx",
  "app/(conta)/conta/dados/page.tsx",
  "app/(conta)/conta/enderecos/page.tsx",
  "app/(conta)/conta/seguranca/page.tsx",
  "app/(conta)/conta/seguranca/aplicativo/page.tsx",
];

describe("depois de sair, nada da pessoa anterior reaparece (AC-11120)", () => {
  it.each(PAGINAS_DA_CONTA)(
    "[CA-20] @spec:AC-11120 %s é dinâmica: nunca guardada para a próxima pessoa",
    (pagina) => {
      expect(ler(pagina)).toContain('export const dynamic = "force-dynamic"');
    },
  );

  it.each(["lib/conta-do-cliente.ts", "lib/meus-pedidos.ts"])(
    "[CA-20] @spec:AC-11120 %s lê a API sem cache",
    (arquivo) => {
      expect(ler(arquivo)).toContain('cache: "no-store"');
    },
  );

  it("[CA-20] @spec:AC-11120 sair apaga os cookies no servidor (o que o Next usa para descartar o cache de navegação)", () => {
    const fonte = ler("server/actions/auth.ts");
    expect(fonte.match(/armazenamento\.delete\(/g)).not.toBeNull();
  });
});

describe("acesso vencido não vira laço de entrada (AC-11127)", () => {
  it("[CA-27] @spec:AC-11127 as páginas da conta mandam à entrada com o retorno, uma vez", () => {
    for (const pagina of PAGINAS_DA_CONTA) {
      const fonte = ler(pagina);
      // Nenhuma manda para a entrada sem o destino de volta.
      expect(fonte, pagina).not.toMatch(/redirect\("\/entrar"\)/);
    }
  });

  it("[CA-27] @spec:AC-11127 a tela de entrada nunca redireciona de volta para a conta", () => {
    const fonte = ler("app/(conta)/entrar/page.tsx");
    expect(fonte).not.toMatch(/redirect\(["'`]\/conta/);
  });
});
