/**
 * Resolução da loja pelo endereço público (AC-400, AC-401, AC-402).
 *
 * O PROBLEMA QUE ESTA PEÇA RESOLVE é de ordem: para saber QUAL loja é, ainda
 * não existe contexto de loja — e sem contexto, o isolamento por linha nega
 * tudo, corretamente. A saída é uma função dedicada no banco
 * (`app.resolve_store`), que atravessa lojas de propósito e devolve um punhado
 * de campos escolhidos a dedo: identificador, apelido, situação, ramo, fuso.
 *
 * Depois de saber quem é a loja, a borda abre uma transação DECLARANDO-A, e o
 * resto é lido pelo caminho normal, sob a política pública — que já esconde
 * loja suspensa e excluída. São duas travas em série, e não uma: mesmo que
 * alguém mude a função de resolução, a política continua recusando a loja que
 * não está ativa.
 *
 * LOJA INEXISTENTE E LOJA SUSPENSA RESPONDEM IGUAL (AC-402). Distinguir as duas
 * contaria a quem perguntasse que aquele endereço já existiu e foi suspenso —
 * informação que não é de ninguém que esteja apenas navegando, e que serve para
 * mapear concorrentes.
 */
import {
  situacaoDaLoja,
  type HorarioDaLoja,
  type SituacaoDeAbertura,
} from "@simpleclick/core";

import { lojaParaVitrine, type LojaPublica } from "./dto-publico.ts";

export type { LojaPublica };

import { transacaoAtual, type TransacaoDoBanco } from "../../core/db.ts";

/** O que a função de resolução do banco devolve. */
interface LinhaResolvida {
  readonly id: string;
  readonly slug: string;
  readonly status: string;
  readonly vertical_code: string;
  readonly timezone: string;
  readonly catalog_version: bigint;
  readonly canonical_host: string | null;
  readonly redirect_needed: boolean;
}

/** Por onde a pessoa chegou: domínio próprio ou apelido no endereço. */
export interface ChegadaNaLoja {
  readonly host?: string | null;
  readonly apelido?: string | null;
}

/** A loja existe e está no ar. Ainda sem os dados da vitrine. */
export interface LojaIdentificada {
  readonly encontrada: true;
  readonly id: string;
  readonly apelido: string;
  /** Endereço canônico, quando o que foi usado não é o oficial. */
  readonly redirecionarPara: string | null;
  /**
   * A versão do catálogo naquele instante.
   *
   * VEM DAQUI, e não de uma segunda consulta: a função de resolução já a
   * devolve, e pedi-la de novo custaria mais uma ida ao banco para ler um
   * número que já está na mão.
   *
   * É TEXTO, e não `bigint`. A coluna é `bigint` no banco, e a tentação é
   * carregar o tipo do banco para cima — mas este objeto acaba em JSON, e
   * `JSON.stringify` RECUSA `bigint` com erro em tempo de execução. Um teste de
   * vazamento que serializa a resposta inteira pegou isso na primeira rodada;
   * em produção teria sido a rota quebrando com um erro que aponta para o
   * serializador, longe daqui. O `bigint` fica onde ele faz sentido: no banco.
   */
  readonly versaoDoCatalogo: string;
}

/** A loja não está disponível — e o motivo não é dito (AC-402). */
export interface LojaIndisponivel {
  readonly encontrada: false;
  readonly explicacao: string;
}

export type IdentificacaoDaLoja = LojaIdentificada | LojaIndisponivel;

/**
 * A mesma resposta para inexistente e suspensa.
 *
 * Uma constante, e não duas frases parecidas: duas frases divergem com o tempo,
 * e a diferença entre elas volta a contar o que esta função existe para não
 * contar.
 */
const INDISPONIVEL: LojaIndisponivel = {
  encontrada: false,
  explicacao: "Esta loja não está disponível.",
};

/** Pergunta ao banco qual loja atende aquele endereço. */
async function resolverNoBanco(
  tx: TransacaoDoBanco,
  chegada: ChegadaNaLoja,
): Promise<LinhaResolvida | null> {
  const linhas = await tx.$queryRaw<
    LinhaResolvida[]
  >`SELECT * FROM app.resolve_store(${chegada.host ?? null}, ${chegada.apelido ?? null})`;

  return linhas[0] ?? null;
}

/**
 * PASSO 1 — descobre QUAL loja atende aquele endereço.
 *
 * Roda sem contexto de loja, porque nesse momento ele ainda não existe. Quem
 * atravessa lojas é a função dedicada do banco, que devolve um punhado de
 * campos escolhidos a dedo — e nada da configuração.
 */
export async function identificarLoja(
  chegada: ChegadaNaLoja,
): Promise<IdentificacaoDaLoja> {
  if (!chegada.host && !chegada.apelido) return INDISPONIVEL;

  const linha = await resolverNoBanco(transacaoAtual(), chegada);

  // Inexistente e suspensa saem por aqui, com a mesma resposta.
  if (linha === null || linha.status !== "ACTIVE") return INDISPONIVEL;

  return {
    encontrada: true,
    id: linha.id,
    apelido: linha.slug,
    redirecionarPara: linha.redirect_needed ? linha.canonical_host : null,
    versaoDoCatalogo: linha.catalog_version.toString(),
  };
}

/**
 * PASSO 2 — lê o que a vitrine mostra, já COM a loja no contexto.
 *
 * POR QUE SÃO DOIS PASSOS, e não uma função só. O contexto da loja é definido
 * UMA VEZ, no início da transação, e não muda mais — é essa regra que impede
 * uma requisição de escorregar de uma loja para outra no meio do caminho. Uma
 * função única precisaria trocar o contexto depois de já ter aberto a
 * transação, furando exatamente a garantia que sustenta o isolamento.
 *
 * Então a borda faz o passo 1 sem contexto, descobre a loja, abre a transação
 * declarando-a, e chama o passo 2. A política pública é a segunda trava: ela
 * recusa loja que não esteja ativa mesmo que a resolução tenha deixado passar.
 */
export interface VitrineDaLoja {
  readonly publica: LojaPublica;
  /** Se está aberta agora, e quando abre — no fuso da loja (AC-401). */
  readonly abertura: SituacaoDeAbertura;
}

export async function lojaDaVitrine(
  agora: Date,
  horario: HorarioDaLoja,
): Promise<VitrineDaLoja | null> {
  const tx = transacaoAtual();

  const loja = await tx.store.findFirst({
    select: {
      slug: true,
      name: true,
      verticalCode: true,
      // O VOCABULÁRIO DO RAMO vem junto, e não numa segunda consulta: ele é
      // usado na mesma tela, e a tabela de presets é de plataforma — a política
      // dela deixa qualquer conexão de execução ler (migração 0003).
      ramo: { select: { labels: true } },
      timezone: true,
      currency: true,
      fulfillmentModes: true,
      street: true,
      number: true,
      complement: true,
      neighborhood: true,
      city: true,
      uf: true,
    },
  });

  if (loja === null) return null;

  // A apresentação vem por FUNÇÃO DEDICADA, e não pela relação (migração 0014).
  // A linha de configuração guarda a chave PIX ao lado das boas-vindas; ler a
  // linha inteira tornaria a chave alcançável pelo caminho público, bastando
  // alguém escrever `select: { payment: true }` num caso de uso futuro.
  const configuracao = await tx.$queryRaw<
    { landing: unknown; theme: unknown }[]
  >`SELECT * FROM app.storefront_settings()`;

  // O HORÁRIO CHEGA PRONTO, e não é lido aqui. A tabela de fronteiras não
  // autoriza um módulo a importar outro: quem sabe ler o horário é o módulo da
  // loja, quem sabe montar a vitrine é este, e quem junta os dois é a borda —
  // que é a única camada que enxerga os dois lados. Sem essa regra, os módulos
  // viram uma teia em que tudo importa tudo.
  //
  // O instante também chega por parâmetro: ler o relógio aqui dentro faria esta
  // função ser impossível de provar na virada da meia-noite, que é justamente
  // quando ela erra.
  const abertura = situacaoDaLoja(horario, agora);

  return { publica: lojaParaVitrine(loja, configuracao[0] ?? {}), abertura };
}
