/**
 * Histórico de auditoria consultável pela administração (T-208, AC-215).
 *
 * A trilha é só leitura aqui: ninguém altera nem apaga um registro (o banco
 * recusa, migrações da trilha). Este caso de uso traduz a consulta da tela —
 * loja, ato e período em dias de Brasília — para a busca do banco, e devolve
 * a página no formato do contrato.
 *
 * DUAS CAMADAS CONTRA DADO PESSOAL (P-009): quem grava já mascara; e a
 * leitura mascara de novo o campo cujo nome é de dado pessoal, para que um
 * registro gravado fora da regra não vire, nesta tela, um lugar de onde se
 * copia o documento ou a chave PIX de alguém.
 *
 * A consulta da administração também é um acesso a dados de loja (AC-118):
 * cada loja que aparece na página ganha o seu `ADMIN_ACCESS`, gravado por
 * quem chama, na mesma transação.
 */

import type {
  CampoDaTrilhaNoContrato,
  ConsultaDaAuditoriaNoContrato,
  PaginaDaAuditoriaNoContrato,
  RegistroDaAuditoriaNoContrato,
} from "@simpleclick/contracts";

import {
  mascararDadoPessoal,
  registroDaTrilha,
  type LinhaDaTrilha,
} from "./trilha.ts";

/** Brasília não tem horário de verão desde 2019: o dia começa às 03:00 UTC. */
const FUSO_DE_BRASILIA = "-03:00";

/** O ato que registra uma consulta da administração (AC-118). */
export const ATO_DE_CONSULTA = "ADMIN_ACCESS";

/** A busca como o repositório a recebe. `null` é "sem esse filtro". */
export interface BuscaNaAuditoria {
  readonly lojaId: string | null;
  readonly acao: string | null;
  /** Instante inicial, inclusive. */
  readonly desde: Date | null;
  /** Instante final, exclusive: o começo do dia seguinte ao último. */
  readonly antesDe: Date | null;
  /**
   * Sem filtro de ato, as consultas da administração ficam de fora: senão a
   * própria leitura do histórico encheria o histórico. Pedidas pelo filtro,
   * elas aparecem.
   */
  readonly semConsultas: boolean;
  readonly limite: number;
  readonly deslocamento: number;
}

/** Uma linha do banco: a da trilha e a loja a que ela pertence. */
export interface LinhaDaAuditoria extends LinhaDaTrilha {
  readonly loja: {
    readonly id: string;
    readonly codigo: string;
    readonly nome: string;
  };
}

export interface RepositorioDaAuditoria {
  buscarNaAuditoria(busca: BuscaNaAuditoria): Promise<{
    readonly linhas: readonly LinhaDaAuditoria[];
    readonly total: number;
  }>;
}

/** O começo do dia no horário de Brasília. */
function inicioDoDia(dia: string): Date {
  return new Date(`${dia}T00:00:00.000${FUSO_DE_BRASILIA}`);
}

const UM_DIA_EM_MS = 24 * 60 * 60 * 1000;

/** Traduz a consulta da tela para a busca do banco. */
export function prepararBuscaNaAuditoria(
  consulta: ConsultaDaAuditoriaNoContrato,
): BuscaNaAuditoria {
  return {
    lojaId: consulta.loja ?? null,
    acao: consulta.ato ?? null,
    desde: consulta.de === undefined ? null : inicioDoDia(consulta.de),
    antesDe:
      consulta.ate === undefined
        ? null
        : new Date(inicioDoDia(consulta.ate).getTime() + UM_DIA_EM_MS),
    semConsultas: consulta.ato === undefined,
    limite: consulta.porPagina,
    deslocamento: (consulta.pagina - 1) * consulta.porPagina,
  };
}

/**
 * Pedaços de nome de campo que denunciam dado pessoal: documento, contato,
 * endereço e chave PIX. Comparados sem caixa, no último trecho do caminho.
 */
const NOMES_DE_DADO_PESSOAL = [
  "cpf",
  "cnpj",
  "documento",
  "doc_number",
  "email",
  "telefone",
  "phone",
  "whatsapp",
  "pix",
  "chave",
  "cep",
  "zip",
  "logradouro",
  "street",
] as const;

/** Contato que guarda o número num campo chamado só `numero`. */
const CONTATOS_COM_NUMERO = /whatsapp|telefone|phone/;

/**
 * O campo guarda dado pessoal, pelo nome? Vale o último trecho do caminho
 * (`pix.chave`, `responsavel.email`) e o número de um contato
 * (`whatsapp.numero`) — o número da casa, sozinho, não é contato.
 */
export function campoPessoal(campo: string): boolean {
  const trechos = campo.toLowerCase().split(".");
  const ultimo = trechos[trechos.length - 1] ?? "";
  if (NOMES_DE_DADO_PESSOAL.some((pedaco) => ultimo.includes(pedaco))) {
    return true;
  }
  return (
    ultimo === "numero" &&
    trechos.some((trecho) => CONTATOS_COM_NUMERO.test(trecho))
  );
}

/** Já mascarado na gravação: começa com reticências e sobra só o final. */
function jaMascarado(valor: unknown): boolean {
  return typeof valor === "string" && valor.startsWith("…");
}

/** O valor do campo pessoal mascarado, sem mascarar duas vezes. */
function protegido(campo: string, valor: unknown): unknown {
  if (!campoPessoal(campo) || jaMascarado(valor)) return valor;
  if (typeof valor === "string") return mascararDadoPessoal(valor);
  // Sim/não e número dizem o que mudou sem ser o dado; um objeto inteiro num
  // campo pessoal não tem final legível a mostrar.
  if (typeof valor === "object" && valor !== null) return "…";
  return valor;
}

/** Os campos do registro com a segunda camada da máscara (P-009). */
export function camposProtegidos(
  campos: readonly CampoDaTrilhaNoContrato[],
): CampoDaTrilhaNoContrato[] {
  return campos.map((campo) => ({
    campo: campo.campo,
    antes: protegido(campo.campo, campo.antes),
    depois: protegido(campo.campo, campo.depois),
  }));
}

/** A linha do banco no formato do contrato, já protegida. */
export function registroDaAuditoria(
  linha: LinhaDaAuditoria,
): RegistroDaAuditoriaNoContrato {
  const registro = registroDaTrilha(linha);
  return {
    ...registro,
    campos: camposProtegidos(registro.campos),
    loja: {
      id: linha.loja.id,
      codigo: linha.loja.codigo,
      nome: linha.loja.nome,
    },
  };
}

/** A página pedida do histórico, da mais recente para a mais antiga. */
export async function consultarAuditoria(
  consulta: ConsultaDaAuditoriaNoContrato,
  repositorio: RepositorioDaAuditoria,
): Promise<PaginaDaAuditoriaNoContrato> {
  const encontrados = await repositorio.buscarNaAuditoria(
    prepararBuscaNaAuditoria(consulta),
  );
  return {
    registros: encontrados.linhas.map(registroDaAuditoria),
    total: encontrados.total,
    pagina: consulta.pagina,
    porPagina: consulta.porPagina,
  };
}

/** As lojas distintas da página: cada uma ganha um registro de consulta. */
export function lojasDaPagina(
  pagina: PaginaDaAuditoriaNoContrato,
): readonly string[] {
  return [...new Set(pagina.registros.map((registro) => registro.loja.id))];
}
