/**
 * A trilha de auditoria lida pela administração (AC-207, AC-118, AC-922).
 *
 * Funções puras: a linha do banco entra, o registro do contrato sai. Moram
 * aqui, e não no repositório, porque a mesma leitura serve à ficha da loja
 * (T-202) e ao histórico consultável (T-208) — e porque a regra de "o que é
 * sensível" precisa de prova sem banco nenhum.
 *
 * DOIS FORMATOS convivem na trilha, e a leitura aceita os dois:
 *
 * - o das alterações campo a campo — a configuração do dono (AC-922) e as
 *   edições da administração —, com `{ campos: { … } }` no antes e no depois;
 * - o dos atos inteiros, como o cadastro da loja (`LOJA_CRIADA`), que guarda
 *   o objeto direto no `after_data`.
 *
 * O que nenhuma das duas guarda é dado pessoal em claro: quem grava mascara
 * antes (P-009), e a leitura mostra o que foi gravado, sem desmascarar nada.
 */

import type {
  CampoDaTrilhaNoContrato,
  RegistroDaTrilhaNoContrato,
} from "@simpleclick/contracts";

/** Uma linha de `app.audit_log`, com o nome de quem praticou o ato. */
export interface LinhaDaTrilha {
  readonly id: string;
  readonly quando: Date;
  readonly acao: string;
  readonly atorId: string | null;
  readonly atorNome: string | null;
  readonly papel: string;
  readonly antes: unknown;
  readonly depois: unknown;
}

/**
 * Atos que a tela destaca sempre, mesmo sem marca no registro.
 *
 * A troca de dado sensível do dono já chega marcada (`sensivel: true`, pela
 * configuração); o código do ato garante o destaque mesmo em registro antigo,
 * gravado antes de a marca existir. Abrir um documento sigiloso da loja
 * (contrato, documento do responsável) é destacado por ser um dos eventos que
 * merecem alerta (modelo de dados, `store_contracts`).
 */
export const ATOS_SENSIVEIS: ReadonlySet<string> = new Set([
  "CONFIG_SENSIVEL_ALTERADA",
  "DOCUMENTO_BAIXADO",
]);

/** Chaves de controle do registro, que não são campo do cadastro. */
const CHAVES_DE_CONTROLE: ReadonlySet<string> = new Set([
  "sensivel",
  "camposSensiveis",
  "sessao",
]);

function objeto(valor: unknown): Readonly<Record<string, unknown>> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

/** Os campos de um lado do registro, nos dois formatos da trilha. */
function camposDoLado(lado: unknown): Readonly<Record<string, unknown>> {
  const bruto = objeto(lado);
  if ("campos" in bruto) return objeto(bruto["campos"]);
  const campos: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(bruto)) {
    if (!CHAVES_DE_CONTROLE.has(chave)) campos[chave] = valor;
  }
  return campos;
}

/**
 * Os campos que o ato tocou, com o valor de antes e o de depois.
 *
 * A ordem é a de gravação: primeiro os do antes, depois os que só existem no
 * depois (um campo novo, como o motivo de uma suspensão).
 */
export function camposDoRegistro(
  antes: unknown,
  depois: unknown,
): CampoDaTrilhaNoContrato[] {
  const deAntes = camposDoLado(antes);
  const deDepois = camposDoLado(depois);
  const nomes = [
    ...Object.keys(deAntes),
    ...Object.keys(deDepois).filter((nome) => !(nome in deAntes)),
  ];
  return nomes.map((campo) => ({
    campo,
    antes: deAntes[campo] ?? null,
    depois: deDepois[campo] ?? null,
  }));
}

/** O ato é daqueles que a tela destaca? */
export function atoSensivel(acao: string, depois: unknown): boolean {
  return ATOS_SENSIVEIS.has(acao) || objeto(depois)["sensivel"] === true;
}

/** A linha do banco no formato do contrato. */
export function registroDaTrilha(
  linha: LinhaDaTrilha,
): RegistroDaTrilhaNoContrato {
  return {
    id: linha.id,
    quando: linha.quando.toISOString(),
    acao: linha.acao,
    quem:
      linha.atorId === null
        ? null
        : { id: linha.atorId, nome: linha.atorNome ?? "Pessoa sem nome" },
    papel: linha.papel,
    campos: camposDoRegistro(linha.antes, linha.depois),
    sensivel: atoSensivel(linha.acao, linha.depois),
  };
}

/**
 * Mascara o dado pessoal ANTES de ele entrar na trilha (P-009).
 *
 * A mesma regra da configuração do dono: sobra o final, para quem lê saber
 * de qual valor para qual valor a mudança foi, sem o valor inteiro.
 */
export function mascararDadoPessoal(valor: unknown): unknown {
  if (typeof valor !== "string" || valor === "") return valor;
  const final = valor.length <= 4 ? "" : valor.slice(-4);
  return `…${final}`;
}
