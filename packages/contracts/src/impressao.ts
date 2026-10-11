/**
 * Contrato da impressão automática (US-605: AC-622..AC-626).
 *
 * É o que trafega entre a API e o agente de impressão instalado na loja
 * (T-608/T-609), e entre a API e o painel do dono (estado do agente e cupons
 * pendentes). O agente é Node/TypeScript dentro do monorepo e lê ESTE arquivo:
 * não existe uma segunda descrição do formato para divergir desta.
 *
 * O cupom que viaja dentro do trabalho é o CUPOM SEMÂNTICO, versão 1, descrito
 * no topo de `packages/core/src/cupom-blocos.ts`. O esquema daqui o descreve
 * para quem só enxerga o contrato (o documento publicado, o aplicativo
 * nativo); quem imprime ainda passa o cupom por `lerCupomImpresso`, que recusa
 * versão desconhecida — imprimir errado é pior que não imprimir.
 */
import { z } from "zod";

// ── O cupom semântico, versão 1 ─────────────────────────────────────────────

const esquemaDoTamanhoDoTexto = z.enum(["normal", "duplo"]);
const esquemaDoRecuo = z.number().int().nonnegative();

/** Um bloco do cupom: o vocabulário inteiro do contrato versão 1. */
export const esquemaDoBlocoDoCupom = z.discriminatedUnion("tipo", [
  z.strictObject({
    tipo: z.literal("texto"),
    texto: z.string(),
    alinhamento: z.enum(["esquerda", "centro", "direita"]).optional(),
    negrito: z.boolean().optional(),
    tamanho: esquemaDoTamanhoDoTexto.optional(),
    recuo: esquemaDoRecuo.optional(),
  }),
  z.strictObject({
    tipo: z.literal("par"),
    esquerda: z.string(),
    direita: z.string(),
    negrito: z.boolean().optional(),
    tamanho: esquemaDoTamanhoDoTexto.optional(),
    recuo: esquemaDoRecuo.optional(),
  }),
  z.strictObject({
    tipo: z.literal("separador"),
    caractere: z.enum(["-", "="]),
  }),
  z.strictObject({
    tipo: z.literal("espaco"),
    linhas: z.number().int().min(1),
  }),
  z.strictObject({ tipo: z.literal("corte") }),
]);

/** O cupom semântico: o que se guarda na fila e o que o agente compila. */
export const esquemaDoCupomImpresso = z.strictObject({
  versao: z.literal(1),
  papel: z.strictObject({
    larguraMm: z.union([z.literal(58), z.literal(80)]),
    colunas: z.number().int().min(8),
  }),
  /** 1 é a original; 2, 3… saem marcadas como reimpressão (AC-621). */
  via: z.number().int().min(1),
  blocos: z.array(esquemaDoBlocoDoCupom),
});

// ── O agente: trabalho entregue, confirmação e falha ────────────────────────

/** Os estados de um trabalho da fila (migração 0034). */
export const ESTADOS_DO_TRABALHO_DE_IMPRESSAO = [
  "QUEUED",
  "LEASED",
  "PRINTED",
  "FAILED",
  "DEAD",
  "CANCELED",
] as const;

export const esquemaDoEstadoDoTrabalho = z.enum(
  ESTADOS_DO_TRABALHO_DE_IMPRESSAO,
);

/**
 * Um trabalho entregue ao agente.
 *
 * O `id` é o que torna a impressão única (AC-625): o reenvio depois de uma
 * confirmação perdida chega com o MESMO identificador e o MESMO cupom, e o
 * agente que já o imprimiu só confirma de novo.
 */
export const esquemaDoTrabalhoDeImpressao = z.strictObject({
  id: z.uuid(),
  pedido: z.strictObject({ id: z.uuid(), codigo: z.string() }),
  /** Quantas vezes este trabalho já foi entregue, contando esta. */
  tentativa: z.number().int().min(1),
  /** Até quando a posse vale. Depois disso o trabalho pode ser reenviado. */
  prazoAte: z.iso.datetime({ offset: true }),
  cupom: esquemaDoCupomImpresso,
});

/** Resposta da consulta do agente: os trabalhos que ficaram com ele. */
export const esquemaDosTrabalhosEntregues = z.strictObject({
  trabalhos: z.array(esquemaDoTrabalhoDeImpressao),
});

/**
 * O que a API responde à confirmação de impressão. Confirmar é idempotente:
 * confirmar de novo o que já foi impresso responde o mesmo estado, sem erro.
 * `CANCELED` quer dizer que o dono imprimiu por clique antes — o agente trata
 * como resolvido.
 */
export const esquemaDaConfirmacaoDeImpressao = z.strictObject({
  id: z.uuid(),
  estado: z.enum(["PRINTED", "CANCELED"]),
});

/** O agente conta por que não imprimiu (papel acabou, impressora fora). */
export const esquemaDaFalhaDeImpressao = z.strictObject({
  motivo: z.string().trim().min(1).max(500),
});

/**
 * O que a API responde à falha: o trabalho volta para a fila com espera
 * crescente (`FAILED`, com a próxima tentativa) ou desiste no limite (`DEAD`,
 * e o dono imprime por clique). Falha de trabalho que já saiu de outro jeito
 * responde o estado em que ele ficou.
 */
export const esquemaDaFalhaRegistrada = z.strictObject({
  id: z.uuid(),
  estado: esquemaDoEstadoDoTrabalho,
  proximaTentativaEm: z.iso.datetime({ offset: true }).nullable(),
});

// ── Pareamento ──────────────────────────────────────────────────────────────

/** O código curto que o dono gera no painel, com validade curta. */
export const esquemaDoCodigoDePareamento = z.strictObject({
  codigo: z.string().regex(/^\d{6}$/),
  expiraEm: z.iso.datetime({ offset: true }),
});

/** O que o agente manda para se parear: a loja, o código e o nome da máquina. */
export const esquemaDoPedidoDePareamento = z.strictObject({
  apelido: z.string().trim().min(1).max(63),
  codigo: z.string().regex(/^\d{6}$/),
  nome: z.string().trim().min(1).max(60),
});

/**
 * A resposta do pareamento. A credencial chega UMA vez, aqui, e o servidor só
 * guarda o resumo dela: perdeu, pareia de novo.
 */
export const esquemaDoAgentePareado = z.strictObject({
  credencial: z.string().min(32),
  agente: z.strictObject({ id: z.uuid(), nome: z.string() }),
  loja: z.strictObject({ apelido: z.string(), nome: z.string() }),
});

// ── O painel: estado do agente e cupons pendentes ───────────────────────────

/**
 * O estado da impressão automática que o painel mostra (AC-622, AC-624).
 *
 * - `desligada`: a loja imprime por clique (o padrão);
 * - `sem_agente`: o automático está ligado e nenhum agente foi pareado;
 * - `conectada`: o agente falou com o servidor há pouco;
 * - `desconectada`: o agente sumiu — o painel avisa, e o cupom espera na fila.
 */
export const esquemaDoEstadoDaImpressaoAutomatica = z.strictObject({
  automatico: z.boolean(),
  situacao: z.enum(["desligada", "sem_agente", "conectada", "desconectada"]),
  ultimoContatoEm: z.iso.datetime({ offset: true }).nullable(),
  pendentes: z.number().int().nonnegative(),
});

/** Um cupom que ainda não saiu pelo agente, disponível para o clique (AC-626). */
export const esquemaDoTrabalhoPendente = z.strictObject({
  id: z.uuid(),
  pedido: z.strictObject({ id: z.uuid(), codigo: z.string() }),
  estado: z.enum(["QUEUED", "LEASED", "FAILED", "DEAD"]),
  tentativas: z.number().int().nonnegative(),
  ultimoErro: z.string().nullable(),
  criadoEm: z.iso.datetime({ offset: true }),
});

export const esquemaDosTrabalhosPendentes = z.strictObject({
  trabalhos: z.array(esquemaDoTrabalhoPendente),
});

export type TrabalhoDeImpressaoNoContrato = z.infer<
  typeof esquemaDoTrabalhoDeImpressao
>;
export type TrabalhosEntreguesNoContrato = z.infer<
  typeof esquemaDosTrabalhosEntregues
>;
export type ConfirmacaoDeImpressaoNoContrato = z.infer<
  typeof esquemaDaConfirmacaoDeImpressao
>;
export type FalhaRegistradaNoContrato = z.infer<
  typeof esquemaDaFalhaRegistrada
>;
export type CodigoDePareamentoNoContrato = z.infer<
  typeof esquemaDoCodigoDePareamento
>;
export type PedidoDePareamentoNoContrato = z.infer<
  typeof esquemaDoPedidoDePareamento
>;
export type AgentePareadoNoContrato = z.infer<typeof esquemaDoAgentePareado>;
export type EstadoDaImpressaoAutomaticaNoContrato = z.infer<
  typeof esquemaDoEstadoDaImpressaoAutomatica
>;
export type TrabalhoPendenteNoContrato = z.infer<
  typeof esquemaDoTrabalhoPendente
>;
