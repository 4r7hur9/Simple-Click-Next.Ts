/**
 * Prova da página pública de um produto (AC-410, AC-413).
 *
 * CONTRA BANCO DE VERDADE, com o isolamento por linha ligado — pelo mesmo
 * motivo do catálogo: o que se prova aqui é que grupo apagado e opção removida
 * não aparecem PORQUE A POLÍTICA os recusa (migração 0018), e não porque a
 * consulta lembrou de filtrar. Um dublê provaria que o TypeScript chama o dublê.
 *
 * A DIFERENÇA IMPORTA na próxima consulta que alguém escrever: morando na
 * política, a garantia vale para toda consulta que existir depois.
 */
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarCategoria,
  criarGrupoDeEscolha,
  criarLoja,
  criarOpcao,
  criarProduto,
  criarVariacao,
  ligarVariacaoAoEixo,
  porGrupoNoProduto,
  porProdutoNaCategoria,
} from "@simpleclick/testing";
import type { LojaDeTeste, ProdutoDeTeste } from "@simpleclick/testing";

import {
  abrirAcessoDaAplicacao,
  comoRequisicao,
  ESPERA_LONGA,
} from "./apoio-de-isolamento.ts";
import { produtoDaVitrine } from "../src/modules/storefront/produto.usecase.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
}, ESPERA_LONGA);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

/** Lê o produto como quem chega pelo endereço público: sem sessão, sem conta. */
function comoVisitante(
  loja: LojaDeTeste,
  produto: ProdutoDeTeste,
  agora?: Date,
) {
  return comoRequisicao(acesso, { lojaId: loja.id, papel: "PUBLIC" }, () =>
    produtoDaVitrine(produto.id, agora),
  );
}

describe("a página do produto traz o que preciso decidir (AC-410)", () => {
  it(
    "@spec:AC-410 devolve nome, descrição, preço e os grupos de escolha na ordem do dono",
    async () => {
      const loja = await criarLoja({ nome: "Lanchonete da Esquina" });
      const produto = await criarProduto({
        loja,
        nome: "X-Salada",
        precoCentavos: 2000,
      });

      // Criados fora de ordem DE PROPÓSITO: se o teste os criasse já ordenados,
      // ele passaria mesmo que o código ordenasse pela data de criação.
      const adicionais = await criarGrupoDeEscolha({
        loja,
        nome: "Adicionais",
      });
      const ponto = await criarGrupoDeEscolha({
        loja,
        nome: "Ponto da carne",
        minimo: 1,
        maximo: 1,
      });
      await porGrupoNoProduto({ loja, produto, grupo: adicionais, ordem: 2 });
      await porGrupoNoProduto({ loja, produto, grupo: ponto, ordem: 1 });

      await criarOpcao({
        loja,
        grupo: adicionais,
        nome: "Bacon",
        acrescimoCentavos: 300,
      });
      await criarOpcao({ loja, grupo: ponto, nome: "Ao ponto" });

      const lido = await comoVisitante(loja, produto);

      expect(lido?.nome).toBe("X-Salada");
      expect(lido?.precoCentavos).toBe(2000);
      expect(lido?.grupos.map((g) => g.nome)).toEqual([
        "Ponto da carne",
        "Adicionais",
      ]);
      // Obrigatoriedade é DERIVADA do mínimo, e chega assim até a tela.
      expect(lido?.grupos[0]?.minimo).toBe(1);
      expect(lido?.grupos[1]?.opcoes[0]?.acrescimoCentavos).toBe(300);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-410 a seção do produto vem junto, para a página oferecer o caminho de volta",
    async () => {
      const loja = await criarLoja({});
      const categoria = await criarCategoria({ loja, nome: "Lanches" });
      const produto = await criarProduto({ loja, nome: "X-Bacon" });
      await porProdutoNaCategoria({ loja, produto, categoria });

      const lido = await comoVisitante(loja, produto);

      expect(lido?.secao?.nome).toBe("Lanches");
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-410 o preço da variante padrão é o que a página abre mostrando",
    async () => {
      const loja = await criarLoja({});
      const produto = await criarProduto({ loja, nome: "Pizza" });
      await criarVariacao({
        loja,
        produto,
        nome: "Grande",
        precoCentavos: 6000,
        ordem: 2,
      });
      await criarVariacao({
        loja,
        produto,
        nome: "Pequena",
        precoCentavos: 4000,
        padrao: true,
        ordem: 1,
      });

      const lido = await comoVisitante(loja, produto);

      expect(lido?.precoCentavos).toBe(4000);
      expect(lido?.variacoes.map((v) => v.nome)).toEqual(["Pequena", "Grande"]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-410 promoção valendo vira o preço, e o base vira o preço 'de'",
    async () => {
      const loja = await criarLoja({});
      const produto = await criarProduto({ loja, nome: "Combo" });
      await criarVariacao({
        loja,
        produto,
        nome: "Único",
        precoCentavos: 5000,
        precoPromocionalCentavos: 3900,
        padrao: true,
      });

      const lido = await comoVisitante(loja, produto);

      expect(lido?.precoCentavos).toBe(3900);
      expect(lido?.precoAnteriorCentavos).toBe(5000);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-410 a grade liga a escolha do eixo à variante que tem estoque",
    async () => {
      const loja = await criarLoja({});
      const produto = await criarProduto({ loja, nome: "Camiseta" });
      const tamanho = await criarGrupoDeEscolha({
        loja,
        nome: "Tamanho",
        minimo: 1,
        maximo: 1,
        eixoDeVariacao: true,
      });
      await porGrupoNoProduto({ loja, produto, grupo: tamanho });
      const p = await criarOpcao({ loja, grupo: tamanho, nome: "P" });
      const m = await criarOpcao({ loja, grupo: tamanho, nome: "M" });

      const variacaoP = await criarVariacao({
        loja,
        produto,
        nome: "P",
        precoCentavos: 4990,
        estoque: 3,
      });
      const variacaoM = await criarVariacao({
        loja,
        produto,
        nome: "M",
        precoCentavos: 4990,
        estoque: 0,
      });
      await ligarVariacaoAoEixo({
        loja,
        variacao: variacaoP,
        grupo: tamanho,
        opcao: p,
      });
      await ligarVariacaoAoEixo({
        loja,
        variacao: variacaoM,
        grupo: tamanho,
        opcao: m,
      });

      const lido = await comoVisitante(loja, produto);

      expect(lido?.grupos[0]?.eixoDeVariacao).toBe(true);
      const naTela = lido?.variacoes.find((v) => v.nome === "P");
      expect(naTela?.valoresDosEixos).toEqual([
        { grupoId: tamanho.id, opcaoId: p.id },
      ]);
      // Estoque zero é "controla e acabou": a variante existe e está esgotada.
      expect(lido?.variacoes.find((v) => v.nome === "M")?.disponivel).toBe(
        false,
      );
    },
    ESPERA_LONGA,
  );
});

describe("a vitrine não vê o que foi apagado (AC-410, migração 0018)", () => {
  it(
    "@spec:AC-410 grupo apagado não aparece de forma alguma",
    async () => {
      const loja = await criarLoja({});
      const produto = await criarProduto({ loja, nome: "X-Tudo" });
      const antigo = await criarGrupoDeEscolha({
        loja,
        nome: "Promoção de julho",
        apagado: true,
      });
      await porGrupoNoProduto({ loja, produto, grupo: antigo });

      const lido = await comoVisitante(loja, produto);

      // Quem esconde é a POLÍTICA, e não o `WHERE` desta consulta.
      expect(lido?.grupos.map((g) => g.nome)).not.toContain(
        "Promoção de julho",
      );
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-410 grupo desligado também não aparece",
    async () => {
      const loja = await criarLoja({});
      const produto = await criarProduto({ loja, nome: "X-Egg" });
      const desligado = await criarGrupoDeEscolha({
        loja,
        nome: "Fora de temporada",
        ativo: false,
      });
      await porGrupoNoProduto({ loja, produto, grupo: desligado });

      const lido = await comoVisitante(loja, produto);

      expect(lido?.grupos).toEqual([]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-410 opção removida some, mas opção ESGOTADA continua visível",
    async () => {
      // A diferença é o ponto todo da 0018: apagada é visibilidade, esgotada é
      // dado. Esconder a esgotada faria o produto parecer ter menos opções.
      const loja = await criarLoja({});
      const produto = await criarProduto({ loja, nome: "X-Burguer" });
      const grupo = await criarGrupoDeEscolha({ loja, nome: "Adicionais" });
      await porGrupoNoProduto({ loja, produto, grupo });

      await criarOpcao({ loja, grupo, nome: "Cheddar", disponivel: false });
      await criarOpcao({ loja, grupo, nome: "Catupiry", apagada: true });

      const lido = await comoVisitante(loja, produto);
      const nomes = lido?.grupos[0]?.opcoes.map((o) => o.nome) ?? [];

      expect(nomes).toContain("Cheddar");
      expect(nomes).not.toContain("Catupiry");
      expect(lido?.grupos[0]?.opcoes[0]?.disponivel).toBe(false);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-410 variação apagada não aparece",
    async () => {
      const loja = await criarLoja({});
      const produto = await criarProduto({ loja, nome: "Pizza" });
      await criarVariacao({
        loja,
        produto,
        nome: "Família",
        precoCentavos: 9000,
        apagada: true,
      });
      await criarVariacao({
        loja,
        produto,
        nome: "Média",
        precoCentavos: 5000,
        padrao: true,
      });

      const lido = await comoVisitante(loja, produto);

      expect(lido?.variacoes.map((v) => v.nome)).toEqual(["Média"]);
    },
    ESPERA_LONGA,
  );
});

describe("produto indisponível é visto, e o motivo é dito (AC-413)", () => {
  it(
    "@spec:AC-413 produto marcado como indisponível responde ESGOTADO",
    async () => {
      const loja = await criarLoja({});
      const produto = await criarProduto({
        loja,
        nome: "Coxinha",
        disponivel: false,
      });

      const lido = await comoVisitante(loja, produto);

      // Ele CONTINUA VINDO na resposta: o critério pede que seja visto.
      expect(lido?.nome).toBe("Coxinha");
      expect(lido?.disponivel).toBe(false);
      expect(lido?.motivoIndisponivel).toBe("ESGOTADO");
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-413 produto com todas as variantes esgotadas conta como esgotado",
    async () => {
      const loja = await criarLoja({});
      const produto = await criarProduto({ loja, nome: "Camiseta" });
      await criarVariacao({ loja, produto, nome: "P", estoque: 0 });
      await criarVariacao({ loja, produto, nome: "M", estoque: 0 });

      const lido = await comoVisitante(loja, produto);

      expect(lido?.disponivel).toBe(false);
      expect(lido?.motivoIndisponivel).toBe("ESGOTADO");
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-413 estoque NULO é 'não controla estoque', e não 'acabou'",
    async () => {
      // É a diferença entre a lanchonete e a loja de roupa. Trocar um pelo
      // outro faria toda lanchonete nascer esgotada.
      const loja = await criarLoja({});
      const produto = await criarProduto({ loja, nome: "Pastel" });
      await criarVariacao({
        loja,
        produto,
        nome: "Único",
        precoCentavos: 800,
        estoque: null,
        padrao: true,
      });

      const lido = await comoVisitante(loja, produto);

      expect(lido?.disponivel).toBe(true);
      expect(lido?.variacoes[0]?.disponivel).toBe(true);
    },
    ESPERA_LONGA,
  );
});

describe("o produto de outra loja não é alcançável", () => {
  it(
    "@spec:AC-410 pedir um produto de outra loja devolve nada, e não o produto",
    async () => {
      const daqui = await criarLoja({ nome: "Loja A" });
      const dali = await criarLoja({ nome: "Loja B" });
      const alheio = await criarProduto({ loja: dali, nome: "Segredo" });

      // O identificador é real e existe no banco — o que barra é a política.
      const lido = await comoRequisicao(
        acesso,
        { lojaId: daqui.id, papel: "PUBLIC" },
        () => produtoDaVitrine(alheio.id),
      );

      expect(lido).toBeNull();
    },
    ESPERA_LONGA,
  );
});
