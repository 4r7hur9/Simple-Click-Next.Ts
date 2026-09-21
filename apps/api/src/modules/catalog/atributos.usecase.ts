/**
 * Campos próprios do ramo no cadastro de produto (T-309).
 *
 * A estrutura continua flexível para não transformar cada ramo em uma tabela,
 * mas os valores conhecidos recebem validação antes de serem persistidos.
 */

type ValorJson =
  | string
  | number
  | boolean
  | null
  | ValorJson[]
  | { [chave: string]: ValorJson };

type ObjetoJson = { [chave: string]: ValorJson };

export interface DefinicaoDeAtributo {
  readonly chave: string;
  readonly rotulo: string;
  readonly tipo: "texto" | "numero" | "selecao";
  readonly opcoes?: readonly string[];
}

const ATRIBUTOS_POR_RAMO: Readonly<
  Record<string, readonly DefinicaoDeAtributo[]>
> = {
  ELECTRONICS: [
    {
      chave: "voltagem",
      rotulo: "Voltagem",
      tipo: "selecao",
      opcoes: ["110V", "220V", "BIVOLT"],
    },
    { chave: "garantiaMeses", rotulo: "Garantia (meses)", tipo: "numero" },
  ],
  AUTO_PARTS: [
    { chave: "marca", rotulo: "Marca", tipo: "texto" },
    { chave: "modelo", rotulo: "Modelo", tipo: "texto" },
    { chave: "anoInicial", rotulo: "Ano inicial", tipo: "numero" },
    { chave: "anoFinal", rotulo: "Ano final", tipo: "numero" },
  ],
};

export class ErroDeAtributoInvalido extends Error {
  readonly chave: string;

  constructor(chave: string) {
    super(`atributo inválido: ${chave}`);
    this.name = "ErroDeAtributoInvalido";
    this.chave = chave;
  }
}

function objeto(valor: unknown): Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

function valorJson(valor: unknown, chave: string): ValorJson {
  if (valor === null) return null;
  if (typeof valor === "string" || typeof valor === "boolean") return valor;
  if (typeof valor === "number" && Number.isFinite(valor)) return valor;
  if (Array.isArray(valor)) return valor.map((item) => valorJson(item, chave));
  if (typeof valor === "object") {
    const resultado: ObjetoJson = {};
    for (const [nome, item] of Object.entries(valor)) {
      resultado[nome] = valorJson(item, chave);
    }
    return resultado;
  }
  throw new ErroDeAtributoInvalido(chave);
}

export function atributosDoRamo(
  codigoDoRamo: string,
): readonly DefinicaoDeAtributo[] {
  return ATRIBUTOS_POR_RAMO[codigoDoRamo] ?? [];
}

/** Valida campos conhecidos e preserva campos criados pelo dono da loja. */
export function validarAtributosDoRamo(
  codigoDoRamo: string,
  bruto: unknown,
): ObjetoJson {
  const atributos = objeto(bruto);
  const definicoes = atributosDoRamo(codigoDoRamo);

  for (const definicao of definicoes) {
    const valor = atributos[definicao.chave];
    if (valor === undefined || valor === null || valor === "") continue;

    if (definicao.tipo === "texto" && typeof valor !== "string") {
      throw new ErroDeAtributoInvalido(definicao.chave);
    }
    if (
      definicao.tipo === "numero" &&
      (typeof valor !== "number" || !Number.isInteger(valor) || valor < 0)
    ) {
      throw new ErroDeAtributoInvalido(definicao.chave);
    }
    if (
      definicao.tipo === "selecao" &&
      !definicao.opcoes?.includes(String(valor))
    ) {
      throw new ErroDeAtributoInvalido(definicao.chave);
    }
  }

  const normalizados: ObjetoJson = {};
  for (const [chave, valor] of Object.entries(atributos)) {
    normalizados[chave] = valorJson(valor, chave);
  }
  return normalizados;
}
