/**
 * Edição do cadastro da loja pela administração (AC-207).
 *
 * A edição chega VALIDADA pela borda (`esquemaDaEdicaoDaLoja`, no contrato):
 * documento conferido pelo dígito verificador, telefone e e-mail normalizados.
 * O que sobra para o caso de uso é decidir O QUE MUDOU e registrar.
 *
 * UMA TRANSAÇÃO SÓ para ler como estava, gravar e registrar na trilha. Se o
 * registro falha, a gravação é desfeita: alteração sem registro é exatamente
 * o que a trilha existe para impedir.
 *
 * SALVAR SEM MUDAR NADA NÃO VIRA LINHA na trilha — a mesma regra da
 * configuração do dono. A trilha que registra "nada mudou" a cada clique
 * esconde a linha que importa entre cem que não importam.
 *
 * O DADO PESSOAL ENTRA MASCARADO (P-009): documento, e-mail, telefone e o
 * endereço de rua podem ser os da própria pessoa responsável — em CPF, são.
 * A trilha diz que mudaram, e de qual final para qual final.
 */

import type { EdicaoDaLojaNoContrato } from "@simpleclick/contracts";

import { mascararDadoPessoal } from "./trilha.ts";

/** O cadastro editável, do jeito que o banco o guarda. */
export interface CadastroEditavel {
  readonly nome: string;
  readonly razaoSocial: string | null;
  readonly documento: string | null;
  readonly tipoDoDocumento: "CPF" | "CNPJ" | null;
  readonly email: string | null;
  readonly telefone: string | null;
  readonly cep: string | null;
  readonly logradouro: string | null;
  readonly numero: string | null;
  readonly complemento: string | null;
  readonly bairro: string | null;
  readonly cidade: string | null;
  readonly uf: string | null;
}

/** Os campos do cadastro que a edição pode tocar, em ordem de tela. */
export type CampoEditavel = Exclude<keyof CadastroEditavel, "tipoDoDocumento">;

/** Campos que podem ser dado pessoal do responsável — entram mascarados. */
export const CAMPOS_PESSOAIS: ReadonlySet<CampoEditavel> = new Set([
  "documento",
  "email",
  "telefone",
  "cep",
  "logradouro",
  "numero",
  "complemento",
]);

/** Uma mudança de campo, com os valores reais (antes de mascarar). */
export interface MudancaNoCadastro {
  readonly campo: CampoEditavel;
  readonly antes: string | null;
  readonly depois: string | null;
}

/** O cadastro como ficaria depois da edição, só com o que foi enviado. */
export function aplicarEdicao(
  atual: CadastroEditavel,
  edicao: EdicaoDaLojaNoContrato,
): CadastroEditavel {
  const endereco = edicao.endereco;
  return {
    nome: edicao.nome ?? atual.nome,
    razaoSocial:
      edicao.razaoSocial === undefined
        ? atual.razaoSocial
        : vazioViraNulo(edicao.razaoSocial),
    documento: edicao.documento ?? atual.documento,
    tipoDoDocumento:
      edicao.documento === undefined
        ? atual.tipoDoDocumento
        : edicao.documento.length === 14
          ? "CNPJ"
          : "CPF",
    email: edicao.email ?? atual.email,
    telefone: edicao.telefone ?? atual.telefone,
    cep: endereco?.cep ?? atual.cep,
    logradouro: endereco?.logradouro ?? atual.logradouro,
    numero: endereco?.numero ?? atual.numero,
    complemento:
      endereco === undefined
        ? atual.complemento
        : vazioViraNulo(endereco.complemento ?? null),
    bairro: endereco?.bairro ?? atual.bairro,
    cidade: endereco?.cidade ?? atual.cidade,
    uf: endereco?.uf ?? atual.uf,
  };
}

function vazioViraNulo(valor: string | null): string | null {
  return valor === null || valor.trim() === "" ? null : valor;
}

const ORDEM_DOS_CAMPOS: readonly CampoEditavel[] = [
  "nome",
  "razaoSocial",
  "documento",
  "email",
  "telefone",
  "cep",
  "logradouro",
  "numero",
  "complemento",
  "bairro",
  "cidade",
  "uf",
];

/** Os campos que mudaram de fato, na ordem da tela. */
export function mudancasDoCadastro(
  antes: CadastroEditavel,
  depois: CadastroEditavel,
): MudancaNoCadastro[] {
  return ORDEM_DOS_CAMPOS.filter((campo) => antes[campo] !== depois[campo]).map(
    (campo) => ({ campo, antes: antes[campo], depois: depois[campo] }),
  );
}

/** O antes e o depois que vão para a trilha, com o dado pessoal mascarado. */
export function registroDaEdicao(mudancas: readonly MudancaNoCadastro[]): {
  readonly antes: { readonly campos: Readonly<Record<string, unknown>> };
  readonly depois: { readonly campos: Readonly<Record<string, unknown>> };
} {
  const antes: Record<string, unknown> = {};
  const depois: Record<string, unknown> = {};
  for (const mudanca of mudancas) {
    const pessoal = CAMPOS_PESSOAIS.has(mudanca.campo);
    antes[mudanca.campo] = pessoal
      ? mascararDadoPessoal(mudanca.antes)
      : mudanca.antes;
    depois[mudanca.campo] = pessoal
      ? mascararDadoPessoal(mudanca.depois)
      : mudanca.depois;
  }
  return { antes: { campos: antes }, depois: { campos: depois } };
}

/** O que a edição precisa do banco, dentro da transação da administração. */
export interface RepositorioDaEdicao {
  /** O cadastro atual, travado até o fim da transação. `null` se não existe. */
  lerParaEditar(lojaId: string): Promise<CadastroEditavel | null>;
  gravarCadastro(lojaId: string, cadastro: CadastroEditavel): Promise<void>;
  registrar(ato: {
    readonly lojaId: string;
    readonly atorId: string;
    readonly acao: "LOJA_ALTERADA";
    readonly antes: unknown;
    readonly depois: unknown;
  }): Promise<void>;
}

export type ResultadoDaEdicao =
  | { readonly ok: true; readonly mudancas: readonly MudancaNoCadastro[] }
  | { readonly ok: false; readonly motivo: "NAO_ENCONTRADA" };

/**
 * Aplica a edição e registra quem alterou, quando e o quê.
 *
 * Quem chama abre a transação: a leitura travada, a gravação e o registro
 * precisam acontecer juntos ou não acontecer.
 */
export async function editarLoja(
  lojaId: string,
  edicao: EdicaoDaLojaNoContrato,
  administradorId: string,
  repositorio: RepositorioDaEdicao,
): Promise<ResultadoDaEdicao> {
  const atual = await repositorio.lerParaEditar(lojaId);
  if (atual === null) return { ok: false, motivo: "NAO_ENCONTRADA" };

  const editado = aplicarEdicao(atual, edicao);
  const mudancas = mudancasDoCadastro(atual, editado);
  if (mudancas.length === 0) return { ok: true, mudancas };

  await repositorio.gravarCadastro(lojaId, editado);
  const { antes, depois } = registroDaEdicao(mudancas);
  await repositorio.registrar({
    lojaId,
    atorId: administradorId,
    acao: "LOJA_ALTERADA",
    antes,
    depois,
  });
  return { ok: true, mudancas };
}
