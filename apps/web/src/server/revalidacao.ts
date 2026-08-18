/**
 * A chamada autenticada que a API faz para invalidar o cache do site (AC-028).
 *
 * A rota (`app/api/revalidate/route.ts`) é só a tomada; a regra mora aqui, por
 * dois motivos: um arquivo de rota do Next só pode exportar os verbos HTTP —
 * qualquer outro nome exportado reprova a verificação de tipos do próprio Next
 * — e a regra precisa ser exercitável sem servidor de pé.
 *
 * ## Autenticada de verdade
 *
 * O segredo é compartilhado com a API e vem do ambiente (P-002). Três recusas
 * deliberadas, cada uma por um modo de falha real:
 *
 * - **sem segredo configurado no site → 503, e nunca "deixa passar".** Um
 *   endpoint que se abre quando a configuração falta é pior do que um endpoint
 *   ausente: ele funciona nos testes e vira porta aberta em produção. Falhar
 *   fechado é a única opção segura.
 * - **sem segredo apresentado → 401.** Sem isso, qualquer um na rede derruba o
 *   cache de qualquer loja em laço, e cada limpeza empurra tráfego para o
 *   banco — negação de serviço barata.
 * - **segredo diferente → 401, comparado em tempo constante.** Comparação com
 *   `===` vaza, pelo tempo de resposta, quantos caracteres iniciais estão
 *   certos, e isso transforma adivinhação impossível em adivinhação viável.
 *
 * ## Por que a loja é validada mesmo com o segredo correto
 *
 * A etiqueta invalidada é montada com o identificador que chega no corpo. Sem
 * conferir a forma, um identificador com separador dentro apagaria etiqueta de
 * outra loja — a mesma confusão de chave de AC-027, entrando pela porta da
 * invalidação.
 */

import { createHash, timingSafeEqual } from "node:crypto";

import {
  ehParteDeChaveValida,
  invalidarNoSite,
  type MotorDeCacheDoSite,
} from "./cache";

/** Cabeçalho que carrega o segredo compartilhado — o mesmo nome que a API usa. */
export const CABECALHO_DE_REVALIDACAO = "x-simpleclick-revalidacao";

/** Segredo curto é adivinhável; 32 é o mesmo piso do resto do projeto. */
export const TAMANHO_MINIMO_DO_SEGREDO = 32;

/** O que a rota precisa para responder: o segredo esperado e quem invalida. */
export interface DependenciasDaRevalidacao {
  /** Segredo configurado neste site. `undefined` quando não há configuração. */
  readonly segredo: string | undefined;
  /** Quem invalida de fato. Só o teste passa outro. */
  readonly motor?: MotorDeCacheDoSite | undefined;
}

/** O que o corpo do pedido carrega. */
interface PedidoDeRevalidacao {
  readonly lojaId: string;
  readonly nomes: readonly string[];
}

/** Resposta em JSON, sempre fora de qualquer cache. */
function responder(estado: number, corpo: Record<string, unknown>): Response {
  return new Response(JSON.stringify(corpo), {
    status: estado,
    headers: {
      "content-type": "application/json",
      // A resposta da invalidação não pode ela mesma ficar guardada em lugar
      // nenhum: seria a resposta de ontem confirmando a limpeza de hoje.
      "cache-control": "no-store",
    },
  });
}

/**
 * Compara em tempo constante.
 *
 * Os dois lados passam por um resumo de tamanho fixo antes da comparação
 * porque `timingSafeEqual` exige comprimentos iguais — e comparar o
 * comprimento antes já vazaria o comprimento do segredo.
 */
function saoIguais(apresentado: string, esperado: string): boolean {
  const resumoApresentado = createHash("sha256").update(apresentado).digest();
  const resumoEsperado = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(resumoApresentado, resumoEsperado);
}

/** Lê e confere o corpo, ou devolve o motivo da recusa. */
function lerPedido(corpo: unknown): PedidoDeRevalidacao | string {
  if (typeof corpo !== "object" || corpo === null) {
    return "o corpo precisa ser um objeto JSON";
  }
  const dados = corpo as Record<string, unknown>;

  const lojaId = dados.lojaId;
  if (typeof lojaId !== "string" || !ehParteDeChaveValida(lojaId)) {
    return "lojaId ausente ou fora do formato aceito";
  }

  const nomesRecebidos = dados.nomes ?? [];
  if (!Array.isArray(nomesRecebidos)) return "nomes precisa ser uma lista";
  const nomes = nomesRecebidos.filter(
    (nome): nome is string => typeof nome === "string",
  );
  if (nomes.length !== nomesRecebidos.length) {
    return "nomes só aceita texto";
  }
  if (!nomes.every(ehParteDeChaveValida)) {
    return "há nome fora do formato aceito";
  }

  return { lojaId: lojaId.trim(), nomes: nomes.map((nome) => nome.trim()) };
}

/** O segredo apresentado no pedido, ou `undefined` quando não veio nenhum. */
function segredoApresentado(requisicao: Request): string | undefined {
  const cabecalho = requisicao.headers.get(CABECALHO_DE_REVALIDACAO)?.trim();
  return cabecalho === undefined || cabecalho === "" ? undefined : cabecalho;
}

/**
 * Responde ao pedido de invalidação.
 *
 * Devolve `200` com as etiquetas invalidadas, e recusa em todos os outros
 * casos. Nenhuma resposta de recusa diz mais do que o necessário: quem não
 * apresentou o segredo não descobre daqui qual loja existe.
 */
export async function responderRevalidacao(
  requisicao: Request,
  dependencias: DependenciasDaRevalidacao,
): Promise<Response> {
  const esperado = dependencias.segredo?.trim() ?? "";
  if (esperado.length < TAMANHO_MINIMO_DO_SEGREDO) {
    return responder(503, {
      erro: "revalidacao_nao_configurada",
      detalhe:
        "SEGREDO_DE_REVALIDACAO não está definida neste site, ou é curta demais. Sem ela, a rota recusa todo mundo — abrir seria pior.",
    });
  }

  const apresentado = segredoApresentado(requisicao);
  if (apresentado === undefined) {
    return responder(401, { erro: "nao_autenticado" });
  }
  if (!saoIguais(apresentado, esperado)) {
    return responder(401, { erro: "segredo_invalido" });
  }

  let corpo: unknown;
  try {
    corpo = await requisicao.json();
  } catch {
    return responder(400, {
      erro: "corpo_invalido",
      detalhe: "o corpo não é JSON",
    });
  }

  const pedido = lerPedido(corpo);
  if (typeof pedido === "string") {
    return responder(400, { erro: "corpo_invalido", detalhe: pedido });
  }

  const invalidado = invalidarNoSite(
    pedido.lojaId,
    pedido.nomes,
    dependencias.motor,
  );

  return responder(200, { lojaId: pedido.lojaId, invalidado });
}

/**
 * As dependências de execução, lidas do ambiente.
 *
 * O segredo nunca tem valor padrão: sem variável, a rota recusa todo mundo, e
 * é essa a intenção.
 */
export function dependenciasDoAmbiente(
  fonte: Readonly<Record<string, string | undefined>> = process.env,
): DependenciasDaRevalidacao {
  return { segredo: fonte.SEGREDO_DE_REVALIDACAO };
}
