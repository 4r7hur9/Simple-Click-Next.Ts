/**
 * Prova da busca na vitrine (AC-408, AC-409; tolerante e sem teto desde o
 * card #75).
 *
 * CONTRA BANCO DE VERDADE, e não podia ser de outro jeito: o que está sob prova
 * aqui é o índice de texto do PostgreSQL, a configuração `portuguese` e a regra
 * de acento da migração 0021. Um dublê provaria que o TypeScript chama o dublê —
 * e a pergunta que importa ("procurar 'pao' acha 'Pão'?") é do banco, não nossa.
 *
 * O ISOLAMENTO CONTINUA VALENDO. A busca é consulta crua, e por isso é a que
 * mais merece o teste com duas lojas: se a política deixasse de proteger a
 * tabela, é por uma consulta crua que o vazamento apareceria primeiro.
 */
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarCategoria,
  criarLoja,
  criarProduto,
  criarVariacao,
  porProdutoNaCategoria,
} from "@simpleclick/testing";
import type { LojaDeTeste } from "@simpleclick/testing";

import {
  abrirAcessoDaAplicacao,
  comoRequisicao,
  ESPERA_LONGA,
} from "./apoio-de-isolamento.ts";
import { criarApp } from "../src/app.ts";
import { produtosQueCasam } from "../src/modules/storefront/busca.usecase.ts";
import { catalogoDaVitrine } from "../src/modules/storefront/catalogo.usecase.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let app: ReturnType<typeof criarApp>;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  app = criarApp({ vitrine: { acesso } });
}, ESPERA_LONGA);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

/**
 * Busca como quem chega pelo endereço público, e devolve os NOMES.
 *
 * Nomes, e não identificadores, porque é o nome que a asserção precisa dizer em
 * voz alta: `["Pão de Açúcar"]` conta o que aconteceu, e um par de UUIDs não.
 */
async function buscarNaLoja(
  loja: LojaDeTeste,
  termo: string,
): Promise<readonly string[]> {
  return comoRequisicao(
    acesso,
    { lojaId: loja.id, papel: "PUBLIC" },
    async () => {
      const acertos = await produtosQueCasam(termo);
      const catalogo = await catalogoDaVitrine("1", {
        apenasProdutos: acertos,
      });
      return catalogo.secoes.flatMap((secao) =>
        secao.produtos.map((produto) => produto.nome),
      );
    },
  );
}

describe("a busca acha o produto pelo nome, com ou sem acento (AC-408)", () => {
  it(
    "@spec:AC-408 acha 'Pão de Açúcar' procurando 'pao', sem acento e em minúscula",
    async () => {
      const loja = await criarLoja({ nome: "Mercadinho do Bairro" });
      const secao = await criarCategoria({ loja, nome: "Padaria" });
      const pao = await criarProduto({ loja, nome: "Pão de Açúcar" });
      await porProdutoNaCategoria({ loja, produto: pao, categoria: secao });

      // AS DUAS DIFERENÇAS DE UMA VEZ: acento e caixa. Quem digita no celular
      // com pressa não põe o til, e o teclado sobe a primeira letra sozinho.
      await expect(buscarNaLoja(loja, "pao")).resolves.toEqual([
        "Pão de Açúcar",
      ]);
      await expect(buscarNaLoja(loja, "PÃO")).resolves.toEqual([
        "Pão de Açúcar",
      ]);
      await expect(buscarNaLoja(loja, "acucar")).resolves.toEqual([
        "Pão de Açúcar",
      ]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-408 acha pela descrição, e não só pelo nome",
    async () => {
      const loja = await criarLoja({ nome: "Lanchonete da Esquina" });
      const secao = await criarCategoria({ loja, nome: "Lanches" });
      const item = await criarProduto({
        loja,
        nome: "Combo do dia",
        descricao: "Hambúrguer artesanal com batata frita",
      });
      await porProdutoNaCategoria({ loja, produto: item, categoria: secao });

      // Quem procura "hamburguer" não sabe que a loja chamou o prato de "Combo
      // do dia". Buscar só no nome devolveria nada numa loja que vende o item.
      await expect(buscarNaLoja(loja, "hamburguer")).resolves.toEqual([
        "Combo do dia",
      ]);
    },
    ESPERA_LONGA,
  );
});

describe("a busca some com a categoria que não teve acerto (AC-408)", () => {
  it(
    "@spec:AC-408 devolve só as seções que têm produto casando com o termo",
    async () => {
      const loja = await criarLoja({ nome: "Mercadinho da Praça" });

      const padaria = await criarCategoria({ loja, nome: "Padaria", ordem: 0 });
      const bebidas = await criarCategoria({ loja, nome: "Bebidas", ordem: 1 });

      const pao = await criarProduto({ loja, nome: "Pão francês" });
      const suco = await criarProduto({ loja, nome: "Suco de laranja" });
      await porProdutoNaCategoria({ loja, produto: pao, categoria: padaria });
      await porProdutoNaCategoria({ loja, produto: suco, categoria: bebidas });

      const secoes = await comoRequisicao(
        acesso,
        { lojaId: loja.id, papel: "PUBLIC" },
        async () => {
          const acertos = await produtosQueCasam("pao");
          const catalogo = await catalogoDaVitrine("1", {
            apenasProdutos: acertos,
          });
          return catalogo.secoes.map((secao) => secao.nome);
        },
      );

      // "Bebidas" SOME, e não aparece vazia. Uma seção com o cabeçalho e nenhum
      // produto embaixo lê como catálogo quebrado, e não como filtro.
      expect(secoes).toEqual(["Padaria"]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-409 devolve vazio quando a loja não vende o que foi procurado",
    async () => {
      const loja = await criarLoja({ nome: "Padaria do Zé" });
      const secao = await criarCategoria({ loja, nome: "Padaria" });
      const pao = await criarProduto({ loja, nome: "Pão francês" });
      await porProdutoNaCategoria({ loja, produto: pao, categoria: secao });

      // Vazio de VERDADE, e não o catálogo inteiro: é o que faz a tela dizer
      // "nada encontrado para bicicleta" em vez de mostrar pão.
      await expect(buscarNaLoja(loja, "bicicleta")).resolves.toEqual([]);
    },
    ESPERA_LONGA,
  );
});

describe("a busca não atravessa a parede entre lojas (P-004, AC-408)", () => {
  it(
    "@spec:AC-408 não devolve o produto de outra loja com o mesmo nome",
    async () => {
      const minha = await criarLoja({ nome: "Padaria A" });
      const outra = await criarLoja({ nome: "Padaria B" });

      const secaoDaOutra = await criarCategoria({
        loja: outra,
        nome: "Padaria",
      });
      const paoDaOutra = await criarProduto({
        loja: outra,
        nome: "Pão de Açúcar",
      });
      await porProdutoNaCategoria({
        loja: outra,
        produto: paoDaOutra,
        categoria: secaoDaOutra,
      });

      // A MINHA LOJA NÃO TEM PÃO NENHUM, e a busca por "pao" nela precisa vir
      // vazia mesmo com o produto existindo na tabela, a uma linha de distância.
      // A função de busca se prende à loja do contexto, e o catálogo que monta
      // o cartão ainda passa pela política do banco.
      await expect(buscarNaLoja(minha, "pao")).resolves.toEqual([]);

      // E o contrário confirma que o produto existe: sem esta linha, o teste
      // acima passaria também se o construtor tivesse falhado em silêncio.
      await expect(buscarNaLoja(outra, "pao")).resolves.toEqual([
        "Pão de Açúcar",
      ]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-408 não devolve produto que não está publicado",
    async () => {
      const loja = await criarLoja({ nome: "Loja em montagem" });
      const secao = await criarCategoria({ loja, nome: "Padaria" });
      const rascunho = await criarProduto({
        loja,
        nome: "Pão de Açúcar",
        status: "DRAFT",
      });
      await porProdutoNaCategoria({
        loja,
        produto: rascunho,
        categoria: secao,
      });

      // Rascunho é do dono, e não do cliente. A busca é uma porta nova para a
      // mesma tabela: se ela devolvesse rascunho, o dono publicaria sem querer.
      await expect(buscarNaLoja(loja, "pao")).resolves.toEqual([]);
    },
    ESPERA_LONGA,
  );
});

describe("o termo chega à rota pelo endereço (AC-408, AC-409)", () => {
  it(
    "@spec:AC-408 `?busca=` estreita o catálogo que a rota devolve",
    async () => {
      const loja = await criarLoja({ nome: "Mercado da Rota" });
      const padaria = await criarCategoria({ loja, nome: "Padaria", ordem: 0 });
      const bebidas = await criarCategoria({ loja, nome: "Bebidas", ordem: 1 });

      const pao = await criarProduto({ loja, nome: "Pão de Açúcar" });
      const suco = await criarProduto({ loja, nome: "Suco de uva" });
      await porProdutoNaCategoria({ loja, produto: pao, categoria: padaria });
      await porProdutoNaCategoria({ loja, produto: suco, categoria: bebidas });

      const resposta = await request(app)
        .get(`/v1/vitrine/${loja.apelido}/catalogo`)
        .query({ busca: "pao" });

      expect(resposta.status).toBe(200);
      expect(resposta.body.secoes).toHaveLength(1);
      expect(resposta.body.secoes[0].nome).toBe("Padaria");
      expect(resposta.body.secoes[0].produtos[0].nome).toBe("Pão de Açúcar");
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-408 sem `?busca=` a rota devolve o catálogo inteiro",
    async () => {
      const loja = await criarLoja({ nome: "Mercado Inteiro" });
      const padaria = await criarCategoria({ loja, nome: "Padaria", ordem: 0 });
      const bebidas = await criarCategoria({ loja, nome: "Bebidas", ordem: 1 });

      const pao = await criarProduto({ loja, nome: "Pão de Açúcar" });
      const suco = await criarProduto({ loja, nome: "Suco de uva" });
      await porProdutoNaCategoria({ loja, produto: pao, categoria: padaria });
      await porProdutoNaCategoria({ loja, produto: suco, categoria: bebidas });

      const resposta = await request(app).get(
        `/v1/vitrine/${loja.apelido}/catalogo`,
      );

      // A AUSÊNCIA DO PARÂMETRO É "SEM BUSCA", e não "busca por nada": as duas
      // seções continuam ali, inclusive a que não casaria com termo nenhum.
      expect(resposta.body.secoes.map((s: { nome: string }) => s.nome)).toEqual(
        ["Padaria", "Bebidas"],
      );
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-409 termo sem acerto devolve 200 com as seções vazias, e não 404",
    async () => {
      const loja = await criarLoja({ nome: "Mercado sem Bicicleta" });
      const secao = await criarCategoria({ loja, nome: "Padaria" });
      const pao = await criarProduto({ loja, nome: "Pão de Açúcar" });
      await porProdutoNaCategoria({ loja, produto: pao, categoria: secao });

      const resposta = await request(app)
        .get(`/v1/vitrine/${loja.apelido}/catalogo`)
        .query({ busca: "bicicleta" });

      // 200 COM NADA, e não 404: a LOJA existe, e é ela que a página precisa
      // continuar mostrando enquanto diz que aquele termo não achou nada. Um
      // 404 aqui derrubaria a vitrine inteira por causa de uma palavra digitada.
      expect(resposta.status).toBe(200);
      expect(resposta.body.secoes).toEqual([]);
      expect(resposta.body.destaques).toEqual([]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-408 termo comprido demais é recusado na borda, e não repassado",
    async () => {
      const loja = await criarLoja({ nome: "Mercado do Limite" });

      const resposta = await request(app)
        .get(`/v1/vitrine/${loja.apelido}/catalogo`)
        .query({ busca: "a".repeat(500) });

      // A borda valida ANTES de abrir transação (P-007): quinhentos caracteres
      // não chegam ao analisador de texto do banco.
      expect(resposta.status).toBe(400);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-408 a resposta filtrada continua cabendo no contrato publicado",
    async () => {
      const loja = await criarLoja({ nome: "Mercado do Contrato" });
      const secao = await criarCategoria({ loja, nome: "Padaria" });
      const pao = await criarProduto({ loja, nome: "Pão de Açúcar" });
      await porProdutoNaCategoria({ loja, produto: pao, categoria: secao });

      const { esquemaDoCatalogo } = await import("@simpleclick/contracts");
      const resposta = await request(app)
        .get(`/v1/vitrine/${loja.apelido}/catalogo`)
        .query({ busca: "pao" });

      const conferido = esquemaDoCatalogo.safeParse(resposta.body);
      expect(
        conferido.success,
        conferido.success ? "" : JSON.stringify(conferido.error.issues),
      ).toBe(true);
    },
    ESPERA_LONGA,
  );
});

describe("a busca tolerante acha o que o cliente digita (card #75)", () => {
  async function autopecas(nome: string) {
    const loja = await criarLoja({ nome, ramo: "autopeças" });
    const secao = await criarCategoria({ loja, nome: "Peças" });
    const peca = async (
      nomeDaPeca: string,
      extra: { descricao?: string } = {},
    ) => {
      const criado = await criarProduto({
        loja,
        nome: nomeDaPeca,
        ...(extra.descricao === undefined ? {} : { descricao: extra.descricao }),
      });
      await porProdutoNaCategoria({ loja, produto: criado, categoria: secao });
      return criado;
    };
    return { loja, secao, peca };
  }

  it(
    "acha a abreviação do fornecedor pela palavra por extenso, e o contrário",
    async () => {
      const { loja, peca } = await autopecas("Autopeças das Abreviações");
      await peca("PAST FR DT GOL G5");
      await peca("AMORT DT GOL G4");
      await peca("RETROV LE PALIO");
      await peca("RET COMANDO VALV UNO");

      await expect(buscarNaLoja(loja, "pastilha")).resolves.toEqual([
        "PAST FR DT GOL G5",
      ]);
      await expect(buscarNaLoja(loja, "Pastilhas de freio")).resolves.toEqual([
        "PAST FR DT GOL G5",
      ]);
      await expect(buscarNaLoja(loja, "amortecedor gol")).resolves.toEqual([
        "AMORT DT GOL G4",
      ]);
      await expect(buscarNaLoja(loja, "retrovisor")).resolves.toEqual([
        "RETROV LE PALIO",
      ]);
      // "ret" (retentor) é abreviação curta: casa só com a palavra inteira,
      // e não acha o retrovisor.
      await expect(buscarNaLoja(loja, "retentor")).resolves.toEqual([
        "RET COMANDO VALV UNO",
      ]);
      // Começo de palavra, sem acento e sem maiúscula.
      await expect(buscarNaLoja(loja, "amort")).resolves.toEqual([
        "AMORT DT GOL G4",
      ]);
    },
    ESPERA_LONGA,
  );

  it(
    "o dicionário é do ramo: numa lanchonete 'past' não vira pastilha",
    async () => {
      const loja = await criarLoja({ nome: "Lanchonete do Past" });
      const secao = await criarCategoria({ loja, nome: "Lanches" });
      const item = await criarProduto({ loja, nome: "PAST FR DT" });
      await porProdutoNaCategoria({ loja, produto: item, categoria: secao });

      await expect(buscarNaLoja(loja, "pastilha")).resolves.toEqual([]);
      await expect(buscarNaLoja(loja, "past")).resolves.toEqual(["PAST FR DT"]);
    },
    ESPERA_LONGA,
  );

  it(
    "acha pela referência do fabricante, pelos similares, pela marca e pelo SKU",
    async () => {
      const { loja, peca } = await autopecas("Autopeças das Referências");
      const pastilha = await peca("PAST FR NOVO UNO");
      const filtro = await peca("FILTRO OLEO UNO");
      await migrador.query(
        `UPDATE app.products SET attributes = $2::jsonb WHERE id = $1`,
        [
          pastilha.id,
          JSON.stringify({
            marca: "SPEED BRAKE",
            referencia: "SNA500",
            similares: ["PD85", "RCPT-12550"],
          }),
        ],
      );
      const variacao = await criarVariacao({
        loja,
        produto: filtro,
        nome: "Único",
        padrao: true,
      });
      await migrador.query(
        `UPDATE app.product_variants SET sku = 'WO-130' WHERE id = $1`,
        [variacao.id],
      );

      await expect(buscarNaLoja(loja, "SNA500")).resolves.toEqual([
        "PAST FR NOVO UNO",
      ]);
      await expect(buscarNaLoja(loja, "pd85")).resolves.toEqual([
        "PAST FR NOVO UNO",
      ]);
      // Código com hífen acha digitado colado.
      await expect(buscarNaLoja(loja, "rcpt12550")).resolves.toEqual([
        "PAST FR NOVO UNO",
      ]);
      await expect(buscarNaLoja(loja, "speed brake")).resolves.toEqual([
        "PAST FR NOVO UNO",
      ]);
      await expect(buscarNaLoja(loja, "wo130")).resolves.toEqual([
        "FILTRO OLEO UNO",
      ]);
      await expect(buscarNaLoja(loja, "WO-130")).resolves.toEqual([
        "FILTRO OLEO UNO",
      ]);
    },
    ESPERA_LONGA,
  );

  it(
    "o nome que começa pelo termo vem antes de quem só o cita",
    async () => {
      const { loja, peca } = await autopecas("Autopeças da Ordem");
      await peca("REP BUCHA FILTRO AR");
      await peca("FILTRO AR GOL");

      const pagina = await request(app)
        .get(`/v1/vitrine/${loja.apelido}/catalogo/produtos`)
        .query({ busca: "filtro" });
      expect(pagina.status).toBe(200);
      expect(
        pagina.body.produtos.map((p: { nome: string }) => p.nome),
      ).toEqual(["FILTRO AR GOL", "REP BUCHA FILTRO AR"]);
    },
    ESPERA_LONGA,
  );

  it(
    "passa de 200 acertos: a página conta todos e o cursor percorre sem repetir",
    async () => {
      const { loja, secao } = await autopecas("Autopeças Sem Teto");
      await migrador.query(
        `WITH novos AS (
           INSERT INTO app.products
             (store_id, name, slug, vertical_code, status, sort_order,
              display_price_cents, price_min_cents, price_max_cents)
           SELECT $1, 'FILTRO OLEO ' || n, 'filtro-oleo-' || n, 'AUTO_PARTS',
                  'PUBLISHED', n, 1000, 1000, 1000
             FROM generate_series(1, 260) AS n
           RETURNING id, sort_order)
         INSERT INTO app.product_categories (store_id, product_id, category_id, sort_order)
         SELECT $1, id, $2, sort_order FROM novos`,
        [loja.id, secao.id],
      );

      const vistos = new Set<string>();
      let cursor: string | undefined;
      let total = 0;
      for (let volta = 0; volta < 20; volta++) {
        const pagina = await request(app)
          .get(`/v1/vitrine/${loja.apelido}/catalogo/produtos`)
          .query({ busca: "filtro", limite: 48, ...(cursor ? { cursor } : {}) });
        expect(pagina.status).toBe(200);
        total = pagina.body.total;
        for (const p of pagina.body.produtos as { id: string }[]) {
          expect(vistos.has(p.id)).toBe(false);
          vistos.add(p.id);
        }
        cursor = pagina.body.proximoCursor ?? undefined;
        if (cursor === undefined) break;
      }
      expect(total).toBe(260);
      expect(vistos.size).toBe(260);

      const resumo = await request(app)
        .get(`/v1/vitrine/${loja.apelido}/catalogo/resumo`)
        .query({ busca: "filtro" });
      expect(resumo.body.secoes[0].total).toBe(260);
    },
    ESPERA_LONGA,
  );
});
