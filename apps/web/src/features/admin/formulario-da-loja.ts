/**
 * Regras do formulário de cadastro de loja, sem React (AC-200..AC-202).
 *
 * A validação é a do CONTRATO (`esquemaDaNovaLoja`), a mesma que a API aplica:
 * o formulário recusa o documento inválido antes de enviar, e a API recusa de
 * novo para quem não passa pelo formulário. Aqui só existe a tradução entre o
 * formulário (campos planos, tudo texto) e o contrato (objeto aninhado).
 */

import {
  esquemaDaNovaLoja,
  type NovaLojaEnviada,
  type NovaLojaNoContrato,
} from "@simpleclick/contracts";

/** Os campos do formulário, do jeito que a tela os guarda: tudo texto. */
export interface ValoresDaNovaLoja {
  readonly nome: string;
  readonly razaoSocial: string;
  readonly documento: string;
  readonly responsavelNome: string;
  readonly responsavelEmail: string;
  readonly responsavelTelefone: string;
  readonly cep: string;
  readonly logradouro: string;
  readonly numero: string;
  readonly complemento: string;
  readonly bairro: string;
  readonly cidade: string;
  readonly uf: string;
  readonly tipoDeNegocio: string;
  readonly apelido: string;
}

export type CampoDaNovaLoja = keyof ValoresDaNovaLoja;

export type ErrosDaNovaLoja = Partial<
  Record<CampoDaNovaLoja, string | undefined>
>;

export const VALORES_INICIAIS: ValoresDaNovaLoja = {
  nome: "",
  razaoSocial: "",
  documento: "",
  responsavelNome: "",
  responsavelEmail: "",
  responsavelTelefone: "",
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "",
  tipoDeNegocio: "",
  apelido: "",
};

/** Ordem em que os campos aparecem: o primeiro com erro recebe o foco. */
export const ORDEM_DOS_CAMPOS: readonly CampoDaNovaLoja[] = [
  "nome",
  "razaoSocial",
  "documento",
  "tipoDeNegocio",
  "apelido",
  "responsavelNome",
  "responsavelEmail",
  "responsavelTelefone",
  "cep",
  "logradouro",
  "numero",
  "complemento",
  "bairro",
  "cidade",
  "uf",
];

/** Caminho do contrato (`responsavel.email`) → campo do formulário. */
const CAMPO_DO_CAMINHO: Readonly<Record<string, CampoDaNovaLoja>> = {
  nome: "nome",
  razaoSocial: "razaoSocial",
  documento: "documento",
  tipoDeNegocio: "tipoDeNegocio",
  apelido: "apelido",
  "responsavel.nome": "responsavelNome",
  "responsavel.email": "responsavelEmail",
  "responsavel.telefone": "responsavelTelefone",
  "endereco.cep": "cep",
  "endereco.logradouro": "logradouro",
  "endereco.numero": "numero",
  "endereco.complemento": "complemento",
  "endereco.bairro": "bairro",
  "endereco.cidade": "cidade",
  "endereco.uf": "uf",
};

/** Os campos planos do formulário no formato que o contrato espera. */
export function montarCadastro(valores: ValoresDaNovaLoja): NovaLojaEnviada {
  const opcional = (texto: string) => (texto.trim() === "" ? null : texto);
  return {
    nome: valores.nome,
    razaoSocial: opcional(valores.razaoSocial),
    documento: valores.documento,
    responsavel: {
      nome: valores.responsavelNome,
      email: valores.responsavelEmail,
      telefone: valores.responsavelTelefone,
    },
    endereco: {
      cep: valores.cep,
      logradouro: valores.logradouro,
      numero: valores.numero,
      complemento: opcional(valores.complemento),
      bairro: valores.bairro,
      cidade: valores.cidade,
      uf: valores.uf,
    },
    tipoDeNegocio: valores.tipoDeNegocio,
    apelido: valores.apelido,
  };
}

/** Recusas no formato da API (`{ caminho, mensagem }`) → erro por campo. */
export function errosPorCampo(
  campos: readonly { readonly caminho: string; readonly mensagem: string }[],
): ErrosDaNovaLoja {
  const erros: Partial<Record<CampoDaNovaLoja, string | undefined>> = {};
  for (const { caminho, mensagem } of campos) {
    const campo = CAMPO_DO_CAMINHO[caminho];
    // O primeiro motivo de cada campo é o que aparece: dois textos embaixo do
    // mesmo campo competem pela atenção de quem está corrigindo.
    if (campo !== undefined && erros[campo] === undefined) {
      erros[campo] = mensagem;
    }
  }
  return erros;
}

export type ValidacaoDaNovaLoja =
  | { readonly ok: true; readonly cadastro: NovaLojaNoContrato }
  | { readonly ok: false; readonly erros: ErrosDaNovaLoja };

/**
 * Confere o formulário ANTES de enviar. Documento com dígito errado para aqui,
 * com a frase que explica o motivo, e nada sai da tela (AC-202).
 */
export function validarNovaLoja(
  valores: ValoresDaNovaLoja,
): ValidacaoDaNovaLoja {
  const resultado = esquemaDaNovaLoja.safeParse(montarCadastro(valores));
  if (resultado.success) return { ok: true, cadastro: resultado.data };
  return {
    ok: false,
    erros: errosPorCampo(
      resultado.error.issues.map((questao) => ({
        caminho: questao.path.join("."),
        mensagem: questao.message,
      })),
    ),
  };
}

/** O primeiro campo com erro, na ordem da tela — é ele que recebe o foco. */
export function primeiroCampoComErro(
  erros: ErrosDaNovaLoja,
): CampoDaNovaLoja | undefined {
  return ORDEM_DOS_CAMPOS.find((campo) => erros[campo] !== undefined);
}

/**
 * Um apelido a partir do nome, para poupar digitação: "Pastel da Joí" →
 * `pastel-da-joi`. É só sugestão de preenchimento; quem decide é a pessoa, e
 * quem confere se está livre é a API.
 */
export function apelidoAPartirDoNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/g, "");
}
