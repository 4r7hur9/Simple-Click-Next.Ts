/**
 * Como um ato da trilha de auditoria aparece na tela (AC-207, AC-118).
 *
 * Regras de apresentação, sem React: o nome do ato, o nome do campo e o valor
 * de antes e de depois. A trilha chega da API com o dado pessoal JÁ
 * mascarado (P-009) — a tela mostra o que recebeu e não tenta reconstruir
 * nada.
 */

import {
  ROTULOS_DAS_SITUACOES,
  ROTULOS_DOS_ATOS,
  ROTULOS_DOS_CAMPOS_DA_LOJA,
  type SituacaoDaLoja,
} from "@simpleclick/contracts";

/**
 * Atos que a API já grava e o contrato ainda não nomeia. Ficam aqui para a
 * tela nunca mostrar o código cru (LIMITE_DO_DONO_ALTERADO) a quem administra.
 */
const ATOS_SEM_NOME_NO_CONTRATO: Readonly<Record<string, string>> = {
  LIMITES_PADRAO_ALTERADOS: "Limites padrão da plataforma alterados",
  LGPD_EXPORTACAO: "Exportação de dados do titular (LGPD)",
  LGPD_EXCLUSAO: "Exclusão de dados do titular (LGPD)",
  LIMITE_DO_DONO_ALTERADO: "Limite de lojas do dono alterado",
  CONVITE_REENVIADO: "Convite de acesso reenviado",
  CLIENTES_IMPORTADOS: "Clientes importados de arquivo",
  COMENTARIO_APROVADO: "Comentário aprovado",
  COMENTARIO_RECUSADO: "Comentário recusado",
  COMENTARIO_APAGADO: "Comentário apagado",
  COMENTARIOS_CONFIGURADOS: "Regras de comentários alteradas",
  COMENTARIOS_AUTOR_BLOQUEADO: "Autor bloqueado nos comentários",
  COMENTARIOS_AUTOR_DESBLOQUEADO: "Autor desbloqueado nos comentários",
  ESPECIFICACAO_CRIADA: "Opção de produto criada",
  ESPECIFICACAO_RENOMEADA: "Opção de produto renomeada",
  ESPECIFICACAO_REMOVIDA: "Opção de produto removida",
  ESPECIFICACAO_OPCAO_ACRESCENTADA: "Valor acrescentado a uma opção",
  ESPECIFICACAO_VALOR_DESCARTADO: "Valor de uma opção descartado",
  PASSWORD_CHANGED: "Senha trocada",
  LOGOUT: "Saída da conta",
  LOGOUT_ALL: "Saída de todos os aparelhos",
};

/** Todos os atos com nome em português, para a tela e para o filtro. */
export const NOMES_DOS_ATOS: Readonly<Record<string, string>> = {
  ...ATOS_SEM_NOME_NO_CONTRATO,
  ...ROTULOS_DOS_ATOS,
};

/** `LIMITE_DO_DONO_ALTERADO` → "Limite do dono alterado", para ato novo. */
function codigoLegivel(codigo: string): string {
  const texto = codigo.toLowerCase().replace(/_+/g, " ").trim();
  return texto === "" ? codigo : texto[0]!.toUpperCase() + texto.slice(1);
}

/** O nome do ato na língua de quem administra, mesmo quando o ato é novo. */
export function rotuloDoAto(acao: string): string {
  return NOMES_DOS_ATOS[acao] ?? codigoLegivel(acao);
}

/** Quem fez o ato, pelo papel gravado na trilha (ADMIN, OWNER…). */
const NOMES_DOS_PAPEIS: Readonly<Record<string, string>> = {
  ADMIN: "administração",
  OWNER: "dono da loja",
  STAFF: "equipe da loja",
  SYSTEM: "sistema",
  CUSTOMER: "cliente",
  PRINT_AGENT: "impressora da loja",
};

export function rotuloDoPapel(papel: string): string {
  return NOMES_DOS_PAPEIS[papel] ?? codigoLegivel(papel).toLowerCase();
}

/** Os limites da loja na trilha: `null` quer dizer "volta ao padrão". */
const CAMPOS_DE_LIMITE: Readonly<Record<string, string>> = {
  staff: "Máximo de pessoas na equipe",
  produtos: "Máximo de produtos",
  categorias: "Máximo de categorias",
  clientes: "Máximo de clientes",
  lojas: "Máximo de lojas do dono",
};

/** Campos de atos que o contrato ainda não nomeia (importação de clientes…). */
const CAMPOS_SEM_NOME_NO_CONTRATO: Readonly<Record<string, string>> = {
  total: "Linhas lidas",
  criados: "Clientes criados",
  atualizados: "Clientes completados",
  repetidos: "Repetidos",
  invalidos: "Linhas com erro",
  foraDoLimite: "Fora do limite de clientes",
  formato: "Formato do arquivo",
  repetidosComo: "O que fazer com repetidos",
  arquivo: "Arquivo",
  papel: "Papel",
  email: "E-mail",
};

/** `foraDoLimite` → "fora do limite", para campo novo sem nome. */
function caminhoLegivel(caminho: string): string {
  const texto = caminho
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._]+/g, " ")
    .toLowerCase()
    .trim();
  return texto === "" ? caminho : texto[0]!.toUpperCase() + texto.slice(1);
}

/** O nome do campo, em português mesmo quando a tela não o conhece. */
export function rotuloDoCampo(campo: string): string {
  return (
    CAMPOS_DE_LIMITE[campo] ??
    ROTULOS_DOS_CAMPOS_DA_LOJA[campo] ??
    CAMPOS_SEM_NOME_NO_CONTRATO[campo] ??
    caminhoLegivel(campo)
  );
}

/** Instante gravado pela API (ISO 8601 com hora), como a trilha o guarda. */
const FORMATO_DE_INSTANTE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * O valor como texto. Ausente vira travessão, e não "null". Instante vira
 * dia e hora de Brasília — é assim que o período de uma suspensão (AC-210)
 * se lê — e a situação da loja, o nome que a administração usa.
 */
export function valorNaTela(valor: unknown, campo?: string): string {
  if (
    (valor === null || valor === undefined) &&
    campo !== undefined &&
    campo in CAMPOS_DE_LIMITE
  ) {
    return "padrão da plataforma";
  }
  if (valor === null || valor === undefined || valor === "") return "—";
  if (
    campo === "status" &&
    typeof valor === "string" &&
    valor in ROTULOS_DAS_SITUACOES
  ) {
    return ROTULOS_DAS_SITUACOES[valor as SituacaoDaLoja];
  }
  if (typeof valor === "string" && FORMATO_DE_INSTANTE.test(valor)) {
    return momentoNaTela(valor);
  }
  if (typeof valor === "string") return valor;
  if (typeof valor === "number" || typeof valor === "boolean") {
    return typeof valor === "boolean" ? (valor ? "sim" : "não") : String(valor);
  }
  return JSON.stringify(valor);
}

/** O instante do ato, no fuso de Brasília: dia/mês/ano e hora:minuto. */
export function momentoNaTela(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
