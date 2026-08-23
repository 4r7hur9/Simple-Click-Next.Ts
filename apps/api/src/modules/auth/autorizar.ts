/**
 * Decisões de acesso da aplicação (AC-116 a AC-118).
 *
 * A autorização daqui é deliberadamente uma segunda camada. A primeira é a
 * política RLS do PostgreSQL: se alguém esquecer esta checagem antes de uma
 * consulta, o banco ainda devolve zero linhas da loja alheia. Por isso a lista
 * de lojas permitidas tem de ser resolvida a partir dos vínculos persistidos,
 * nunca a partir de um id enviado pela URL.
 */

export type PapelDeAutorizacao = "CUSTOMER" | "OWNER" | "STAFF" | "ADMIN";

/** Identidade já verificada na borda, antes de chegar ao domínio. */
export interface AtorAutenticado {
  readonly identidadeId: string;
  readonly papel: PapelDeAutorizacao;
  /** Vínculos ativos resolvidos no servidor; não vêm da requisição do cliente. */
  readonly lojasPermitidas: readonly string[];
}

export const RESPOSTA_DE_ACESSO_NEGADO = {
  status: 403,
  codigo: "acesso_negado",
  mensagem: "Você não tem permissão para acessar esta área.",
} as const;

/** Recusa neutra: não revela se uma loja, pedido ou produto realmente existe. */
export class ErroDeAcessoNegado extends Error {
  readonly resposta = RESPOSTA_DE_ACESSO_NEGADO;

  constructor() {
    super(RESPOSTA_DE_ACESSO_NEGADO.mensagem);
    this.name = "ErroDeAcessoNegado";
  }
}

function ehDaEquipeDaLoja(ator: AtorAutenticado): boolean {
  return ator.papel === "OWNER" || ator.papel === "STAFF";
}

/** Só administração atravessa lojas; equipe precisa ter vínculo com a loja alvo. */
export function podeAcessarLoja(
  ator: AtorAutenticado,
  lojaId: string,
): boolean {
  if (ator.papel === "ADMIN") return true;
  return ehDaEquipeDaLoja(ator) && ator.lojasPermitidas.includes(lojaId);
}

/** Interrompe a operação antes da consulta quando o escopo não pertence ao ator. */
export function exigirAcessoALoja(
  ator: AtorAutenticado,
  lojaId: string,
): void {
  if (!podeAcessarLoja(ator, lojaId)) throw new ErroDeAcessoNegado();
}

export function podeAcessarPainelDaLoja(ator: AtorAutenticado): boolean {
  return ehDaEquipeDaLoja(ator);
}

export function podeAcessarAreaAdministrativa(
  ator: AtorAutenticado,
): boolean {
  return ator.papel === "ADMIN";
}

export type AreaDeGestao = "painel" | "administracao";

/** Uma rota única evita denunciar qual área protegida existe do outro lado. */
export function rotaSeguraParaAreaDeGestao(
  ator: AtorAutenticado,
  area: AreaDeGestao,
): "/sem-permissao" | undefined {
  const permitido =
    area === "painel"
      ? podeAcessarPainelDaLoja(ator)
      : podeAcessarAreaAdministrativa(ator);
  return permitido ? undefined : "/sem-permissao";
}

export interface RegistroDeAcessoAdministrativo {
  readonly lojaId: string;
  readonly atorId: string;
  readonly papelDoAtor: "ADMIN";
  readonly acao: "ADMIN_ACCESS";
  readonly entidade: string;
  readonly entidadeId: string | undefined;
  readonly ocorridoEm: Date;
}

export interface ConsultaAdministrativa<T> {
  readonly lojaId: string;
  /** Tipo do dado acessado, sem colocar dado pessoal no histórico. */
  readonly entidade: string;
  readonly entidadeId?: string | undefined;
  readonly registrarAcesso: (
    registro: RegistroDeAcessoAdministrativo,
  ) => Promise<void>;
  readonly consultar: () => Promise<T>;
  readonly agora?: () => Date;
}

/**
 * Administração não ganha um atalho silencioso: toda leitura de dado de loja
 * passa pelo registro antes de consultar. O chamador executa as duas etapas na
 * mesma unidade de trabalho quando precisar de atomicidade com a leitura.
 */
export async function consultarDadosDaLojaComoAdministrador<T>(
  ator: AtorAutenticado,
  consulta: ConsultaAdministrativa<T>,
): Promise<T> {
  if (!podeAcessarAreaAdministrativa(ator)) throw new ErroDeAcessoNegado();

  await consulta.registrarAcesso({
    lojaId: consulta.lojaId,
    atorId: ator.identidadeId,
    papelDoAtor: "ADMIN",
    acao: "ADMIN_ACCESS",
    entidade: consulta.entidade,
    entidadeId: consulta.entidadeId,
    ocorridoEm: consulta.agora?.() ?? new Date(),
  });
  return consulta.consultar();
}
