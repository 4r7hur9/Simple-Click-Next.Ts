/**
 * Normalização do número de WhatsApp (AC-913).
 *
 * POR QUE ISTO É CRÍTICO. O número não vai para uma tela de conferência: ele
 * vira `https://wa.me/<numero>`. Um número errado não dá erro em lugar nenhum —
 * o WhatsApp simplesmente abre uma conversa que não existe. O cliente acha que
 * pediu, o dono nunca recebe, e ninguém descobre até a reclamação. É por isso
 * que a recusa aqui é explícita e diz O QUE FALTA, em vez de devolver um "número
 * inválido" que não ensina nada a quem está cadastrando.
 *
 * Função PURA: não conhece banco, HTTP nem framework, como a tabela de
 * fronteiras de `.spec/design/arquitetura.md` exige de `packages/core`.
 *
 * O resultado é UNIÃO DISCRIMINADA e não exceção, ao contrário do gerador de
 * texto ao lado. A diferença não é estilo: ali, receber um pedido malformado é
 * defeito de programação e deve estourar; aqui, digitar o número errado é o
 * comportamento esperado de um ser humano, e a mensagem do que falta é DADO que
 * a tela precisa mostrar — não acidente para alguém capturar.
 */

/** Número aceito, já no formato internacional e pronto para virar link. */
export interface NumeroAceito {
  readonly ok: true;
  /** Só dígitos, com código do país — é o que entra em `https://wa.me/<isto>`. */
  readonly e164: string;
  /** Como mostrar de volta para quem digitou, para conferir antes de salvar. */
  readonly exibicao: string;
  readonly pais: string;
  /** Código de área. Vazio fora do Brasil, onde não sabemos separar. */
  readonly ddd: string;
  readonly assinante: string;
  readonly tipo: TipoDeLinha;
}

/** Número recusado, com o motivo escrito para aparecer na tela. */
export interface NumeroRecusado {
  readonly ok: false;
  /** Código estável para teste e para a tela escolher o destaque. */
  readonly causa: CausaDaRecusa;
  /** Frase pronta para o usuário, dizendo o que falta — nunca "inválido". */
  readonly explicacao: string;
}

export type ResultadoDoNumero = NumeroAceito | NumeroRecusado;

export type TipoDeLinha = "MOVEL" | "FIXO" | "INTERNACIONAL";

export type CausaDaRecusa =
  | "VAZIO"
  | "SEM_DIGITOS"
  | "CURTO_DEMAIS"
  | "LONGO_DEMAIS"
  | "DDD_DESCONHECIDO"
  | "CELULAR_SEM_O_NOVE"
  | "PREFIXO_DESCONHECIDO";

/** Opções da normalização. O padrão atende a loja brasileira, que é o caso. */
export interface OpcoesDoNumero {
  /** Código do país assumido quando quem digitou não informou. */
  readonly paisPadrao?: string;
}

/**
 * Códigos de área que existem no Brasil.
 *
 * A lista é explícita de propósito. Aceitar "qualquer coisa de 11 a 99" deixaria
 * passar 23, 25, 26, 29, 30, 36, 39, 40, 50, 52, 56 a 60, 70, 72, 76, 78, 80 e
 * 90 — que nunca foram atribuídos. São justamente os erros de digitação mais
 * comuns (trocar 21 por 20, 31 por 30), e cada um deles geraria um link morto.
 */
const DDDS_DO_BRASIL: ReadonlySet<string> = new Set([
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "21",
  "22",
  "24",
  "27",
  "28",
  "31",
  "32",
  "33",
  "34",
  "35",
  "37",
  "38",
  "41",
  "42",
  "43",
  "44",
  "45",
  "46",
  "47",
  "48",
  "49",
  "51",
  "53",
  "54",
  "55",
  "61",
  "62",
  "63",
  "64",
  "65",
  "66",
  "67",
  "68",
  "69",
  "71",
  "73",
  "74",
  "75",
  "77",
  "79",
  "81",
  "82",
  "83",
  "84",
  "85",
  "86",
  "87",
  "88",
  "89",
  "91",
  "92",
  "93",
  "94",
  "95",
  "96",
  "97",
  "98",
  "99",
]);

const PAIS_BRASIL = "55";

/** Menor e maior comprimento que a E.164 admite, contando o código do país. */
const MINIMO_E164 = 8;
const MAXIMO_E164 = 15;

/** A recusa com a causa e a frase que a tela mostra. */
function recusar(causa: CausaDaRecusa, explicacao: string): NumeroRecusado {
  return { ok: false, causa, explicacao };
}

/** Tira máscara, espaço, ponto, traço e parêntese, guardando só os dígitos. */
function somenteDigitos(entrada: string): string {
  return entrada.replace(/\D/g, "");
}

/**
 * Descobre se quem digitou já informou o código do país.
 *
 * O `+` é a única marca CONFIÁVEL. Sem ele, "5511912345678" e um número local
 * são indistinguíveis por olhar, então a regra é de comprimento: no Brasil, DDD
 * mais assinante dá 10 ou 11 dígitos; 12 ou 13 começando com 55 só pode ser o
 * país na frente.
 */
function separarPais(digitos: string, temMais: boolean, paisPadrao: string) {
  if (temMais) {
    const pais = digitos.startsWith(PAIS_BRASIL) ? PAIS_BRASIL : "";
    return pais === PAIS_BRASIL
      ? { pais, resto: digitos.slice(2), estrangeiro: false }
      : { pais: digitos, resto: "", estrangeiro: true };
  }
  if (
    paisPadrao === PAIS_BRASIL &&
    digitos.startsWith(PAIS_BRASIL) &&
    (digitos.length === 12 || digitos.length === 13)
  ) {
    return { pais: PAIS_BRASIL, resto: digitos.slice(2), estrangeiro: false };
  }
  return {
    pais: paisPadrao,
    resto: digitos,
    estrangeiro: paisPadrao !== PAIS_BRASIL,
  };
}

/**
 * Aplica as regras brasileiras: código de área que existe, celular de nove
 * dígitos começando em 9, fixo de oito começando entre 2 e 5.
 */
function conferirBrasil(resto: string): ResultadoDoNumero {
  // O zero da frente é herança da discagem interurbana ("011 9..."). Ele não
  // faz parte do número, e mantê-lo empurraria o DDD para o lugar errado.
  const semZero = resto.startsWith("0") ? resto.slice(1) : resto;

  if (semZero.length < 10) {
    return recusar(
      "CURTO_DEMAIS",
      `Faltam dígitos: com o código de área, um número brasileiro tem 10 (fixo) ou 11 (celular). Você informou ${semZero.length}.`,
    );
  }
  if (semZero.length > 11) {
    return recusar(
      "LONGO_DEMAIS",
      `Sobram dígitos: com o código de área, um número brasileiro tem 10 (fixo) ou 11 (celular). Você informou ${semZero.length}.`,
    );
  }

  const ddd = semZero.slice(0, 2);
  const assinante = semZero.slice(2);

  if (!DDDS_DO_BRASIL.has(ddd)) {
    // Nenhum DDD começa com 0: se sobrou um zero depois de tirar o da
    // discagem, quem digitou pôs um DDD começando com 0 ("(00) 9..."), e a
    // frase cita esses dois dígitos, não os que sobraram do corte.
    const dddDigitado = ddd.startsWith("0") ? resto.slice(0, 2) : ddd;
    return recusar(
      "DDD_DESCONHECIDO",
      `O código de área ${dddDigitado} não existe no Brasil. Confira os dois primeiros dígitos.`,
    );
  }

  if (assinante.length === 9) {
    if (!assinante.startsWith("9")) {
      return recusar(
        "PREFIXO_DESCONHECIDO",
        `Depois do código de área ${ddd}, um número de 9 dígitos é celular e começa com 9. Este começa com ${assinante[0]}.`,
      );
    }
    return aceitarBrasil(ddd, assinante, "MOVEL");
  }

  // Oito dígitos começando em 6, 7, 8 ou 9 é celular do formato antigo: em 2016
  // todos ganharam um 9 na frente. Acrescentar esse 9 aqui pareceria gentileza,
  // mas seria adivinhação — e adivinhar errado devolve um link morto sem aviso.
  // Melhor recusar dizendo exatamente o que falta.
  if (/^[6-9]/.test(assinante)) {
    return recusar(
      "CELULAR_SEM_O_NOVE",
      `Este parece um celular no formato antigo, de 8 dígitos. Desde 2016 o celular tem 9 dígitos e começa com 9 — provavelmente falta o 9 na frente de ${assinante}.`,
    );
  }

  if (!/^[2-5]/.test(assinante)) {
    return recusar(
      "PREFIXO_DESCONHECIDO",
      `Depois do código de área ${ddd}, um número de 8 dígitos é fixo e começa entre 2 e 5. Este começa com ${assinante[0]}.`,
    );
  }

  return aceitarBrasil(ddd, assinante, "FIXO");
}

/** O número brasileiro aceito, exibido como "+55 (11) 91234-5678". */
function aceitarBrasil(
  ddd: string,
  assinante: string,
  tipo: TipoDeLinha,
): NumeroAceito {
  const corte = assinante.length === 9 ? 5 : 4;
  const exibicao = `+${PAIS_BRASIL} (${ddd}) ${assinante.slice(0, corte)}-${assinante.slice(corte)}`;
  return {
    ok: true,
    e164: `${PAIS_BRASIL}${ddd}${assinante}`,
    exibicao,
    pais: PAIS_BRASIL,
    ddd,
    assinante,
    tipo,
  };
}

/**
 * Fora do Brasil não temos como saber onde o código de área termina, então a
 * conferência é só a da E.164. Recusar por não conhecer o país seria pior:
 * impediria uma loja de fronteira de cadastrar o número que ela de fato usa.
 */
function conferirEstrangeiro(digitos: string): ResultadoDoNumero {
  if (digitos.length < MINIMO_E164) {
    return recusar(
      "CURTO_DEMAIS",
      `Faltam dígitos: um número internacional tem no mínimo ${MINIMO_E164} dígitos com o código do país. Você informou ${digitos.length}.`,
    );
  }
  if (digitos.length > MAXIMO_E164) {
    return recusar(
      "LONGO_DEMAIS",
      `Sobram dígitos: um número internacional tem no máximo ${MAXIMO_E164} dígitos com o código do país. Você informou ${digitos.length}.`,
    );
  }
  return {
    ok: true,
    e164: digitos,
    exibicao: `+${digitos}`,
    pais: digitos.slice(0, 2),
    ddd: "",
    assinante: digitos.slice(2),
    tipo: "INTERNACIONAL",
  };
}

/**
 * Normaliza o número digitado para o formato que o link do WhatsApp aceita.
 *
 * Aceita máscara, espaço, zero de interurbano e ausência do código do país.
 * Recusa dizendo o que falta — nunca um "número inválido" mudo.
 */
export function normalizarWhatsApp(
  entrada: string,
  opcoes: OpcoesDoNumero = {},
): ResultadoDoNumero {
  const paisPadrao = opcoes.paisPadrao ?? PAIS_BRASIL;

  if (entrada.trim() === "") {
    return recusar(
      "VAZIO",
      "Informe o número de WhatsApp que recebe os pedidos.",
    );
  }

  const digitos = somenteDigitos(entrada);
  if (digitos === "") {
    return recusar(
      "SEM_DIGITOS",
      "O que você digitou não tem nenhum dígito. Informe o número com código de área, por exemplo (11) 91234-5678.",
    );
  }

  const { pais, resto, estrangeiro } = separarPais(
    digitos,
    entrada.trim().startsWith("+"),
    paisPadrao,
  );

  if (estrangeiro)
    return conferirEstrangeiro(pais === "" ? digitos : pais + resto);
  return conferirBrasil(resto);
}

/** Monta o endereço que abre a conversa. Só aceita número já normalizado. */
export function linkDoWhatsApp(numero: NumeroAceito, texto: string): string {
  return `https://wa.me/${numero.e164}?text=${encodeURIComponent(texto)}`;
}
