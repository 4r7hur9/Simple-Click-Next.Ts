/**
 * Qual leitor usar e os tetos do servidor (card #60).
 *
 * O FORMATO vem, nesta ordem: do que o painel forçou, da extensão do nome do
 * arquivo, do tipo do conteúdo e, por fim, dos próprios bytes ("PK" é ZIP,
 * "[" ou "{" é JSON). Os tetos — 5 MB e 5 mil linhas — valem aqui, no
 * servidor, para qualquer formato; o painel pode avisar antes, mas não é ele
 * quem garante.
 */
import {
  MAXIMO_DE_LINHAS_DA_IMPORTACAO,
  TAMANHO_MAXIMO_DA_IMPORTACAO_EM_BYTES,
  type CodificacaoDaImportacao,
  type FormatoDaImportacao,
  type SeparadorDaImportacao,
} from "@simpleclick/contracts";

import { lerCsv } from "./ler-csv.ts";
import { lerJson, lerJsonLines } from "./ler-json.ts";
import { lerXlsx } from "./ler-xlsx.ts";
import { ErroDaLeitura, type TabelaLida } from "./tabela.ts";

export interface OpcoesDaLeitura {
  readonly nomeDoArquivo?: string | null;
  readonly tipoDoConteudo?: string | null;
  readonly formato?: FormatoDaImportacao;
  readonly separador?: SeparadorDaImportacao;
  readonly codificacao?: CodificacaoDaImportacao;
}

const POR_EXTENSAO: Readonly<Record<string, FormatoDaImportacao>> = {
  csv: "csv",
  txt: "csv",
  tsv: "tsv",
  tab: "tsv",
  json: "json",
  jsonl: "jsonl",
  ndjson: "jsonl",
  xlsx: "xlsx",
};

const NAO_SUPORTADOS: Readonly<Record<string, string>> = {
  xls: "O formato .xls antigo não é aceito. No Excel, use Salvar como → .xlsx ou .csv.",
  ods: "O formato .ods não é aceito. Salve como .xlsx ou .csv.",
  numbers: "O formato .numbers não é aceito. Exporte como .xlsx ou .csv.",
};

const POR_TIPO: Readonly<Record<string, FormatoDaImportacao>> = {
  "text/csv": "csv",
  "application/csv": "csv",
  "text/tab-separated-values": "tsv",
  "application/json": "json",
  "application/x-ndjson": "jsonl",
  "application/jsonl": "jsonl",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

function extensao(nome: string | null | undefined): string | null {
  const achado = /\.([a-z0-9]+)$/i.exec(nome?.trim() ?? "");
  return achado?.[1]?.toLowerCase() ?? null;
}

/** O começo do texto, sem marca e sem espaço. */
function primeiroCaractere(bytes: Uint8Array): string {
  let i = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) i = 3;
  while (
    i < bytes.length &&
    /\s/.test(String.fromCharCode(bytes[i] as number))
  ) {
    i += 1;
  }
  return i < bytes.length ? String.fromCharCode(bytes[i] as number) : "";
}

/** Um objeto por linha: a primeira linha não vazia já fecha um JSON. */
function pareceJsonLines(bytes: Uint8Array): boolean {
  const inicio = new TextDecoder("utf-8").decode(bytes.subarray(0, 64 * 1024));
  const linhas = inicio.split(/\r\n|\n|\r/).filter((l) => l.trim() !== "");
  if (linhas.length < 2) return false;
  try {
    JSON.parse(linhas[0] as string);
    JSON.parse(linhas[1] as string);
    return true;
  } catch {
    return false;
  }
}

export function descobrirFormato(
  bytes: Uint8Array,
  opcoes: OpcoesDaLeitura,
): FormatoDaImportacao {
  if (opcoes.formato !== undefined) return opcoes.formato;
  const ext = extensao(opcoes.nomeDoArquivo);
  if (ext !== null && NAO_SUPORTADOS[ext] !== undefined) {
    throw new ErroDaLeitura("formato_nao_suportado", NAO_SUPORTADOS[ext]);
  }
  // XLS e outros documentos antigos do Office (OLE): D0 CF 11 E0.
  if (
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0
  ) {
    throw new ErroDaLeitura(
      "formato_nao_suportado",
      NAO_SUPORTADOS.xls as string,
    );
  }
  if (ext !== null && POR_EXTENSAO[ext] !== undefined) return POR_EXTENSAO[ext];
  const tipo = opcoes.tipoDoConteudo?.split(";")[0]?.trim().toLowerCase();
  if (tipo !== undefined && POR_TIPO[tipo] !== undefined) return POR_TIPO[tipo];

  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return "xlsx";
  const primeiro = primeiroCaractere(bytes);
  if (primeiro === "[") return "json";
  if (primeiro === "{") return pareceJsonLines(bytes) ? "jsonl" : "json";
  return "csv";
}

/** Lê o arquivo inteiro, ou recusa dizendo por quê. */
export function lerArquivoDeClientes(
  bytes: Uint8Array,
  opcoes: OpcoesDaLeitura = {},
): TabelaLida {
  if (bytes.length === 0) {
    throw new ErroDaLeitura("arquivo_vazio", "O arquivo enviado está vazio.");
  }
  if (bytes.length > TAMANHO_MAXIMO_DA_IMPORTACAO_EM_BYTES) {
    throw new ErroDaLeitura(
      "arquivo_grande_demais",
      `O arquivo passa de ${TAMANHO_MAXIMO_DA_IMPORTACAO_EM_BYTES / (1024 * 1024)} MB. Divida em arquivos menores.`,
    );
  }

  const formato = descobrirFormato(bytes, opcoes);
  let tabela: TabelaLida;
  switch (formato) {
    case "csv":
    case "tsv":
      tabela = lerCsv(bytes, {
        formato,
        ...(opcoes.separador === undefined
          ? {}
          : { separador: opcoes.separador }),
        ...(opcoes.codificacao === undefined
          ? {}
          : { codificacao: opcoes.codificacao }),
      });
      break;
    case "json":
      tabela = lerJson(bytes, opcoes.codificacao);
      break;
    case "jsonl":
      tabela = lerJsonLines(bytes, opcoes.codificacao);
      break;
    case "xlsx":
      if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) {
        throw new ErroDaLeitura(
          "arquivo_ilegivel",
          "O arquivo não é uma planilha .xlsx de verdade. Salve de novo pelo Excel ou envie como .csv.",
        );
      }
      tabela = lerXlsx(bytes, MAXIMO_DE_LINHAS_DA_IMPORTACAO);
      break;
  }

  if (tabela.linhas.length > MAXIMO_DE_LINHAS_DA_IMPORTACAO) {
    throw new ErroDaLeitura(
      "linhas_demais",
      `O arquivo passa de ${MAXIMO_DE_LINHAS_DA_IMPORTACAO.toLocaleString("pt-BR")} linhas. Divida em arquivos menores.`,
    );
  }
  if (tabela.linhas.length === 0) {
    throw new ErroDaLeitura(
      "arquivo_vazio",
      "O arquivo só tem o cabeçalho: nenhum cliente para importar.",
    );
  }
  return tabela;
}
