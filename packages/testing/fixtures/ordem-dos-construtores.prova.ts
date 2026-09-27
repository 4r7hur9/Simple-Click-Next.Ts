import { appendFileSync } from "node:fs";

import { expect, it } from "vitest";

import {
  comoLoja,
  criarCliente,
  criarLoja,
  criarMembro,
  criarProduto,
} from "../src/factories.ts";

/**
 * Suíte executada em outro processo para provar que a ORDEM não muda o
 * resultado (AC-038).
 *
 * De dentro de um processo não dá para provar isso: o arquivo tem uma ordem só,
 * e afirmar "a outra ordem também passaria" seria opinião. Aqui os dois casos
 * são registrados na ordem declarada ou na ordem invertida, conforme
 * `SC_ORDEM_DOS_CONSTRUTORES`, e cada um RELATA o que enxergou. Quem chama roda
 * as duas ordens e compara os relatos: iguais, a ordem não importa.
 *
 * Os dois casos são de propósito parecidos — mesmo ramo, mesmo nome de loja,
 * mesmo nome de produto. É a forma de cobrar a unicidade: se os construtores
 * repetissem apelido, código ou e-mail, o segundo a rodar quebraria em chave
 * única, em qualquer ordem.
 *
 * O arquivo termina em `.prova.ts` e não em `.test.ts` porque a suíte do
 * projeto não pode recolhê-lo: ele é o cenário observado, não um teste do
 * projeto.
 */

const RELATO = process.env.SC_RELATO_DOS_CONSTRUTORES;
const INVERTIDA = process.env.SC_ORDEM_DOS_CONSTRUTORES === "invertida";

/** O que muda entre os dois casos. O resto é igual, e é esse o ponto. */
const CASOS = [
  { caso: "alfa", precoCentavos: 1999 },
  { caso: "beta", precoCentavos: 2999 },
] as const;

const NOME_DA_LOJA = "Lanchonete da esquina";
const NOME_DO_PRODUTO = "X-Salada";

interface Relato {
  readonly caso: string;
  readonly lojasVisiveis: number;
  readonly nomeDaLoja: string;
  readonly produtos: { nome: string; precoCentavos: number }[];
  readonly membros: number;
  readonly clientes: number;
}

function relatar(relato: Relato): void {
  if (RELATO === undefined) return;
  appendFileSync(RELATO, `${JSON.stringify(relato)}\n`, "utf8");
}

const ordemDaVez = INVERTIDA ? [...CASOS].reverse() : [...CASOS];

for (const { caso, precoCentavos } of ordemDaVez) {
  it(`monta o cenário ${caso} e enxerga apenas o dele`, async () => {
    const loja = await criarLoja({ ramo: "lanchonete", nome: NOME_DA_LOJA });
    await criarMembro({ loja });
    await criarProduto({ loja, nome: NOME_DO_PRODUTO, precoCentavos });
    await criarCliente({ loja });

    const observado = await comoLoja(loja, async (tx) => {
      const lojas = await tx.query<{ total: number; nome: string }>(
        "SELECT count(*)::int AS total, max(name) AS nome FROM app.stores",
      );
      const produtos = await tx.query<{ nome: string; centavos: string }>(
        `SELECT name AS nome, display_price_cents::text AS centavos
           FROM app.products ORDER BY name`,
      );
      const membros = await tx.query<{ total: number }>(
        "SELECT count(*)::int AS total FROM app.store_members",
      );
      const clientes = await tx.query<{ total: number }>(
        "SELECT count(*)::int AS total FROM app.store_customers",
      );
      return { lojas, produtos, membros, clientes };
    });

    const relato: Relato = {
      caso,
      lojasVisiveis: observado.lojas.rows[0]?.total ?? -1,
      nomeDaLoja: observado.lojas.rows[0]?.nome ?? "",
      produtos: observado.produtos.rows.map((linha) => ({
        nome: linha.nome,
        precoCentavos: Number(linha.centavos),
      })),
      membros: observado.membros.rows[0]?.total ?? -1,
      clientes: observado.clientes.rows[0]?.total ?? -1,
    };
    relatar(relato);

    // A asserção acontece aqui também, e não só na comparação de fora: uma
    // prova que só grava relato passaria mesmo com o isolamento desligado.
    expect(relato).toEqual({
      caso,
      lojasVisiveis: 1,
      nomeDaLoja: NOME_DA_LOJA,
      produtos: [{ nome: NOME_DO_PRODUTO, precoCentavos }],
      // O dono com que a loja nasceu e o membro vinculado pelo construtor.
      membros: 2,
      clientes: 1,
    });
  });
}
