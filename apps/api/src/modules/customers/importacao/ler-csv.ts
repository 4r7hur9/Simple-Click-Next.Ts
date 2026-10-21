/**
 * CSV e TSV (card #60), sem biblioteca: o formato é o do RFC 4180 — campo
 * entre aspas pode ter separador, quebra de linha e aspas dobradas ("").
 *
 * O SEPARADOR É DESCOBERTO quando o painel não o força. O Excel brasileiro
 * salva com ";" (a vírgula é a casa decimal), o resto do mundo com ",", e o
 * copiar-colar de planilha vira tabulação. Vence o candidato que aparece o
 * MESMO número de vezes (e mais de zero) nas primeiras linhas — fora de
 * aspas; empatando, o que aparece mais.
 *
 * O número da linha é o da planilha: o cabeçalho é a linha 1 e cada registro
 * conta uma, mesmo quando um campo entre aspas quebra a linha do texto.
 */
import {
  MAXIMO_DE_LINHAS_DA_IMPORTACAO,
  type CodificacaoDaImportacao,
  type SeparadorDaImportacao,
} from "@simpleclick/contracts";

import {
  ErroDaLeitura,
  linhaVazia,
  nomesUnicosDasColunas,
  type LinhaLida,
  type TabelaLida,
} from "./tabela.ts";
import { decodificarTexto } from "./texto.ts";

const CARACTERE_DO_SEPARADOR: Readonly<Record<SeparadorDaImportacao, string>> =
  {
    ",": ",",
    ";": ";",
    tab: "\t",
    "|": "|",
  };

/** Quantas vezes cada candidato aparece, fora de aspas, em cada linha. */
function contarForaDeAspas(linha: string, caractere: string): number {
  let dentro = false;
  let vezes = 0;
  for (const letra of linha) {
    if (letra === '"') dentro = !dentro;
    else if (!dentro && letra === caractere) vezes += 1;
  }
  return vezes;
}

export function detectarSeparador(texto: string): SeparadorDaImportacao {
  const amostra = texto
    .slice(0, 64 * 1024)
    .split(/\r\n|\n|\r/)
    .filter((linha) => linha.trim() !== "")
    .slice(0, 10);
  if (amostra.length === 0) return ",";

  let melhor: SeparadorDaImportacao = ",";
  let melhorNota = -1;
  for (const candidato of Object.keys(
    CARACTERE_DO_SEPARADOR,
  ) as SeparadorDaImportacao[]) {
    const caractere = CARACTERE_DO_SEPARADOR[candidato];
    const contagens = amostra.map((linha) =>
      contarForaDeAspas(linha, caractere),
    );
    const primeira = contagens[0] ?? 0;
    if (primeira === 0) continue;
    const constantes = contagens.filter((n) => n === primeira).length;
    // Consistência pesa mais que quantidade: ";" em todas as linhas ganha da
    // "," que aparece só nos nomes com vírgula.
    const nota = (constantes / contagens.length) * 1000 + primeira;
    if (nota > melhorNota) {
      melhorNota = nota;
      melhor = candidato;
    }
  }
  return melhor;
}

/** Os registros do texto, um array de campos por registro. */
export function separarRegistros(
  texto: string,
  caractere: string,
  maximo = Number.POSITIVE_INFINITY,
): string[][] {
  const registros: string[][] = [];
  let campo = "";
  let registro: string[] = [];
  let dentro = false;
  let i = 0;
  const n = texto.length;

  const fecharRegistro = () => {
    registro.push(campo);
    registros.push(registro);
    registro = [];
    campo = "";
    if (registros.length > maximo) {
      throw new ErroDaLeitura(
        "linhas_demais",
        `O arquivo passa de ${MAXIMO_DE_LINHAS_DA_IMPORTACAO.toLocaleString("pt-BR")} linhas. Divida em arquivos menores.`,
      );
    }
  };

  while (i < n) {
    const letra = texto[i] as string;
    if (dentro && letra === '"' && texto[i + 1] === '"') {
      campo += '"';
      i += 2;
      continue;
    }
    if (dentro) {
      if (letra === '"') dentro = false;
      else campo += letra;
      i += 1;
      continue;
    }
    if (letra === '"' && campo.trim() === "") {
      dentro = true;
      campo = "";
      i += 1;
      continue;
    }
    if (letra === caractere) {
      registro.push(campo);
      campo = "";
      i += 1;
      continue;
    }
    if (letra === "\r" || letra === "\n") {
      fecharRegistro();
      i += letra === "\r" && texto[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    campo += letra;
    i += 1;
  }
  if (campo !== "" || registro.length > 0) fecharRegistro();
  return registros;
}

export interface OpcoesDoCsv {
  readonly separador?: SeparadorDaImportacao;
  readonly codificacao?: CodificacaoDaImportacao;
  readonly formato: "csv" | "tsv";
}

export function lerCsv(bytes: Uint8Array, opcoes: OpcoesDoCsv): TabelaLida {
  const { texto, codificacao } = decodificarTexto(bytes, opcoes.codificacao);
  const separador =
    opcoes.separador ??
    (opcoes.formato === "tsv" ? "tab" : detectarSeparador(texto));
  // Cabeçalho + o máximo de linhas de dados + uma folga para linhas vazias
  // no fim, que não contam.
  const registros = separarRegistros(
    texto,
    CARACTERE_DO_SEPARADOR[separador],
    MAXIMO_DE_LINHAS_DA_IMPORTACAO * 2 + 1,
  );

  const inicio = registros.findIndex((registro) => !linhaVazia(registro));
  if (inicio === -1) {
    throw new ErroDaLeitura(
      "arquivo_vazio",
      "O arquivo não tem nenhuma linha.",
    );
  }
  const cabecalho = registros[inicio] as string[];
  const colunas = nomesUnicosDasColunas(cabecalho);

  const linhas: LinhaLida[] = [];
  for (let r = inicio + 1; r < registros.length; r += 1) {
    const registro = registros[r] as string[];
    if (linhaVazia(registro)) continue;
    const valores = colunas.map((_, c) => (registro[c] ?? "").trim());
    linhas.push({ numero: r + 1, valores });
  }

  return {
    formato: separador === "tab" ? "tsv" : opcoes.formato,
    codificacao,
    separador,
    colunas,
    linhas,
  };
}
