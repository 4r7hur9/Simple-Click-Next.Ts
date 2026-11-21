/**
 * Geração e conferência do documento de contrato publicado (AC-007).
 *
 * O esquema de validação é a fonte única (decisão de 17/08). Daqui sai o
 * documento OpenAPI 3.1 que os aplicativos Kotlin e Swift vão usar para gerar
 * o cliente deles — e é por isso que ele precisa estar sempre em dia: cliente
 * gerado de documento velho falha na loja do cliente, não na nossa máquina.
 *
 * Dois comandos:
 *   node src/contracts/gerar.ts escrever    grava contrato/openapi.json
 *   node src/contracts/gerar.ts verificar   regenera em memória e compara
 *
 * O segundo é a etapa do portão. Ele não conserta nada: reprova apontando a
 * diferença, porque publicar sozinho esconderia justamente a mudança de
 * contrato que alguém precisa revisar.
 */

import { readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { z } from "zod";
import { stringify } from "yaml";
import {
  ERROS_DE_TODA_ROTA,
  ESQUEMAS_DO_CONTRATO,
  ETIQUETAS_DO_CONTRATO,
  ROTAS_DO_CONTRATO,
  type RotaDoContrato,
} from "@simpleclick/contracts";

/** Onde o documento publicado mora, versionado junto do código. */
export const CAMINHO_PUBLICADO = fileURLToPath(
  new URL("../../../../contrato/openapi.json", import.meta.url),
);

/** Cópia em YAML no caminho que o curso espera (docs/openapi.yaml). */
export const CAMINHO_YAML = fileURLToPath(
  new URL("../../../../docs/openapi.yaml", import.meta.url),
);

/** Comando que regrava o documento, citado em toda mensagem de reprovação. */
export const COMANDO_DE_REGRAVACAO =
  "pnpm --filter @simpleclick/api run contrato:escrever";

/** Valor JSON qualquer: é o que um documento OpenAPI é, no fim das contas. */
export type ValorJson =
  | string
  | number
  | boolean
  | null
  | ValorJson[]
  | { [chave: string]: ValorJson };

export type ObjetoJson = { [chave: string]: ValorJson };

/**
 * Versão do documento: a mesma do pacote da API.
 *
 * Vem do `package.json` em vez de constante escrita à mão porque duas versões
 * escritas em dois lugares divergem — e a que o aplicativo nativo lê é esta.
 */
function versaoDaApi(): string {
  const bruto = readFileSync(
    fileURLToPath(new URL("../../package.json", import.meta.url)),
    "utf8",
  );
  const manifesto = JSON.parse(bruto) as { version?: string };
  return manifesto.version ?? "0.0.0";
}

/** Texto de cada situação de resposta que o contrato usa. */
const DESCRICAO_DO_STATUS: Readonly<Record<string, string>> = Object.freeze({
  "200": "Requisição atendida",
  "201": "Recurso criado",
  "204": "Requisição atendida, sem corpo",
  "400": "Entrada recusada pelo contrato",
  "401": "Sessão ausente ou inválida",
  "403": "Sessão válida, sem permissão para isto",
  "404": "Endereço ou recurso inexistente",
  "409": "Conflito com o estado atual do recurso",
  "422": "Entrada válida na forma, recusada na regra de negócio",
  "429": "Tentativas demais; tente de novo mais tarde",
  "500": "Falha inesperada",
});

/** Converte um esquema em JSON Schema, sem o cabeçalho que o OpenAPI já dá. */
function paraJsonSchema(esquema: z.ZodType): ObjetoJson {
  const convertido = z.toJSONSchema(esquema, {
    target: "draft-2020-12",
    io: "output",
  }) as ObjetoJson;
  const { $schema: _cabecalho, ...resto } = convertido;
  return resto;
}

/** Nome publicado de cada esquema reaproveitado, achado por identidade. */
function nomesDosEsquemas(): Map<z.ZodType, string> {
  const nomes = new Map<z.ZodType, string>();
  for (const [nome, esquema] of Object.entries(ESQUEMAS_DO_CONTRATO)) {
    nomes.set(esquema, nome);
  }
  return nomes;
}

/** Referência ao esquema nomeado quando existe; cópia embutida quando não. */
function referenciarEsquema(
  esquema: z.ZodType,
  nomes: Map<z.ZodType, string>,
): ObjetoJson {
  const nome = nomes.get(esquema);
  if (nome === undefined) return paraJsonSchema(esquema);
  return { $ref: `#/components/schemas/${nome}` };
}

/** Um campo do esquema é obrigatório quando ele recusa a ausência do valor. */
function ehObrigatorio(esquema: z.ZodType): boolean {
  return !esquema.safeParse(undefined).success;
}

/** Descreve os campos de um esquema de objeto como parâmetros da rota. */
function descreverCampos(
  esquema: z.ZodType | undefined,
  onde: "path" | "query",
): ObjetoJson[] {
  if (esquema === undefined) return [];
  if (!(esquema instanceof z.ZodObject)) return [];

  const campos = Object.entries(esquema.shape as Record<string, z.ZodType>);
  return campos
    .sort(([um], [outro]) => um.localeCompare(outro, "en"))
    .map(([nome, campo]) => ({
      name: nome,
      in: onde,
      // Parâmetro de caminho é sempre obrigatório: sem ele o endereço nem
      // existe. Na consulta, quem manda é o esquema.
      required: onde === "path" ? true : ehObrigatorio(campo),
      schema: paraJsonSchema(campo),
    }));
}

/** Situações de resposta da rota, sem repetir e em ordem estável. */
function situacoesDeErro(rota: RotaDoContrato): number[] {
  const todas = new Set([...ERROS_DE_TODA_ROTA, ...rota.errosPossiveis]);
  return [...todas].sort((uma, outra) => uma - outra);
}

/**
 * Os formatos de corpo que a API devolve numa situação de erro.
 *
 * A API tem DOIS formatos de erro (achado do teste de contrato): o plano, das
 * rotas que respondem à mão, e o envelope do manipulador global
 * (`core/erros.ts`). No 400 o plano tem duas formas: a da borda de validação
 * (`ErroDeEntradaInvalida`, com a lista de campos) e a das recusas escritas à
 * mão nas rotas (`ErroDeEntradaRecusada`), que trazem outro código
 * (`tipo_desconhecido`, `periodo_invalido`...), às vezes sem `campos` e às
 * vezes com um detalhe próprio. Publicar só a primeira fazia o cliente gerado
 * rejeitar uma resposta que a API manda de verdade (card #137).
 */
function formatosDoErro(situacao: number): ObjetoJson[] {
  const envelope = { $ref: "#/components/schemas/ErroComEnvelope" };
  if (situacao !== 400) {
    return [{ $ref: "#/components/schemas/Erro" }, envelope];
  }
  return [
    { $ref: "#/components/schemas/ErroDeEntradaInvalida" },
    { $ref: "#/components/schemas/ErroDeEntradaRecusada" },
    envelope,
  ];
}

/** Descreve uma rota como operação do documento. */
function descreverOperacao(
  rota: RotaDoContrato,
  nomes: Map<z.ZodType, string>,
): ObjetoJson {
  const operacao: ObjetoJson = {
    operationId: rota.identificador,
    summary: rota.resumo,
    tags: [rota.etiqueta],
  };
  if (rota.descricao !== undefined) operacao["description"] = rota.descricao;

  const parametros = [
    ...descreverCampos(rota.parametros, "path"),
    ...descreverCampos(rota.consulta, "query"),
  ];
  if (parametros.length > 0) operacao["parameters"] = parametros;

  if (rota.corpo !== undefined) {
    operacao["requestBody"] = {
      required: true,
      content: {
        "application/json": { schema: referenciarEsquema(rota.corpo, nomes) },
      },
    };
  }

  const respostas: ObjetoJson = {};
  const sucessos = [rota.status, ...rota.statusAlternativosDeSucesso];
  for (const sucesso of sucessos) {
    respostas[String(sucesso)] = {
      description:
        sucesso === rota.status
          ? (DESCRICAO_DO_STATUS[String(sucesso)] ?? rota.resumo)
          : `${DESCRICAO_DO_STATUS[String(sucesso)] ?? rota.resumo} (resposta alternativa de sucesso; reenvio idempotente devolve o recurso já existente)`,
      content: {
        "application/json": {
          schema: referenciarEsquema(rota.resposta, nomes),
        },
      },
    };
  }
  for (const situacao of situacoesDeErro(rota)) {
    if (respostas[String(situacao)] !== undefined) continue;
    respostas[String(situacao)] = {
      description: DESCRICAO_DO_STATUS[String(situacao)] ?? "Falha",
      content: {
        "application/json": {
          schema: { anyOf: formatosDoErro(situacao) },
        },
      },
    };
  }
  operacao["responses"] = respostas;

  return operacao;
}

/** Agrupa as operações por caminho, como o documento espera. */
function descreverCaminhos(
  rotas: readonly RotaDoContrato[],
  nomes: Map<z.ZodType, string>,
): ObjetoJson {
  const caminhos: ObjetoJson = {};
  for (const rota of rotas) {
    const atual = (caminhos[rota.caminhoDoDocumento] ?? {}) as ObjetoJson;
    atual[rota.metodo] = descreverOperacao(rota, nomes);
    caminhos[rota.caminhoDoDocumento] = atual;
  }
  return caminhos;
}

/** Só as etiquetas realmente usadas, para o documento não anunciar vazio. */
function descreverEtiquetas(rotas: readonly RotaDoContrato[]): ObjetoJson[] {
  const usadas = [...new Set(rotas.map((rota) => rota.etiqueta))].sort(
    (um, outro) => um.localeCompare(outro, "en"),
  );
  return usadas.map((etiqueta) => ({
    name: etiqueta,
    description: ETIQUETAS_DO_CONTRATO[etiqueta] ?? etiqueta,
  }));
}

/**
 * Corpo do 400 da borda de validação (`apps/api/src/core/validar.ts`): além do
 * código, lista os campos reprovados. Só metadado do documento — a validação
 * continua sendo a do contrato Zod; o teste de contrato prende este formato à
 * resposta real.
 */
const ESQUEMA_DOS_CAMPOS_RECUSADOS: ObjetoJson = {
  type: "array",
  items: {
    type: "object",
    properties: {
      onde: { type: "string", enum: ["params", "query", "body"] },
      caminho: { type: "string" },
      mensagem: { type: "string" },
    },
    required: ["onde", "caminho", "mensagem"],
    additionalProperties: false,
  },
};

const ESQUEMA_DE_ENTRADA_INVALIDA: ObjetoJson = {
  type: "object",
  properties: {
    erro: { type: "string", const: "entrada_invalida" },
    campos: ESQUEMA_DOS_CAMPOS_RECUSADOS,
  },
  required: ["erro", "campos"],
  additionalProperties: false,
};

/**
 * Corpo do 400 escrito à mão numa rota: o código de máquina, sempre; a lista
 * de campos e a mensagem, quando a rota as dá. Fica aberto a outros campos de
 * diagnóstico (`explicacao`, `problemas`) porque eles existem nas respostas
 * reais; o cliente gerado decide pelo `erro`.
 */
const ESQUEMA_DE_ENTRADA_RECUSADA: ObjetoJson = {
  type: "object",
  properties: {
    erro: { type: "string" },
    campos: ESQUEMA_DOS_CAMPOS_RECUSADOS,
    mensagem: { type: "string" },
  },
  required: ["erro"],
};

/** Envelope de erro do manipulador global (`apps/api/src/core/erros.ts`). */
const ESQUEMA_DE_ERRO_COM_ENVELOPE: ObjetoJson = {
  type: "object",
  properties: {
    erro: {
      type: "object",
      properties: {
        codigo: { type: "string" },
        mensagem: { type: "string" },
        referencia: { type: "string" },
      },
      required: ["codigo", "mensagem", "referencia"],
      additionalProperties: false,
    },
  },
  required: ["erro"],
  additionalProperties: false,
};

/** Esquemas nomeados do documento, em ordem alfabética. */
function descreverComponentes(): ObjetoJson {
  const esquemas: ObjetoJson = {
    ErroDeEntradaInvalida: ESQUEMA_DE_ENTRADA_INVALIDA,
    ErroDeEntradaRecusada: ESQUEMA_DE_ENTRADA_RECUSADA,
    ErroComEnvelope: ESQUEMA_DE_ERRO_COM_ENVELOPE,
  };
  const nomes = Object.keys(ESQUEMAS_DO_CONTRATO).sort((um, outro) =>
    um.localeCompare(outro, "en"),
  );
  for (const nome of nomes) {
    const esquema = ESQUEMAS_DO_CONTRATO[nome];
    if (esquema !== undefined) esquemas[nome] = paraJsonSchema(esquema);
  }
  return { schemas: esquemas };
}

/**
 * Monta o documento inteiro a partir do catálogo de rotas.
 *
 * Recebe as rotas por parâmetro para que o teste consiga perguntar "e se
 * alguém acrescentar uma rota?" sem mexer no catálogo de verdade.
 */
export function gerarDocumento(
  rotas: readonly RotaDoContrato[] = ROTAS_DO_CONTRATO,
): ObjetoJson {
  const nomes = nomesDosEsquemas();
  return {
    openapi: "3.1.1",
    info: {
      title: "SimpleClick API",
      version: versaoDaApi(),
      description:
        "Contrato gerado a partir dos esquemas de validação da API. Não edite este arquivo à mão: ele é regravado por `pnpm --filter @simpleclick/api run contrato:escrever` e conferido pelo portão de qualidade.",
    },
    servers: [
      {
        url: "https://api.simpleclick.localhost",
        description: "desenvolvimento local",
      },
      { url: "https://api.simpleclick.app", description: "produção" },
    ],
    tags: descreverEtiquetas(rotas),
    paths: descreverCaminhos(rotas, nomes),
    components: descreverComponentes(),
  };
}

/** Texto exato que o arquivo publicado precisa ter. */
export function serializar(documento: ObjetoJson): string {
  return `${JSON.stringify(documento, null, 2)}\n`;
}

/** Texto YAML do mesmo documento (sem quebra de linha automática). */
export function serializarYaml(documento: ObjetoJson): string {
  const cabecalho =
    "# GERADO de packages/contracts por apps/api/src/contracts/gerar.ts.\n# Não edite à mão: rode `pnpm openapi:gerar`. Lint: `pnpm openapi:lint`.\n";
  return cabecalho + stringify(documento, { lineWidth: 0 });
}

/** Um ponto em que código e documento publicado contam histórias diferentes. */
export interface Divergencia {
  readonly onde: string;
  readonly noCodigo: string;
  readonly noPublicado: string;
}

export type MotivoDaReprovacao =
  "ausente" | "ilegivel" | "divergente" | "formato";

export interface Comparacao {
  readonly emDia: boolean;
  readonly motivo: MotivoDaReprovacao | null;
  readonly divergencias: readonly Divergencia[];
}

/** Como um valor aparece na explicação da diferença. */
function resumirValor(valor: ValorJson | undefined): string {
  if (valor === undefined) return "(ausente)";
  const texto = JSON.stringify(valor);
  return texto.length > 120 ? `${texto.slice(0, 117)}...` : texto;
}

/** Chaves dos dois lados, sem repetir e em ordem estável. */
function chavesDosDoisLados(um: ObjetoJson, outro: ObjetoJson): string[] {
  return [...new Set([...Object.keys(um), ...Object.keys(outro)])].sort(
    (uma, outra) => uma.localeCompare(outra, "en"),
  );
}

function ehObjetoJson(valor: ValorJson | undefined): valor is ObjetoJson {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/**
 * Compara os dois lados campo a campo, acumulando onde eles diferem.
 *
 * Percorre em profundidade em vez de comparar texto porque a mensagem precisa
 * dizer QUAL rota ou QUAL campo mudou: "os arquivos são diferentes" obriga
 * quem levou a reprovação a caçar a diferença à mão.
 */
function acharDivergencias(
  esperado: ValorJson | undefined,
  publicado: ValorJson | undefined,
  onde: string,
  achadas: Divergencia[],
): void {
  if (achadas.length >= 40) return;
  if (JSON.stringify(esperado) === JSON.stringify(publicado)) return;

  if (ehObjetoJson(esperado) && ehObjetoJson(publicado)) {
    for (const chave of chavesDosDoisLados(esperado, publicado)) {
      const filho = onde === "" ? chave : `${onde}.${chave}`;
      acharDivergencias(esperado[chave], publicado[chave], filho, achadas);
    }
    return;
  }

  achadas.push({
    onde: onde === "" ? "(documento)" : onde,
    noCodigo: resumirValor(esperado),
    noPublicado: resumirValor(publicado),
  });
}

/**
 * Confere o documento publicado contra o que o código produz agora.
 *
 * Reprova em quatro situações, e cada uma tem conserto diferente: arquivo que
 * não existe, arquivo ilegível, conteúdo diferente e conteúdo equivalente mas
 * fora do formato de gravação — este último importa porque, sem ele, o próximo
 * `escrever` mudaria o arquivo sem que nada tivesse mudado no contrato.
 */
export function compararComPublicado(
  documento: ObjetoJson,
  textoPublicado: string | null,
): Comparacao {
  if (textoPublicado === null) {
    return { emDia: false, motivo: "ausente", divergencias: [] };
  }

  let publicado: ValorJson;
  try {
    publicado = JSON.parse(textoPublicado) as ValorJson;
  } catch {
    return { emDia: false, motivo: "ilegivel", divergencias: [] };
  }

  const divergencias: Divergencia[] = [];
  acharDivergencias(documento, publicado, "", divergencias);
  if (divergencias.length > 0) {
    return { emDia: false, motivo: "divergente", divergencias };
  }

  if (textoPublicado !== serializar(documento)) {
    return { emDia: false, motivo: "formato", divergencias: [] };
  }

  return { emDia: true, motivo: null, divergencias: [] };
}

/** Lê o documento publicado; devolve `null` quando ele não existe. */
export async function lerPublicado(
  caminho: string = CAMINHO_PUBLICADO,
): Promise<string | null> {
  try {
    return await readFile(caminho, "utf8");
  } catch {
    return null;
  }
}

/** Grava o documento publicado e devolve o texto gravado. */
export async function escreverPublicado(
  caminho: string = CAMINHO_PUBLICADO,
): Promise<string> {
  const texto = serializar(gerarDocumento());
  await writeFile(caminho, texto, "utf8");
  return texto;
}

/** Grava docs/openapi.yaml a partir do mesmo documento. */
export async function escreverYaml(
  caminho: string = CAMINHO_YAML,
): Promise<string> {
  const texto = serializarYaml(gerarDocumento());
  await writeFile(caminho, texto, "utf8");
  return texto;
}

/** O YAML publicado está em dia com o código? */
export async function yamlEstaEmDia(
  caminho: string = CAMINHO_YAML,
): Promise<boolean> {
  return (await lerPublicado(caminho)) === serializarYaml(gerarDocumento());
}

/** Reprovação em texto: o que está errado, onde, e o que fazer agora. */
export function explicar(comparacao: Comparacao, caminho: string): string {
  if (comparacao.emDia) return `contrato publicado em dia: ${caminho}`;

  const cabecalhos: Readonly<Record<MotivoDaReprovacao, string>> = {
    ausente: `o documento publicado não existe em ${caminho}`,
    ilegivel: `o documento publicado em ${caminho} não é JSON válido`,
    divergente: `o documento publicado em ${caminho} está diferente do código`,
    formato: `o documento publicado em ${caminho} é equivalente ao código, mas fora do formato de gravação`,
  };

  const linhas = [cabecalhos[comparacao.motivo ?? "divergente"]];
  for (const divergencia of comparacao.divergencias) {
    linhas.push(
      `  ${divergencia.onde}\n    no código:    ${divergencia.noCodigo}\n    no publicado: ${divergencia.noPublicado}`,
    );
  }
  linhas.push(
    `  regrave com: ${COMANDO_DE_REGRAVACAO} — e revise a diferença antes de registrar a mudança.`,
  );
  return linhas.join("\n");
}

/** Confere e devolve o parecer pronto para o portão. */
export async function verificarPublicado(
  caminho: string = CAMINHO_PUBLICADO,
): Promise<Comparacao> {
  return compararComPublicado(gerarDocumento(), await lerPublicado(caminho));
}

/** Lê `--arquivo <caminho>` da linha de comando, quando vier. */
function caminhoPedido(argumentos: readonly string[]): string {
  const posicao = argumentos.indexOf("--arquivo");
  const valor = posicao === -1 ? undefined : argumentos[posicao + 1];
  return valor === undefined ? CAMINHO_PUBLICADO : resolve(valor);
}

async function principal(argumentos: readonly string[]): Promise<number> {
  const comando = argumentos[0];
  const caminho = caminhoPedido(argumentos);

  if (comando === "escrever") {
    await escreverPublicado(caminho);
    process.stdout.write(`contrato gravado em ${caminho}\n`);
    return 0;
  }

  if (comando === "yaml") {
    const destino = argumentos.includes("--arquivo") ? caminho : CAMINHO_YAML;
    await escreverYaml(destino);
    process.stdout.write(`openapi em YAML gravado em ${destino}\n`);
    return 0;
  }

  if (comando === "verificar-yaml") {
    const emDia = await yamlEstaEmDia();
    process.stdout.write(
      emDia
        ? `yaml em dia: ${CAMINHO_YAML}\n`
        : `yaml desatualizado: rode pnpm openapi:gerar\n`,
    );
    return emDia ? 0 : 1;
  }

  if (comando === "verificar") {
    const comparacao = await verificarPublicado(caminho);
    process.stdout.write(`${explicar(comparacao, caminho)}\n`);
    return comparacao.emDia ? 0 : 1;
  }

  process.stdout.write(
    "uso: node src/contracts/gerar.ts escrever|verificar [--arquivo <caminho>]\n",
  );
  return 2;
}

/**
 * Só roda como programa quando foi chamado como programa.
 *
 * O teste importa este arquivo; sem esta guarda, importar geraria o documento
 * e mataria o processo do Vitest.
 */
const chamadoDiretamente =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (chamadoDiretamente) {
  process.exitCode = await principal(process.argv.slice(2));
}
