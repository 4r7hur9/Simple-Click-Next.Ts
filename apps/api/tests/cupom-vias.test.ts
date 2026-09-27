/**
 * Vias do cupom contra PostgreSQL de verdade (AC-621, AC-619, AC-618, P-003).
 *
 * A marca de reimpressão já está provada em memória em
 * `packages/core/src/cupom-blocos.test.ts`. Aqui está o que só o banco
 * sustenta: que o PEDIDO registra quantas vezes foi impresso, que duas
 * impressões simultâneas não saem com o mesmo número de via, que a loja B não
 * conta via no pedido da loja A, e que o cupom sai com o que foi guardado na
 * compra — não com o que a tela mandou.
 */
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { diagramarCupom, type CupomImpresso } from "@simpleclick/core";
import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarLoja,
} from "@simpleclick/testing";
import type { LojaDeTeste } from "@simpleclick/testing";

import {
  abrirAcessoDaAplicacao,
  comoRequisicao,
  ESPERA_LONGA,
} from "./apoio-de-isolamento.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import { criarPedido } from "../src/modules/orders/criar-pedido.usecase.ts";
import { tokenPublico } from "../src/modules/orders/numero-pedido.ts";
import {
  emitirCupomDoPedido,
  PedidoSemCupom,
} from "../src/modules/printing/cupom.usecase.ts";
import { normalizarConfiguracaoDeImpressao } from "../src/modules/stores/impressao-config.usecase.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let lojaA: LojaDeTeste;
let lojaB: LojaDeTeste;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  lojaA = await criarLoja({ nome: "Açaí & Guaraná da Vila" });
  lojaB = await criarLoja({ nome: "Pastelaria do Porto" });
}, ESPERA_LONGA);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

/** O pedido do cliente, criado pelo mesmo caminho do fechamento. */
async function pedidoDoCliente(loja: LojaDeTeste): Promise<string> {
  const resultado = await comoRequisicao(
    acesso,
    { lojaId: loja.id, papel: "CUSTOMER", tokenDoPedido: tokenPublico() },
    () =>
      criarPedido(
        {
          lojaId: loja.id,
          contato: {
            nome: "Maria Conceição",
            telefoneE164: "5511988887777",
            logradouro: "Rua das Flores",
            numero: "123",
            complemento: "Apto 12",
            bairro: "Centro",
            cidade: "São Paulo",
            estado: "SP",
            cep: "01000-000",
          },
          itens: [
            {
              nomeDoProduto: "Açaí com granola",
              nomeDaVariacao: "500 ml",
              quantidade: 2,
              precoUnitarioEmCentavos: 2150,
              opcoesEmCentavos: 400,
              totalDaLinhaEmCentavos: 4700,
              observacao: "Sem granola na metade, é alergia",
              opcoes: [
                {
                  nomeDoGrupo: "Adicionais",
                  nomeDaOpcao: "Paçoca",
                  quantidade: 2,
                  acrescimoEmCentavos: 400,
                },
              ],
            },
            {
              nomeDoProduto: "Guaraná",
              quantidade: 3,
              precoUnitarioEmCentavos: 650,
              totalDaLinhaEmCentavos: 1950,
            },
          ],
          entrega: "DELIVERY",
          formaDePagamento: "CASH",
          trocoParaEmCentavos: 10000,
          subtotalEmCentavos: 6650,
          taxaDeEntregaEmCentavos: 800,
          modoDaTaxaDeEntrega: "VALUE",
          totalEmCentavos: 7450,
          observacaoDoCliente: "Tocar a campainha do portão azul",
        },
        { aberta: true },
      ),
  );
  if (!resultado.ok) throw new Error("o pedido de apoio não foi criado");
  return resultado.pedido.id;
}

/** Emite uma via como o dono da loja, pelo caminho que a rota usa. */
function emitirComoDono(
  loja: LojaDeTeste,
  pedidoId: string,
): Promise<CupomImpresso> {
  return comoRequisicao(acesso, { lojaId: loja.id, papel: "OWNER" }, () =>
    emitirCupomDoPedido(pedidoId, normalizarConfiguracaoDeImpressao),
  );
}

/** O que o banco guardou sobre as vias deste pedido. */
async function viasGuardadas(pedidoId: string) {
  const resultado = await migrador.query<{
    print_count: number;
    last_printed_at: Date | null;
  }>(`SELECT print_count, last_printed_at FROM app.orders WHERE id = $1`, [
    pedidoId,
  ]);
  const linha = resultado.rows[0];
  if (linha === undefined) throw new Error(`pedido ${pedidoId} não existe`);
  return linha;
}

/** O cupom como texto corrido, para procurar trechos. */
function papel(cupom: CupomImpresso): string {
  return diagramarCupom(cupom)
    .map((linha) => (linha.tipo === "texto" ? linha.texto : "--corte--"))
    .join("\n");
}

/** Nenhuma linha do cupom passa das colunas do papel dele. */
function exigirQueCabeNoPapel(cupom: CupomImpresso): void {
  for (const linha of diagramarCupom(cupom)) {
    if (linha.tipo !== "texto") continue;
    const cabe =
      linha.tamanho === "duplo" ? cupom.papel.colunas / 2 : cupom.papel.colunas;
    expect([...linha.texto].length).toBeLessThanOrEqual(cabe);
  }
}

async function larguraDaLoja(loja: LojaDeTeste, larguraMm: 58 | 80) {
  await migrador.query(
    `UPDATE app.store_settings SET printing = $2::jsonb WHERE store_id = $1`,
    [
      loja.id,
      JSON.stringify({
        larguraMm,
        conteudo: {
          pedido: true,
          itens: true,
          total: true,
          enderecoCliente: true,
          totalEmDestaque: false,
          observacoes: true,
        },
      }),
    ],
  );
}

describe("o pedido registra quantas vezes o cupom foi impresso (AC-621)", () => {
  it(
    "@spec:AC-621 a primeira impressão é a via 1; imprimir de novo gera a 2ª via marcada, e o pedido guarda a contagem",
    async () => {
      const pedidoId = await pedidoDoCliente(lojaA);
      expect((await viasGuardadas(pedidoId)).print_count).toBe(0);

      const primeira = await emitirComoDono(lojaA, pedidoId);
      expect(primeira.via).toBe(1);
      expect(papel(primeira)).not.toMatch(/REIMPRESS/);
      expect((await viasGuardadas(pedidoId)).print_count).toBe(1);

      const segunda = await emitirComoDono(lojaA, pedidoId);
      expect(segunda.via).toBe(2);
      expect(papel(segunda)).toContain("REIMPRESSÃO");
      expect(papel(segunda)).toContain("*** 2ª VIA ***");

      const guardadas = await viasGuardadas(pedidoId);
      expect(guardadas.print_count).toBe(2);
      expect(guardadas.last_printed_at).toBeInstanceOf(Date);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-621 duas impressões ao mesmo tempo saem com vias diferentes, e as duas ficam contadas",
    async () => {
      const pedidoId = await pedidoDoCliente(lojaA);
      await emitirComoDono(lojaA, pedidoId);

      const [uma, outra] = await Promise.all([
        emitirComoDono(lojaA, pedidoId),
        emitirComoDono(lojaA, pedidoId),
      ]);
      expect([uma.via, outra.via].sort()).toEqual([2, 3]);
      expect((await viasGuardadas(pedidoId)).print_count).toBe(3);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-621 a contagem de vias não anda para trás, nem pela equipe da loja",
    async () => {
      const pedidoId = await pedidoDoCliente(lojaA);
      await emitirComoDono(lojaA, pedidoId);
      await emitirComoDono(lojaA, pedidoId);

      await expect(
        comoRequisicao(
          acesso,
          { lojaId: lojaA.id, papel: "OWNER" },
          (tx) =>
            tx.$executeRaw`UPDATE app.orders SET print_count = 0 WHERE id = ${pedidoId}::uuid`,
        ),
      ).rejects.toThrow(/vias impressas nao diminuem/);
      expect((await viasGuardadas(pedidoId)).print_count).toBe(2);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-621 @principle:P-003 a loja B não imprime nem conta via no pedido da loja A",
    async () => {
      const pedidoId = await pedidoDoCliente(lojaA);
      await emitirComoDono(lojaA, pedidoId);

      await expect(emitirComoDono(lojaB, pedidoId)).rejects.toBeInstanceOf(
        PedidoSemCupom,
      );
      expect((await viasGuardadas(pedidoId)).print_count).toBe(1);

      // Endereço inventado também responde "não encontrado", sem contar nada.
      await expect(
        emitirComoDono(lojaA, "00000000-0000-4000-8000-000000000000"),
      ).rejects.toBeInstanceOf(PedidoSemCupom);
    },
    ESPERA_LONGA,
  );
});

describe("o cupom sai com o que o pedido guardou (AC-619)", () => {
  it(
    "@spec:AC-619 loja, pedido, cliente, itens com escolhas, observação, endereço, pagamento e total vêm do banco",
    async () => {
      const pedidoId = await pedidoDoCliente(lojaA);
      const texto = papel(await emitirComoDono(lojaA, pedidoId));

      expect(texto).toContain("Açaí & Guaraná da Vila");
      expect(texto).toMatch(/PEDIDO [A-Z]-\d{4}/);
      expect(texto).toContain("Maria Conceição");
      expect(texto).toContain("(11) 98888-7777");
      expect(texto).toContain("2x Açaí com granola (500 ml)");
      expect(texto).toContain("+ Adicionais: Paçoca x2 (+R$ 4,00)");
      expect(texto).toContain(">> Obs.: Sem granola na metade, é alergia");
      expect(texto).toContain("3x Guaraná");
      expect(texto).toContain("Tocar a campainha do portão azul");
      expect(texto).toContain("Rua das Flores, 123 - Apto 12");
      expect(texto).toContain("Dinheiro");
      expect(texto).toMatch(/Troco para +R\$ 100,00/);
      expect(texto).toMatch(/Taxa de entrega +R\$ 8,00/);
      expect(texto).toMatch(/TOTAL +R\$ 74,50/);
    },
    ESPERA_LONGA,
  );
});

describe("a largura configurada em cada loja vale para o cupom (AC-618)", () => {
  it(
    "@spec:AC-618 a loja de 58 mm recebe cupom de 32 colunas e a de 80 mm, de 48, para o mesmo pedido",
    async () => {
      await larguraDaLoja(lojaA, 58);
      await larguraDaLoja(lojaB, 80);
      try {
        const estreito = await emitirComoDono(
          lojaA,
          await pedidoDoCliente(lojaA),
        );
        const largo = await emitirComoDono(lojaB, await pedidoDoCliente(lojaB));

        expect(estreito.papel).toEqual({ larguraMm: 58, colunas: 32 });
        expect(largo.papel).toEqual({ larguraMm: 80, colunas: 48 });
        exigirQueCabeNoPapel(estreito);
        exigirQueCabeNoPapel(largo);
      } finally {
        await migrador.query(
          `UPDATE app.store_settings SET printing = '{}'::jsonb WHERE store_id = ANY($1::uuid[])`,
          [[lojaA.id, lojaB.id]],
        );
      }
    },
    ESPERA_LONGA,
  );
});
