/**
 * Que coluna alimenta que campo do cadastro (card #60).
 *
 * SUGESTÃO PELO NOME DA COLUNA, sem acento e sem caixa: "Celular", "WhatsApp"
 * e "Fone" são telefone; "E-mail" é e-mail; "Obs." é observação. A ordem das
 * regras importa — "Nome da rua" é endereço, não nome, e "Número do telefone"
 * é telefone, não número da casa. Cada campo fica com UMA coluna (a primeira
 * que casar) e cada coluna alimenta um campo só.
 *
 * Sem coluna com nome de telefone ou de e-mail, olha o CONTEÚDO: a coluna em
 * que a maioria dos valores é um telefone que fecha (ou tem "@") vira a
 * sugestão.
 *
 * O MAPEAMENTO MANUAL do painel vence a sugestão campo a campo; nulo tira o
 * campo da importação.
 */
import {
  CAMPOS_DA_IMPORTACAO,
  type CampoDaImportacao,
  type MapeamentoDaImportacao,
} from "@simpleclick/contracts";

import { normalizarTelefoneDoCliente } from "../telefone-do-cliente.ts";
import type { TabelaLida } from "./tabela.ts";

/** "Telefone/Celular (WhatsApp)" → "telefone celular whatsapp". */
export function normalizarNomeDaColuna(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** As regras, na ordem em que são tentadas para cada coluna. */
const REGRAS: readonly {
  readonly campo: CampoDaImportacao;
  readonly casa: RegExp;
}[] = [
  {
    campo: "telefone",
    casa: /\b(telefones?|tel|fones?|celular(es)?|cel|whats ?app|whats|zap|wpp|phone|mobile|contato telefonico)\b/,
  },
  { campo: "email", casa: /\b(e ?mails?|correio eletronico)\b/ },
  { campo: "cep", casa: /\b(cep|codigo postal|zip ?code|zip|postal code)\b/ },
  {
    campo: "pontoDeReferencia",
    casa: /\b(referencia|ponto de referencia|reference)\b/,
  },
  {
    campo: "complemento",
    casa: /\b(complemento|compl|apto|apartamento|bloco)\b/,
  },
  { campo: "bairro", casa: /\b(bairro|distrito|neighborhood)\b/ },
  { campo: "cidade", casa: /\b(cidade|municipio|city)\b/ },
  { campo: "estado", casa: /^(estado|uf|state|estado uf|uf estado)$/ },
  {
    campo: "numero",
    casa: /^(numero|n|no|num|nro|number|numero da casa|numero do endereco)$/,
  },
  {
    campo: "logradouro",
    casa: /\b(endereco|enderecos|rua|logradouro|address|avenida|av|street)\b/,
  },
  {
    campo: "observacao",
    casa: /\b(obs|observacao|observacoes|notas?|anotacao|anotacoes|comentarios?|notes?|descricao)\b/,
  },
  {
    campo: "nome",
    casa: /^(nome|nomes|nome completo|nome do cliente|nome cliente|cliente|clientes|name|full name|lead|razao social|nome e sobrenome|primeiro nome|first name)$/,
  },
];

/** A regra que o nome da coluna casa, ou nulo. */
export function campoPeloNome(nome: string): CampoDaImportacao | null {
  const normal = normalizarNomeDaColuna(nome);
  if (normal === "") return null;
  for (const regra of REGRAS) {
    if (regra.casa.test(normal)) return regra.campo;
  }
  // "Nome do contato", "Nome do lead": começa por nome e não é de endereço.
  if (
    /^nome\b/.test(normal) &&
    !/\b(rua|bairro|cidade|mae|pai|fantasia)\b/.test(normal)
  ) {
    return "nome";
  }
  return null;
}

/** Até três valores não vazios da coluna. */
export function exemplosDaColuna(
  tabela: TabelaLida,
  indice: number,
): readonly string[] {
  const exemplos: string[] = [];
  for (const linha of tabela.linhas) {
    const valor = linha.valores[indice] ?? "";
    if (valor !== "") exemplos.push(valor.slice(0, 80));
    if (exemplos.length === 3) break;
  }
  return exemplos;
}

/** A fração dos primeiros valores não vazios que passam no teste. */
function fracaoQuePassa(
  tabela: TabelaLida,
  indice: number,
  teste: (valor: string) => boolean,
): number {
  let vistos = 0;
  let passam = 0;
  for (const linha of tabela.linhas) {
    const valor = linha.valores[indice] ?? "";
    if (valor === "") continue;
    vistos += 1;
    if (teste(valor)) passam += 1;
    if (vistos === 30) break;
  }
  return vistos === 0 ? 0 : passam / vistos;
}

/** A sugestão: campo → índice da coluna. */
export function sugerirMapeamento(
  tabela: TabelaLida,
): ReadonlyMap<CampoDaImportacao, number> {
  const sugestao = new Map<CampoDaImportacao, number>();
  const usadas = new Set<number>();
  tabela.colunas.forEach((nome, indice) => {
    const campo = campoPeloNome(nome);
    if (campo === null || sugestao.has(campo)) return;
    sugestao.set(campo, indice);
    usadas.add(indice);
  });

  const pelaAmostra: readonly [
    CampoDaImportacao,
    (valor: string) => boolean,
  ][] = [
    ["telefone", (valor) => normalizarTelefoneDoCliente(valor).ok],
    ["email", (valor) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)],
  ];
  for (const [campo, teste] of pelaAmostra) {
    if (sugestao.has(campo)) continue;
    for (let indice = 0; indice < tabela.colunas.length; indice += 1) {
      if (usadas.has(indice)) continue;
      if (fracaoQuePassa(tabela, indice, teste) >= 0.6) {
        sugestao.set(campo, indice);
        usadas.add(indice);
        break;
      }
    }
  }
  return sugestao;
}

export interface MapeamentoAplicado {
  /** Campo → índice da coluna, só os campos que entram. */
  readonly indices: ReadonlyMap<CampoDaImportacao, number>;
  /** Campo → nome da coluna, todos os campos (nulo = não importa). */
  readonly porNome: Readonly<Record<CampoDaImportacao, string | null>>;
  /** Colunas do mapeamento manual que não existem no arquivo. */
  readonly desconhecidas: readonly string[];
}

/** A sugestão com o que o painel mandou por cima. */
export function aplicarMapeamento(
  tabela: TabelaLida,
  manual: MapeamentoDaImportacao,
): MapeamentoAplicado {
  const indices = new Map(sugerirMapeamento(tabela));
  const desconhecidas: string[] = [];
  const porNomeNormal = new Map<string, number>();
  tabela.colunas.forEach((nome, indice) => {
    porNomeNormal.set(nome.toLowerCase(), indice);
  });

  for (const campo of CAMPOS_DA_IMPORTACAO) {
    if (!(campo in manual)) continue;
    const coluna = manual[campo];
    if (coluna === null || coluna === undefined) {
      indices.delete(campo);
      continue;
    }
    const indice = porNomeNormal.get(coluna.trim().toLowerCase());
    if (indice === undefined) {
      desconhecidas.push(coluna);
      indices.delete(campo);
      continue;
    }
    // A coluna escolhida à mão sai de outro campo que a sugestão lhe deu.
    for (const [outro, i] of indices) {
      if (i === indice && outro !== campo && !(outro in manual))
        indices.delete(outro);
    }
    indices.set(campo, indice);
  }

  const porNome = Object.fromEntries(
    CAMPOS_DA_IMPORTACAO.map((campo) => {
      const indice = indices.get(campo);
      return [
        campo,
        indice === undefined ? null : (tabela.colunas[indice] ?? null),
      ];
    }),
  ) as Record<CampoDaImportacao, string | null>;

  return { indices, porNome, desconhecidas };
}
