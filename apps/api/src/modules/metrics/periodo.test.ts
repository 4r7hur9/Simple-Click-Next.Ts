/**
 * Prova da regra de período (T-800): o corte é no fuso da loja, os atalhos
 * terminam hoje, o intervalo a dedo cobre as pontas inteiras e o intervalo
 * errado é recusado com explicação.
 */
import { describe, expect, it } from "vitest";

import {
  diaNoFuso,
  diasDoPeriodo,
  diasEntre,
  fusoOuPadrao,
  inicioDoDiaNoFuso,
  lerDataCivil,
  LIMITE_DE_DIAS,
  periodoAnterior,
  relogioNoFuso,
  resolverPeriodo,
  somarDias,
} from "./periodo.ts";

const SAO_PAULO = "America/Sao_Paulo";
const MANAUS = "America/Manaus";

describe("o dia é o da loja, não o do servidor (AC-800)", () => {
  it("@spec:AC-800 às 23:30 de São Paulo ainda é o mesmo dia, embora em UTC já seja o seguinte", () => {
    // 2026-09-27 23:30 em São Paulo (UTC-3) é 2026-09-28 02:30 em UTC.
    const instante = new Date("2026-09-28T02:30:00.000Z");
    expect(diaNoFuso(instante, SAO_PAULO)).toBe("2026-09-27");
    expect(diaNoFuso(instante, "UTC")).toBe("2026-09-28");
    expect(relogioNoFuso(instante, SAO_PAULO)).toMatchObject({
      hora: 23,
      minuto: 30,
    });
  });

  it("@spec:AC-800 'hoje' começa à meia-noite da loja, e a loja de Manaus começa uma hora depois", () => {
    const agora = new Date("2026-09-28T02:30:00.000Z");
    const sp = resolverPeriodo({ atalho: "hoje" }, agora, SAO_PAULO);
    const mao = resolverPeriodo({ atalho: "hoje" }, agora, MANAUS);
    if (!sp.ok || !mao.ok) throw new Error("período recusado");

    expect(sp.periodo.de).toBe("2026-09-27");
    expect(sp.periodo.inicio.toISOString()).toBe("2026-09-27T03:00:00.000Z");
    expect(sp.periodo.fim.toISOString()).toBe("2026-09-28T03:00:00.000Z");
    // Manaus é UTC-4: a meia-noite dela é 04:00 UTC.
    expect(mao.periodo.inicio.toISOString()).toBe("2026-09-27T04:00:00.000Z");
    expect(sp.periodo.dias).toBe(1);
  });

  it("fuso desconhecido cai no padrão de Brasília (ASM-800)", () => {
    expect(fusoOuPadrao("Marte/Olympus")).toBe(SAO_PAULO);
    expect(fusoOuPadrao("")).toBe(SAO_PAULO);
    expect(fusoOuPadrao(null)).toBe(SAO_PAULO);
    expect(fusoOuPadrao(MANAUS)).toBe(MANAUS);
  });

  it("a virada de horário de verão é respeitada onde ele existe", () => {
    // Nova York entra no horário de verão em 2026-03-08: o dia tem 23 horas.
    const inicio = inicioDoDiaNoFuso("2026-03-08", "America/New_York");
    const seguinte = inicioDoDiaNoFuso("2026-03-09", "America/New_York");
    expect(inicio.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(seguinte.toISOString()).toBe("2026-03-09T04:00:00.000Z");
  });
});

describe("os atalhos terminam hoje e cobrem exatamente o que dizem (AC-803)", () => {
  const agora = new Date("2026-09-27T15:00:00.000Z");

  it("@spec:AC-803 três dias são hoje e os dois anteriores; sete dias, hoje e os seis anteriores", () => {
    const tres = resolverPeriodo({ atalho: "3d" }, agora, SAO_PAULO);
    const sete = resolverPeriodo({ atalho: "7d" }, agora, SAO_PAULO);
    if (!tres.ok || !sete.ok) throw new Error("período recusado");

    expect(tres.periodo).toMatchObject({
      de: "2026-09-25",
      ate: "2026-09-27",
      dias: 3,
    });
    expect(sete.periodo).toMatchObject({
      de: "2026-09-21",
      ate: "2026-09-27",
      dias: 7,
    });
    expect(diasDoPeriodo(sete.periodo)).toEqual([
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
      "2026-09-25",
      "2026-09-26",
      "2026-09-27",
    ]);
  });

  it("o período anterior equivalente tem o mesmo tamanho e termina na véspera (AC-802)", () => {
    const sete = resolverPeriodo({ atalho: "7d" }, agora, SAO_PAULO);
    if (!sete.ok) throw new Error("período recusado");
    const anterior = periodoAnterior(sete.periodo);
    expect(anterior).toMatchObject({
      de: "2026-09-14",
      ate: "2026-09-20",
      dias: 7,
    });
    expect(anterior.fim.getTime()).toBe(sete.periodo.inicio.getTime());

    const hoje = resolverPeriodo({ atalho: "hoje" }, agora, SAO_PAULO);
    if (!hoje.ok) throw new Error("período recusado");
    expect(periodoAnterior(hoje.periodo)).toMatchObject({
      de: "2026-09-26",
      ate: "2026-09-26",
    });
  });

  it("@spec:AC-802 o período em curso compara com o mesmo pedaço do anterior: hoje até 14h32 contra ontem até 14h32", () => {
    // 14h32 em São Paulo (UTC-3).
    const meioDoDia = new Date("2026-09-27T17:32:00.000Z");
    const hoje = resolverPeriodo({ atalho: "hoje" }, meioDoDia, SAO_PAULO);
    if (!hoje.ok) throw new Error("período recusado");

    const ontem = periodoAnterior(hoje.periodo, meioDoDia);
    expect(ontem).toMatchObject({
      de: "2026-09-26",
      ate: "2026-09-26",
      parcial: true,
    });
    expect(ontem.inicio.toISOString()).toBe("2026-09-26T03:00:00.000Z");
    expect(ontem.fim.toISOString()).toBe("2026-09-26T17:32:00.000Z");

    // Sete dias terminando hoje: os sete anteriores, cortados às 14h32 do
    // último deles.
    const sete = resolverPeriodo({ atalho: "7d" }, meioDoDia, SAO_PAULO);
    if (!sete.ok) throw new Error("período recusado");
    const anteriores = periodoAnterior(sete.periodo, meioDoDia);
    expect(anteriores).toMatchObject({
      de: "2026-09-14",
      ate: "2026-09-20",
      parcial: true,
    });
    expect(anteriores.fim.toISOString()).toBe("2026-09-20T17:32:00.000Z");

    // Período já encerrado compara com o anterior inteiro.
    const passado = resolverPeriodo(
      { atalho: "personalizado", de: "2026-09-01", ate: "2026-09-15" },
      meioDoDia,
      SAO_PAULO,
    );
    if (!passado.ok) throw new Error("período recusado");
    const antesDoPassado = periodoAnterior(passado.periodo, meioDoDia);
    expect(antesDoPassado.parcial).toBe(false);
    expect(antesDoPassado.fim.getTime()).toBe(passado.periodo.inicio.getTime());
  });
});

describe("o intervalo a dedo cobre as pontas por inteiro (AC-804)", () => {
  it("@spec:AC-804 de 1º a 15 vai da meia-noite do dia 1º ao primeiro instante do dia 16, no fuso da loja", () => {
    const resultado = resolverPeriodo(
      { atalho: "personalizado", de: "2026-08-01", ate: "2026-08-15" },
      new Date("2026-09-27T15:00:00.000Z"),
      SAO_PAULO,
    );
    if (!resultado.ok) throw new Error(resultado.explicacao);

    expect(resultado.periodo.dias).toBe(15);
    expect(resultado.periodo.inicio.toISOString()).toBe(
      "2026-08-01T03:00:00.000Z",
    );
    // Exclusivo: o pedido das 23:59:59.999 do dia 15 está DENTRO.
    expect(resultado.periodo.fim.toISOString()).toBe(
      "2026-08-16T03:00:00.000Z",
    );
    const ultimoInstante = new Date(resultado.periodo.fim.getTime() - 1);
    expect(diaNoFuso(ultimoInstante, SAO_PAULO)).toBe("2026-08-15");
  });

  it("um dia só é um intervalo válido", () => {
    const resultado = resolverPeriodo(
      { atalho: "personalizado", de: "2026-08-01", ate: "2026-08-01" },
      new Date(),
      SAO_PAULO,
    );
    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.periodo.dias).toBe(1);
  });
});

describe("intervalo inválido é recusado com explicação (AC-805)", () => {
  const agora = new Date("2026-09-27T15:00:00.000Z");

  it("@spec:AC-805 data final anterior à inicial é recusada, e o limite de um ano também", () => {
    const invertido = resolverPeriodo(
      { atalho: "personalizado", de: "2026-08-15", ate: "2026-08-01" },
      agora,
      SAO_PAULO,
    );
    expect(invertido).toEqual({
      ok: false,
      explicacao: "A data final precisa ser igual ou posterior à data inicial.",
    });

    const longo = resolverPeriodo(
      { atalho: "personalizado", de: "2025-01-01", ate: "2026-09-27" },
      agora,
      SAO_PAULO,
    );
    expect(longo.ok).toBe(false);
    if (!longo.ok) expect(longo.explicacao).toContain(`${LIMITE_DE_DIAS}`);

    const noLimite = resolverPeriodo(
      { atalho: "personalizado", de: "2025-09-27", ate: "2026-09-27" },
      agora,
      SAO_PAULO,
    );
    expect(noLimite.ok).toBe(true);
  });

  it("@spec:AC-805 sem as duas datas, ou com data que não existe, a recusa diz o que faltou", () => {
    expect(
      resolverPeriodo(
        { atalho: "personalizado", de: "2026-08-01" },
        agora,
        SAO_PAULO,
      ),
    ).toMatchObject({ ok: false, explicacao: expect.stringContaining("data") });
    expect(
      resolverPeriodo(
        { atalho: "personalizado", de: "2026-02-31", ate: "2026-03-01" },
        agora,
        SAO_PAULO,
      ),
    ).toMatchObject({ ok: false });
    expect(lerDataCivil("2026-02-31")).toBeNull();
    expect(lerDataCivil("27/09/2026")).toBeNull();
    expect(lerDataCivil("2026-09-27")).toEqual({ ano: 2026, mes: 9, dia: 27 });
  });
});

describe("aritmética de datas civis", () => {
  it("soma e conta dias atravessando mês e ano", () => {
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
    expect(somarDias("2024-03-01", -1)).toBe("2024-02-29");
    expect(diasEntre("2026-01-01", "2026-12-31")).toBe(365);
    expect(diasEntre("2026-09-27", "2026-09-27")).toBe(1);
  });
});
