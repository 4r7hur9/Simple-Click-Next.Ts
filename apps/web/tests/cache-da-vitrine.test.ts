import { describe, expect, it } from "vitest";

import { buscarFechamento } from "../src/server/fechamento";
import { buscarProduto } from "../src/server/produto";
import {
  buscarCatalogo,
  buscarVitrine,
  SEGUNDOS_DE_CACHE,
} from "../src/server/vitrine";

/**
 * Prova de que o site guarda a vitrine SOB A ETIQUETA DA LOJA (dívida 93).
 *
 * Antes, as quatro leituras públicas — apresentação, catálogo, página do
 * produto e fechamento — iam para o cache do Next só com prazo, sem etiqueta.
 * A invalidação que a API manda depois de uma alteração do dono não tinha o
 * que apagar, e o cliente via a versão velha por até um minuto.
 *
 * A etiqueta é montada pelo APELIDO, porque é o apelido que vem no endereço:
 * a leitura precisa dela antes de saber qual loja responde. O formato é
 * escrito por extenso aqui, e não importado, para que uma mudança nele
 * apareça como teste vermelho — é o mesmo texto que a rota de invalidação
 * apaga.
 */

const APELIDO = "pastelaria-da-vila";
const ETIQUETA = "vitrine:pastelaria-da-vila";

/** O que a leitura pediu ao `fetch` do Next. */
interface OpcoesDoNext {
  readonly revalidate?: number;
  readonly tags?: readonly string[];
}

/** Um `fetch` que só anota o pedido e responde "não encontrado". */
function buscaQueAnota() {
  const pedidos: OpcoesDoNext[] = [];
  const buscar = (async (_endereco: string, opcoes?: RequestInit) => {
    pedidos.push((opcoes as { next?: OpcoesDoNext } | undefined)?.next ?? {});
    return Promise.resolve(new Response(null, { status: 404 }));
  }) as unknown as typeof fetch;
  return { buscar, pedidos };
}

describe("a vitrine é guardada sob a etiqueta da loja (dívida 93)", () => {
  it("@spec:AC-028 a apresentação da loja leva a etiqueta da vitrine daquela loja", async () => {
    const { buscar, pedidos } = buscaQueAnota();

    await buscarVitrine(APELIDO, buscar);

    expect(pedidos).toEqual([
      { revalidate: SEGUNDOS_DE_CACHE, tags: [ETIQUETA] },
    ]);
  });

  it("@spec:AC-028 o catálogo leva a mesma etiqueta, com busca e filtro ou sem", async () => {
    const { buscar, pedidos } = buscaQueAnota();

    await buscarCatalogo(APELIDO, {}, buscar);
    await buscarCatalogo(
      APELIDO,
      { busca: "queijo", categoria: "pasteis", filtros: ["sabor:queijo"] },
      buscar,
    );

    // Toda busca daquela loja cai junto: o dono mudou um preço, e o preço
    // aparece em qualquer resultado que tenha o produto.
    expect(pedidos.map((pedido) => pedido.tags)).toEqual([
      [ETIQUETA],
      [ETIQUETA],
    ]);
  });

  it("@spec:AC-028 a página do produto leva a etiqueta da loja dele", async () => {
    const { buscar, pedidos } = buscaQueAnota();

    await buscarProduto("33333333-3333-4333-8333-333333333333", {
      apelidoDaLoja: APELIDO,
      buscar,
    });

    expect(pedidos).toEqual([
      { revalidate: SEGUNDOS_DE_CACHE, tags: [ETIQUETA] },
    ]);
  });

  it("@spec:AC-028 o fechamento também: forma de pagamento e entrega mudam pelo painel", async () => {
    const { buscar, pedidos } = buscaQueAnota();

    await buscarFechamento(APELIDO, buscar);

    expect(pedidos[0]?.tags).toEqual([ETIQUETA]);
  });

  it("@spec:AC-028 o prazo continua valendo como rede de proteção, se o aviso se perder", async () => {
    const { buscar, pedidos } = buscaQueAnota();

    await buscarVitrine(APELIDO, buscar);
    await buscarCatalogo(APELIDO, {}, buscar);

    for (const pedido of pedidos) expect(pedido.revalidate).toBe(60);
  });

  it("@spec:AC-027 cada loja tem a sua etiqueta, e invalidar uma não apaga a outra", async () => {
    const { buscar, pedidos } = buscaQueAnota();

    await buscarVitrine("pastelaria-da-vila", buscar);
    await buscarVitrine("pastelaria-da-praca", buscar);

    expect(pedidos.map((pedido) => pedido.tags)).toEqual([
      ["vitrine:pastelaria-da-vila"],
      ["vitrine:pastelaria-da-praca"],
    ]);
  });

  it("@spec:AC-028 apelido impossível no endereço não derruba a página: vai sem etiqueta e a API responde", async () => {
    const { buscar, pedidos } = buscaQueAnota();

    // O Next entrega o segmento já decodificado; "%20" vira espaço. Quem diz
    // que a loja não existe é a API — a etiqueta não pode lançar antes dela.
    await expect(buscarVitrine("loja com espaço", buscar)).resolves.toEqual({
      estado: "nao-encontrada",
    });
    expect(pedidos).toEqual([{ revalidate: SEGUNDOS_DE_CACHE, tags: [] }]);
  });
});
