/**
 * Prova do carrinho contra PostgreSQL de verdade (AC-500, AC-501, AC-502).
 *
 * "Sobrevive ao recarregar" e "o carrinho de uma loja nunca se mistura com o de
 * outra" são afirmações sobre PERSISTÊNCIA e sobre ISOLAMENTO. Nenhuma das duas
 * se prova em memória: a primeira exige que o dado esteja fora do processo, e a
 * segunda é decidida por política do banco, não por código de aplicação.
 */
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarLoja,
  criarProduto,
} from "@simpleclick/testing";
import type { LojaDeTeste, ProdutoDeTeste } from "@simpleclick/testing";

import {
  abrirAcessoDaAplicacao,
  comoRequisicao,
  ESPERA_LONGA,
} from "./apoio-de-isolamento.ts";
import {
  acrescentarItem,
  mudarQuantidade,
  removerItem,
  verCarrinho,
} from "../src/modules/cart/carrinho.usecase.ts";
import type { CarrinhoAtual } from "../src/modules/cart/carrinho.usecase.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let loja: LojaDeTeste;
let outraLoja: LojaDeTeste;
let marmita: ProdutoDeTeste;
let refrigerante: ProdutoDeTeste;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  loja = await criarLoja({ nome: "Cozinha da Vila" });
  outraLoja = await criarLoja({ nome: "Bistrô do Largo" });
  marmita = await criarProduto({ loja, nome: "Marmita executiva" });
  refrigerante = await criarProduto({ loja, nome: "Refrigerante lata" });
}, ESPERA_LONGA);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

/**
 * Roda como um visitante daquela loja, com a sessão de carrinho declarada.
 *
 * A sessão é o que decide QUAL carrinho a requisição alcança. Duas visitas com
 * sessões diferentes são duas pessoas diferentes, e o banco as separa.
 */
function comoVisitante<T>(
  alvo: LojaDeTeste,
  sessao: string,
  acao: () => Promise<T>,
): Promise<T> {
  return comoRequisicao(
    acesso,
    { lojaId: alvo.id, papel: "PUBLIC", sessaoDoCarrinho: sessao },
    () => acao(),
  );
}

async function carrinhoDe(
  alvo: LojaDeTeste,
  sessao: string,
): Promise<CarrinhoAtual> {
  return comoVisitante(alvo, sessao, verCarrinho);
}

describe("item adicionado aparece no carrinho (AC-500)", () => {
  it(
    "@spec:AC-500 o item chega com quantidade, observação e as opções escolhidas",
    async () => {
      const sessao = "sessao-do-item";
      const carrinho = await comoVisitante(loja, sessao, () =>
        acrescentarItem({
          produtoId: marmita.id,
          quantidade: 2,
          observacao: "sem cebola",
          opcoes: [{ grupoNome: "Acompanhamento", opcaoNome: "Farofa" }],
        }),
      );

      expect(carrinho.itens).toHaveLength(1);
      expect(carrinho.itens[0]?.quantidade).toBe(2);
      expect(carrinho.itens[0]?.observacao).toBe("sem cebola");
      expect(carrinho.itens[0]?.opcoes[0]?.opcaoNome).toBe("Farofa");
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-500 o contador soma as QUANTIDADES, e não as linhas",
    async () => {
      // Cinco marmitas numa linha só têm de aparecer como cinco no ícone. Contar
      // linhas faria o número mentir para o cliente que pediu vários iguais.
      const sessao = "sessao-do-contador";
      await comoVisitante(loja, sessao, () =>
        acrescentarItem({ produtoId: marmita.id, quantidade: 5 }),
      );
      const carrinho = await comoVisitante(loja, sessao, () =>
        acrescentarItem({ produtoId: refrigerante.id, quantidade: 2 }),
      );

      expect(carrinho.itens).toHaveLength(2);
      expect(carrinho.totalDeItens).toBe(7);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-500 pedir o mesmo item de novo soma na linha que já existe",
    async () => {
      // Criar linha nova a cada toque encheria a gaveta de repetições do mesmo
      // lanche, e o cliente teria de somar de cabeça quantos pediu.
      const sessao = "sessao-da-soma";
      await comoVisitante(loja, sessao, () =>
        acrescentarItem({ produtoId: marmita.id, quantidade: 1 }),
      );
      const carrinho = await comoVisitante(loja, sessao, () =>
        acrescentarItem({ produtoId: marmita.id, quantidade: 2 }),
      );

      expect(carrinho.itens).toHaveLength(1);
      expect(carrinho.itens[0]?.quantidade).toBe(3);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-500 o mesmo produto com opções diferentes ocupa linhas separadas",
    async () => {
      // São coisas diferentes: uma marmita com farofa e outra sem não podem
      // virar duas unidades da mesma linha, ou a cozinha prepara errado.
      const sessao = "sessao-das-opcoes";
      await comoVisitante(loja, sessao, () =>
        acrescentarItem({
          produtoId: marmita.id,
          quantidade: 1,
          opcoes: [{ grupoNome: "Acompanhamento", opcaoNome: "Farofa" }],
        }),
      );
      const carrinho = await comoVisitante(loja, sessao, () =>
        acrescentarItem({
          produtoId: marmita.id,
          quantidade: 1,
          opcoes: [{ grupoNome: "Acompanhamento", opcaoNome: "Vinagrete" }],
        }),
      );

      expect(carrinho.itens).toHaveLength(2);
    },
    ESPERA_LONGA,
  );
});

describe("mudar quantidade e remover item (AC-501)", () => {
  it(
    "@spec:AC-501 aumentar e diminuir a quantidade muda a linha",
    async () => {
      const sessao = "sessao-da-quantidade";
      const inicial = await comoVisitante(loja, sessao, () =>
        acrescentarItem({ produtoId: marmita.id, quantidade: 1 }),
      );
      const item = inicial.itens[0];
      expect(item).toBeDefined();

      const aumentado = await comoVisitante(loja, sessao, () =>
        mudarQuantidade(item?.id ?? "", 4),
      );
      expect(aumentado.itens[0]?.quantidade).toBe(4);
      expect(aumentado.totalDeItens).toBe(4);

      const diminuido = await comoVisitante(loja, sessao, () =>
        mudarQuantidade(item?.id ?? "", 2),
      );
      expect(diminuido.itens[0]?.quantidade).toBe(2);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-501 chegar a zero TIRA o item, em vez de guardar uma linha inútil",
    async () => {
      const sessao = "sessao-do-zero";
      const inicial = await comoVisitante(loja, sessao, () =>
        acrescentarItem({ produtoId: marmita.id, quantidade: 3 }),
      );

      const vazio = await comoVisitante(loja, sessao, () =>
        mudarQuantidade(inicial.itens[0]?.id ?? "", 0),
      );

      expect(vazio.itens).toEqual([]);
      expect(vazio.totalDeItens).toBe(0);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-501 remover um item deixa os outros intactos",
    async () => {
      const sessao = "sessao-da-remocao";
      await comoVisitante(loja, sessao, () =>
        acrescentarItem({ produtoId: marmita.id, quantidade: 2 }),
      );
      const dois = await comoVisitante(loja, sessao, () =>
        acrescentarItem({ produtoId: refrigerante.id, quantidade: 1 }),
      );
      const paraTirar = dois.itens.find((i) => i.produtoId === marmita.id);

      const depois = await comoVisitante(loja, sessao, () =>
        removerItem(paraTirar?.id ?? ""),
      );

      expect(depois.itens).toHaveLength(1);
      expect(depois.itens[0]?.produtoId).toBe(refrigerante.id);
    },
    ESPERA_LONGA,
  );
});

describe("o carrinho sobrevive e não se mistura (AC-502)", () => {
  it(
    "@spec:AC-502 outra requisição da mesma sessão encontra o carrinho montado",
    async () => {
      // É o recarregar da página: outra requisição, outro contexto, mesmo
      // token de sessão. O carrinho não está na memória de ninguém.
      const sessao = "sessao-que-volta";
      await comoVisitante(loja, sessao, () =>
        acrescentarItem({ produtoId: marmita.id, quantidade: 2 }),
      );

      const aoVoltar = await carrinhoDe(loja, sessao);

      expect(aoVoltar.itens).toHaveLength(1);
      expect(aoVoltar.itens[0]?.quantidade).toBe(2);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-502 o carrinho de uma loja não aparece na outra",
    async () => {
      // Mesma pessoa, mesmo navegador, mesma sessão, duas lojas: o que ela
      // montou numa não pode aparecer na outra.
      const sessao = "sessao-em-duas-lojas";
      await comoVisitante(loja, sessao, () =>
        acrescentarItem({ produtoId: marmita.id, quantidade: 2 }),
      );

      const naOutra = await carrinhoDe(outraLoja, sessao);

      expect(naOutra.itens).toEqual([]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-502 o carrinho de outro visitante da MESMA loja não é alcançado",
    async () => {
      // Antes da migração 0012 isto era possível: as políticas de carrinho
      // pediam só que existisse loja no contexto, e qualquer visitante lia,
      // alterava e apagava o carrinho de todos os outros.
      const dela = "sessao-da-ana";
      const dele = "sessao-do-bruno";
      await comoVisitante(loja, dela, () =>
        acrescentarItem({ produtoId: marmita.id, quantidade: 4 }),
      );

      const carrinhoDoBruno = await carrinhoDe(loja, dele);
      expect(carrinhoDoBruno.itens).toEqual([]);

      // E o dela continua intacto: a visita do Bruno não a alcançou de forma
      // nenhuma, nem para ler nem para criar.
      const carrinhoDaAna = await carrinhoDe(loja, dela);
      expect(carrinhoDaAna.itens[0]?.quantidade).toBe(4);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-502 um visitante não consegue apagar o item de outro",
    async () => {
      // A prova de que a política NEGA: sem ela, esvaziar o carrinho da loja
      // inteira era um comando só.
      const dela = "sessao-da-carla";
      const dele = "sessao-do-daniel";
      const carrinho = await comoVisitante(loja, dela, () =>
        acrescentarItem({ produtoId: marmita.id, quantidade: 2 }),
      );
      const alvo = carrinho.itens[0];
      // Exigido, e não opcional: com o identificador indefinido o comando não
      // teria alvo, afetaria zero linhas por esse motivo, e a prova de que a
      // política RECUSA estaria provando outra coisa.
      if (alvo === undefined)
        throw new Error("o carrinho de apoio ficou vazio");

      const apagadas = await comoRequisicao(
        acesso,
        { lojaId: loja.id, papel: "PUBLIC", sessaoDoCarrinho: dele },
        (tx) => tx.cartItem.deleteMany({ where: { id: alvo.id } }),
      );

      expect(apagadas.count).toBe(0);
      expect((await carrinhoDe(loja, dela)).itens).toHaveLength(1);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-502 sem sessão declarada o carrinho nem é montado",
    async () => {
      const recusa = await comoRequisicao(
        acesso,
        { lojaId: loja.id, papel: "PUBLIC" },
        () => verCarrinho(),
      ).then(
        () => null,
        (erro: unknown) => erro,
      );

      expect(recusa).toBeInstanceOf(Error);
    },
    ESPERA_LONGA,
  );
});
