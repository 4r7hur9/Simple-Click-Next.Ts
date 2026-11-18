/**
 * As contas pequenas da página Sobre: dia de hoje no fuso da loja, hora curta,
 * endereço em linhas, telefone legível e o atalho do mapa.
 *
 * Tudo PURO e sem relógio próprio: o instante chega por parâmetro, para a prova
 * poder fixar a segunda-feira e a virada da meia-noite.
 */

/** Uma faixa de funcionamento, em hora local da loja ("18:00"). */
export interface FaixaNaTela {
  readonly abre: string;
  readonly fecha: string;
}

export interface EnderecoNaTela {
  readonly logradouro: string | null;
  readonly numero: string | null;
  readonly complemento: string | null;
  readonly bairro: string | null;
  readonly cidade: string | null;
  readonly uf: string | null;
}

/** Os nomes dos dias, com 0 no domingo — a numeração do contrato. */
export const NOME_DO_DIA = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
] as const;

/** A semana como o brasileiro lê um quadro de horário: segunda primeiro. */
export const ORDEM_DA_SEMANA = [1, 2, 3, 4, 5, 6, 0] as const;

const DIA_EM_INGLES: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * O dia da semana AGORA, no fuso da loja.
 *
 * O relógio do servidor está em UTC: às 22h de domingo em São Paulo ele já diz
 * segunda, e a página destacaria o dia errado justo na hora do jantar.
 */
export function diaDaSemanaNoFuso(agora: Date, fusoHorario: string): number {
  try {
    const curto = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      timeZone: fusoHorario,
    }).format(agora);
    return DIA_EM_INGLES[curto] ?? agora.getUTCDay();
  } catch {
    // Fuso inválido no cadastro não derruba a página: vale o dia em UTC.
    return agora.getUTCDay();
  }
}

/** "18:00" → "18h"; "18:30" → "18h30". */
export function horaCurta(hora: string): string {
  const [h = "0", m = "00"] = hora.split(":");
  const horas = String(Number(h));
  return m === "00" ? `${horas}h` : `${horas}h${m}`;
}

/** Converte "18:30" em minutos desde a meia-noite. */
function emMinutos(hora: string): number {
  const [h = "0", m = "0"] = hora.split(":");
  return Number(h) * 60 + Number(m);
}

/**
 * Uma faixa como texto. Fechar antes de abrir quer dizer "até a meia-noite" —
 * a mesma leitura do cálculo de `packages/core` —, e 0h às 0h é o dia inteiro.
 */
export function textoDaFaixa(faixa: FaixaNaTela): string {
  const abre = emMinutos(faixa.abre);
  const fecha = emMinutos(faixa.fecha);
  if (fecha <= abre) {
    return abre === 0 ? "24 horas" : `${horaCurta(faixa.abre)} – 24h`;
  }
  return `${horaCurta(faixa.abre)} – ${horaCurta(faixa.fecha)}`;
}

/** As faixas do dia num texto só, ou nulo para dia fechado. */
export function textoDoDia(faixas: readonly FaixaNaTela[]): string | null {
  if (faixas.length === 0) return null;
  return faixas.map(textoDaFaixa).join(" · ");
}

/** O endereço em linhas, sem vírgula nem barra sobrando. */
export function enderecoEmLinhas(endereco: EnderecoNaTela): string[] {
  return [
    [endereco.logradouro, endereco.numero].filter(Boolean).join(", "),
    endereco.complemento,
    endereco.bairro,
    [endereco.cidade, endereco.uf].filter(Boolean).join(" / "),
  ].filter((linha): linha is string => Boolean(linha));
}

/**
 * O link do mapa, pela busca pública do Google Maps: abre o aplicativo no
 * celular e o site no computador, sem chave de API e sem coordenada (o contrato
 * não as tem). Sem rua nem cidade, não há o que procurar.
 */
export function enderecoNoMapa(endereco: EnderecoNaTela): string | null {
  if (!endereco.logradouro && !endereco.cidade) return null;
  const busca = [
    [endereco.logradouro, endereco.numero].filter(Boolean).join(", "),
    endereco.bairro,
    [endereco.cidade, endereco.uf].filter(Boolean).join(" - "),
  ]
    .filter(Boolean)
    .join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(busca)}`;
}

/** Só os dígitos: é o que o link do WhatsApp aceita. */
export function numeroDoWhatsApp(numero: string): string {
  return numero.replace(/\D/g, "");
}

/**
 * O número como se fala no Brasil: "(11) 91111-0001". Número de fora, ou com
 * tamanho inesperado, sai como veio — melhor cru do que mascarado errado.
 */
export function telefoneLegivel(numero: string): string {
  const digitos = numeroDoWhatsApp(numero);
  const nacional =
    digitos.startsWith("55") && digitos.length >= 12
      ? digitos.slice(2)
      : digitos;
  if (nacional.length === 11) {
    return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 7)}-${nacional.slice(7)}`;
  }
  if (nacional.length === 10) {
    return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 6)}-${nacional.slice(6)}`;
  }
  return numero;
}

/**
 * O texto Sobre dividido em abertura e corpo.
 *
 * Parágrafo é linha em branco. Com um parágrafo só, a primeira frase vira a
 * abertura — desde que sobre texto depois dela; senão, tudo é abertura.
 */
export function dividirHistoria(texto: string): {
  readonly abertura: string;
  readonly corpo: readonly string[];
} {
  const paragrafos = texto
    .split(/\n\s*\n/)
    .map((paragrafo) => paragrafo.trim())
    .filter(Boolean);
  const [primeiro = "", ...resto] = paragrafos;
  if (resto.length > 0) return { abertura: primeiro, corpo: resto };

  const fim = primeiro.search(/[.!?](\s|$)/);
  if (fim > 0 && fim < primeiro.length - 1) {
    const corpo = primeiro.slice(fim + 1).trim();
    if (corpo) return { abertura: primeiro.slice(0, fim + 1), corpo: [corpo] };
  }
  return { abertura: primeiro, corpo: [] };
}

/**
 * O prazo como se diz: "40 min", "1h30", "2 dias". Loja de roupa entrega em
 * dias, e "2880 min" ninguém lê.
 */
export function textoDoPrazo(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  if (minutos < 24 * 60) {
    const horas = Math.floor(minutos / 60);
    const resto = minutos % 60;
    return resto === 0
      ? `${horas}h`
      : `${horas}h${String(resto).padStart(2, "0")}`;
  }
  const dias = Math.round(minutos / (24 * 60));
  return dias === 1 ? "1 dia" : `${dias} dias`;
}
