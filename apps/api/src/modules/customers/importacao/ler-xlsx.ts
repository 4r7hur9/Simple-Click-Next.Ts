/**
 * XLSX, primeira aba (card #60), sem biblioteca.
 *
 * O .xlsx é um ZIP com XML dentro, e para tirar NOMES E TELEFONES dele basta
 * pouco: o diretório central do ZIP (para achar cada parte), o `inflateRaw`
 * do próprio Node, a lista de textos compartilhados (`sharedStrings.xml`) e
 * as células da primeira aba. Fórmula vale pelo último resultado guardado;
 * estilo, data e mesclagem não interessam a uma lista de clientes.
 *
 * Um ZIP pequeno pode inflar para gigabytes ("bomba de zip"): cada parte tem
 * teto de tamanho DEPOIS de inflada, e passou dele o arquivo é recusado.
 *
 * O .xls antigo (binário) e o .ods ficam de fora, com a orientação de salvar
 * como .xlsx ou .csv.
 */
import { inflateRawSync } from "node:zlib";

import {
  ErroDaLeitura,
  linhaVazia,
  nomesUnicosDasColunas,
  type LinhaLida,
  type TabelaLida,
} from "./tabela.ts";

/** O maior tamanho que uma parte do ZIP pode ter depois de inflada. */
const TETO_DA_PARTE_INFLADA = 80 * 1024 * 1024;

const ILEGIVEL =
  "Não deu para abrir a planilha. Salve de novo como .xlsx ou .csv.";

interface EntradaDoZip {
  readonly metodo: number;
  readonly tamanhoComprimido: number;
  readonly deslocamento: number;
}

/** As partes do ZIP, pelo nome. */
export function lerDiretorioDoZip(
  bytes: Uint8Array,
): ReadonlyMap<string, EntradaDoZip> {
  const dados = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // O fim do diretório central fica nos últimos 22 bytes + comentário.
  let fim = -1;
  for (
    let i = bytes.length - 22;
    i >= Math.max(0, bytes.length - 65_557);
    i -= 1
  ) {
    if (dados.getUint32(i, true) === 0x06054b50) {
      fim = i;
      break;
    }
  }
  if (fim === -1) throw new ErroDaLeitura("arquivo_ilegivel", ILEGIVEL);

  const quantas = dados.getUint16(fim + 10, true);
  let posicao = dados.getUint32(fim + 16, true);
  const entradas = new Map<string, EntradaDoZip>();
  const nomes = new TextDecoder("utf-8");
  for (let n = 0; n < quantas; n += 1) {
    if (
      posicao + 46 > bytes.length ||
      dados.getUint32(posicao, true) !== 0x02014b50
    ) {
      throw new ErroDaLeitura("arquivo_ilegivel", ILEGIVEL);
    }
    const metodo = dados.getUint16(posicao + 10, true);
    const tamanhoComprimido = dados.getUint32(posicao + 20, true);
    const tamanhoDoNome = dados.getUint16(posicao + 28, true);
    const tamanhoExtra = dados.getUint16(posicao + 30, true);
    const tamanhoDoComentario = dados.getUint16(posicao + 32, true);
    const deslocamento = dados.getUint32(posicao + 42, true);
    const nome = nomes.decode(
      bytes.subarray(posicao + 46, posicao + 46 + tamanhoDoNome),
    );
    entradas.set(nome, { metodo, tamanhoComprimido, deslocamento });
    posicao += 46 + tamanhoDoNome + tamanhoExtra + tamanhoDoComentario;
  }
  return entradas;
}

/** O conteúdo inflado de uma parte, como texto. */
function lerParte(
  bytes: Uint8Array,
  entradas: ReadonlyMap<string, EntradaDoZip>,
  nome: string,
): string | null {
  const entrada = entradas.get(nome);
  if (entrada === undefined) return null;
  const dados = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const local = entrada.deslocamento;
  if (
    local + 30 > bytes.length ||
    dados.getUint32(local, true) !== 0x04034b50
  ) {
    throw new ErroDaLeitura("arquivo_ilegivel", ILEGIVEL);
  }
  const inicio =
    local +
    30 +
    dados.getUint16(local + 26, true) +
    dados.getUint16(local + 28, true);
  const comprimido = bytes.subarray(inicio, inicio + entrada.tamanhoComprimido);
  let cru: Uint8Array;
  if (entrada.metodo === 0) {
    cru = comprimido;
  } else if (entrada.metodo === 8) {
    try {
      cru = inflateRawSync(comprimido, {
        maxOutputLength: TETO_DA_PARTE_INFLADA,
      });
    } catch (causa) {
      if (
        causa instanceof RangeError ||
        (causa as { code?: string }).code === "ERR_BUFFER_TOO_LARGE"
      ) {
        throw new ErroDaLeitura(
          "arquivo_grande_demais",
          "A planilha é grande demais depois de aberta. Divida em arquivos menores.",
        );
      }
      throw new ErroDaLeitura("arquivo_ilegivel", ILEGIVEL);
    }
  } else {
    throw new ErroDaLeitura("arquivo_ilegivel", ILEGIVEL);
  }
  return new TextDecoder("utf-8").decode(cru);
}

/** Desfaz as entidades do XML. */
export function textoDoXml(xml: string): string {
  return xml.replace(
    /&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos);/gi,
    (_, e: string) => {
      const nome = e.toLowerCase();
      if (nome === "amp") return "&";
      if (nome === "lt") return "<";
      if (nome === "gt") return ">";
      if (nome === "quot") return '"';
      if (nome === "apos") return "'";
      const codigo = nome.startsWith("#x")
        ? Number.parseInt(nome.slice(2), 16)
        : Number.parseInt(nome.slice(1), 10);
      return Number.isFinite(codigo) && codigo <= 0x10ffff
        ? String.fromCodePoint(codigo)
        : "";
    },
  );
}

/** Todo o texto de `<t>` dentro de um trecho (texto rico tem vários). */
function textosDe(trecho: string): string {
  let texto = "";
  for (const achado of trecho.matchAll(
    /<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g,
  )) {
    texto += textoDoXml(achado[1] ?? "");
  }
  return texto;
}

function textosCompartilhados(xml: string | null): readonly string[] {
  if (xml === null) return [];
  const lista: string[] = [];
  for (const achado of xml.matchAll(
    /<(?:\w+:)?si(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?si>/g,
  )) {
    // A pronúncia fonética (`rPh`) não é parte do texto.
    lista.push(
      textosDe(
        (achado[1] ?? "").replace(/<(?:\w+:)?rPh[\s\S]*?<\/(?:\w+:)?rPh>/g, ""),
      ),
    );
  }
  return lista;
}

/** "AB" → 27 (base zero). */
function indiceDaColuna(letras: string): number {
  let indice = 0;
  for (const letra of letras.toUpperCase()) {
    indice = indice * 26 + (letra.charCodeAt(0) - 64);
  }
  return indice - 1;
}

/** Número guardado pela planilha → texto, sem notação científica. */
function numeroComoTexto(bruto: string): string {
  const valor = Number(bruto);
  if (!Number.isFinite(valor)) return bruto;
  if (Number.isInteger(valor) && Math.abs(valor) < 1e21)
    return valor.toFixed(0);
  return String(valor);
}

/** O texto de uma célula, pelo tipo dela. */
function valorDaCelula(
  tipo: string | null,
  corpo: string,
  v: string | undefined,
  compartilhados: readonly string[],
): string {
  if (tipo === "inlineStr") return textosDe(corpo);
  if (v === undefined) return "";
  if (tipo === "s") return compartilhados[Number(v)] ?? "";
  if (tipo === "str" || tipo === "e") return textoDoXml(v);
  if (tipo === "b") return v === "1" ? "sim" : "não";
  return numeroComoTexto(textoDoXml(v));
}

function atributo(abertura: string, nome: string): string | null {
  const achado = new RegExp(`\\s${nome}="([^"]*)"`).exec(abertura);
  return achado === null ? null : (achado[1] ?? null);
}

/** O caminho da primeira aba, pelo `workbook.xml` e as relações dele. */
function caminhoDaPrimeiraAba(
  bytes: Uint8Array,
  entradas: ReadonlyMap<string, EntradaDoZip>,
): string {
  const padrao = "xl/worksheets/sheet1.xml";
  const livro = lerParte(bytes, entradas, "xl/workbook.xml");
  const relacoes = lerParte(bytes, entradas, "xl/_rels/workbook.xml.rels");
  if (livro === null || relacoes === null) return padrao;
  const aba = /<(?:\w+:)?sheet\s[^>]*>/.exec(livro)?.[0];
  const id = aba === undefined ? null : /\sr:id="([^"]*)"/.exec(aba)?.[1];
  if (id === undefined || id === null) return padrao;
  for (const achado of relacoes.matchAll(/<Relationship\s[^>]*>/g)) {
    if (atributo(achado[0], "Id") !== id) continue;
    const alvo = atributo(achado[0], "Target");
    if (alvo === null) return padrao;
    return alvo.startsWith("/")
      ? alvo.slice(1)
      : `xl/${alvo.replace(/^\.\//, "")}`;
  }
  return padrao;
}

export function lerXlsx(bytes: Uint8Array, maximoDeLinhas: number): TabelaLida {
  const entradas = lerDiretorioDoZip(bytes);
  if (
    !entradas.has("xl/workbook.xml") &&
    !entradas.has("xl/worksheets/sheet1.xml")
  ) {
    throw new ErroDaLeitura(
      "formato_nao_suportado",
      "Este ZIP não é uma planilha do Excel (.xlsx).",
    );
  }
  const compartilhados = textosCompartilhados(
    lerParte(bytes, entradas, "xl/sharedStrings.xml"),
  );
  const aba = lerParte(bytes, entradas, caminhoDaPrimeiraAba(bytes, entradas));
  if (aba === null) throw new ErroDaLeitura("arquivo_ilegivel", ILEGIVEL);

  const linhasCruas: { numero: number; celulas: string[] }[] = [];
  let numeroEsperado = 1;
  for (const achado of aba.matchAll(
    /<(?:\w+:)?row(\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g,
  )) {
    const r = atributo(achado[1] ?? "", "r");
    const numero = r === null ? numeroEsperado : Number(r);
    numeroEsperado = numero + 1;
    const celulas: string[] = [];
    let proxima = 0;
    for (const celula of (achado[2] ?? "").matchAll(
      /<(?:\w+:)?c(\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g,
    )) {
      const abertura = celula[1] ?? "";
      const referencia = atributo(abertura, "r");
      const coluna =
        referencia === null
          ? proxima
          : indiceDaColuna(/^[A-Za-z]+/.exec(referencia)?.[0] ?? "A");
      proxima = coluna + 1;
      if (coluna > 500) continue;
      const tipo = atributo(abertura, "t");
      const corpo = celula[2] ?? "";
      const v = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(corpo)?.[1];
      celulas[coluna] = valorDaCelula(tipo, corpo, v, compartilhados).trim();
    }
    const completas = Array.from(celulas, (valor) => valor ?? "");
    if (linhaVazia(completas)) continue;
    linhasCruas.push({ numero, celulas: completas });
    if (linhasCruas.length > maximoDeLinhas + 1) break;
  }

  const cabecalho = linhasCruas[0];
  if (cabecalho === undefined) {
    throw new ErroDaLeitura(
      "arquivo_vazio",
      "A primeira aba da planilha está vazia.",
    );
  }
  const colunas = nomesUnicosDasColunas(cabecalho.celulas);
  const linhas: LinhaLida[] = linhasCruas.slice(1).map((linha) => ({
    numero: linha.numero,
    valores: colunas.map((_, c) => linha.celulas[c] ?? ""),
  }));
  return {
    formato: "xlsx",
    codificacao: null,
    separador: null,
    colunas,
    linhas,
  };
}
