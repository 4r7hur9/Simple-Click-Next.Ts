/**
 * Busca a vitrine de uma loja na API (AC-400, AC-401, AC-402).
 *
 * O site NÃO fala com o banco: a tabela de fronteiras de
 * `.spec/design/arquitetura.md` só autoriza esta camada a conhecer o contrato,
 * e é a API que resolve qual loja atende aquele apelido. Esta função é a única
 * ponte, e por isso é onde a resposta é conferida contra o esquema — o que vem
 * pela rede é DADO até alguém provar o contrário.
 *
 * A conferência não é desconfiança do próprio servidor: é o que faz a página
 * quebrar no lugar certo se o contrato mudar. Sem ela, um campo renomeado
 * chegaria como `undefined` até o meio da árvore de componentes, e o erro
 * apareceria como texto sumido em vez de falha de contrato.
 */
import { esquemaDaVitrine, type Vitrine } from "@simpleclick/contracts";

import { enderecoDaApi, ESPERA_MAXIMA_EM_MS } from "./api-client.ts";

/** O que a página recebe: a loja, ou o motivo de não haver loja. */
export type ResultadoDaVitrine =
  | { readonly estado: "encontrada"; readonly vitrine: Vitrine }
  | { readonly estado: "nao-encontrada" }
  | { readonly estado: "indisponivel"; readonly motivo: string };

/** Quanto tempo a vitrine pode ficar guardada antes de ser buscada de novo. */
export const SEGUNDOS_DE_CACHE = 60;

/**
 * Busca a vitrine pelo apelido.
 *
 * `buscar` entra por parâmetro para a prova responder sem rede. Sem isso, a
 * única prova possível seria "roda contra o ambiente no ar" — teste que falha
 * por motivo errado e que ninguém consegue rodar na própria máquina.
 */
export async function buscarVitrine(
  apelido: string,
  buscar: typeof fetch = fetch,
): Promise<ResultadoDaVitrine> {
  const endereco = `${enderecoDaApi()}/v1/vitrine/${encodeURIComponent(apelido)}`;

  let resposta: Response;
  try {
    resposta = await buscar(endereco, {
      // A vitrine muda pouco e é lida muito: guardar por um minuto tira da API
      // a repetição de quem abriu a mesma loja, sem deixar o dono esperando
      // muito por uma mudança de preço.
      next: { revalidate: SEGUNDOS_DE_CACHE },
      signal: AbortSignal.timeout(ESPERA_MAXIMA_EM_MS),
      headers: { accept: "application/json" },
    } as RequestInit);
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : "falha de rede";
    return { estado: "indisponivel", motivo };
  }

  // 404 é resposta, e não falha: é o que a API devolve tanto para loja
  // inexistente quanto para suspensa, de propósito e com o mesmo corpo.
  if (resposta.status === 404) return { estado: "nao-encontrada" };

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

  const conferido = esquemaDaVitrine.safeParse(corpo);
  if (!conferido.success) {
    // Resposta fora do contrato é indisponibilidade, e não página vazia: a
    // página vazia faria a loja parecer sem produto quando o problema é outro.
    return {
      estado: "indisponivel",
      motivo: "a resposta da API não bate com o contrato publicado",
    };
  }

  return { estado: "encontrada", vitrine: conferido.data };
}
