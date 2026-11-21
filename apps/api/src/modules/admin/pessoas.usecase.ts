/**
 * Atos da administração sobre PESSOAS (card #170, T-3): cadastrar, editar,
 * desativar, reativar e gerar o link de acesso de uso único.
 *
 * As regras moram aqui e o banco chega por uma porta (`RepositorioDePessoas`),
 * para que a prova das regras não precise de banco. Quem chama roda cada ato
 * numa transação só, pela credencial `sc_admin`: ou tudo fica (o ato e a
 * linha da trilha), ou nada fica.
 *
 * ORDEM DE TRAVA, a mesma em toda a plataforma (0075 e vínculos da T-4):
 * as LOJAS de que a pessoa é dona (por id, em ordem), depois a IDENTIDADE, e só
 * então sessões, links e convites. A conferência de "protegida" (grant ativo
 * de administração) e de "desativada" é feita com a identidade já travada:
 * nada que outra transação faça entre a leitura e o ato muda a decisão.
 *
 * NADA DE ADMINISTRAÇÃO AQUI: nenhum ato escreve em `platform_admins`, e a
 * conta que tem o grant ativo é intocável por estas rotas (409).
 *
 * A trilha é a da PLATAFORMA (`audit_platform`), porque a pessoa não é de loja
 * nenhuma, e a equipe de uma loja lê o `audit_log` dela. Dado pessoal entra
 * mascarado; token, resumo do token e link nunca entram.
 */

import { mascararDadoPessoal } from "./trilha.ts";

/** O link de uso único vale uma hora, como o da recuperação de senha. */
export const VALIDADE_DO_ACESSO_EM_MS = 60 * 60 * 1000;

/** Atos da trilha da plataforma gravados por aqui. */
export const ATOS_DE_PESSOA = {
  criada: "CONTA_CRIADA",
  editada: "CONTA_EDITADA",
  desativada: "CONTA_DESATIVADA",
  reativada: "CONTA_REATIVADA",
  acessoGerado: "ACESSO_GERADO",
  consultada: "CONTA_CONSULTADA",
} as const;

/** Como os atos de pessoa se chamam na coluna `entity` da trilha. */
export const ENTIDADE_DA_PESSOA = "identity";

/** A pessoa como o ato a enxerga, já travada na transação. */
export interface PessoaTravada {
  readonly id: string;
  readonly email: string;
  readonly nome: string | null;
  readonly telefone: string | null;
  readonly temSenha: boolean;
  readonly desativadaEm: Date | null;
  /** Tem grant ativo de administração da plataforma: intocável aqui. */
  readonly protegida: boolean;
}

/** Loja que ficaria sem dono ativo se a pessoa fosse desativada. */
export interface LojaSemOutroDono {
  readonly lojaId: string;
  readonly nome: string;
  readonly apelido: string;
}

/** Um ato na trilha da plataforma, já sem dado pessoal em claro. */
export interface AtoDePessoa {
  readonly atorId: string;
  readonly acao: string;
  readonly identidadeId: string;
  readonly antes?: Readonly<Record<string, unknown>> | null;
  readonly depois?: Readonly<Record<string, unknown>> | null;
}

/** O banco, como estes atos o enxergam. Tudo na transação em curso. */
export interface RepositorioDePessoas {
  /**
   * Trava (FOR UPDATE, em ordem de id) as lojas não excluídas de que a pessoa
   * é dona ativa. Vem ANTES da identidade: é a ordem dos vínculos (T-4).
   */
  travarLojasDoDono(identidadeId: string): Promise<void>;
  /** Trava a identidade (FOR UPDATE). `null`: não existe ou foi anonimizada. */
  travarPessoa(identidadeId: string): Promise<PessoaTravada | null>;
  /**
   * Cria a identidade sem senha e sem papel. Devolve o id novo, ou `null`
   * quando o e-mail já é de outra identidade (sem abortar a transação).
   */
  criarPessoa(dados: {
    readonly nome: string;
    readonly email: string;
    readonly telefone: string | null;
  }): Promise<string | null>;
  /** A identidade que já usa o e-mail. */
  identidadeDoEmail(email: string): Promise<string | null>;
  atualizarPessoa(
    identidadeId: string,
    campos: {
      readonly nome?: string | undefined;
      readonly telefone?: string | null | undefined;
    },
  ): Promise<void>;
  /** Lojas em que a pessoa é a única dona ativa (com as lojas já travadas). */
  lojasQueFicariamSemDono(identidadeId: string): Promise<LojaSemOutroDono[]>;
  /** Preenche `disabled_at` e revoga as sessões com ACCOUNT_DISABLED. */
  marcarDesativada(identidadeId: string, agora: Date): Promise<number>;
  marcarReativada(identidadeId: string): Promise<void>;
  /** Consome os links de redefinição e vence os convites pendentes. */
  consumirAcessosPendentes(identidadeId: string, agora: Date): Promise<void>;
  /** Grava o RESUMO do link, com quem o gerou. */
  gravarAcesso(acesso: {
    readonly identidadeId: string;
    readonly resumo: string;
    readonly expiraEm: Date;
    readonly emissorId: string;
  }): Promise<void>;
  registrar(ato: AtoDePessoa): Promise<void>;
}

/** O que gera e resume o token do link (o mesmo formato da recuperação). */
export interface GeradorDeAcesso {
  readonly gerarToken: () => string;
  readonly resumirToken: (token: string) => string;
}

export interface DependenciasDosAtos extends GeradorDeAcesso {
  readonly repositorio: RepositorioDePessoas;
  readonly agora: () => Date;
}

/** O link recém-gerado: o token só existe aqui e na resposta (uma vez). */
export interface AcessoGerado {
  readonly token: string;
  readonly expiraEm: Date;
}

export type RecusaDoAto =
  | { readonly ok: false; readonly motivo: "NAO_ENCONTRADA" }
  | { readonly ok: false; readonly motivo: "PROTEGIDA" }
  | { readonly ok: false; readonly motivo: "DESATIVADA" };

/** Caminho relativo da tela que define a senha pelo link. */
export function caminhoDoAcesso(token: string): string {
  return `/definir-senha?token=${encodeURIComponent(token)}`;
}

/** Os dados pessoais da pessoa, mascarados para a trilha (P-009). */
function dadosMascarados(
  campos: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const mascarados: Record<string, unknown> = {};
  for (const [campo, valor] of Object.entries(campos)) {
    mascarados[campo] = valor === null ? null : mascararDadoPessoal(valor);
  }
  return mascarados;
}

/**
 * Trava a pessoa e recusa o que nenhum ato pode tocar. Desativada só é
 * recusada quando o ato pede conta ativa.
 */
async function pessoaParaOAto(
  identidadeId: string,
  repositorio: RepositorioDePessoas,
  exigirAtiva: boolean,
): Promise<PessoaTravada | RecusaDoAto> {
  const pessoa = await repositorio.travarPessoa(identidadeId);
  if (pessoa === null) return { ok: false, motivo: "NAO_ENCONTRADA" };
  if (pessoa.protegida) return { ok: false, motivo: "PROTEGIDA" };
  if (exigirAtiva && pessoa.desativadaEm !== null) {
    return { ok: false, motivo: "DESATIVADA" };
  }
  return pessoa;
}

function ehRecusa(valor: PessoaTravada | RecusaDoAto): valor is RecusaDoAto {
  return "ok" in valor;
}

/**
 * Gera o link de uso único, com a identidade JÁ travada por quem chama:
 * consome os links e convites pendentes (só o novo vale), grava o resumo com
 * o emissor e registra ACESSO_GERADO — sem o token, o resumo nem o link.
 */
async function emitirAcesso(
  pessoa: PessoaTravada,
  administradorId: string,
  motivo: string,
  dependencias: DependenciasDosAtos,
): Promise<AcessoGerado> {
  const { repositorio } = dependencias;
  const agora = dependencias.agora();
  const token = dependencias.gerarToken();
  const expiraEm = new Date(agora.getTime() + VALIDADE_DO_ACESSO_EM_MS);
  await repositorio.consumirAcessosPendentes(pessoa.id, agora);
  await repositorio.gravarAcesso({
    identidadeId: pessoa.id,
    resumo: dependencias.resumirToken(token),
    expiraEm,
    emissorId: administradorId,
  });
  await repositorio.registrar({
    atorId: administradorId,
    acao: ATOS_DE_PESSOA.acessoGerado,
    identidadeId: pessoa.id,
    depois: {
      motivo,
      jaTinhaSenha: pessoa.temSenha,
      expiraEm: expiraEm.toISOString(),
      sensivel: true,
    },
  });
  return { token, expiraEm };
}

// ---------------------------------------------------------------------------
// Cadastrar
// ---------------------------------------------------------------------------

export type ResultadoDoCadastro =
  | {
      readonly ok: true;
      readonly identidadeId: string;
      readonly acesso: AcessoGerado;
    }
  | {
      readonly ok: false;
      readonly motivo: "EMAIL_EM_USO";
      readonly identidadeId: string;
    };

/** Motivo gravado no link que nasce com o cadastro. */
export const MOTIVO_DO_ACESSO_DO_CADASTRO =
  "Cadastro da pessoa pela administração";

/**
 * Cria a identidade SEM senha e sem papel, e já gera o link para a pessoa
 * definir a senha. E-mail de outra identidade: recusa apontando qual é.
 */
export async function cadastrarPessoa(
  dados: {
    readonly nome: string;
    readonly email: string;
    readonly telefone?: string | undefined;
  },
  administradorId: string,
  dependencias: DependenciasDosAtos,
): Promise<ResultadoDoCadastro> {
  const { repositorio } = dependencias;
  const telefone = dados.telefone ?? null;
  const criada = await repositorio.criarPessoa({
    nome: dados.nome,
    email: dados.email,
    telefone,
  });
  if (criada === null) {
    const existente = await repositorio.identidadeDoEmail(dados.email);
    if (existente === null) {
      // O conflito veio de uma linha que sumiu no meio: não há como acontecer
      // sem DELETE em identities, que ninguém tem. Falha alta.
      throw new Error("conflito de e-mail sem identidade correspondente");
    }
    return { ok: false, motivo: "EMAIL_EM_USO", identidadeId: existente };
  }

  await repositorio.registrar({
    atorId: administradorId,
    acao: ATOS_DE_PESSOA.criada,
    identidadeId: criada,
    depois: dadosMascarados({
      nome: dados.nome,
      email: dados.email,
      telefone,
    }),
  });
  const pessoa = await repositorio.travarPessoa(criada);
  if (pessoa === null) throw new Error("a pessoa recém-criada não foi achada");
  const acesso = await emitirAcesso(
    pessoa,
    administradorId,
    MOTIVO_DO_ACESSO_DO_CADASTRO,
    dependencias,
  );
  return { ok: true, identidadeId: criada, acesso };
}

// ---------------------------------------------------------------------------
// Editar (só nome e telefone)
// ---------------------------------------------------------------------------

export async function editarPessoa(
  identidadeId: string,
  edicao: {
    readonly nome?: string | undefined;
    readonly telefone?: string | null | undefined;
  },
  administradorId: string,
  repositorio: RepositorioDePessoas,
): Promise<{ readonly ok: true } | RecusaDoAto> {
  const pessoa = await pessoaParaOAto(identidadeId, repositorio, false);
  if (ehRecusa(pessoa)) return pessoa;

  const antes: Record<string, unknown> = {};
  const depois: Record<string, unknown> = {};
  if (edicao.nome !== undefined && edicao.nome !== pessoa.nome) {
    antes["nome"] = pessoa.nome;
    depois["nome"] = edicao.nome;
  }
  if (edicao.telefone !== undefined && edicao.telefone !== pessoa.telefone) {
    antes["telefone"] = pessoa.telefone;
    depois["telefone"] = edicao.telefone;
  }
  if (Object.keys(depois).length === 0) return { ok: true };

  await repositorio.atualizarPessoa(identidadeId, {
    ...("nome" in depois ? { nome: edicao.nome } : {}),
    ...("telefone" in depois ? { telefone: edicao.telefone ?? null } : {}),
  });
  await repositorio.registrar({
    atorId: administradorId,
    acao: ATOS_DE_PESSOA.editada,
    identidadeId,
    antes: { campos: dadosMascarados(antes) },
    depois: { campos: dadosMascarados(depois) },
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Desativar e reativar
// ---------------------------------------------------------------------------

export type ResultadoDaDesativacao =
  | { readonly ok: true; readonly sessoesEncerradas: number }
  | RecusaDoAto
  | {
      readonly ok: false;
      readonly motivo: "DONO_UNICO";
      readonly lojas: readonly LojaSemOutroDono[];
    };

/**
 * Desativa a conta: efeito imediato em login, renovação, recuperação, convite
 * e acesso às lojas (0075). Ser a única dona ativa de uma loja exige ciência
 * explícita (`lojasSemDonoCiente`), e a resposta lista as lojas.
 */
export async function desativarPessoa(
  identidadeId: string,
  pedido: {
    readonly motivo: string;
    readonly lojasSemDonoCiente?: boolean | undefined;
  },
  administradorId: string,
  dependencias: Pick<DependenciasDosAtos, "repositorio" | "agora">,
): Promise<ResultadoDaDesativacao> {
  const { repositorio } = dependencias;
  await repositorio.travarLojasDoDono(identidadeId);
  const pessoa = await pessoaParaOAto(identidadeId, repositorio, true);
  if (ehRecusa(pessoa)) return pessoa;

  const lojas = await repositorio.lojasQueFicariamSemDono(identidadeId);
  if (lojas.length > 0 && pedido.lojasSemDonoCiente !== true) {
    return { ok: false, motivo: "DONO_UNICO", lojas };
  }

  const agora = dependencias.agora();
  const sessoesEncerradas = await repositorio.marcarDesativada(
    identidadeId,
    agora,
  );
  await repositorio.consumirAcessosPendentes(identidadeId, agora);
  await repositorio.registrar({
    atorId: administradorId,
    acao: ATOS_DE_PESSOA.desativada,
    identidadeId,
    depois: {
      motivo: pedido.motivo,
      sessoesEncerradas,
      lojasSemDono: lojas.map((loja) => loja.lojaId),
      sensivel: true,
    },
  });
  return { ok: true, sessoesEncerradas };
}

export async function reativarPessoa(
  identidadeId: string,
  pedido: { readonly motivo: string },
  administradorId: string,
  repositorio: RepositorioDePessoas,
): Promise<{ readonly ok: true } | RecusaDoAto> {
  const pessoa = await pessoaParaOAto(identidadeId, repositorio, false);
  if (ehRecusa(pessoa)) return pessoa;
  // Já ativa: nada muda e nada entra na trilha (repetir o clique é seguro).
  if (pessoa.desativadaEm === null) return { ok: true };

  await repositorio.marcarReativada(identidadeId);
  await repositorio.registrar({
    atorId: administradorId,
    acao: ATOS_DE_PESSOA.reativada,
    identidadeId,
    depois: { motivo: pedido.motivo, sensivel: true },
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Link de acesso de uso único
// ---------------------------------------------------------------------------

export async function gerarAcessoDaPessoa(
  identidadeId: string,
  pedido: { readonly motivo: string },
  administradorId: string,
  dependencias: DependenciasDosAtos,
): Promise<
  | {
      readonly ok: true;
      readonly acesso: AcessoGerado;
      readonly email: string;
    }
  | RecusaDoAto
> {
  const pessoa = await pessoaParaOAto(
    identidadeId,
    dependencias.repositorio,
    true,
  );
  if (ehRecusa(pessoa)) return pessoa;
  const acesso = await emitirAcesso(
    pessoa,
    administradorId,
    pedido.motivo,
    dependencias,
  );
  return { ok: true, acesso, email: pessoa.email };
}
