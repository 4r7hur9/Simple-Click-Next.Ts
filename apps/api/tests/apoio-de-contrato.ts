/**
 * Apoio do teste de contrato: valida uma resposta real contra o OpenAPI.
 *
 * POR QUE NÃO É O AJV: o ajv 8 não é dependência direta do projeto (só chega
 * de carona, e o hoisted é o 6, sem draft 2020-12). O requisito da tarefa é
 * usar o que já está instalado, sem mexer no lockfile — então este validador
 * cobre o subconjunto de JSON Schema que o conversor Zod emite. Palavra-chave
 * desconhecida FALHA em voz alta (não é ignorada), para o validador nunca
 * "passar" um schema que ele não entende.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type Json = unknown;
type Esquema = Record<string, Json>;

export interface DocumentoOpenApi {
  readonly openapi: string;
  readonly paths: Record<string, Record<string, OperacaoOpenApi>>;
  readonly components: { readonly schemas: Record<string, Esquema> };
}
interface OperacaoOpenApi {
  readonly responses: Record<
    string,
    { readonly content?: { readonly "application/json"?: { schema: Esquema } } }
  >;
}

export const CAMINHO_DO_JSON = fileURLToPath(
  new URL("../../../contrato/openapi.json", import.meta.url),
);
export const CAMINHO_DO_YAML = fileURLToPath(
  new URL("../../../docs/openapi.yaml", import.meta.url),
);

export function lerOpenApi(): DocumentoOpenApi {
  return JSON.parse(readFileSync(CAMINHO_DO_JSON, "utf8")) as DocumentoOpenApi;
}

const CONHECIDAS = new Set([
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "anyOf",
  "oneOf",
  "enum",
  "const",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "minLength",
  "maxLength",
  "pattern",
  "format",
  "minItems",
  "maxItems",
  "propertyNames",
  "default",
  "description",
  "$ref",
  "id",
  "title",
]);

function tipoDe(valor: Json): string {
  if (valor === null) return "null";
  if (Array.isArray(valor)) return "array";
  if (typeof valor === "number")
    return Number.isInteger(valor) ? "integer" : "number";
  return typeof valor;
}

function confereTipo(tipo: string, valor: Json): boolean {
  const real = tipoDe(valor);
  if (tipo === "number") return real === "number" || real === "integer";
  return tipo === real;
}

/** Devolve a lista de problemas (vazia = válido). */
export function validar(
  doc: DocumentoOpenApi,
  esquema: Esquema,
  valor: Json,
  onde = "$",
): string[] {
  const ref = esquema["$ref"];
  if (typeof ref === "string") {
    const nome = ref.replace("#/components/schemas/", "");
    const alvo = doc.components.schemas[nome];
    if (alvo === undefined) return [`${onde}: $ref sem componente (${ref})`];
    return validar(doc, alvo, valor, onde);
  }
  for (const chave of Object.keys(esquema)) {
    if (!CONHECIDAS.has(chave)) {
      return [
        `${onde}: palavra-chave de schema não suportada pelo validador: ${chave}`,
      ];
    }
  }
  const erros: string[] = [];

  if (esquema["anyOf"] !== undefined) {
    const ramos = esquema["anyOf"] as Esquema[];
    if (!ramos.some((r) => validar(doc, r, valor, onde).length === 0)) {
      erros.push(
        `${onde}: nenhum ramo de anyOf aceita ${JSON.stringify(valor)?.slice(0, 80)}`,
      );
    }
    return erros;
  }
  if (esquema["oneOf"] !== undefined) {
    const ramos = esquema["oneOf"] as Esquema[];
    const aceitam = ramos.filter(
      (r) => validar(doc, r, valor, onde).length === 0,
    ).length;
    if (aceitam !== 1)
      erros.push(
        `${onde}: oneOf deveria casar com 1 ramo, casou com ${aceitam}`,
      );
    return erros;
  }
  if ("const" in esquema && esquema["const"] !== valor) {
    erros.push(`${onde}: esperado ${JSON.stringify(esquema["const"])}`);
  }
  if (Array.isArray(esquema["enum"]) && !esquema["enum"].includes(valor)) {
    erros.push(`${onde}: fora do enum (${JSON.stringify(valor)})`);
  }
  const tipos =
    esquema["type"] === undefined ? [] : ([] as Json[]).concat(esquema["type"]);
  if (tipos.length > 0 && !tipos.some((t) => confereTipo(String(t), valor))) {
    return [
      ...erros,
      `${onde}: esperado ${tipos.join("|")}, veio ${tipoDe(valor)}`,
    ];
  }

  if (typeof valor === "number") {
    const { minimum, maximum, exclusiveMinimum, exclusiveMaximum } =
      esquema as Record<string, number | undefined>;
    if (minimum !== undefined && valor < minimum)
      erros.push(`${onde}: abaixo de ${minimum}`);
    if (maximum !== undefined && valor > maximum)
      erros.push(`${onde}: acima de ${maximum}`);
    if (exclusiveMinimum !== undefined && valor <= exclusiveMinimum)
      erros.push(`${onde}: não acima de ${exclusiveMinimum}`);
    if (exclusiveMaximum !== undefined && valor >= exclusiveMaximum)
      erros.push(`${onde}: não abaixo de ${exclusiveMaximum}`);
  }
  if (typeof valor === "string") {
    const { minLength, maxLength, pattern } = esquema as Record<
      string,
      number | string | undefined
    >;
    if (typeof minLength === "number" && valor.length < minLength)
      erros.push(`${onde}: curto demais`);
    if (typeof maxLength === "number" && valor.length > maxLength)
      erros.push(`${onde}: longo demais`);
    if (typeof pattern === "string" && !new RegExp(pattern, "u").test(valor))
      erros.push(`${onde}: fora do padrão ${pattern}`);
  }
  if (Array.isArray(valor)) {
    const { minItems, maxItems, items } = esquema as {
      minItems?: number;
      maxItems?: number;
      items?: Esquema;
    };
    if (minItems !== undefined && valor.length < minItems)
      erros.push(`${onde}: poucos itens`);
    if (maxItems !== undefined && valor.length > maxItems)
      erros.push(`${onde}: itens demais`);
    if (items !== undefined) {
      valor.forEach((item, i) =>
        erros.push(...validar(doc, items, item, `${onde}[${i}]`)),
      );
    }
  }
  if (typeof valor === "object" && valor !== null && !Array.isArray(valor)) {
    const objeto = valor as Record<string, Json>;
    const props = (esquema["properties"] ?? {}) as Record<string, Esquema>;
    for (const nome of (esquema["required"] ?? []) as string[]) {
      if (!(nome in objeto))
        erros.push(`${onde}.${nome}: obrigatório e ausente`);
    }
    const adicional = esquema["additionalProperties"];
    for (const [nome, filho] of Object.entries(objeto)) {
      const prop = props[nome];
      if (prop !== undefined) {
        erros.push(...validar(doc, prop, filho, `${onde}.${nome}`));
      } else if (adicional === false) {
        erros.push(`${onde}.${nome}: campo fora do contrato`);
      } else if (typeof adicional === "object" && adicional !== null) {
        erros.push(
          ...validar(doc, adicional as Esquema, filho, `${onde}.${nome}`),
        );
      }
    }
  }
  return erros;
}

/**
 * Confere status E corpo de uma resposta real contra a operação documentada.
 * Status não documentado já reprova: é o defeito que o #128 achou.
 */
export function problemasDaResposta(
  doc: DocumentoOpenApi,
  caminho: string,
  metodo: "get" | "post",
  status: number,
  corpo: Json,
): string[] {
  const operacao = doc.paths[caminho]?.[metodo];
  if (operacao === undefined)
    return [`${metodo.toUpperCase()} ${caminho} não existe no OpenAPI`];
  const resposta = operacao.responses[String(status)];
  if (resposta === undefined) {
    return [
      `status ${status} não documentado em ${metodo.toUpperCase()} ${caminho} (documentados: ${Object.keys(operacao.responses).join(", ")})`,
    ];
  }
  const esquema = resposta.content?.["application/json"]?.schema;
  if (esquema === undefined) return [];
  return validar(doc, esquema, corpo);
}
