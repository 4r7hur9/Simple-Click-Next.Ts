import { randomUUID } from "node:crypto";
import type { ZodError, ZodIssue } from "zod";

import {
  esquemaDaEspecificacao,
  esquemaDoRegistroDaEspecificacao,
  esquemaDoValorDaEspecificacao,
} from "./especificacao-esquema.ts";
import type {
  EntradaDaEspecificacao,
  RegistroDaEspecificacao,
  TipoDeValor,
} from "./especificacao-esquema.ts";

export type Especificacao = RegistroDaEspecificacao;
export type ValorDeEspecificacao = string | number | boolean;

export interface OpcoesDeCriacao {
  readonly id?: string;
  readonly agora?: Date;
}

export class ErroDeEspecificacaoInvalida extends Error {
  readonly problemas: readonly ZodIssue[];

  constructor(problemas: readonly ZodIssue[]) {
    super("A especificação da categoria é inválida.");
    this.name = "ErroDeEspecificacaoInvalida";
    this.problemas = problemas;
  }
}

export class ErroDeValorDeEspecificacaoInvalido extends Error {
  readonly especificacaoId: string;
  readonly opcoesPermitidas: readonly string[];

  constructor(
    especificacao: Pick<Especificacao, "id" | "opcoes">,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "ErroDeValorDeEspecificacaoInvalido";
    this.especificacaoId = especificacao.id;
    this.opcoesPermitidas = especificacao.opcoes;
  }
}

export interface EspecificacaoHerdada {
  readonly especificacao: Especificacao;
  readonly valor: ValorDeEspecificacao | undefined;
}

export interface ErroDePreenchimento {
  readonly especificacaoId: string;
  readonly nome: string;
  readonly mensagem: string;
}

export interface ResultadoDoPreenchimento {
  readonly valido: boolean;
  readonly erros: readonly ErroDePreenchimento[];
}

export interface VersaoHistoricaDaEspecificacao {
  readonly especificacaoId: string;
  readonly categoriaId: string;
  readonly versao: number;
  readonly nome: string;
  readonly tipo: TipoDeValor;
  readonly unidade: string | null;
  readonly opcoes: readonly string[];
  readonly evento: "CRIADA" | "RENOMEADA" | "REMOVIDA";
  readonly ocorridoEm: string;
}

export interface ImpactoDaRemocao {
  readonly especificacaoId: string;
  readonly nome: string;
  readonly produtosAfetados: number;
  readonly aviso: string;
}

export interface ResultadoDaAlteracao {
  readonly especificacao: Especificacao;
  readonly versaoAnterior: VersaoHistoricaDaEspecificacao;
}

export interface InstantaneoDaEspecificacaoNoPedido {
  readonly especificacaoId: string;
  readonly categoriaId: string;
  readonly nome: string;
  readonly tipo: TipoDeValor;
  readonly unidade: string | null;
  readonly valor: ValorDeEspecificacao;
}

function erroDaEntrada(resultado: {
  readonly error: ZodError;
}): ErroDeEspecificacaoInvalida {
  return new ErroDeEspecificacaoInvalida(resultado.error.issues);
}

function valorVazio(valor: unknown): boolean {
  return valor === undefined || valor === null || valor === "";
}

function ordenar(especificacoes: readonly Especificacao[]): Especificacao[] {
  return [...especificacoes]
    .filter((especificacao) => especificacao.removidaEm === null)
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));
}

function historicoDaVersao(
  especificacao: Especificacao,
  evento: VersaoHistoricaDaEspecificacao["evento"],
  ocorridoEm: Date,
): VersaoHistoricaDaEspecificacao {
  return {
    especificacaoId: especificacao.id,
    categoriaId: especificacao.categoriaId,
    versao: especificacao.versao,
    nome: especificacao.nome,
    tipo: especificacao.tipo,
    unidade: especificacao.unidade,
    opcoes: [...especificacao.opcoes],
    evento,
    ocorridoEm: ocorridoEm.toISOString(),
  };
}

/** Cria um registro sempre ligado a uma categoria concreta. */
export function criarEspecificacao(
  entrada: EntradaDaEspecificacao,
  opcoes: OpcoesDeCriacao = {},
): Especificacao {
  const resultado = esquemaDaEspecificacao.safeParse(entrada);
  if (!resultado.success) throw erroDaEntrada(resultado);

  return esquemaDoRegistroDaEspecificacao.parse({
    ...resultado.data,
    id: opcoes.id ?? randomUUID(),
    versao: 1,
    removidaEm: null,
  });
}

/** Lista as definições da categoria na ordem que o dono escolheu. */
export function especificacoesDaCategoria(
  especificacoes: readonly Especificacao[],
  categoriaId: string,
): readonly Especificacao[] {
  return ordenar(
    especificacoes.filter(
      (especificacao) => especificacao.categoriaId === categoriaId,
    ),
  );
}

/** Monta os campos que o formulário do produto herda da categoria. */
export function herdarEspecificacoesDaCategoria(
  especificacoes: readonly Especificacao[],
  categoriaId: string,
  valores: Readonly<Record<string, unknown>> = {},
): readonly EspecificacaoHerdada[] {
  return especificacoesDaCategoria(especificacoes, categoriaId).map(
    (especificacao) => ({
      especificacao,
      valor: valores[especificacao.id] as ValorDeEspecificacao | undefined,
    }),
  );
}

/** Confere um valor contra o tipo e, em lista, contra as opções cadastradas. */
export function validarValorDaEspecificacao(
  especificacao: Especificacao,
  valor: unknown,
): ValorDeEspecificacao {
  const resultado =
    esquemaDoValorDaEspecificacao(especificacao).safeParse(valor);
  if (resultado.success) return resultado.data as ValorDeEspecificacao;

  const mensagem =
    especificacao.tipo === "lista"
      ? `Valor inválido para ${especificacao.nome}. Escolha: ${especificacao.opcoes.join(", ")}.`
      : `Valor inválido para ${especificacao.nome}.`;
  throw new ErroDeValorDeEspecificacaoInvalido(especificacao, mensagem);
}

/** Uma especificação obrigatória não pode ser salva em branco. */
export function validarPreenchimentoDoProduto(
  especificacoes: readonly Especificacao[],
  valores: Readonly<Record<string, unknown>>,
): ResultadoDoPreenchimento {
  const erros: ErroDePreenchimento[] = [];

  for (const especificacao of ordenar(especificacoes)) {
    const valor = valores[especificacao.id];
    if (valorVazio(valor)) {
      if (especificacao.obrigatoria) {
        erros.push({
          especificacaoId: especificacao.id,
          nome: especificacao.nome,
          mensagem: `${especificacao.nome} é obrigatória.`,
        });
      }
      continue;
    }

    try {
      validarValorDaEspecificacao(especificacao, valor);
    } catch (erro) {
      erros.push({
        especificacaoId: especificacao.id,
        nome: especificacao.nome,
        mensagem:
          erro instanceof Error
            ? erro.message
            : `Valor inválido para ${especificacao.nome}.`,
      });
    }
  }

  return { valido: erros.length === 0, erros };
}

/** Acrescenta um valor ao vocabulário sem substituir os valores anteriores. */
export function acrescentarOpcaoDaLista(
  especificacao: Especificacao,
  opcao: string,
): Especificacao {
  if (especificacao.tipo !== "lista") {
    throw new ErroDeValorDeEspecificacaoInvalido(
      especificacao,
      "Somente uma especificação de lista pode receber opções.",
    );
  }
  const normalizada = opcao.trim();
  if (normalizada === "") {
    throw new ErroDeValorDeEspecificacaoInvalido(
      especificacao,
      "A nova opção não pode ser vazia.",
    );
  }
  if (especificacao.opcoes.includes(normalizada)) return especificacao;

  return esquemaDoRegistroDaEspecificacao.parse({
    ...especificacao,
    opcoes: [...especificacao.opcoes, normalizada],
  });
}

/** Calcula o aviso antes que uma definição seja removida da categoria. */
export function estimarImpactoDaRemocao(
  especificacao: Especificacao,
  produtosAfetados: number,
): ImpactoDaRemocao {
  if (!Number.isInteger(produtosAfetados) || produtosAfetados < 0) {
    throw new RangeError("A quantidade de produtos afetados é inválida.");
  }
  return {
    especificacaoId: especificacao.id,
    nome: especificacao.nome,
    produtosAfetados,
    aviso:
      produtosAfetados === 0
        ? `Remover ${especificacao.nome} não afeta produtos preenchidos.`
        : `Remover ${especificacao.nome} afetará ${produtosAfetados} produto(s). Os valores serão preservados no histórico.`,
  };
}

/** Renomeia sem destruir a versão que pode estar referenciada por pedidos. */
export function renomearEspecificacao(
  especificacao: Especificacao,
  novoNome: string,
  agora: Date = new Date(),
): ResultadoDaAlteracao {
  const nome = novoNome.trim();
  if (nome === "") throw new Error("O nome da especificação é obrigatório.");
  if (especificacao.removidaEm !== null) {
    throw new Error("Não é possível renomear uma especificação removida.");
  }

  const versaoAnterior = historicoDaVersao(especificacao, "RENOMEADA", agora);
  const atualizada = esquemaDoRegistroDaEspecificacao.parse({
    ...especificacao,
    nome,
    versao: especificacao.versao + 1,
  });
  return { especificacao: atualizada, versaoAnterior };
}

/** Remove logicamente e devolve a versão histórica para os pedidos antigos. */
export function removerEspecificacao(
  especificacao: Especificacao,
  impacto: ImpactoDaRemocao,
  agora: Date = new Date(),
): ResultadoDaAlteracao {
  if (impacto.especificacaoId !== especificacao.id) {
    throw new Error("O impacto não pertence à especificação removida.");
  }
  if (especificacao.removidaEm !== null) {
    throw new Error("A especificação já foi removida.");
  }

  const versaoAnterior = historicoDaVersao(especificacao, "REMOVIDA", agora);
  const removida = esquemaDoRegistroDaEspecificacao.parse({
    ...especificacao,
    versao: especificacao.versao + 1,
    removidaEm: agora.toISOString(),
  });
  return { especificacao: removida, versaoAnterior };
}

/** Congela nome e tipo no item do pedido, antes de qualquer futura alteração. */
export function congelarEspecificacaoNoPedido(
  especificacao: Especificacao,
  valor: unknown,
): InstantaneoDaEspecificacaoNoPedido {
  return {
    especificacaoId: especificacao.id,
    categoriaId: especificacao.categoriaId,
    nome: especificacao.nome,
    tipo: especificacao.tipo,
    unidade: especificacao.unidade,
    valor: validarValorDaEspecificacao(especificacao, valor),
  };
}
