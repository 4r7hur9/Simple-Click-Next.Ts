/**
 * Sessões com renovação rotativa (AC-109, AC-110, AC-111).
 *
 * A operação decisiva fica no repositório: consumir o refresh atual, criar o
 * próximo e, no reuso, revogar a família inteira precisam ocorrer na mesma
 * transação. Separar essas etapas abriria uma corrida em que dois pedidos com
 * o mesmo token ganhariam cada um uma sessão nova.
 */

import { randomUUID } from "node:crypto";

import {
  assinarTokenDeAcesso,
  DURACAO_DO_TOKEN_DE_ACESSO_EM_SEGUNDOS,
  DURACAO_DO_TOKEN_DE_RENOVACAO_EM_SEGUNDOS,
  gerarTokenDeRenovacao,
  resumirTokenDeRenovacao,
  type PapelDaSessao,
} from "./token.ts";

/** A origem declara como a pessoa vai receber a sessão. */
export type ClienteDaSessao = "navegador" | "nativo";

/** Dados já autenticados pelo login ou pelo segundo fator. */
export interface InicioDaSessao {
  readonly identidadeId: string;
  readonly papel: PapelDaSessao;
  readonly cliente: ClienteDaSessao;
}

/** Linha mínima que a persistência precisa guardar para a rotação. */
export interface SessaoPersistida {
  readonly id: string;
  readonly familiaId: string;
  readonly identidadeId: string;
  readonly papel: PapelDaSessao;
  readonly cliente: ClienteDaSessao;
  readonly resumoDoRefresh: string;
  readonly criadaEm: Date;
  readonly expiraEm: Date;
}

/** Dados novos que o repositório junta à sessão ativa na mesma transação. */
export interface PedidoDeRotacao {
  readonly sessaoId: string;
  readonly resumoDoNovoRefresh: string;
  readonly criadaEm: Date;
  readonly expiraEm: Date;
}

/** O repositório responde depois de uma operação atômica de rotação. */
export type ResultadoDaRotacaoNoRepositorio =
  | {
      readonly estado: "rotacionada";
      readonly anterior: SessaoPersistida;
      readonly substituta: SessaoPersistida;
    }
  | {
      readonly estado: "reuso_detectado";
      readonly identidadeId: string;
      readonly familiaId: string;
      /** Impede um invasor de causar um e-mail por repetição do mesmo token. */
      readonly familiaJaEstavaRevogada: boolean;
    }
  | { readonly estado: "recusada" };

/** Porta de dados; a implementação de produção deve usar uma transação. */
export interface RepositorioDeSessoes {
  criar(sessao: SessaoPersistida): Promise<void>;
  rotacionar(
    resumoDoRefreshApresentado: string,
    pedido: PedidoDeRotacao,
    agora: Date,
  ): Promise<ResultadoDaRotacaoNoRepositorio>;
}

/** Porta de aviso: a infraestrutura resolve o endereço sem vazar dado no log. */
export interface AvisadorDeReusoDeSessao {
  avisarReusoDeToken(dados: {
    readonly identidadeId: string;
    readonly familiaId: string;
  }): Promise<void>;
}

/** Dependências explícitas deixam a regra exercitável e sem estado global. */
export interface DependenciasDaSessao {
  readonly repositorio: RepositorioDeSessoes;
  readonly avisador: AvisadorDeReusoDeSessao;
  /** Vem de JWT_SECRET já validada na inicialização (P-002). */
  readonly segredoDeAssinatura: string;
  readonly agora?: () => Date;
  readonly gerarIdentificador?: () => string;
  readonly gerarRefresh?: () => string;
}

interface TokensDaSessao {
  readonly tokenDeAcesso: string;
  readonly tokenDeRenovacao: string;
  readonly acessoExpiraEm: Date;
  readonly renovacaoExpiraEm: Date;
}

/**
 * A borda web recebe os tokens só dentro do servidor para pôr o refresh no
 * cookie. Ela não serializa esta estrutura diretamente para o navegador.
 */
export interface SessaoParaBordaWeb extends TokensDaSessao {
  readonly destino: "navegador";
}

/** O aplicativo nativo recebe o par no corpo e usa o acesso como Bearer. */
export interface SessaoParaClienteNativo extends TokensDaSessao {
  readonly destino: "nativo";
}

export type SessaoEntregue = SessaoParaBordaWeb | SessaoParaClienteNativo;

/** Resultado público de uma tentativa de renovação. */
export type ResultadoDaRenovacao =
  | { readonly estado: "renovada"; readonly sessao: SessaoEntregue }
  | { readonly estado: "reuso_detectado" }
  | { readonly estado: "recusada" };

function dataAtual(dependencias: DependenciasDaSessao): Date {
  return dependencias.agora?.() ?? new Date();
}

function novoIdentificador(dependencias: DependenciasDaSessao): string {
  return dependencias.gerarIdentificador?.() ?? randomUUID();
}

function criarTokens(
  sessao: Omit<SessaoPersistida, "resumoDoRefresh">,
  dependencias: DependenciasDaSessao,
  agora: Date,
  tokenDeRenovacao?: string,
): TokensDaSessao {
  const refresh =
    tokenDeRenovacao ??
    dependencias.gerarRefresh?.() ??
    gerarTokenDeRenovacao();
  const acessoExpiraEm = new Date(
    agora.getTime() + DURACAO_DO_TOKEN_DE_ACESSO_EM_SEGUNDOS * 1_000,
  );

  return {
    tokenDeAcesso: assinarTokenDeAcesso(
      {
        identidadeId: sessao.identidadeId,
        papel: sessao.papel,
        sessaoId: sessao.id,
        familiaId: sessao.familiaId,
      },
      dependencias.segredoDeAssinatura,
      agora,
    ),
    tokenDeRenovacao: refresh,
    acessoExpiraEm,
    renovacaoExpiraEm: sessao.expiraEm,
  };
}

function entregar(
  cliente: ClienteDaSessao,
  tokens: TokensDaSessao,
): SessaoEntregue {
  return { destino: cliente, ...tokens };
}

function proximaSessao(
  inicio: Omit<InicioDaSessao, "cliente"> & {
    readonly cliente: ClienteDaSessao;
    readonly familiaId: string;
  },
  dependencias: DependenciasDaSessao,
  agora: Date,
): Omit<SessaoPersistida, "resumoDoRefresh"> {
  return {
    id: novoIdentificador(dependencias),
    familiaId: inicio.familiaId,
    identidadeId: inicio.identidadeId,
    papel: inicio.papel,
    cliente: inicio.cliente,
    criadaEm: agora,
    expiraEm: new Date(
      agora.getTime() + DURACAO_DO_TOKEN_DE_RENOVACAO_EM_SEGUNDOS * 1_000,
    ),
  };
}

/** Cria uma família nova de sessão depois da autenticação já aprovada. */
export async function iniciarSessao(
  inicio: InicioDaSessao,
  dependencias: DependenciasDaSessao,
): Promise<SessaoEntregue> {
  const agora = dataAtual(dependencias);
  const semResumo = proximaSessao(
    { ...inicio, familiaId: novoIdentificador(dependencias) },
    dependencias,
    agora,
  );
  const tokens = criarTokens(semResumo, dependencias, agora);

  await dependencias.repositorio.criar({
    ...semResumo,
    resumoDoRefresh: resumirTokenDeRenovacao(tokens.tokenDeRenovacao),
  });

  return entregar(inicio.cliente, tokens);
}

/**
 * Consome um refresh e cria seu sucessor. Token já consumido é sinal de cópia:
 * o repositório revoga a família na mesma transação e o aviso segue uma vez.
 */
export async function renovarSessao(
  tokenDeRenovacao: string,
  dependencias: DependenciasDaSessao,
): Promise<ResultadoDaRenovacao> {
  const agora = dataAtual(dependencias);
  const resumoApresentado = resumirTokenDeRenovacao(tokenDeRenovacao);
  const tokenNovo = dependencias.gerarRefresh?.() ?? gerarTokenDeRenovacao();
  const pedido: PedidoDeRotacao = {
    sessaoId: novoIdentificador(dependencias),
    resumoDoNovoRefresh: resumirTokenDeRenovacao(tokenNovo),
    criadaEm: agora,
    expiraEm: new Date(
      agora.getTime() + DURACAO_DO_TOKEN_DE_RENOVACAO_EM_SEGUNDOS * 1_000,
    ),
  };
  const resultado = await dependencias.repositorio.rotacionar(
    resumoApresentado,
    pedido,
    agora,
  );

  if (resultado.estado === "reuso_detectado") {
    if (!resultado.familiaJaEstavaRevogada) {
      await dependencias.avisador.avisarReusoDeToken({
        identidadeId: resultado.identidadeId,
        familiaId: resultado.familiaId,
      });
    }
    return { estado: "reuso_detectado" };
  }
  if (resultado.estado === "recusada") return resultado;

  const tokens: TokensDaSessao = {
    ...criarTokens(
      {
        id: resultado.substituta.id,
        familiaId: resultado.substituta.familiaId,
        identidadeId: resultado.substituta.identidadeId,
        papel: resultado.substituta.papel,
        cliente: resultado.substituta.cliente,
        criadaEm: resultado.substituta.criadaEm,
        expiraEm: resultado.substituta.expiraEm,
      },
      dependencias,
      agora,
      tokenNovo,
    ),
  };

  return {
    estado: "renovada",
    sessao: entregar(resultado.substituta.cliente, tokens),
  };
}
