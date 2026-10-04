/**
 * Fila de impressão contra PostgreSQL de verdade: o cupom espera o agente e
 * sai UMA vez (T-607 — AC-624, AC-625; AC-621 e P-003).
 *
 * As regras puras (espera crescente, o que o agente recebe) estão provadas em
 * `src/modules/printing/fila.usecase.test.ts`. Aqui está o que só o banco
 * sustenta: o trabalho nascendo na transação do pedido, dois agentes travando
 * ao mesmo tempo sem se esperarem, o prazo de posse vencendo de verdade, a via
 * somada uma vez só, e o clique do dono cancelando o que esperava o agente.
 *
 * O "agente" daqui é o laço que o agente de verdade (T-609) roda: reivindica,
 * imprime o que não está no diário dele, anota ANTES de confirmar e confirma.
 * A impressora é uma lista — cada item é uma folha que saiu no papel. É ela que
 * as provas contam: "uma única impressão" é uma folha, não um estado no banco.
 */
import { createHash, randomBytes } from "node:crypto";

import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { CupomImpresso } from "@simpleclick/core";
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
import { ErroDeDominio } from "../src/core/erros.ts";
import { criarPedido } from "../src/modules/orders/criar-pedido.usecase.ts";
import { tokenPublico } from "../src/modules/orders/numero-pedido.ts";
import { emitirCupomDoPedido } from "../src/modules/printing/cupom.usecase.ts";
import {
  confirmarImpressao,
  listarPendentes,
  reivindicarTrabalhos,
  registrarFalha,
  type OpcoesDaReivindicacao,
  type ResultadoDaConfirmacao,
  type ResultadoDaFalha,
  type TrabalhoEntregue,
  type TrabalhoPendente,
} from "../src/modules/printing/fila.usecase.ts";
import { normalizarConfiguracaoDeImpressao } from "../src/modules/stores/impressao-config.usecase.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 6 });
}, ESPERA_LONGA);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

// ---------------------------------------------------------------------------
// Cenário
// ---------------------------------------------------------------------------

/** Uma loja que ligou a impressão automática (o padrão é desligada). */
async function lojaComAutomatico(nome: string): Promise<LojaDeTeste> {
  const loja = await criarLoja({ nome });
  await migrador.query(
    `UPDATE app.store_settings
        SET printing = printing || '{"automatico": true}'::jsonb
      WHERE store_id = $1`,
    [loja.id],
  );
  return loja;
}

/** O pedido do cliente, pelo mesmo caminho do fechamento da vitrine. */
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

/** Uma folha que saiu na impressora da loja. */
interface Folha {
  readonly trabalhoId: string;
  readonly pedidoId: string;
  readonly via: number;
  readonly agente: string;
}

/**
 * O agente pareado com a loja, do jeito que o agente de verdade se comporta.
 * O pareamento em si é da T-608: aqui ele nasce direto no banco, com o resumo
 * de uma credencial aleatória.
 */
class AgenteDeTeste {
  /** Os trabalhos que este agente já imprimiu — o diário local dele. */
  readonly diario = new Set<string>();
  readonly nome: string;
  readonly id: string;
  readonly loja: LojaDeTeste;
  /** A impressora da loja: cada item é uma folha que saiu no papel. */
  readonly impressora: Folha[];

  constructor(dados: {
    readonly nome: string;
    readonly id: string;
    readonly loja: LojaDeTeste;
    readonly impressora: Folha[];
  }) {
    this.nome = dados.nome;
    this.id = dados.id;
    this.loja = dados.loja;
    this.impressora = dados.impressora;
  }

  /** Uma transação com o papel do agente, na loja dele. */
  noPapel<T>(acao: () => Promise<T>, lojaId = this.loja.id): Promise<T> {
    return comoRequisicao(acesso, { lojaId, papel: "PRINT_AGENT" }, acao);
  }

  reivindicar(opcoes?: OpcoesDaReivindicacao): Promise<TrabalhoEntregue[]> {
    return this.noPapel(() =>
      reivindicarTrabalhos(this.id, normalizarConfiguracaoDeImpressao, opcoes),
    );
  }

  confirmar(trabalhoId: string): Promise<ResultadoDaConfirmacao> {
    return this.noPapel(() => confirmarImpressao(this.id, trabalhoId));
  }

  falhar(trabalhoId: string, motivo: string): Promise<ResultadoDaFalha> {
    return this.noPapel(() => registrarFalha(this.id, trabalhoId, motivo));
  }

  /** Imprime o trabalho, a não ser que o diário diga que ele já saiu. */
  imprimir(trabalho: TrabalhoEntregue): void {
    if (this.diario.has(trabalho.id)) return;
    this.impressora.push({
      trabalhoId: trabalho.id,
      pedidoId: trabalho.pedido.id,
      via: trabalho.cupom.via,
      agente: this.nome,
    });
    // Anotado ANTES de confirmar: se a confirmação se perder, o reenvio
    // encontra o trabalho no diário e não sai outra folha (AC-625).
    this.diario.add(trabalho.id);
  }

  /**
   * Uma volta do laço: reivindica, imprime o que não está no diário e
   * confirma — a não ser que a rede perca a confirmação.
   */
  async consultar(
    opcoes: OpcoesDaReivindicacao & {
      readonly perderConfirmacao?: boolean;
    } = {},
  ): Promise<TrabalhoEntregue[]> {
    const trabalhos = await this.reivindicar(opcoes);
    for (const trabalho of trabalhos) {
      this.imprimir(trabalho);
      if (opcoes.perderConfirmacao !== true) await this.confirmar(trabalho.id);
    }
    return trabalhos;
  }
}

/** Pareia um agente com a loja. */
async function agente(
  loja: LojaDeTeste,
  nome: string,
  impressora: Folha[] = [],
): Promise<AgenteDeTeste> {
  const resumo = createHash("sha256").update(randomBytes(32)).digest();
  const pareado = await migrador.query<{ id: string }>(
    `INSERT INTO app.print_agents (store_id, name, token_sha256)
     VALUES ($1, $2, $3) RETURNING id`,
    [loja.id, nome, resumo],
  );
  const id = pareado.rows[0]?.id;
  if (id === undefined) throw new Error("o agente de apoio não foi pareado");
  return new AgenteDeTeste({ nome, id, loja, impressora });
}

/** A lista de pendentes, como o dono a vê no painel. */
function pendentesDoDono(loja: LojaDeTeste): Promise<TrabalhoPendente[]> {
  return comoRequisicao(
    acesso,
    { lojaId: loja.id, usuarioId: loja.dono.id, papel: "OWNER" },
    () => listarPendentes(),
  );
}

/** O dono imprime por clique, pelo caminho que a rota do cupom usa. */
function imprimirPorClique(
  loja: LojaDeTeste,
  pedidoId: string,
): Promise<CupomImpresso> {
  return comoRequisicao(
    acesso,
    { lojaId: loja.id, usuarioId: loja.dono.id, papel: "OWNER" },
    () => emitirCupomDoPedido(pedidoId, normalizarConfiguracaoDeImpressao),
  );
}

interface TrabalhoNoBanco {
  readonly id: string;
  readonly status: string;
  readonly attempt: number;
  readonly agent_id: string | null;
  readonly printed_at: Date | null;
  readonly last_error: string | null;
  readonly espera_ms: number;
}

/** Os trabalhos do pedido, como a credencial de migração os enxerga. */
async function trabalhosDoPedido(pedidoId: string): Promise<TrabalhoNoBanco[]> {
  const resultado = await migrador.query<TrabalhoNoBanco>(
    `SELECT id::text AS id, status, attempt::int AS attempt,
            agent_id::text AS agent_id, printed_at, last_error,
            (extract(epoch FROM (available_at - updated_at)) * 1000)::int AS espera_ms
       FROM app.print_jobs
      WHERE order_id = $1
      ORDER BY created_at`,
    [pedidoId],
  );
  return resultado.rows;
}

async function unicoTrabalho(pedidoId: string): Promise<TrabalhoNoBanco> {
  const trabalhos = await trabalhosDoPedido(pedidoId);
  expect(trabalhos).toHaveLength(1);
  return trabalhos[0] as TrabalhoNoBanco;
}

/** Quantas vias o pedido registra (AC-621). */
async function viasDoPedido(pedidoId: string): Promise<number> {
  const resultado = await migrador.query<{ print_count: number }>(
    `SELECT print_count FROM app.orders WHERE id = $1`,
    [pedidoId],
  );
  return Number(resultado.rows[0]?.print_count);
}

/** O relógio anda até a próxima tentativa, sem a prova esperar de verdade. */
async function chegaAHoraDaProximaTentativa(pedidoId: string): Promise<void> {
  await migrador.query(
    `UPDATE app.print_jobs SET available_at = now()
      WHERE order_id = $1 AND status = 'FAILED'`,
    [pedidoId],
  );
}

const esperar = (ms: number): Promise<void> =>
  new Promise((resolver) => setTimeout(resolver, ms));

/** O cupom sem as marcas de reimpressão: o que sobra é o conteúdo do pedido. */
function conteudoDoCupom(cupom: CupomImpresso): unknown {
  const blocos =
    cupom.via > 1
      ? // Três blocos no topo (REIMPRESSÃO, *** Nª VIA ***, separador) e dois
        // no pé, antes do avanço de papel e do corte.
        [...cupom.blocos.slice(3, -4), ...cupom.blocos.slice(-2)]
      : cupom.blocos;
  return { versao: cupom.versao, papel: cupom.papel, blocos };
}

// ---------------------------------------------------------------------------
// AC-624 — agente fora do ar: o cupom espera, e nada se perde
// ---------------------------------------------------------------------------

describe("o cupom espera o agente", () => {
  it(
    "@spec:AC-624 com o agente fora do ar o cupom aguarda na fila e, quando ele volta, sai uma vez, na ordem em que entrou",
    async () => {
      const loja = await lojaComAutomatico("Açaí & Guaraná da Vila");
      const impressora: Folha[] = [];
      const caixa = await agente(loja, "PC do caixa", impressora);

      // O agente está fora do ar: ninguém consulta. Os pedidos entram mesmo
      // assim, e cada um deixa o seu trabalho na fila, na transação dele.
      const primeiro = await pedidoDoCliente(loja);
      const segundo = await pedidoDoCliente(loja);

      expect((await unicoTrabalho(primeiro)).status).toBe("QUEUED");
      expect((await unicoTrabalho(segundo)).status).toBe("QUEUED");
      const pendentes = await pendentesDoDono(loja);
      expect(pendentes.map((p) => [p.pedido.id, p.estado])).toEqual([
        [primeiro, "QUEUED"],
        [segundo, "QUEUED"],
      ]);
      // Nenhuma via foi contada: o cupom ainda não saiu por caminho nenhum.
      expect(await viasDoPedido(primeiro)).toBe(0);

      // O agente volta.
      const entregues = await caixa.consultar();

      expect(entregues.map((t) => t.pedido.id)).toEqual([primeiro, segundo]);
      expect(impressora.map((f) => [f.pedidoId, f.via])).toEqual([
        [primeiro, 1],
        [segundo, 1],
      ]);
      expect((await unicoTrabalho(primeiro)).status).toBe("PRINTED");
      expect((await unicoTrabalho(segundo)).agent_id).toBe(caixa.id);
      expect(await viasDoPedido(primeiro)).toBe(1);
      expect(await viasDoPedido(segundo)).toBe(1);

      // E não sai de novo na próxima volta.
      expect(await caixa.consultar()).toEqual([]);
      expect(impressora).toHaveLength(2);
      expect(await pendentesDoDono(loja)).toEqual([]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-624 a falha volta para a fila com espera crescente e, no limite, o cupom fica à vista e o clique continua funcionando",
    async () => {
      const loja = await lojaComAutomatico("Pastelaria do Porto");
      const caixa = await agente(loja, "PC do caixa");
      const pedidoId = await pedidoDoCliente(loja);

      const [primeira] = await caixa.reivindicar();
      if (primeira === undefined)
        throw new Error("o trabalho não foi entregue");
      expect(primeira.tentativa).toBe(1);

      const esperas: number[] = [];
      let resultado = await caixa.falhar(primeira.id, "Sem papel");
      for (let tentativa = 2; resultado.estado === "FAILED"; tentativa += 1) {
        const noBanco = await unicoTrabalho(pedidoId);
        esperas.push(noBanco.espera_ms);
        expect(resultado.proximaTentativaEm).not.toBeNull();
        // Antes da hora, o trabalho não é entregue de novo.
        expect(await caixa.reivindicar()).toEqual([]);

        await chegaAHoraDaProximaTentativa(pedidoId);
        const [denovo] = await caixa.reivindicar();
        if (denovo === undefined) throw new Error("o trabalho não voltou");
        // É o MESMO trabalho, com o MESMO cupom: a falha não gera outro.
        expect(denovo.id).toBe(primeira.id);
        expect(denovo.cupom).toEqual(primeira.cupom);
        expect(denovo.tentativa).toBe(tentativa);
        resultado = await caixa.falhar(denovo.id, "Sem papel");
      }

      expect(esperas).toEqual([5_000, 10_000, 20_000, 40_000, 80_000]);
      expect(resultado).toEqual({
        id: primeira.id,
        estado: "DEAD",
        proximaTentativaEm: null,
      });
      // A via foi somada na primeira entrega, e só nela.
      expect(await viasDoPedido(pedidoId)).toBe(1);

      // A fila desistiu, mas o cupom não sumiu: está à vista do dono.
      const [desistido] = await pendentesDoDono(loja);
      expect(desistido).toMatchObject({
        id: primeira.id,
        estado: "DEAD",
        tentativas: 6,
        ultimoErro: "Sem papel",
      });
      expect(await caixa.reivindicar()).toEqual([]);

      // O botão de imprimir por clique continua funcionando.
      const peloClique = await imprimirPorClique(loja, pedidoId);
      expect(peloClique.via).toBe(2);
      expect((await unicoTrabalho(pedidoId)).status).toBe("CANCELED");
      expect(await pendentesDoDono(loja)).toEqual([]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-624 imprimir por clique um cupom que espera o agente cancela o trabalho, e o cupom não sai duas vezes",
    async () => {
      const loja = await lojaComAutomatico("Lanchonete do Largo");
      const impressora: Folha[] = [];
      const caixa = await agente(loja, "PC do caixa", impressora);

      // Cupom que nunca saiu pelo agente: o clique é a via ORIGINAL.
      const naFila = await pedidoDoCliente(loja);
      const original = await imprimirPorClique(loja, naFila);
      expect(original.via).toBe(1);
      expect((await unicoTrabalho(naFila)).status).toBe("CANCELED");

      // Cupom que o agente pegou e imprimiu, mas cuja confirmação se perdeu:
      // o dono não vê o papel e imprime por clique — sai a 2ª via, marcada.
      const comOAgente = await pedidoDoCliente(loja);
      const [pego] = await caixa.consultar({
        perderConfirmacao: true,
        prazoDePosseMs: 1_000,
      });
      expect(pego?.pedido.id).toBe(comOAgente);
      const segunda = await imprimirPorClique(loja, comOAgente);
      expect(segunda.via).toBe(2);

      // A confirmação atrasada chega: o trabalho continua cancelado, e a
      // resposta diz isso para o agente dar por resolvido.
      if (pego === undefined) throw new Error("o trabalho não foi entregue");
      expect(await caixa.confirmar(pego.id)).toEqual({
        id: pego.id,
        estado: "CANCELED",
      });

      // Nem com o prazo vencido nada volta a ser entregue.
      await esperar(1_200);
      expect(await caixa.consultar()).toEqual([]);
      expect(impressora.map((f) => [f.pedidoId, f.via])).toEqual([
        [comOAgente, 1],
      ]);
      expect(await viasDoPedido(naFila)).toBe(1);
      expect(await viasDoPedido(comOAgente)).toBe(2);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-624 cupom que não pode ser montado não trava a fila nem some: fica à vista para o clique, sem via contada",
    async () => {
      const loja = await lojaComAutomatico("Cantina da Esquina");
      const caixa = await agente(loja, "PC do caixa");
      const comDefeito = await pedidoDoCliente(loja);
      const seguinte = await pedidoDoCliente(loja);

      // A configuração não pode ser lida na montagem do PRIMEIRO cupom — um
      // dado fora do contrato, do jeito que um pedido com defeito apareceria.
      let montagens = 0;
      const lerQueFalhaUmaVez = (guardada: unknown) => {
        montagens += 1;
        if (montagens === 1) throw new Error("configuração ilegível");
        return normalizarConfiguracaoDeImpressao(guardada);
      };
      const entregues = await caixa.noPapel(() =>
        reivindicarTrabalhos(caixa.id, lerQueFalhaUmaVez),
      );

      // O defeito de um não segura o outro: o seguinte sai normalmente.
      expect(entregues.map((t) => t.pedido.id)).toEqual([seguinte]);
      expect(await viasDoPedido(seguinte)).toBe(1);

      // O que não pôde ser montado não conta via e não some da vista.
      const desistido = await unicoTrabalho(comDefeito);
      expect(desistido.status).toBe("DEAD");
      expect(desistido.last_error).toContain("imprima por clique");
      expect(await viasDoPedido(comDefeito)).toBe(0);
      const pendentes = await pendentesDoDono(loja);
      expect(pendentes.map((p) => [p.pedido.id, p.estado])).toEqual([
        [comDefeito, "DEAD"],
        [seguinte, "LEASED"],
      ]);
      expect((await imprimirPorClique(loja, comDefeito)).via).toBe(1);
    },
    ESPERA_LONGA,
  );

  it(
    "loja com a impressão automática desligada não enfileira nada: o padrão é o clique",
    async () => {
      const loja = await criarLoja({ nome: "Padaria Sem Agente" });
      const pedidoId = await pedidoDoCliente(loja);

      expect(await trabalhosDoPedido(pedidoId)).toEqual([]);
      expect(await pendentesDoDono(loja)).toEqual([]);
    },
    ESPERA_LONGA,
  );
});

// ---------------------------------------------------------------------------
// AC-625 — o cupom nunca é impresso duas vezes
// ---------------------------------------------------------------------------

describe("o cupom sai uma vez só", () => {
  it(
    "@spec:AC-625 dois agentes reivindicando ao mesmo tempo não se esperam e nunca recebem o mesmo trabalho",
    async () => {
      const loja = await lojaComAutomatico("Pizzaria Dois Fornos");
      const impressora: Folha[] = [];
      const caixa = await agente(loja, "PC do caixa", impressora);
      const cozinha = await agente(loja, "PC da cozinha", impressora);
      const pedidos: string[] = [];
      for (let i = 0; i < 4; i += 1) pedidos.push(await pedidoDoCliente(loja));

      // O caixa reivindica e SEGURA a transação aberta: as linhas dele
      // continuam travadas enquanto a cozinha consulta. Sem o salto das linhas
      // travadas, a cozinha esperaria o caixa, que espera a cozinha — e a prova
      // estouraria o prazo em vez de passar.
      let avisarQueReivindicou!: (t: TrabalhoEntregue[]) => void;
      const caixaReivindicou = new Promise<TrabalhoEntregue[]>((resolver) => {
        avisarQueReivindicou = resolver;
      });
      let liberarOCaixa!: () => void;
      const caixaLiberado = new Promise<void>((resolver) => {
        liberarOCaixa = resolver;
      });

      const transacaoDoCaixa = caixa.noPapel(async () => {
        const pegos = await reivindicarTrabalhos(
          caixa.id,
          normalizarConfiguracaoDeImpressao,
          { limite: 2 },
        );
        avisarQueReivindicou(pegos);
        await caixaLiberado;
        return pegos;
      });

      const doCaixaAindaAberto = await caixaReivindicou;
      const daCozinha = await cozinha.reivindicar({ limite: 4 });
      liberarOCaixa();
      const doCaixa = await transacaoDoCaixa;

      expect(doCaixa).toEqual(doCaixaAindaAberto);
      const idsDoCaixa = doCaixa.map((t) => t.pedido.id);
      const idsDaCozinha = daCozinha.map((t) => t.pedido.id);
      // O caixa ficou com os dois mais antigos; a cozinha, com os outros dois.
      expect(idsDoCaixa).toEqual(pedidos.slice(0, 2));
      expect(idsDaCozinha).toEqual(pedidos.slice(2));

      for (const t of doCaixa) caixa.imprimir(t);
      for (const t of daCozinha) cozinha.imprimir(t);
      await Promise.all([
        ...doCaixa.map((t) => caixa.confirmar(t.id)),
        ...daCozinha.map((t) => cozinha.confirmar(t.id)),
      ]);

      // Uma folha por pedido, e cada pedido com uma via.
      expect(impressora.map((f) => f.pedidoId).sort()).toEqual(
        [...pedidos].sort(),
      );
      for (const pedidoId of pedidos) {
        expect(await viasDoPedido(pedidoId)).toBe(1);
        expect((await unicoTrabalho(pedidoId)).status).toBe("PRINTED");
      }

      // Rodada de consultas simultâneas depois: não sobra nada para ninguém.
      const sobras = await Promise.all([
        caixa.consultar(),
        cozinha.consultar(),
        caixa.consultar(),
        cozinha.consultar(),
      ]);
      expect(sobras.flat()).toEqual([]);
      expect(impressora).toHaveLength(4);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-625 confirmação perdida com o prazo vencido: o reenvio traz o mesmo trabalho, o agente o reconhece, e a folha sai uma vez",
    async () => {
      const loja = await lojaComAutomatico("Sorveteria da Praça");
      const impressora: Folha[] = [];
      const caixa = await agente(loja, "PC do caixa", impressora);
      const pedidoId = await pedidoDoCliente(loja);
      const PRAZO_MS = 2_500;

      // Imprime, e a confirmação se perde na rede.
      const [primeira] = await caixa.consultar({
        perderConfirmacao: true,
        prazoDePosseMs: PRAZO_MS,
      });
      if (primeira === undefined)
        throw new Error("o trabalho não foi entregue");
      expect(impressora).toHaveLength(1);
      expect((await unicoTrabalho(pedidoId)).status).toBe("LEASED");

      // Dentro do prazo, ninguém recebe o trabalho de novo.
      expect(await caixa.consultar({ prazoDePosseMs: PRAZO_MS })).toEqual([]);

      // O prazo vence de verdade, e o servidor tenta novamente.
      await esperar(PRAZO_MS + 300);
      const [reenvio] = await caixa.consultar({ prazoDePosseMs: PRAZO_MS });
      if (reenvio === undefined)
        throw new Error("o trabalho não foi reenviado");

      // Mesmo identificador, mesmo cupom, mesma via: o diário reconhece, e
      // não sai outra folha.
      expect(reenvio.id).toBe(primeira.id);
      expect(reenvio.cupom).toEqual(primeira.cupom);
      expect(reenvio.tentativa).toBe(2);
      expect(impressora).toHaveLength(1);

      const confirmado = await unicoTrabalho(pedidoId);
      expect(confirmado.status).toBe("PRINTED");
      expect(confirmado.attempt).toBe(2);
      // O reenvio não somou via.
      expect(await viasDoPedido(pedidoId)).toBe(1);

      // A confirmação repetida responde o mesmo e não reescreve o instante.
      expect(await caixa.confirmar(primeira.id)).toEqual({
        id: primeira.id,
        estado: "PRINTED",
      });
      expect((await unicoTrabalho(pedidoId)).printed_at).toEqual(
        confirmado.printed_at,
      );
      expect(await caixa.consultar()).toEqual([]);
      expect(impressora).toHaveLength(1);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-625 o agente que cai sem confirmar não perde o cupom: outro agente o recebe quando o prazo vence",
    async () => {
      const loja = await lojaComAutomatico("Hamburgueria do Cais");
      const impressora: Folha[] = [];
      const caido = await agente(loja, "PC que travou", impressora);
      const reserva = await agente(loja, "PC reserva", impressora);
      const pedidoId = await pedidoDoCliente(loja);

      // Pega o trabalho e cai antes de imprimir: nada no papel, nada confirmado.
      const [pego] = await caido.reivindicar({ prazoDePosseMs: 2_000 });
      if (pego === undefined) throw new Error("o trabalho não foi entregue");
      expect(await reserva.reivindicar()).toEqual([]);

      await esperar(2_300);
      const [assumido] = await reserva.consultar();
      expect(assumido?.id).toBe(pego.id);
      expect(assumido?.cupom).toEqual(pego.cupom);
      expect(impressora.map((f) => f.agente)).toEqual(["PC reserva"]);
      expect((await unicoTrabalho(pedidoId)).agent_id).toBe(reserva.id);
      expect(await viasDoPedido(pedidoId)).toBe(1);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-621 o cupom que o agente imprime é o mesmo do clique, e a via é somada uma vez por impressão",
    async () => {
      const loja = await lojaComAutomatico("Açaí da Esquina");
      const caixa = await agente(loja, "PC do caixa");
      const pedidoId = await pedidoDoCliente(loja);

      const [pelaFila] = await caixa.consultar();
      if (pelaFila === undefined)
        throw new Error("o trabalho não foi entregue");
      expect(pelaFila.cupom.via).toBe(1);
      expect(await viasDoPedido(pedidoId)).toBe(1);

      // O papel caiu no chão: o dono reimprime por clique. A 2ª via sai
      // marcada, e o resto é exatamente o que o agente imprimiu.
      const peloClique = await imprimirPorClique(loja, pedidoId);
      expect(peloClique.via).toBe(2);
      expect(JSON.stringify(peloClique.blocos)).toContain("REIMPRESSÃO");
      expect(conteudoDoCupom(peloClique)).toEqual(
        conteudoDoCupom(pelaFila.cupom),
      );
      expect(await viasDoPedido(pedidoId)).toBe(2);
    },
    ESPERA_LONGA,
  );
});

// ---------------------------------------------------------------------------
// P-003 — o agente só alcança a fila da loja dele
// ---------------------------------------------------------------------------

describe("o agente fica na loja dele", () => {
  it(
    "@principle:P-003 agente de uma loja não reivindica, não confirma e não vê a fila de outra; agente revogado não faz nada",
    async () => {
      const lojaA = await lojaComAutomatico("Loja A da Fila");
      const lojaB = await lojaComAutomatico("Loja B da Fila");
      const agenteA = await agente(lojaA, "Caixa A");
      const agenteB = await agente(lojaB, "Caixa B");
      const pedidoDeB = await pedidoDoCliente(lojaB);

      // O agente A, na loja dele, não enxerga o trabalho de B.
      expect(await agenteA.reivindicar()).toEqual([]);
      expect((await unicoTrabalho(pedidoDeB)).status).toBe("QUEUED");

      // E declarar a loja B no contexto não ajuda: o agente não é de lá.
      await expect(
        agenteA.noPapel(
          () =>
            reivindicarTrabalhos(agenteA.id, normalizarConfiguracaoDeImpressao),
          lojaB.id,
        ),
      ).rejects.toMatchObject({ codigo: "nao_autenticado" });
      expect((await unicoTrabalho(pedidoDeB)).status).toBe("QUEUED");

      const [deB] = await agenteB.reivindicar();
      if (deB === undefined)
        throw new Error("o trabalho de B não foi entregue");
      await expect(agenteA.confirmar(deB.id)).rejects.toBeInstanceOf(
        ErroDeDominio,
      );
      expect((await unicoTrabalho(pedidoDeB)).status).toBe("LEASED");

      // Revogado no painel, o agente B para na hora.
      await migrador.query(
        `UPDATE app.print_agents SET revoked_at = now() WHERE id = $1`,
        [agenteB.id],
      );
      await expect(agenteB.confirmar(deB.id)).rejects.toMatchObject({
        codigo: "nao_autenticado",
      });
      await expect(agenteB.reivindicar()).rejects.toMatchObject({
        codigo: "nao_autenticado",
      });
    },
    ESPERA_LONGA,
  );
});
