/**
 * Apoio das provas dos clientes da loja e do pedido manual (T-700 a T-707).
 *
 * TUDO PELA APLICAÇÃO DE VERDADE. A prova monta `criarApp` inteiro sobre o
 * banco descartável do arquivo e fala com ele como o painel fala: token de
 * acesso assinado com o segredo do ambiente, apelido da loja no caminho,
 * origem autorizada no cabeçalho. Nenhum autenticador de mentira — o dono é
 * sempre MEMBRO da loja (`criarMembro`), e o token é da identidade dele.
 *
 * O que se repete em todas as provas mora aqui: a loja pronta para vender, o
 * dono com token, o produto com grupo obrigatório e as chamadas às rotas.
 */
import type { Express } from "express";
import type pg from "pg";
import request from "supertest";

import {
  criarGrupoDeEscolha,
  criarLoja,
  criarMembro,
  criarOpcao,
  criarProduto,
  porGrupoNoProduto,
  type GrupoDeTeste,
  type LojaDeTeste,
  type MembroDeTeste,
  type OpcaoDeTeste,
  type ProdutoDeTeste,
  type SobrescritaDeLoja,
} from "@simpleclick/testing";

import { prepararParaVender } from "./apoio-de-compra.ts";
import {
  comoPortador,
  ORIGEM_DO_PAINEL,
  tokenDeAcesso,
} from "./apoio-de-pedidos.ts";
import { criarApp } from "../src/app.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";

export { ORIGEM_DO_PAINEL } from "./apoio-de-pedidos.ts";

/** Espera generosa: o primeiro arquivo do dia ainda constrói o molde. */
export const ESPERA_DOS_CLIENTES = 120_000;

/** A aplicação inteira, falando com o banco descartável deste arquivo. */
export function aplicacaoDosClientes(acesso: AcessoAoBanco): Express {
  return criarApp({
    origens: [ORIGEM_DO_PAINEL],
    vitrine: { acesso },
    carrinho: { acesso },
    pedidos: { acesso },
    fila: { acesso },
    conta: { acesso },
    clientes: { acesso },
    pedidoManual: { acesso },
    enderecos: { acesso },
    cupom: { acesso },
  });
}

/** Uma loja que vende, com o dono dela e o cabeçalho de autorização dele. */
export interface LojaComDono {
  readonly loja: LojaDeTeste;
  readonly dono: MembroDeTeste;
  /** `Bearer <token>` do dono, pronto para o cabeçalho. */
  readonly autorizacao: string;
}

/**
 * Cria a loja, o dono MEMBRO dela e o token dele; deixa a loja vendendo.
 *
 * O dono nunca é identificador inventado: é a identidade que `store_members`
 * vincula à loja, porque é esse vínculo que decide o que ele alcança.
 */
export async function lojaComDono(
  migrador: pg.Client,
  sobrescrita: SobrescritaDeLoja = {},
): Promise<LojaComDono> {
  const loja = await criarLoja(sobrescrita);
  const dono = await criarMembro({ loja });
  await prepararParaVender(migrador, loja);
  return {
    loja,
    dono,
    autorizacao: comoPortador(tokenDeAcesso(dono.identidade.id, "OWNER")),
  };
}

/** Um lanche com o grupo obrigatório "Molho" (escolha 1) e um adicional pago. */
export interface LancheComMolho {
  readonly produto: ProdutoDeTeste;
  readonly molho: GrupoDeTeste;
  readonly ketchup: OpcaoDeTeste;
  readonly mostarda: OpcaoDeTeste;
}

export async function lancheComMolho(
  loja: LojaDeTeste,
  precoCentavos = 2000,
): Promise<LancheComMolho> {
  const produto = await criarProduto({
    loja,
    nome: "X-Salada",
    precoCentavos,
  });
  const molho = await criarGrupoDeEscolha({
    loja,
    nome: "Molho",
    minimo: 1,
    maximo: 1,
  });
  const ketchup = await criarOpcao({ loja, grupo: molho, nome: "Ketchup" });
  const mostarda = await criarOpcao({
    loja,
    grupo: molho,
    nome: "Mostarda",
    acrescimoCentavos: 150,
  });
  await porGrupoNoProduto({ loja, produto, grupo: molho });
  return { produto, molho, ketchup, mostarda };
}

/** As chamadas às rotas do dono, com a origem e a autorização já postas. */
export class Painel {
  private readonly app: Express;
  private readonly alvo: LojaComDono;

  constructor(app: Express, alvo: LojaComDono) {
    this.app = app;
    this.alvo = alvo;
  }

  private caminho(resto: string): string {
    return `/v1/lojas/${this.alvo.loja.apelido}${resto}`;
  }

  /** A lista; com texto é só a busca, com objeto vão filtros, ordem e página. */
  listar(consulta?: string | Record<string, string>) {
    const pedido = request(this.app)
      .get(this.caminho("/clientes"))
      .set("Authorization", this.alvo.autorizacao);
    if (consulta === undefined) return pedido;
    return pedido.query(typeof consulta === "string" ? { busca: consulta } : consulta);
  }

  cadastrar(corpo: Record<string, unknown>) {
    return request(this.app)
      .post(this.caminho("/clientes"))
      .set("Origin", ORIGEM_DO_PAINEL)
      .set("Authorization", this.alvo.autorizacao)
      .send(corpo);
  }

  ficha(clienteId: string) {
    return request(this.app)
      .get(this.caminho(`/clientes/${clienteId}`))
      .set("Authorization", this.alvo.autorizacao);
  }

  editar(clienteId: string, corpo: Record<string, unknown>) {
    return request(this.app)
      .patch(this.caminho(`/clientes/${clienteId}`))
      .set("Origin", ORIGEM_DO_PAINEL)
      .set("Authorization", this.alvo.autorizacao)
      .send(corpo);
  }

  remover(clienteId: string) {
    return request(this.app)
      .delete(this.caminho(`/clientes/${clienteId}`))
      .set("Origin", ORIGEM_DO_PAINEL)
      .set("Authorization", this.alvo.autorizacao);
  }

  lancar(corpo: Record<string, unknown>) {
    return request(this.app)
      .post(this.caminho("/pedidos/manual"))
      .set("Origin", ORIGEM_DO_PAINEL)
      .set("Authorization", this.alvo.autorizacao)
      .send(corpo);
  }

  repetir(pedidoId: string) {
    return request(this.app)
      .post(this.caminho(`/pedidos/${pedidoId}/repetir`))
      .set("Origin", ORIGEM_DO_PAINEL)
      .set("Authorization", this.alvo.autorizacao);
  }

  fila() {
    return request(this.app)
      .get(this.caminho("/pedidos"))
      .set("Authorization", this.alvo.autorizacao);
  }

  pedido(pedidoId: string) {
    return request(this.app)
      .get(this.caminho(`/pedidos/${pedidoId}`))
      .set("Authorization", this.alvo.autorizacao);
  }

  mudarStatus(pedidoId: string, status: string, motivo?: string) {
    return request(this.app)
      .patch(this.caminho(`/pedidos/${pedidoId}/status`))
      .set("Origin", ORIGEM_DO_PAINEL)
      .set("Authorization", this.alvo.autorizacao)
      .send(motivo === undefined ? { status } : { status, motivo });
  }

  cupom(pedidoId: string) {
    return request(this.app)
      .post(this.caminho(`/pedidos/${pedidoId}/cupom`))
      .set("Origin", ORIGEM_DO_PAINEL)
      .set("Authorization", this.alvo.autorizacao);
  }
}

/** Um item de pedido manual do lanche, com o molho escolhido. */
export function itemDoLanche(
  lanche: LancheComMolho,
  opcao: OpcaoDeTeste | null = lanche.ketchup,
  quantidade = 1,
): Record<string, unknown> {
  return {
    produtoId: lanche.produto.id,
    quantidade,
    escolhas:
      opcao === null
        ? []
        : [{ grupoId: lanche.molho.id, opcaoId: opcao.id, quantidade: 1 }],
  };
}
