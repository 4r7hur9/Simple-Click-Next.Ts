/**
 * Horário de funcionamento da loja, lido do banco (AC-401, AC-909 a AC-912).
 *
 * Este módulo faz UMA coisa: montar, a partir das linhas do banco, o objeto que
 * o cálculo puro de `packages/core` sabe interpretar. Ele não decide se a loja
 * está aberta — quem decide é o cálculo, que não conhece banco e por isso pode
 * ser testado em qualquer data, em qualquer fuso, na virada da meia-noite.
 *
 * A CONVERSÃO DE HORA merece atenção. O banco guarda `time`, que é hora sem
 * data; o cliente do Prisma a entrega como `Date` fixada em 1º de janeiro de
 * 1970, UTC. Ler a hora local dessa data daria um valor deslocado pelo fuso da
 * máquina que roda a API — e a loja abriria três horas mais cedo em produção do
 * que na máquina de quem programou.
 */
import type { ExcecaoDatada, HorarioDaLoja } from "@simpleclick/core";

import { transacaoAtual } from "../../core/db.ts";

/** Quantos dias de exceção interessam à vitrine. */
const JANELA_DE_EXCECOES_EM_DIAS = 30;

/** Lê "18:30" de um `time` do banco, sem passar pelo fuso da máquina. */
function horaDoBanco(valor: Date): string {
  const horas = String(valor.getUTCHours()).padStart(2, "0");
  const minutos = String(valor.getUTCMinutes()).padStart(2, "0");
  return `${horas}:${minutos}`;
}

/** Lê "2026-12-25" de uma `date` do banco. */
function dataDoBanco(valor: Date): string {
  return valor.toISOString().slice(0, 10);
}

/**
 * Monta o horário da loja do contexto.
 *
 * As exceções são buscadas numa JANELA, e não todas: uma loja com cinco anos de
 * feriados cadastrados traria centenas de linhas para responder uma pergunta
 * sobre hoje. Trinta dias cobrem a próxima abertura, que é o mais longe que o
 * cálculo olha.
 */
export async function horarioDaLoja(agora: Date): Promise<HorarioDaLoja> {
  const tx = transacaoAtual();

  const loja = await tx.store.findFirst({
    select: {
      timezone: true,
      openState: true,
      temporarilyClosedUntil: true,
    },
  });

  if (loja === null) {
    // Sem loja no contexto não há horário. Devolver algo "aberto" seria pior
    // que devolver fechado: deixaria pedir numa loja que não se sabe qual é.
    return { estado: "PERMANENTLY_CLOSED", fusoHorario: "America/Sao_Paulo" };
  }

  const linhas = await tx.storeHour.findMany({
    where: { isClosed: false },
    orderBy: [{ weekday: "asc" }, { sortOrder: "asc" }],
    select: { weekday: true, opensAt: true, closesAt: true },
  });

  const faixas: Record<number, { abre: string; fecha: string }[]> = {};
  for (const linha of linhas) {
    const doDia = faixas[linha.weekday] ?? [];
    doDia.push({
      abre: horaDoBanco(linha.opensAt),
      fecha: horaDoBanco(linha.closesAt),
    });
    faixas[linha.weekday] = doDia;
  }

  const ate = new Date(agora);
  ate.setUTCDate(ate.getUTCDate() + JANELA_DE_EXCECOES_EM_DIAS);
  const inicio = new Date(agora);
  // Um dia para trás cobre a loja a oeste, onde a data local ainda é ontem.
  inicio.setUTCDate(inicio.getUTCDate() - 1);

  const excecoesDoBanco = await tx.storeHourException.findMany({
    where: { onDate: { gte: inicio, lte: ate } },
    orderBy: { onDate: "asc" },
    select: {
      onDate: true,
      isClosed: true,
      opensAt: true,
      closesAt: true,
      reason: true,
    },
  });

  const excecoes: ExcecaoDatada[] = excecoesDoBanco.map((excecao) => ({
    data: dataDoBanco(excecao.onDate),
    fechada: excecao.isClosed,
    ...(excecao.opensAt ? { abre: horaDoBanco(excecao.opensAt) } : {}),
    ...(excecao.closesAt ? { fecha: horaDoBanco(excecao.closesAt) } : {}),
    ...(excecao.reason ? { motivo: excecao.reason } : {}),
  }));

  return {
    estado: loja.openState as HorarioDaLoja["estado"],
    fusoHorario: loja.timezone,
    fechadaAte: loja.temporarilyClosedUntil,
    faixas,
    excecoes,
  };
}
