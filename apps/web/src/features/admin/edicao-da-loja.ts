/**
 * Regras do formulário de edição do cadastro, sem React (AC-207).
 *
 * A validação é a do CONTRATO (`esquemaDaEdicaoDaLoja`), a mesma que a API
 * aplica. O que mora aqui é a tradução entre a ficha (o que o banco tem) e o
 * formulário (tudo texto), e a regra de mandar SÓ O QUE MUDOU: um cadastro
 * antigo sem e-mail não pode travar a correção do nome porque o campo de
 * e-mail, que ninguém tocou, está vazio.
 */

import {
  esquemaDaEdicaoDaLoja,
  type EdicaoDaLojaEnviada,
  type EdicaoDaLojaNoContrato,
  type FichaDaLojaNoContrato,
} from "@simpleclick/contracts";

/** O formulário, do jeito que a tela o guarda: tudo texto. */
export interface ValoresDaEdicao {
  readonly nome: string;
  readonly razaoSocial: string;
  readonly documento: string;
  readonly email: string;
  readonly telefone: string;
  readonly cep: string;
  readonly logradouro: string;
  readonly numero: string;
  readonly complemento: string;
  readonly bairro: string;
  readonly cidade: string;
  readonly uf: string;
}

export type CampoDaEdicao = keyof ValoresDaEdicao;

export type ErrosDaEdicao = Partial<Record<CampoDaEdicao, string | undefined>>;

const CAMPOS_DO_ENDERECO = [
  "cep",
  "logradouro",
  "numero",
  "complemento",
  "bairro",
  "cidade",
  "uf",
] as const satisfies readonly CampoDaEdicao[];

/** O formulário preenchido com o que a ficha tem. */
export function valoresDaFicha(ficha: FichaDaLojaNoContrato): ValoresDaEdicao {
  return {
    nome: ficha.nome,
    razaoSocial: ficha.razaoSocial ?? "",
    documento: ficha.documento.numero ?? "",
    email: ficha.contato.email ?? "",
    telefone: ficha.contato.telefone ?? "",
    cep: ficha.endereco.cep ?? "",
    logradouro: ficha.endereco.logradouro ?? "",
    numero: ficha.endereco.numero ?? "",
    complemento: ficha.endereco.complemento ?? "",
    bairro: ficha.endereco.bairro ?? "",
    cidade: ficha.endereco.cidade ?? "",
    uf: ficha.endereco.uf ?? "",
  };
}

/**
 * A edição que vai para a API: só os campos que a pessoa mudou. O endereço
 * vai inteiro quando qualquer parte dele mudou — ele é um bloco no contrato.
 * `null` quando nada mudou.
 */
export function edicaoDoFormulario(
  original: ValoresDaEdicao,
  atual: ValoresDaEdicao,
): EdicaoDaLojaEnviada | null {
  const mudou = (campo: CampoDaEdicao) =>
    original[campo].trim() !== atual[campo].trim();
  const edicao: Record<string, unknown> = {};
  if (mudou("nome")) edicao["nome"] = atual.nome;
  if (mudou("razaoSocial")) {
    edicao["razaoSocial"] =
      atual.razaoSocial.trim() === "" ? null : atual.razaoSocial;
  }
  if (mudou("documento")) edicao["documento"] = atual.documento;
  if (mudou("email")) edicao["email"] = atual.email;
  if (mudou("telefone")) edicao["telefone"] = atual.telefone;
  if (CAMPOS_DO_ENDERECO.some(mudou)) {
    edicao["endereco"] = {
      cep: atual.cep,
      logradouro: atual.logradouro,
      numero: atual.numero,
      complemento: atual.complemento.trim() === "" ? null : atual.complemento,
      bairro: atual.bairro,
      cidade: atual.cidade,
      uf: atual.uf,
    };
  }
  return Object.keys(edicao).length === 0
    ? null
    : (edicao as EdicaoDaLojaEnviada);
}

/** Caminho do contrato (`endereco.cep`) → campo do formulário. */
function campoDoCaminho(caminho: string): CampoDaEdicao | undefined {
  const final = caminho.startsWith("endereco.")
    ? caminho.slice("endereco.".length)
    : caminho;
  const conhecidos: readonly string[] = [
    "nome",
    "razaoSocial",
    "documento",
    "email",
    "telefone",
    ...CAMPOS_DO_ENDERECO,
  ];
  return conhecidos.includes(final) ? (final as CampoDaEdicao) : undefined;
}

/** Recusas no formato da API (`{ caminho, mensagem }`) → erro por campo. */
export function errosDaEdicao(
  campos: readonly { readonly caminho: string; readonly mensagem: string }[],
): ErrosDaEdicao {
  const erros: ErrosDaEdicao = {};
  for (const { caminho, mensagem } of campos) {
    const campo = campoDoCaminho(caminho);
    if (campo !== undefined && erros[campo] === undefined) {
      erros[campo] = mensagem;
    }
  }
  return erros;
}

export type ValidacaoDaEdicao =
  | { readonly ok: true; readonly edicao: EdicaoDaLojaNoContrato }
  | { readonly ok: false; readonly erros: ErrosDaEdicao };

/** Confere a edição pelo contrato ANTES de enviar. */
export function validarEdicao(edicao: EdicaoDaLojaEnviada): ValidacaoDaEdicao {
  const resultado = esquemaDaEdicaoDaLoja.safeParse(edicao);
  if (resultado.success) return { ok: true, edicao: resultado.data };
  return {
    ok: false,
    erros: errosDaEdicao(
      resultado.error.issues.map((questao) => ({
        caminho: questao.path.join("."),
        mensagem: questao.message,
      })),
    ),
  };
}
