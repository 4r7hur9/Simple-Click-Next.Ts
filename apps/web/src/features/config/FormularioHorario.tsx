"use client";
/**
 * Horário de funcionamento: a grade da semana, o "fechar agora" e as datas
 * especiais (US-902, AC-921).
 *
 * A TELA SÓ ALIMENTA O CÁLCULO. Quem decide se a loja está aberta é a regra de
 * `packages/core` (T-903), no fuso da loja; aqui o dono diz de quando a quando
 * abre, e a vitrine passa a obedecer.
 *
 * OS SETE DIAS VÃO SEMPRE, na ordem de domingo a sábado — inclusive os
 * fechados, com a lista de faixas vazia. É o que faz a recusa da API apontar o
 * campo certo: "semana.2.faixas.0.fecha" é a terça, primeira faixa, sem
 * tradução de índice no meio do caminho (AC-923).
 */
import type { SecaoDeHorario } from "@simpleclick/contracts";

import { atributosDeErro, ErroDoCampo } from "./ErroDoCampo.tsx";
import { comInfo, InfoDoPainel, RotuloComInfo } from "./RotuloComInfo.tsx";
import { useSecao } from "./useSecao.ts";

const DIAS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
] as const;

interface Faixa {
  readonly abre: string;
  readonly fecha: string;
}

interface Excecao {
  readonly data: string;
  readonly fechada: boolean;
  readonly abre: string | null;
  readonly fecha: string | null;
  readonly motivo: string | null;
}

/** O horário como a tela o edita: sete dias, sempre. */
export interface HorarioNaTela {
  readonly dias: readonly (readonly Faixa[])[];
  readonly fechadoAgora: boolean;
  readonly excecoes: readonly Excecao[];
}

const SEM_HORARIO: HorarioNaTela = {
  dias: DIAS.map(() => []),
  fechadoAgora: false,
  excecoes: [],
};

const FAIXA_NOVA: Faixa = { abre: "18:00", fecha: "22:00" };

/** O que a API devolve, espalhado nos sete dias da tela. */
export function horarioDaApi(bruto: unknown): HorarioNaTela {
  const lido = bruto as Partial<SecaoDeHorario> | null;
  const dias: Faixa[][] = DIAS.map(() => []);
  for (const dia of lido?.semana ?? []) {
    if (dia.dia >= 0 && dia.dia <= 6) dias[dia.dia] = [...dia.faixas];
  }
  return {
    dias,
    fechadoAgora: lido?.fechadoAgora === true,
    excecoes: [...(lido?.excecoes ?? [])],
  };
}

/** O corpo que a API espera. */
export function horarioParaApi(horario: HorarioNaTela): SecaoDeHorario {
  return {
    semana: horario.dias.map((faixas, dia) => ({ dia, faixas: [...faixas] })),
    fechadoAgora: horario.fechadoAgora,
    excecoes: horario.excecoes.map((excecao) => ({
      ...excecao,
      abre: excecao.fechada ? null : excecao.abre,
      fecha: excecao.fechada ? null : excecao.fecha,
      motivo: excecao.motivo?.trim() ? excecao.motivo.trim() : null,
    })),
  };
}

const TEXTOS = {
  carregando: "Carregando horário…",
  carregada: "Horário carregado.",
  salva: "Horário salvo. A vitrine já segue a nova grade.",
};

export function FormularioHorario() {
  const secao = useSecao("horario", SEM_HORARIO, horarioDaApi, TEXTOS);
  const { dados, mudar, erros } = secao;
  // O "i" da faixa vai uma vez só, na primeira faixa do primeiro dia aberto:
  // repetido em cada dia, viraria ruído.
  const primeiroDiaAberto = dados.dias.findIndex((faixas) => faixas.length > 0);

  function mudarFaixa(dia: number, indice: number, faixa: Faixa) {
    mudar((anterior) => ({
      ...anterior,
      dias: anterior.dias.map((faixas, d) =>
        d === dia ? faixas.map((f, i) => (i === indice ? faixa : f)) : faixas,
      ),
    }));
  }

  function acrescentarFaixa(dia: number) {
    mudar((anterior) => ({
      ...anterior,
      dias: anterior.dias.map((faixas, d) =>
        d === dia ? [...faixas, FAIXA_NOVA] : faixas,
      ),
    }));
  }

  function removerFaixa(dia: number, indice: number) {
    mudar((anterior) => ({
      ...anterior,
      dias: anterior.dias.map((faixas, d) =>
        d === dia ? faixas.filter((_, i) => i !== indice) : faixas,
      ),
    }));
  }

  function mudarExcecao(indice: number, excecao: Excecao) {
    mudar((anterior) => ({
      ...anterior,
      excecoes: anterior.excecoes.map((e, i) => (i === indice ? excecao : e)),
    }));
  }

  if (secao.fase === "carregando") {
    return (
      <p className="mt-8" role="status">
        {secao.mensagem}
      </p>
    );
  }

  if (secao.fase === "falhou") {
    return (
      <p className="mt-8" role="alert">
        {secao.mensagem}
      </p>
    );
  }

  return (
    <form
      className="mt-8 max-w-3xl space-y-8"
      noValidate
      onSubmit={(evento) => {
        evento.preventDefault();
        void secao.salvar(horarioParaApi(dados));
      }}
    >
      <fieldset className="space-y-3 rounded-2xl border border-[var(--cor-borda)] p-5">
        <legend className="flex items-center gap-1.5 px-2 font-medium">
          Fechar agora
          <InfoDoPainel explicacao="fecharAgora" nome="Fechar agora" />
        </legend>
        <label className="flex items-start gap-3">
          <input
            className="mt-1 h-5 w-5"
            type="checkbox"
            name="fechadoAgora"
            checked={dados.fechadoAgora}
            onChange={(evento) =>
              mudar((anterior) => ({
                ...anterior,
                fechadoAgora: evento.target.checked,
              }))
            }
          />
          <span>
            <span className="font-medium">Parar de receber pedidos agora</span>
            <span className="mt-1 block text-sm text-[var(--cor-tinta-suave)]">
              A vitrine avisa que a loja não está recebendo pedidos. A grade da
              semana continua como está, e ao desligar você volta a receber.
            </span>
          </span>
        </label>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="flex items-center gap-1.5 font-medium">
          Grade da semana
          <InfoDoPainel explicacao="gradeDaSemana" nome="Grade da semana" />
        </legend>
        <p className="text-sm text-[var(--cor-tinta-suave)]">
          Horários no relógio da sua cidade (o fuso da loja). Até 4 faixas por
          dia; o dia sem faixa fica fechado.
        </p>
        <ErroDoCampo campo="semana" erros={erros} />
        {dados.dias.map((faixas, dia) => (
          <div
            key={DIAS[dia]}
            className="rounded-2xl border border-[var(--cor-borda)] p-4"
          >
            <p className="font-medium">
              {DIAS[dia]}
              {faixas.length === 0 ? (
                <span className="ml-2 text-sm font-normal text-[var(--cor-tinta-suave)]">
                  fechado
                </span>
              ) : null}
            </p>
            <ErroDoCampo campo={`semana.${dia}.faixas`} erros={erros} />
            {faixas.map((faixa, indice) => {
              const base = `semana.${dia}.faixas.${indice}`;
              return (
                <div
                  key={`${DIAS[dia]}-${indice}`}
                  className="mt-3 flex flex-wrap items-end gap-3"
                >
                  {dia === primeiroDiaAberto && indice === 0 ? (
                    <div className="block">
                      <RotuloComInfo
                        para={`horario-${dia}-${indice}-abre`}
                        explicacao="faixaDeHorario"
                        nome={`Faixa de horário de ${DIAS[dia] ?? ""}`}
                        className="text-sm"
                      >
                        Abre
                      </RotuloComInfo>
                      <input
                        id={`horario-${dia}-${indice}-abre`}
                        className="sc-campo mt-1 block"
                        type="time"
                        name={`${base}.abre`}
                        value={faixa.abre}
                        onChange={(evento) =>
                          mudarFaixa(dia, indice, {
                            ...faixa,
                            abre: evento.target.value,
                          })
                        }
                        {...comInfo(
                          `horario-${dia}-${indice}-abre`,
                          atributosDeErro(`${base}.abre`, erros),
                        )}
                      />
                    </div>
                  ) : (
                    <label className="block">
                      <span className="text-sm">Abre</span>
                      <input
                        className="sc-campo mt-1 block"
                        type="time"
                        name={`${base}.abre`}
                        value={faixa.abre}
                        onChange={(evento) =>
                          mudarFaixa(dia, indice, {
                            ...faixa,
                            abre: evento.target.value,
                          })
                        }
                        {...atributosDeErro(`${base}.abre`, erros)}
                      />
                    </label>
                  )}
                  <label className="block">
                    <span className="text-sm">Fecha</span>
                    <input
                      className="sc-campo mt-1 block"
                      type="time"
                      name={`${base}.fecha`}
                      value={faixa.fecha}
                      onChange={(evento) =>
                        mudarFaixa(dia, indice, {
                          ...faixa,
                          fecha: evento.target.value,
                        })
                      }
                      {...atributosDeErro(`${base}.fecha`, erros)}
                    />
                  </label>
                  <button
                    type="button"
                    className="sc-botao sc-botao--secundaria"
                    onClick={() => removerFaixa(dia, indice)}
                  >
                    Remover faixa
                  </button>
                  <div className="basis-full">
                    <ErroDoCampo campo={`${base}.abre`} erros={erros} />
                    <ErroDoCampo campo={`${base}.fecha`} erros={erros} />
                  </div>
                </div>
              );
            })}
            {faixas.length < 4 ? (
              <button
                type="button"
                className="sc-botao sc-botao--secundaria mt-4"
                onClick={() => acrescentarFaixa(dia)}
              >
                {faixas.length === 0
                  ? `Abrir ${(DIAS[dia] ?? "o dia").toLowerCase()}`
                  : "Acrescentar faixa"}
              </button>
            ) : null}
          </div>
        ))}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="flex items-center gap-1.5 font-medium">
          Datas especiais
          <InfoDoPainel explicacao="datasEspeciais" nome="Datas especiais" />
        </legend>
        <p className="text-sm text-[var(--cor-tinta-suave)]">
          Feriados, férias ou um dia com horário diferente. Valem só na data, e
          a grade da semana continua intacta.
        </p>
        <ErroDoCampo campo="excecoes" erros={erros} />
        {dados.excecoes.map((excecao, indice) => {
          const base = `excecoes.${indice}`;
          return (
            <div
              key={`${base}-${excecao.data}`}
              className="flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--cor-borda)] p-4"
            >
              <label className="block">
                <span className="text-sm">Data</span>
                <input
                  className="sc-campo mt-1 block"
                  type="date"
                  name={`${base}.data`}
                  value={excecao.data}
                  onChange={(evento) =>
                    mudarExcecao(indice, {
                      ...excecao,
                      data: evento.target.value,
                    })
                  }
                  {...atributosDeErro(`${base}.data`, erros)}
                />
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={excecao.fechada}
                  onChange={(evento) =>
                    mudarExcecao(indice, {
                      ...excecao,
                      fechada: evento.target.checked,
                      abre: excecao.abre ?? "10:00",
                      fecha: excecao.fecha ?? "14:00",
                    })
                  }
                />
                <span className="text-sm">Fechada o dia todo</span>
              </label>
              {excecao.fechada ? null : (
                <>
                  <label className="block">
                    <span className="text-sm">Abre</span>
                    <input
                      className="sc-campo mt-1 block"
                      type="time"
                      value={excecao.abre ?? ""}
                      onChange={(evento) =>
                        mudarExcecao(indice, {
                          ...excecao,
                          abre: evento.target.value,
                        })
                      }
                      {...atributosDeErro(`${base}.abre`, erros)}
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm">Fecha</span>
                    <input
                      className="sc-campo mt-1 block"
                      type="time"
                      value={excecao.fecha ?? ""}
                      onChange={(evento) =>
                        mudarExcecao(indice, {
                          ...excecao,
                          fecha: evento.target.value,
                        })
                      }
                      {...atributosDeErro(`${base}.fecha`, erros)}
                    />
                  </label>
                </>
              )}
              <div className="block min-w-48 flex-1">
                <RotuloComInfo
                  para={`horario-motivo-${indice}`}
                  explicacao="motivoDaData"
                  nome="Motivo da data especial"
                  className="text-sm"
                >
                  Motivo (aparece na vitrine)
                </RotuloComInfo>
                <input
                  id={`horario-motivo-${indice}`}
                  aria-describedby={`horario-motivo-${indice}-info`}
                  className="sc-campo mt-1 block w-full"
                  value={excecao.motivo ?? ""}
                  maxLength={120}
                  placeholder="Ex.: Feriado de Natal"
                  onChange={(evento) =>
                    mudarExcecao(indice, {
                      ...excecao,
                      motivo: evento.target.value,
                    })
                  }
                />
              </div>
              <button
                type="button"
                className="sc-botao sc-botao--secundaria"
                onClick={() =>
                  mudar((anterior) => ({
                    ...anterior,
                    excecoes: anterior.excecoes.filter((_, i) => i !== indice),
                  }))
                }
              >
                Remover data
              </button>
              <div className="basis-full">
                <ErroDoCampo campo={`${base}.data`} erros={erros} />
                <ErroDoCampo campo={`${base}.abre`} erros={erros} />
                <ErroDoCampo campo={`${base}.fecha`} erros={erros} />
              </div>
            </div>
          );
        })}
        <button
          type="button"
          className="sc-botao sc-botao--secundaria"
          onClick={() =>
            mudar((anterior) => ({
              ...anterior,
              excecoes: [
                ...anterior.excecoes,
                {
                  data: "",
                  fechada: true,
                  abre: null,
                  fecha: null,
                  motivo: null,
                },
              ],
            }))
          }
        >
          Acrescentar data especial
        </button>
      </fieldset>

      <div className="flex flex-wrap items-center gap-4">
        <button
          className="sc-botao sc-botao--primaria"
          type="submit"
          disabled={secao.salvando}
        >
          {secao.salvando ? "Salvando…" : "Salvar horário"}
        </button>
        <p role="status" className="text-sm text-[var(--cor-tinta-suave)]">
          {secao.mensagem}
        </p>
      </div>
    </form>
  );
}
