/**
 * Apoio comum às provas da impressão automática pela porta de verdade (T-608 —
 * AC-622, AC-623, AC-624, AC-626).
 *
 * As provas passam pela aplicação montada como em produção (`criarApp`), com a
 * autenticação do dono por token assinado, a lista de origens e o banco
 * descartável do arquivo — e o agente fala com a API como o programa da loja
 * fala: credencial no cabeçalho, consulta, confirmação. Aqui ficam os atores
 * (o dono no painel, o agente na rede, o cliente que pede) e os dublês do
 * cache do limite do pareamento.
 *
 * Cada arquivo de prova chama `prepararBancoDaImpressaoAutomatica()` no topo:
 * ela abre o acesso ao banco do arquivo antes das provas e o fecha depois.
 */
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, expect } from "vitest";

import {
  esquemaDoAgentePareado,
  esquemaDoCodigoDePareamento,
  esquemaDoEstadoDaImpressaoAutomatica,
  esquemaDosTrabalhosEntregues,
  esquemaDosTrabalhosPendentes,
  type EstadoDaImpressaoAutomaticaNoContrato,
  type TrabalhoDeImpressaoNoContrato,
  type TrabalhoPendenteNoContrato,
} from "@simpleclick/contracts";
import { lerCupomImpresso } from "@simpleclick/core";
import { bancoDoArquivo, conectarNoBancoDoArquivo } from "@simpleclick/testing";
import type { LojaDeTeste } from "@simpleclick/testing";

import {
  gravarSecao,
  montarAppDaConfiguracao,
  ORIGEM_DO_PAINEL,
  tokenDoDono,
} from "./apoio-de-configuracao.ts";
import {
  abrirAcessoDaAplicacao,
  comoRequisicao,
  ESPERA_LONGA,
} from "./apoio-de-isolamento.ts";
import type { OpcoesDoApp } from "../src/app.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import type { CacheDoLimite } from "../src/core/limite.ts";
import { criarPedido } from "../src/modules/orders/criar-pedido.usecase.ts";
import { tokenPublico } from "../src/modules/orders/numero-pedido.ts";
import { emitirCupomDoPedido } from "../src/modules/printing/cupom.usecase.ts";
import { normalizarConfiguracaoDeImpressao } from "../src/modules/stores/impressao-config.usecase.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;

/** Abre o banco do arquivo antes das provas e o fecha depois. */
export function prepararBancoDaImpressaoAutomatica(): void {
  beforeAll(async () => {
    migrador = await conectarNoBancoDoArquivo();
    acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, {
      maxDeConexoes: 6,
    });
  }, ESPERA_LONGA);

  afterAll(async () => {
    await acesso?.encerrar();
    await migrador?.end();
  }, ESPERA_LONGA);
}

/** A credencial de migração, que enxerga tudo: para conferir o banco. */
export function migradorDoArquivo(): pg.Client {
  return migrador;
}

// ---------------------------------------------------------------------------
// Dublês do cache do limite
// ---------------------------------------------------------------------------

/** O Redis que sempre deixa passar, contando quantas vezes foi consultado. */
export function cacheQueDeixa(): CacheDoLimite & { chamadas: number } {
  const cache = {
    chamadas: 0,
    async executarScript() {
      cache.chamadas += 1;
      // {barrado, esperaMs, tentativasRestantes, bloqueiosSeguidos, bloqueioNovo}
      return [0, 0, 9, 0, 0];
    },
  };
  return cache;
}

/** O Redis que diz que a loja está bloqueada por um minuto. */
export const cacheQueBarra: CacheDoLimite = {
  async executarScript() {
    return [1, 60_000, 0, 1, 0];
  },
};

/** O Redis que caiu. */
export const cacheQueCaiu: CacheDoLimite = {
  async executarScript() {
    throw new Error("ECONNREFUSED 127.0.0.1:6379");
  },
};

// ---------------------------------------------------------------------------
// A aplicação e os atores
// ---------------------------------------------------------------------------

export type App = ReturnType<typeof montarAppDaConfiguracao>;

/** A aplicação inteira, com a impressão automática no banco do arquivo. */
export function aplicacao(
  extras: Partial<NonNullable<OpcoesDoApp["impressaoAutomatica"]>> = {},
): App {
  return montarAppDaConfiguracao(acesso, {
    impressaoAutomatica: { acesso, cacheDoLimite: cacheQueDeixa(), ...extras },
  });
}

export const CONTEUDO_PADRAO = {
  pedido: true,
  itens: true,
  total: true,
  enderecoCliente: true,
  totalEmDestaque: false,
  observacoes: true,
};

/** O dono salva a impressão no painel, como a tela salva. */
export function salvarImpressao(app: App, loja: LojaDeTeste, corpo: object) {
  return gravarSecao(app, {
    apelido: loja.apelido,
    secao: "impressao",
    corpo,
    token: tokenDoDono(loja.dono.id),
  });
}

/** O dono liga ou desliga a chave do automático. */
export async function chaveDoAutomatico(
  app: App,
  loja: LojaDeTeste,
  ligada: boolean,
): Promise<void> {
  const resposta = await salvarImpressao(app, loja, {
    larguraMm: 80,
    conteudo: CONTEUDO_PADRAO,
    automatico: ligada,
  });
  expect(resposta.status).toBe(204);
}

/** O estado que o painel mostra na fila de pedidos. */
export async function estadoNoPainel(
  app: App,
  loja: LojaDeTeste,
): Promise<EstadoDaImpressaoAutomaticaNoContrato> {
  const resposta = await request(app)
    .get(`/v1/lojas/${loja.apelido}/impressao/estado`)
    .set("Authorization", `Bearer ${tokenDoDono(loja.dono.id)}`);
  expect(resposta.status).toBe(200);
  expect(resposta.headers["cache-control"]).toBe("no-store");
  return esquemaDoEstadoDaImpressaoAutomatica.parse(resposta.body);
}

/** Os cupons que esperam o agente, como o painel os lista. */
export async function pendentesNoPainel(
  app: App,
  loja: LojaDeTeste,
): Promise<TrabalhoPendenteNoContrato[]> {
  const resposta = await request(app)
    .get(`/v1/lojas/${loja.apelido}/impressao/pendentes`)
    .set("Authorization", `Bearer ${tokenDoDono(loja.dono.id)}`);
  expect(resposta.status).toBe(200);
  return esquemaDosTrabalhosPendentes.parse(resposta.body).trabalhos;
}

/** O dono gera o código de pareamento no painel. */
export async function gerarCodigo(
  app: App,
  loja: LojaDeTeste,
): Promise<string> {
  const resposta = await request(app)
    .post(`/v1/lojas/${loja.apelido}/impressao/pareamento`)
    .set("Origin", ORIGEM_DO_PAINEL)
    .set("Authorization", `Bearer ${tokenDoDono(loja.dono.id)}`);
  expect(resposta.status).toBe(201);
  return esquemaDoCodigoDePareamento.parse(resposta.body).codigo;
}

/** O agente manda apelido, código e nome da máquina. */
export function pedirPareamento(
  app: App,
  corpo: { apelido: string; codigo: string; nome?: string },
) {
  return request(app)
    .post("/v1/impressao/agente/pareamento")
    .set("Origin", ORIGEM_DO_PAINEL)
    .send({ nome: "PC do caixa", ...corpo });
}

/** O programa da loja, falando com a API pela credencial dele. */
export class AgenteNaRede {
  readonly impressora: string[] = [];
  readonly diario = new Set<string>();

  readonly app: App;
  readonly credencial: string;
  readonly id: string;

  constructor(app: App, credencial: string, id: string) {
    this.app = app;
    this.credencial = credencial;
    this.id = id;
  }

  consultar() {
    return request(this.app)
      .get("/v1/impressao/agente/trabalhos")
      .set("Authorization", `Bearer ${this.credencial}`);
  }

  async trabalhos(): Promise<TrabalhoDeImpressaoNoContrato[]> {
    const resposta = await this.consultar();
    expect(resposta.status).toBe(200);
    expect(resposta.headers["cache-control"]).toBe("no-store");
    return esquemaDosTrabalhosEntregues.parse(resposta.body).trabalhos;
  }

  confirmar(trabalhoId: string) {
    return request(this.app)
      .post(`/v1/impressao/agente/trabalhos/${trabalhoId}/confirmacao`)
      .set("Origin", ORIGEM_DO_PAINEL)
      .set("Authorization", `Bearer ${this.credencial}`);
  }

  /** Uma volta do laço: consulta, imprime o que não está no diário, confirma. */
  async rodar(): Promise<TrabalhoDeImpressaoNoContrato[]> {
    const trabalhos = await this.trabalhos();
    for (const trabalho of trabalhos) {
      const cupom = lerCupomImpresso(trabalho.cupom);
      expect(cupom).not.toBeNull();
      if (!this.diario.has(trabalho.id)) {
        this.impressora.push(trabalho.pedido.id);
        this.diario.add(trabalho.id);
      }
      expect((await this.confirmar(trabalho.id)).status).toBe(200);
    }
    return trabalhos;
  }
}

/** Gera o código no painel e pareia o agente com ele. */
export async function parear(
  app: App,
  loja: LojaDeTeste,
  nome = "PC do caixa",
): Promise<AgenteNaRede> {
  const codigo = await gerarCodigo(app, loja);
  const resposta = await pedirPareamento(app, {
    apelido: loja.apelido,
    codigo,
    nome,
  });
  expect(resposta.status).toBe(201);
  const pareado = esquemaDoAgentePareado.parse(resposta.body);
  expect(pareado.loja).toEqual({ apelido: loja.apelido, nome: loja.nome });
  expect(pareado.agente.nome).toBe(nome);
  return new AgenteNaRede(app, pareado.credencial, pareado.agente.id);
}

/** O pedido do cliente, pelo mesmo caminho do fechamento da vitrine. */
export async function pedidoDoCliente(loja: LojaDeTeste): Promise<string> {
  const resultado = await comoRequisicao(
    acesso,
    { lojaId: loja.id, papel: "CUSTOMER", tokenDoPedido: tokenPublico() },
    () =>
      criarPedido(
        {
          lojaId: loja.id,
          contato: { nome: "Conceição Araújo", telefoneE164: "5511987654321" },
          itens: [
            {
              nomeDoProduto: "Açaí com granola",
              quantidade: 1,
              precoUnitarioEmCentavos: 2350,
              totalDaLinhaEmCentavos: 2350,
            },
          ],
          entrega: "PICKUP",
          formaDePagamento: "PIX",
          subtotalEmCentavos: 2350,
          taxaDeEntregaEmCentavos: 0,
          totalEmCentavos: 2350,
        },
        { aberta: true },
      ),
  );
  if (!resultado.ok) throw new Error("o pedido de apoio não foi criado");
  return resultado.pedido.id;
}

/** O dono imprime por clique, pelo caminho que a rota do cupom usa. */
export function imprimirPorClique(loja: LojaDeTeste, pedidoId: string) {
  return comoRequisicao(
    acesso,
    { lojaId: loja.id, usuarioId: loja.dono.id, papel: "OWNER" },
    () => emitirCupomDoPedido(pedidoId, normalizarConfiguracaoDeImpressao),
  );
}

/** Os trabalhos do pedido, como a credencial de migração os enxerga. */
export async function trabalhosDoPedido(pedidoId: string) {
  const resultado = await migrador.query<{
    id: string;
    status: string;
    agent_id: string | null;
    printed_at: Date | null;
  }>(
    `SELECT id::text AS id, status, agent_id::text AS agent_id, printed_at
       FROM app.print_jobs WHERE order_id = $1 ORDER BY created_at`,
    [pedidoId],
  );
  return resultado.rows;
}

export async function viasDoPedido(pedidoId: string): Promise<number> {
  const resultado = await migrador.query<{ print_count: number }>(
    `SELECT print_count FROM app.orders WHERE id = $1`,
    [pedidoId],
  );
  return Number(resultado.rows[0]?.print_count);
}

/** O agente some: o último contato dele fica minutos para trás. */
export async function agenteSomeHaCincoMinutos(
  agenteId: string,
): Promise<void> {
  await migrador.query(
    `UPDATE app.print_agents
        SET last_heartbeat_at = now() - interval '5 minutes'
      WHERE id = $1`,
    [agenteId],
  );
}

export async function codigoAbertoDa(loja: LojaDeTeste) {
  const resultado = await migrador.query<{
    failed_attempts: number;
    consumed_at: Date | null;
  }>(
    `SELECT failed_attempts, consumed_at
       FROM app.print_pairing_codes
      WHERE store_id = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [loja.id],
  );
  return resultado.rows[0];
}

export async function agentesDa(loja: LojaDeTeste) {
  const resultado = await migrador.query<{
    id: string;
    revoked_at: Date | null;
  }>(
    `SELECT id::text AS id, revoked_at FROM app.print_agents
      WHERE store_id = $1 ORDER BY created_at`,
    [loja.id],
  );
  return resultado.rows;
}

export const esperar = (ms: number): Promise<void> =>
  new Promise((resolver) => setTimeout(resolver, ms));
