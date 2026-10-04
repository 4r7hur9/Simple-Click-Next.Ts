/**
 * Prova da leitura do catálogo para o pedido manual (AC-707).
 *
 * O balcão lê o catálogo e o detalhe de cada produto sem cópia guardada, com o
 * dono atendendo. A vitrine desiste da API em dois segundos; aqui, uma API
 * que demora um pouco mais que isso — servidor recém-iniciado, ou ocupado com
 * outra tela — ainda monta o balcão, em vez de jogar o dono na tela de erro.
 * Foi o que o ponta a ponta do T-708 pegou: o primeiro pedido manual depois de
 * o site subir caía em "Não foi possível carregar o catálogo".
 */
import { describe, expect, it } from "vitest";

import {
  ESPERA_DO_BALCAO_EM_MS,
  produtosDoBalcao,
} from "../src/server/produtos-do-balcao.ts";

/** Mais que os dois segundos da vitrine, bem menos que a espera do balcão. */
const DEMORA_DA_API_EM_MS = 2_300;

const PRODUTO = "11111111-1111-4111-8111-111111111111";
const SECAO = "22222222-2222-4222-8222-222222222222";
const GRUPO = "33333333-3333-4333-8333-333333333333";
const OPCAO = "44444444-4444-4444-8444-444444444444";

const CATALOGO = {
  secoes: [
    {
      id: SECAO,
      apelido: "lanches",
      nome: "Lanches",
      produtos: [
        {
          id: PRODUTO,
          apelido: "x-salada",
          nome: "X-Salada",
          chamada: null,
          precoCentavos: 2000,
          precoAnteriorCentavos: null,
          imagem: null,
          destaque: false,
          disponivel: true,
        },
      ],
    },
  ],
  destaques: [],
  versao: "1",
};

const DETALHE = {
  id: PRODUTO,
  apelido: "x-salada",
  nome: "X-Salada",
  chamada: null,
  descricao: null,
  imagens: [],
  precoCentavos: 2000,
  precoAnteriorCentavos: null,
  grupos: [
    {
      id: GRUPO,
      nome: "Molho",
      descricao: null,
      tipo: "ADDON",
      minimo: 1,
      maximo: 1,
      permiteRepetir: false,
      eixoDeVariacao: false,
      opcoes: [
        {
          id: OPCAO,
          nome: "Ketchup",
          acrescimoCentavos: 0,
          marcadaPorPadrao: false,
          disponivel: true,
        },
      ],
    },
  ],
  variacoes: [],
  disponivel: true,
  motivoIndisponivel: null,
  aceitaObservacao: true,
  secao: { id: SECAO, apelido: "lanches", nome: "Lanches" },
};

/**
 * Uma API que responde certo, mas devagar — e que respeita o cancelamento,
 * como a rede de verdade: se quem pediu desistir antes, a resposta não chega.
 */
function apiLenta(): typeof fetch {
  return ((endereco: RequestInfo | URL, opcoes?: RequestInit) =>
    new Promise<Response>((responder, recusar) => {
      const caminho = String(endereco);
      const corpo = caminho.includes("/produto/") ? DETALHE : CATALOGO;
      const relogio = setTimeout(
        () => responder(Response.json(corpo)),
        DEMORA_DA_API_EM_MS,
      );
      const sinal = opcoes?.signal;
      sinal?.addEventListener("abort", () => {
        clearTimeout(relogio);
        recusar(sinal.reason);
      });
    })) as typeof fetch;
}

describe("o balcão espera a API mais que a vitrine (AC-707)", () => {
  it("@spec:AC-707 uma API que passa dos dois segundos da vitrine ainda monta o balcão, com os grupos do produto", async () => {
    expect(ESPERA_DO_BALCAO_EM_MS).toBeGreaterThan(DEMORA_DA_API_EM_MS);

    const leitura = await produtosDoBalcao("e2e-painel", apiLenta());

    expect(leitura.estado).toBe("ok");
    if (leitura.estado !== "ok") return;
    expect(leitura.produtos.map((produto) => produto.nome)).toEqual([
      "X-Salada",
    ]);
    expect(leitura.produtos[0]?.grupos.map((grupo) => grupo.nome)).toEqual([
      "Molho",
    ]);
  }, 15_000);
});
