/**
 * Busca a configuração de fechamento da loja (AC-506, AC-507, AC-510).
 *
 * ESTA CHAMADA É DO SERVIDOR, e não do navegador, ao contrário do carrinho. A
 * diferença é de quem é o dado: o carrinho é de QUEM ESTÁ COMPRANDO, e por isso
 * depende de um cookie que só o navegador dele carrega; a configuração é da
 * LOJA, igual para todo mundo, e por isso pode — e deve — ser desenhada no
 * servidor, antes de qualquer script.
 *
 * É A ÚNICA BUSCA DO SITE QUE TRAZ A CHAVE PIX, e ela só acontece na página do
 * fechamento. O AC-904 manda a chave não aparecer nos dados públicos da
 * vitrine; o AC-510 manda ela aparecer quando o cliente escolhe pagar com PIX.
 */
import {
  esquemaDoFechamento,
  type FechamentoNoContrato,
} from "@simpleclick/contracts";

import { enderecoDaApi, ESPERA_MAXIMA_EM_MS } from "./api-client.ts";

/** O que a página recebe: a configuração, ou o motivo de não haver. */
export type ResultadoDoFechamento =
  | { readonly estado: "encontrado"; readonly fechamento: FechamentoNoContrato }
  | { readonly estado: "nao-encontrado" }
  | { readonly estado: "indisponivel"; readonly motivo: string };

/**
 * Quanto tempo a configuração pode ficar guardada.
 *
 * MENOR QUE A DA VITRINE, de propósito. Um preço de vitrine desatualizado por
 * um minuto é um preço; uma chave PIX desatualizada é dinheiro indo para a
 * conta errada. Quinze segundos é o suficiente para segurar a rajada de quem
 * abre o fechamento e mexe nas formas de pagamento, sem esticar essa janela.
 */
export const SEGUNDOS_DE_CACHE_DO_FECHAMENTO = 15;

export async function buscarFechamento(
  apelido: string,
  buscar: typeof fetch = fetch,
): Promise<ResultadoDoFechamento> {
  const endereco = `${enderecoDaApi()}/v1/vitrine/${encodeURIComponent(
    apelido,
  )}/fechamento`;

  let resposta: Response;
  try {
    resposta = await buscar(endereco, {
      next: { revalidate: SEGUNDOS_DE_CACHE_DO_FECHAMENTO },
      signal: AbortSignal.timeout(ESPERA_MAXIMA_EM_MS),
      headers: { accept: "application/json" },
    } as RequestInit);
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : "falha de rede";
    return { estado: "indisponivel", motivo };
  }

  if (resposta.status === 404) return { estado: "nao-encontrado" };

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
    return {
      estado: "indisponivel",
      motivo: "a API respondeu algo que não é JSON",
    };
  }

  const conferido = esquemaDoFechamento.safeParse(corpo);
  if (!conferido.success) {
    // Fora do contrato é indisponibilidade, e não "loja sem formas de
    // pagamento": a segunda faria a página oferecer um fechamento mudo.
    return {
      estado: "indisponivel",
      motivo: "a resposta da API não bate com o contrato publicado",
    };
  }

  return { estado: "encontrado", fechamento: conferido.data };
}
