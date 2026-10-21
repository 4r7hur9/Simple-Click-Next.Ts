/**
 * A lista de clientes do painel com busca, filtros, ordem e página (card #77),
 * contra PostgreSQL de verdade e pelas rotas da aplicação.
 */
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { esquemaDaListaDeClientes } from "@simpleclick/contracts";
import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
} from "@simpleclick/testing";

import {
  aplicacaoDosClientes,
  ESPERA_DOS_CLIENTES,
  itemDoLanche,
  lancheComMolho,
  lojaComDono,
  Painel,
} from "./apoio-de-clientes.ts";
import { abrirAcessoDaAplicacao } from "./apoio-de-isolamento.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let painel: Painel;
let idDaIris: string;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  const app = aplicacaoDosClientes(acesso);
  const loja = await lojaComDono(migrador, { nome: "Lanchonete Filtros" });
  painel = new Painel(app, loja);

  const nomes: [string, string, string?][] = [
    ["Iara Lopes", "11 90000-0001"],
    ["Íris Matos", "11 90000-0002", "contato@exemplo.test"],
    ["Jair Neves", "11 90000-0003"],
    ["Zélia Prado", "11 90000-0004"],
  ];
  const ids: string[] = [];
  for (const [nome, telefone, email] of nomes) {
    const cadastro = await painel.cadastrar({
      nome,
      telefone,
      ...(email === undefined ? {} : { email }),
    });
    expect(cadastro.status).toBe(201);
    ids.push(cadastro.body.id as string);
  }
  idDaIris = ids[1]!;

  // Só Jair e Zélia pedem; Zélia gasta mais (2 pedidos).
  const lanche = await lancheComMolho(loja.loja, 2000);
  for (const indice of [2, 3, 3]) {
    const lancado = await painel.lancar({
      cliente: { tipo: "cadastrado", clienteId: ids[indice]! },
      itens: [itemDoLanche(lanche)],
      entrega: "PICKUP",
      formaDePagamento: "PIX",
    });
    expect(lancado.status).toBe(201);
  }
  // Iara foi importada (marca da 0072).
  await migrador.query(
    "UPDATE app.store_customers SET origin = 'IMPORT' WHERE id = $1",
    [ids[0]],
  );
}, ESPERA_DOS_CLIENTES);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_DOS_CLIENTES);

async function ler(consulta: Record<string, string>) {
  const resposta = await painel.listar(consulta);
  expect(resposta.status).toBe(200);
  return esquemaDaListaDeClientes.parse(resposta.body);
}

describe("a lista de clientes com filtros (card #77)", () => {
  it(
    "ordena por nome ignorando acento: Íris fica entre Iara e Jair",
    async () => {
      const lista = await ler({ ordem: "nome", pagina: "1" });
      expect(lista.clientes.map((c) => c.nome)).toEqual([
        "Iara Lopes",
        "Íris Matos",
        "Jair Neves",
        "Zélia Prado",
      ]);
      expect(lista.total).toBe(4);
      expect(lista.todos).toBe(4);
      const decrescente = await ler({ ordem: "nome-desc", pagina: "1" });
      expect(decrescente.clientes[3]?.nome).toBe("Iara Lopes");
    },
    ESPERA_DOS_CLIENTES,
  );

  it(
    "filtra por com pedidos, sem pedidos, importados e inativos",
    async () => {
      const com = await ler({ pedidos: "com", pagina: "1" });
      expect(com.clientes.map((c) => c.nome).sort()).toEqual([
        "Jair Neves",
        "Zélia Prado",
      ]);
      const sem = await ler({ pedidos: "sem", pagina: "1" });
      expect(sem.total).toBe(2);
      const importados = await ler({ origem: "importados", pagina: "1" });
      expect(importados.clientes.map((c) => c.nome)).toEqual(["Iara Lopes"]);
      // Pedidos de agora: ninguém está inativo há 30 dias.
      expect((await ler({ inativosDias: "30", pagina: "1" })).total).toBe(0);
      const recentes = await ler({ cadastro: "recentes", pagina: "1" });
      expect(recentes.total).toBe(4);
    },
    ESPERA_DOS_CLIENTES,
  );

  it(
    "ordena por quem mais gastou e busca por nome sem acento, e-mail e telefone",
    async () => {
      const gasto = await ler({ ordem: "gasto", pagina: "1" });
      expect(gasto.clientes[0]?.nome).toBe("Zélia Prado");
      expect((await ler({ busca: "iris", pagina: "1" })).clientes[0]?.id).toBe(
        idDaIris,
      );
      expect((await ler({ busca: "exemplo.test", pagina: "1" })).total).toBe(1);
      // Maiúscula acentuada no começo do nome também casa pela busca sem acento.
      expect((await ler({ busca: "ÍRIS", pagina: "1" })).total).toBe(1);
      expect((await ler({ busca: "90000-0003", pagina: "1" })).clientes[0]?.nome).toBe(
        "Jair Neves",
      );
      expect((await ler({ busca: "ninguem" , pagina: "1" })).total).toBe(0);
    },
    ESPERA_DOS_CLIENTES,
  );

  it(
    "pagina com total, e sem `pagina` responde como sempre (só a lista)",
    async () => {
      const primeira = await ler({ ordem: "nome", pagina: "1", porPagina: "10" });
      expect(primeira.porPagina).toBe(10);
      const vazia = await ler({ ordem: "nome", pagina: "9", porPagina: "10" });
      expect(vazia.clientes).toEqual([]);
      expect(vazia.total).toBe(4);
      const antiga = await painel.listar();
      expect(Object.keys(antiga.body)).toEqual(["clientes"]);
      expect((await painel.listar({ ordem: "xyz" })).status).toBe(400);
    },
    ESPERA_DOS_CLIENTES,
  );
});
