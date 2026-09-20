/**
 * Única porta de saída HTTP do site para a API.
 *
 * A arquitetura reserva este arquivo para isso: componente de tela não chama a
 * API direto, e nenhuma outra camada abre conexão. Hoje ele cobre só o sinal
 * de vida — a rota que o contrato já declara —, e cresce junto com as fatias.
 *
 * O que ele devolve já vem conferido pelo contrato compartilhado: quem chama
 * recebe um estado pronto para a tela, nunca JSON solto.
 */

import {
  CAMINHO_DA_IDENTIFICACAO,
  descreverIdentificacao,
  lerIdentificacao,
} from "../lib/api-contrato.ts";

/**
 * Endereço da API quando o ambiente não diz outro.
 *
 * É o nome que o roteador local serve com TLS (ver `infra/traefik`), e o mesmo
 * que aparece na lista fechada de origens autorizadas. Não é segredo: segredo
 * vem de variável de ambiente, e endereço público de serviço não é segredo
 * (P-002).
 */
export const ENDERECO_PADRAO_DA_API = "https://api.simpleclick.localhost";

/** Espera máxima pelo sinal de vida. Tela não fica pendurada em rede. */
export const ESPERA_MAXIMA_EM_MS = 2000;

export type EstadoDaApi =
  | { readonly estado: "no-ar"; readonly descricao: string }
  | { readonly estado: "indisponivel"; readonly motivo: string };

/** Endereço configurado da API, sem barra sobrando no fim. */
export function enderecoDaApi(): string {
  const declarado = process.env.NEXT_PUBLIC_API_URL;
  const escolhido =
    declarado === undefined || declarado.length === 0
      ? ENDERECO_PADRAO_DA_API
      : declarado;
  return escolhido.replace(/\/+$/, "");
}

/**
 * Pergunta à API se ela está viva e traduz a resposta pelo contrato.
 *
 * `buscar` entra por parâmetro para o teste conseguir responder sem rede — e
 * sem isso a única prova possível seria "roda contra o ambiente no ar", que é
 * teste que falha por motivo errado.
 */
export async function consultarIdentificacaoDaApi(
  buscar: typeof fetch = fetch,
): Promise<EstadoDaApi> {
  const endereco = `${enderecoDaApi()}${CAMINHO_DA_IDENTIFICACAO}`;

  let resposta: Response;
  try {
    resposta = await buscar(endereco, {
      // Sinal de vida é estado do momento: em cache, a tela mentiria.
      cache: "no-store",
      signal: AbortSignal.timeout(ESPERA_MAXIMA_EM_MS),
      headers: { accept: "application/json" },
    });
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : "falha de rede";
    return { estado: "indisponivel", motivo };
  }

  if (!resposta.ok) {
    return {
      estado: "indisponivel",
      motivo: `a API respondeu ${resposta.status}`,
    };
  }

  let corpo: unknown;
  try {
    corpo = await resposta.json();
  } catch {
    return { estado: "indisponivel", motivo: "a resposta não era JSON" };
  }

  const leitura = lerIdentificacao(corpo);
  if (!leitura.lida) return { estado: "indisponivel", motivo: leitura.motivo };

  return {
    estado: "no-ar",
    descricao: descreverIdentificacao(leitura.identificacao),
  };
}
