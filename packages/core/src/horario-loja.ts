/**
 * A loja está aberta agora? (AC-401, AC-909, AC-910)
 *
 * "AGORA" É RELATIVO, e num sistema multi-loja isso não é filosofia: uma loja
 * em Fortaleza e outra em Rio Branco não compartilham o mesmo dia. Calcular
 * abertura com o relógio do servidor em UTC faria a loja do Acre fechar duas
 * horas antes do que devia; calcular com o relógio do navegador do cliente
 * deixaria qualquer um pedir com a loja fechada, porque esse relógio é dele.
 * Por isso o fuso da loja entra como dado, e o cálculo inteiro acontece nele.
 *
 * Função PURA: recebe o instante e devolve o veredito. Sem `Date.now()` dentro,
 * porque função que lê o relógio sozinha não tem como ser testada em janeiro e
 * em julho, nem na virada da meia-noite.
 */

/** Como a loja decide se está aberta. */
export type EstadoDeAbertura =
  "SCHEDULE" | "ALWAYS_OPEN" | "TEMPORARILY_CLOSED" | "PERMANENTLY_CLOSED";

/** Uma faixa de funcionamento, em hora e minuto locais da loja. */
export interface FaixaDeHorario {
  /** "18:00" */
  readonly abre: string;
  /** "23:30" */
  readonly fecha: string;
}

/**
 * O horário da loja.
 *
 * As faixas são por dia da semana, com 0 no domingo — a mesma numeração que o
 * JavaScript usa, para não haver conversão silenciosa no meio do caminho.
 * Vários intervalos no mesmo dia são aceitos (AC-910): almoço e jantar são
 * duas faixas, e no intervalo entre elas a loja está fechada.
 */
export interface HorarioDaLoja {
  readonly estado: EstadoDeAbertura;
  readonly fusoHorario: string;
  /** Até quando o fechamento temporário vale. */
  readonly fechadaAte?: Date | null;
  readonly faixas?: Readonly<Record<number, readonly FaixaDeHorario[]>>;
  /** Feriados e férias. Vencem a grade semanal, e só no dia delas (AC-912). */
  readonly excecoes?: readonly ExcecaoDatada[];
}

/**
 * Uma exceção datada: feriado, férias, fechamento pontual (AC-912).
 *
 * Ela existe para o dono NÃO precisar desconfigurar a semana só para fechar um
 * dia — e não precisar reconfigurá-la de memória no dia seguinte. Quem
 * esquecesse ficaria fechado sem saber por quê.
 */
export interface ExcecaoDatada {
  /** Data local da loja, em "AAAA-MM-DD". */
  readonly data: string;
  readonly fechada: boolean;
  /** Quando a exceção ABRE fora da grade, como véspera de Natal estendida. */
  readonly abre?: string;
  readonly fecha?: string;
  readonly motivo?: string;
}

/** O veredito, com a frase que a tela mostra. */
export interface SituacaoDeAbertura {
  readonly aberta: boolean;
  /** "abre hoje às 18h", "abre segunda às 9h30". Nulo quando não há previsão. */
  readonly proximaAbertura: string | null;
  /** Motivo do fechamento, para a tela escolher o tom. */
  readonly motivo:
    "ABERTA" | "FORA_DO_HORARIO" | "PAUSA" | "ENCERRADA" | "EXCECAO";
  /** O que o dono escreveu na exceção, quando é ela que fecha a loja. */
  readonly explicacaoDaExcecao?: string | null;
}

const DIAS = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
] as const;

const MINUTOS_NO_DIA = 24 * 60;

/** Converte "18:30" em minutos desde a meia-noite. Nulo se não for hora. */
function emMinutos(hora: string): number | null {
  const casou = /^(\d{1,2}):(\d{2})$/.exec(hora.trim());
  if (casou === null) return null;
  const h = Number(casou[1]);
  const m = Number(casou[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/** Escreve minutos como a pessoa lê: "18h", "9h30". */
function comoSeLe(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

/** O momento da loja: que dia da semana é e que horas são, no fuso dela. */
interface MomentoLocal {
  readonly diaDaSemana: number;
  readonly minutosDoDia: number;
  /** Data local da loja, em "AAAA-MM-DD" — é a chave da exceção datada. */
  readonly data: string;
}

/**
 * Lê o instante no fuso da loja.
 *
 * `Intl` faz a conversão, inclusive o horário de verão — que muda de regra por
 * decreto e não se calcula com aritmética de fuso fixo.
 */
export function momentoNaLoja(agora: Date, fusoHorario: string): MomentoLocal {
  const formatador = new Intl.DateTimeFormat("en-CA", {
    timeZone: fusoHorario,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const partes = formatador.formatToParts(agora);
  const parte = (tipo: string) =>
    partes.find((p) => p.type === tipo)?.value ?? "";

  const nomes = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const diaDaSemana = Math.max(0, nomes.indexOf(parte("weekday")));
  // Meia-noite sai como "24" em alguns ambientes com hour12 falso.
  const hora = Number(parte("hour")) % 24;
  const minuto = Number(parte("minute"));

  const data = `${parte("year")}-${parte("month")}-${parte("day")}`;

  return { diaDaSemana, minutosDoDia: hora * 60 + minuto, data };
}

/** A exceção cadastrada para aquela data, se houver. */
function excecaoDoDia(
  horario: HorarioDaLoja,
  data: string,
): ExcecaoDatada | undefined {
  return horario.excecoes?.find((excecao) => excecao.data === data);
}

/**
 * As faixas que valem num dia, já considerando a exceção datada.
 *
 * A exceção VENCE a grade semanal — é para isso que ela existe. Fechada, o dia
 * não tem faixa nenhuma; aberta, valem as horas dela e não as da semana.
 */
function faixasDaData(
  horario: HorarioDaLoja,
  dia: number,
  data: string,
): { abre: number; fecha: number }[] {
  const excecao = excecaoDoDia(horario, data);
  if (excecao !== undefined) {
    if (excecao.fechada) return [];
    return faixasValidas([
      { abre: excecao.abre ?? "", fecha: excecao.fecha ?? "" },
    ]);
  }
  return faixasDoDia(horario, dia);
}

/** As faixas válidas de um dia, ordenadas e sem as malformadas. */
function faixasDoDia(
  horario: HorarioDaLoja,
  dia: number,
): { abre: number; fecha: number }[] {
  return faixasValidas(horario.faixas?.[dia] ?? []);
}

/** Descarta faixa malformada e ordena o que sobrou. */
function faixasValidas(
  brutas: readonly FaixaDeHorario[],
): { abre: number; fecha: number }[] {
  const validas: { abre: number; fecha: number }[] = [];

  for (const faixa of brutas) {
    const abre = emMinutos(faixa.abre);
    const fecha = emMinutos(faixa.fecha);
    if (abre === null || fecha === null) continue;
    // Faixa que vira o dia ("22:00" a "02:00") é tratada como até a meia-noite.
    // A parte da madrugada pertence ao dia seguinte, e é lá que ela deve estar
    // cadastrada: inventar a virada aqui esconderia um cadastro incompleto.
    validas.push({ abre, fecha: fecha > abre ? fecha : MINUTOS_NO_DIA });
  }

  return validas.sort((a, b) => a.abre - b.abre);
}

/** A data local somada de alguns dias, em "AAAA-MM-DD". */
function dataMais(data: string, dias: number): string {
  // Meio-dia UTC de propósito: somar dias a partir da meia-noite escorrega para
  // o dia anterior em qualquer fuso a oeste, e o feriado do dia 25 viraria 24.
  const base = new Date(`${data}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

/**
 * Procura a próxima abertura, olhando até uma semana à frente.
 *
 * Anda por DATA, e não só por dia da semana, porque é a data que casa com a
 * exceção: sem isso, a busca prometeria "abre quarta às 11h" no ano em que a
 * quarta é feriado cadastrado.
 */
function proximaAbertura(
  horario: HorarioDaLoja,
  momento: MomentoLocal,
): string | null {
  for (let adiante = 0; adiante <= 7; adiante += 1) {
    const dia = (momento.diaDaSemana + adiante) % 7;
    const data = dataMais(momento.data, adiante);

    for (const faixa of faixasDaData(horario, dia, data)) {
      // No dia de hoje, só interessa faixa que ainda vai começar.
      if (adiante === 0 && faixa.abre <= momento.minutosDoDia) continue;

      const quando =
        adiante === 0 ? "hoje" : adiante === 1 ? "amanhã" : DIAS[dia];
      return `abre ${quando} às ${comoSeLe(faixa.abre)}`;
    }
  }
  // Nenhuma faixa em sete dias: a loja não tem horário cadastrado, ou está de
  // férias pela semana inteira.
  return null;
}

/**
 * Decide se a loja está aberta neste instante.
 *
 * A ordem das perguntas importa: encerrada vence tudo, pausa vence o horário, e
 * só então o horário decide. Inverter faria uma loja em pausa aparecer aberta
 * porque estava dentro da faixa — e ela pausou justamente para não receber
 * pedido.
 */
export function situacaoDaLoja(
  horario: HorarioDaLoja,
  agora: Date,
): SituacaoDeAbertura {
  if (horario.estado === "PERMANENTLY_CLOSED") {
    return { aberta: false, proximaAbertura: null, motivo: "ENCERRADA" };
  }

  if (horario.estado === "TEMPORARILY_CLOSED") {
    const ate = horario.fechadaAte;
    // Pausa vencida volta a valer o horário: quem pausou por duas horas não
    // precisa lembrar de despausar.
    if (!ate || ate.getTime() > agora.getTime()) {
      return { aberta: false, proximaAbertura: null, motivo: "PAUSA" };
    }
  }

  const momento = momentoNaLoja(agora, horario.fusoHorario);

  if (horario.estado === "ALWAYS_OPEN") {
    return { aberta: true, proximaAbertura: null, motivo: "ABERTA" };
  }

  const excecao = excecaoDoDia(horario, momento.data);
  const dentro = faixasDaData(horario, momento.diaDaSemana, momento.data).some(
    (faixa) =>
      momento.minutosDoDia >= faixa.abre && momento.minutosDoDia < faixa.fecha,
  );

  if (dentro) return { aberta: true, proximaAbertura: null, motivo: "ABERTA" };

  // Fechada POR EXCEÇÃO é diferente de fechada por horário: a tela pode dizer
  // "fechado no feriado" em vez de "fora do horário", que numa quarta-feira às
  // duas da tarde soaria como defeito do sistema.
  if (excecao?.fechada === true) {
    return {
      aberta: false,
      proximaAbertura: proximaAbertura(horario, momento),
      motivo: "EXCECAO",
      explicacaoDaExcecao: excecao.motivo ?? null,
    };
  }

  return {
    aberta: false,
    proximaAbertura: proximaAbertura(horario, momento),
    motivo: "FORA_DO_HORARIO",
  };
}
