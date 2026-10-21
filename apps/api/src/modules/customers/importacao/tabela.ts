/**
 * A tabela que todo leitor entrega (card #60): o que veio do arquivo, já sem
 * formato. Colunas com nome único e linhas de texto cru, cada uma com o
 * número que o dono reconhece no arquivo dele.
 */
import type {
  CodificacaoDaImportacao,
  ErroDaImportacao,
  FormatoDaImportacao,
  SeparadorDaImportacao,
} from "@simpleclick/contracts";

/** Uma linha de dados: o número dela no arquivo e um texto por coluna. */
export interface LinhaLida {
  readonly numero: number;
  readonly valores: readonly string[];
}

export interface TabelaLida {
  readonly formato: FormatoDaImportacao;
  readonly codificacao: CodificacaoDaImportacao | null;
  readonly separador: SeparadorDaImportacao | null;
  readonly colunas: readonly string[];
  readonly linhas: readonly LinhaLida[];
}

/** O arquivo que não dá para ler, com a frase que o painel mostra. */
export class ErroDaLeitura extends Error {
  readonly codigo: ErroDaImportacao;

  constructor(codigo: ErroDaImportacao, mensagem: string) {
    super(mensagem);
    this.name = "ErroDaLeitura";
    this.codigo = codigo;
  }
}

/**
 * Os nomes das colunas como o painel vai mandá-los de volta no mapeamento:
 * sem espaço sobrando, sem vazio ("Coluna 3") e sem repetição ("Nome (2)").
 */
export function nomesUnicosDasColunas(
  brutos: readonly string[],
): readonly string[] {
  const vistos = new Map<string, number>();
  return brutos.map((bruto, indice) => {
    const base = bruto.replace(/\s+/g, " ").trim() || `Coluna ${indice + 1}`;
    const chave = base.toLowerCase();
    const vezes = (vistos.get(chave) ?? 0) + 1;
    vistos.set(chave, vezes);
    return vezes === 1 ? base : `${base} (${vezes})`;
  });
}

/** Linha em que nenhuma célula tem texto. */
export function linhaVazia(valores: readonly string[]): boolean {
  return valores.every((valor) => valor.trim() === "");
}
