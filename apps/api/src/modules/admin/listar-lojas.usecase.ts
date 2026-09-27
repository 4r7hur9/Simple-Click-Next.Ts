/**
 * Lista e busca de lojas pela administração (AC-206).
 *
 * A consulta chega validada pela borda (`esquemaDaConsultaDeLojas`). O que
 * este caso de uso decide é a TRADUÇÃO da busca: um campo só, que a pessoa
 * preenche com o que tem na mão — parte do nome, o CNPJ com ou sem máscara, o
 * código de atendimento — e que aqui vira as duas perguntas que o banco sabe
 * responder: "casa com nome ou código?" e "casa com os dígitos do documento?".
 *
 * Os acentos são ignorados no banco (`app.sem_acento`, migração 0021), e não
 * aqui: a mesma regra que a busca da vitrine usa, escrita uma vez só.
 */

import {
  somenteDigitos,
  type ConsultaDeLojasNoContrato,
  type ListaDeLojasNoContrato,
  type LojaNaListaNoContrato,
  type SituacaoDaLoja,
} from "@simpleclick/contracts";

/** A busca como o repositório a recebe. */
export interface BuscaDeLojas {
  /** Em minúsculas e sem espaços nas pontas. Vazio é "sem busca". */
  readonly texto: string;
  /** Só os dígitos, quando o que foi digitado tem cara de documento. */
  readonly digitos: string;
  /** `null` é "tudo que não foi excluído". */
  readonly situacao: SituacaoDaLoja | null;
  readonly limite: number;
  readonly deslocamento: number;
}

/** O que o caso de uso precisa do banco. */
export interface RepositorioDaListagem {
  buscarLojas(busca: BuscaDeLojas): Promise<{
    readonly lojas: readonly LojaNaListaNoContrato[];
    readonly total: number;
  }>;
}

/**
 * O texto tem cara de documento quando só tem dígitos e máscara — e ao menos
 * três dígitos, senão "1" casaria com todo documento da plataforma.
 */
function digitosDeDocumento(texto: string): string {
  if (!/^[\d.\-/\s]+$/.test(texto)) return "";
  const digitos = somenteDigitos(texto);
  return /^\d{3,}$/.test(digitos) ? digitos : "";
}

/** Traduz a consulta da tela para a busca do banco. */
export function prepararBuscaDeLojas(
  consulta: ConsultaDeLojasNoContrato,
): BuscaDeLojas {
  const texto = (consulta.busca ?? "").trim().toLowerCase();
  return {
    texto,
    digitos: digitosDeDocumento(texto),
    situacao: consulta.situacao ?? null,
    limite: consulta.porPagina,
    deslocamento: (consulta.pagina - 1) * consulta.porPagina,
  };
}

/** A página pedida, com o total para a tela saber quantas existem. */
export async function listarLojas(
  consulta: ConsultaDeLojasNoContrato,
  repositorio: RepositorioDaListagem,
): Promise<ListaDeLojasNoContrato> {
  const encontradas = await repositorio.buscarLojas(
    prepararBuscaDeLojas(consulta),
  );
  return {
    lojas: [...encontradas.lojas],
    total: encontradas.total,
    pagina: consulta.pagina,
    porPagina: consulta.porPagina,
  };
}
