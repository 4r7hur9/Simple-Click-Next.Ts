/**
 * JSON e JSON Lines (card #60).
 *
 * JSON: uma LISTA de objetos (`[{...}, {...}]`), ou um objeto que tenha a
 * lista dentro (`{"clientes": [...]}`, `{"data": [...]}` — vale a primeira
 * propriedade que for lista de objetos), ou uma lista de listas em que a
 * primeira é o cabeçalho. JSON Lines: um objeto por linha.
 *
 * Objeto dentro de objeto vira coluna com ponto (`endereco.cidade`), um nível
 * só — é o bastante para o export de CRM e de formulário, que é o que chega.
 */
import type { CodificacaoDaImportacao } from "@simpleclick/contracts";

import {
  ErroDaLeitura,
  linhaVazia,
  nomesUnicosDasColunas,
  type LinhaLida,
  type TabelaLida,
} from "./tabela.ts";
import { decodificarTexto } from "./texto.ts";

type Registro = Readonly<Record<string, unknown>>;

function ehObjeto(valor: unknown): valor is Registro {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/** Valor de célula como texto: número sem notação científica, nulo vazio. */
export function comoTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "string") return valor.trim();
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) return "";
    return Number.isInteger(valor) && Math.abs(valor) < 1e21
      ? valor.toFixed(0)
      : String(valor);
  }
  if (typeof valor === "boolean") return valor ? "sim" : "não";
  if (Array.isArray(valor))
    return valor.map(comoTexto).filter(Boolean).join(", ");
  return JSON.stringify(valor);
}

/** O objeto achatado um nível: `{a: {b: 1}}` → `{"a.b": 1}`. */
function achatar(registro: Registro): Map<string, unknown> {
  const plano = new Map<string, unknown>();
  for (const [chave, valor] of Object.entries(registro)) {
    if (ehObjeto(valor)) {
      for (const [sub, interno] of Object.entries(valor)) {
        plano.set(`${chave}.${sub}`, interno);
      }
    } else {
      plano.set(chave, valor);
    }
  }
  return plano;
}

/** A lista de registros que o documento carrega. */
function listaDoDocumento(documento: unknown): readonly unknown[] {
  if (Array.isArray(documento)) return documento;
  if (ehObjeto(documento)) {
    for (const valor of Object.values(documento)) {
      if (Array.isArray(valor) && valor.some((item) => ehObjeto(item))) {
        return valor;
      }
    }
    for (const valor of Object.values(documento)) {
      if (Array.isArray(valor)) return valor;
    }
  }
  throw new ErroDaLeitura(
    "arquivo_ilegivel",
    "O JSON precisa ser uma lista de clientes, ou um objeto com a lista dentro.",
  );
}

/** Registros (com o número de cada) → tabela. */
function tabelaDosRegistros(
  itens: readonly { readonly numero: number; readonly valor: unknown }[],
  formato: "json" | "jsonl",
  codificacao: CodificacaoDaImportacao,
): TabelaLida {
  // Lista de listas: a primeira é o cabeçalho.
  const primeiro = itens[0]?.valor;
  if (Array.isArray(primeiro)) {
    const colunas = nomesUnicosDasColunas(primeiro.map(comoTexto));
    const linhas: LinhaLida[] = [];
    for (const item of itens.slice(1)) {
      if (!Array.isArray(item.valor)) continue;
      const lista = item.valor as unknown[];
      const valores = colunas.map((_, c) => comoTexto(lista[c]));
      if (!linhaVazia(valores)) linhas.push({ numero: item.numero, valores });
    }
    return { formato, codificacao, separador: null, colunas, linhas };
  }

  const planos = itens
    .filter((item) => ehObjeto(item.valor))
    .map((item) => ({
      numero: item.numero,
      plano: achatar(item.valor as Registro),
    }));
  const chaves: string[] = [];
  const vistas = new Set<string>();
  for (const { plano } of planos) {
    for (const chave of plano.keys()) {
      if (!vistas.has(chave)) {
        vistas.add(chave);
        chaves.push(chave);
      }
    }
  }
  if (chaves.length === 0) {
    throw new ErroDaLeitura(
      "arquivo_vazio",
      "O JSON não tem nenhum cliente com campos.",
    );
  }
  const colunas = nomesUnicosDasColunas(chaves);
  const linhas: LinhaLida[] = [];
  for (const { numero, plano } of planos) {
    const valores = chaves.map((chave) => comoTexto(plano.get(chave)));
    if (!linhaVazia(valores)) linhas.push({ numero, valores });
  }
  return { formato, codificacao, separador: null, colunas, linhas };
}

export function lerJson(
  bytes: Uint8Array,
  codificacaoForcada?: CodificacaoDaImportacao,
): TabelaLida {
  const { texto, codificacao } = decodificarTexto(bytes, codificacaoForcada);
  let documento: unknown;
  try {
    documento = JSON.parse(texto);
  } catch {
    throw new ErroDaLeitura(
      "arquivo_ilegivel",
      "O JSON está quebrado: confira vírgulas, aspas e colchetes.",
    );
  }
  const lista = listaDoDocumento(documento);
  return tabelaDosRegistros(
    lista.map((valor, indice) => ({ numero: indice + 1, valor })),
    "json",
    codificacao,
  );
}

export function lerJsonLines(
  bytes: Uint8Array,
  codificacaoForcada?: CodificacaoDaImportacao,
): TabelaLida {
  const { texto, codificacao } = decodificarTexto(bytes, codificacaoForcada);
  const itens: { numero: number; valor: unknown }[] = [];
  const linhas = texto.split(/\r\n|\n|\r/);
  for (let i = 0; i < linhas.length; i += 1) {
    const linha = (linhas[i] as string).trim();
    if (linha === "") continue;
    try {
      itens.push({ numero: i + 1, valor: JSON.parse(linha) });
    } catch {
      throw new ErroDaLeitura(
        "arquivo_ilegivel",
        `A linha ${i + 1} do JSON Lines não é um JSON válido.`,
      );
    }
  }
  if (itens.length === 0) {
    throw new ErroDaLeitura(
      "arquivo_vazio",
      "O arquivo não tem nenhuma linha.",
    );
  }
  return tabelaDosRegistros(itens, "jsonl", codificacao);
}
