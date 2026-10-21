/**
 * Cada linha do arquivo vira um cadastro candidato, ou um motivo (card #60).
 *
 * A CONFERÊNCIA É A DO CADASTRO MANUAL: o mesmo esquema do contrato
 * (`esquemaDoClienteParaCadastrar` — nome de 2 a 120 letras, e-mail que
 * fecha, UF com duas letras) e a mesma normalização de telefone
 * (`normalizarTelefoneDoCliente`). O que o painel recusaria digitado à mão, o
 * importador também recusa — com o número da linha e o motivo.
 *
 * REPETIDO É PELA MESMA CHAVE DO CADASTRO: o telefone sem o 55 (`phone_key`)
 * ou o e-mail sem caixa. Dentro do arquivo vale a primeira linha; as seguintes
 * com o mesmo telefone ou e-mail são repetidas dela. Contra a loja, quem
 * responde é a busca em lote de `existentes.ts`.
 */
import {
  esquemaDoClienteParaCadastrar,
  ROTULOS_DOS_CAMPOS_DA_IMPORTACAO,
  type CampoDaImportacao,
  type ProblemaDaImportacao,
  type RepetidoDaImportacao,
} from "@simpleclick/contracts";

import type { ClienteParaCadastrar } from "../cadastrar.usecase.ts";
import { normalizarTelefoneDoCliente } from "../telefone-do-cliente.ts";
import type { TabelaLida } from "./tabela.ts";

/** O que a linha trazia nos três campos que identificam a pessoa. */
export interface DadosCrus {
  readonly nome: string | null;
  readonly telefone: string | null;
  readonly email: string | null;
}

/** Uma linha que passou na conferência. */
export interface LeadDaLinha {
  readonly linha: number;
  readonly dados: ClienteParaCadastrar;
  /** A chave do telefone (igual a `phone_key`). */
  readonly chave: string;
  /** O telefone como se grava: E.164 com o "+". */
  readonly e164: string;
  /** O e-mail sem caixa e sem espaço, ou nulo. */
  readonly email: string | null;
  readonly cru: DadosCrus;
}

export interface LinhaInvalida {
  readonly linha: number;
  readonly problema: ProblemaDaImportacao;
  readonly cru: DadosCrus;
}

export type LinhaAnalisada =
  | ({ readonly tipo: "valida" } & LeadDaLinha)
  | ({ readonly tipo: "invalida" } & LinhaInvalida);

/** Quem já é cliente da loja, como a busca em lote o devolve. */
export interface ExistenteNaLoja {
  readonly clienteId: string;
  readonly nome: string;
  /** Cliente com conta na plataforma: o e-mail é da conta, não da ficha. */
  readonly comConta: boolean;
}

export interface ExistentesNaLoja {
  readonly porTelefone: ReadonlyMap<string, ExistenteNaLoja>;
  readonly porEmail: ReadonlyMap<string, ExistenteNaLoja>;
}

export interface RepetidoNaLoja {
  readonly lead: LeadDaLinha;
  readonly existente: ExistenteNaLoja;
  readonly motivo: "TELEFONE" | "EMAIL";
}

export interface Classificacao {
  readonly novos: readonly LeadDaLinha[];
  readonly repetidosNaLoja: readonly RepetidoNaLoja[];
  readonly repetidosNoArquivo: readonly (RepetidoDaImportacao & {
    readonly cru: DadosCrus;
  })[];
  readonly invalidos: readonly LinhaInvalida[];
}

const CAMPOS_DO_ENDERECO = [
  "logradouro",
  "numero",
  "complemento",
  "bairro",
  "cidade",
  "estado",
  "cep",
  "pontoDeReferencia",
] as const;

/** A frase de cada campo que o esquema recusou. */
function motivoDoCampo(campo: CampoDaImportacao): string {
  switch (campo) {
    case "nome":
      return "O nome precisa ter de 2 a 120 letras.";
    case "telefone":
      return "Telefone com tamanho fora do esperado.";
    case "email":
      return "E-mail inválido.";
    case "estado":
      return "Estado precisa ser a sigla de 2 letras (ex.: CE).";
    default:
      return `${ROTULOS_DOS_CAMPOS_DA_IMPORTACAO[campo]} longo demais.`;
  }
}

/** O campo do contrato pelo caminho do problema do Zod. */
function campoDoCaminho(caminho: readonly PropertyKey[]): CampoDaImportacao {
  const primeiro = String(caminho[0] ?? "");
  if (primeiro === "endereco") {
    const segundo = String(caminho[1] ?? "logradouro");
    return (CAMPOS_DO_ENDERECO as readonly string[]).includes(segundo)
      ? (segundo as CampoDaImportacao)
      : "logradouro";
  }
  return (
    ["nome", "telefone", "email", "observacao"].includes(primeiro)
      ? primeiro
      : "nome"
  ) as CampoDaImportacao;
}

/** Confere uma linha e devolve o cadastro candidato ou o motivo. */
export function analisarLinhas(
  tabela: TabelaLida,
  indices: ReadonlyMap<CampoDaImportacao, number>,
): readonly LinhaAnalisada[] {
  return tabela.linhas.map((linha): LinhaAnalisada => {
    const valor = (campo: CampoDaImportacao): string => {
      const indice = indices.get(campo);
      return indice === undefined ? "" : (linha.valores[indice] ?? "").trim();
    };
    const nome = valor("nome").replace(/\s+/g, " ");
    const telefoneCru = valor("telefone");
    const emailCru = valor("email");
    const cru: DadosCrus = {
      nome: nome || null,
      telefone: telefoneCru || null,
      email: emailCru || null,
    };
    const invalida = (
      campo: CampoDaImportacao,
      motivo: string,
    ): LinhaAnalisada => ({
      tipo: "invalida",
      linha: linha.numero,
      problema: { linha: linha.numero, campo, motivo },
      cru,
    });

    if (nome === "") return invalida("nome", "Sem nome.");
    if (telefoneCru === "") return invalida("telefone", "Sem telefone.");
    const telefone = normalizarTelefoneDoCliente(telefoneCru);
    if (!telefone.ok) return invalida("telefone", telefone.explicacao);

    const logradouro = valor("logradouro");
    const endereco =
      logradouro === ""
        ? null
        : Object.fromEntries(
            CAMPOS_DO_ENDERECO.map((campo) => {
              const texto = valor(campo);
              if (campo === "estado")
                return [campo, texto === "" ? null : texto.toUpperCase()];
              return [campo, texto === "" ? null : texto];
            }),
          );
    const observacao = valor("observacao");

    const conferido = esquemaDoClienteParaCadastrar.safeParse({
      nome,
      telefone: telefoneCru,
      email: emailCru === "" ? null : emailCru,
      endereco,
      observacao: observacao === "" ? null : observacao,
    });
    if (!conferido.success) {
      const campos = [
        ...new Set(
          conferido.error.issues.map((issue) => campoDoCaminho(issue.path)),
        ),
      ];
      const primeiro = campos[0] ?? "nome";
      return invalida(primeiro, campos.map(motivoDoCampo).join(" "));
    }

    const email = conferido.data.email?.trim().toLowerCase() || null;
    return {
      tipo: "valida",
      linha: linha.numero,
      dados: conferido.data,
      chave: telefone.chave,
      e164: telefone.e164,
      email,
      cru,
    };
  });
}

/** Separa novos, repetidos (no arquivo e na loja) e inválidos. */
export function classificar(
  linhas: readonly LinhaAnalisada[],
  existentes: ExistentesNaLoja,
): Classificacao {
  const novos: LeadDaLinha[] = [];
  const repetidosNaLoja: RepetidoNaLoja[] = [];
  const repetidosNoArquivo: (RepetidoDaImportacao & { cru: DadosCrus })[] = [];
  const invalidos: LinhaInvalida[] = [];
  const primeiraPorTelefone = new Map<string, number>();
  const primeiraPorEmail = new Map<string, number>();

  for (const linha of linhas) {
    if (linha.tipo === "invalida") {
      invalidos.push(linha);
      continue;
    }
    const porTelefone = primeiraPorTelefone.get(linha.chave);
    const porEmail =
      linha.email === null ? undefined : primeiraPorEmail.get(linha.email);
    if (porTelefone !== undefined || porEmail !== undefined) {
      repetidosNoArquivo.push({
        linha: linha.linha,
        onde: "arquivo",
        motivo: porTelefone !== undefined ? "TELEFONE" : "EMAIL",
        clienteId: null,
        nome: linha.cru.nome,
        linhaOriginal: (porTelefone ?? porEmail) as number,
        cru: linha.cru,
      });
      continue;
    }
    primeiraPorTelefone.set(linha.chave, linha.linha);
    if (linha.email !== null) primeiraPorEmail.set(linha.email, linha.linha);

    const lead: LeadDaLinha = {
      linha: linha.linha,
      dados: linha.dados,
      chave: linha.chave,
      e164: linha.e164,
      email: linha.email,
      cru: linha.cru,
    };
    const naLojaPorTelefone = existentes.porTelefone.get(linha.chave);
    const naLojaPorEmail =
      linha.email === null ? undefined : existentes.porEmail.get(linha.email);
    if (naLojaPorTelefone !== undefined) {
      repetidosNaLoja.push({
        lead,
        existente: naLojaPorTelefone,
        motivo: "TELEFONE",
      });
    } else if (naLojaPorEmail !== undefined) {
      repetidosNaLoja.push({
        lead,
        existente: naLojaPorEmail,
        motivo: "EMAIL",
      });
    } else {
      novos.push(lead);
    }
  }
  return { novos, repetidosNaLoja, repetidosNoArquivo, invalidos };
}

/** O repetido da loja no vocabulário do contrato. */
export function repetidoDaLojaNoContrato(
  repetido: RepetidoNaLoja,
): RepetidoDaImportacao {
  return {
    linha: repetido.lead.linha,
    onde: "loja",
    motivo: repetido.motivo,
    clienteId: repetido.existente.clienteId,
    nome: repetido.existente.nome,
    linhaOriginal: null,
  };
}

/** Sem o `cru`, para a resposta. */
export function repetidoDoArquivoNoContrato(
  repetido: RepetidoDaImportacao & { readonly cru: DadosCrus },
): RepetidoDaImportacao {
  const { cru: _cru, ...resto } = repetido;
  return resto;
}
