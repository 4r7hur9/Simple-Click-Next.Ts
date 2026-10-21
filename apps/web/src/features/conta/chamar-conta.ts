/**
 * O pedido que as telas da conta fazem ao próprio site, que leva a sessão à
 * API sem o script da página ver o token (P-008). Nunca lança: rede fora vira
 * `{ ok: false }`.
 */
export interface RespostaDaConta {
  readonly ok: boolean;
  readonly status: number;
  /** O código de erro da API (`senha_incorreta`, `cpf_invalido`…). */
  readonly erro?: string | undefined;
  readonly mensagem?: string | undefined;
  readonly corpo?: unknown;
}

export async function chamarConta(
  metodo: "GET" | "POST" | "PATCH" | "DELETE",
  caminho: string,
  corpo?: unknown,
  buscar: typeof fetch = fetch,
): Promise<RespostaDaConta> {
  try {
    const resposta = await buscar(`/api/conta/${caminho}`, {
      method: metodo,
      headers: corpo === undefined ? {} : { "content-type": "application/json" },
      ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
    });
    let json: unknown;
    try {
      json = await resposta.json();
    } catch {
      json = undefined;
    }
    const objeto = typeof json === "object" && json !== null ? (json as Record<string, unknown>) : {};
    const erro = typeof objeto["erro"] === "string" ? objeto["erro"] : undefined;
    const mensagem = typeof objeto["mensagem"] === "string" ? objeto["mensagem"] : undefined;
    return { ok: resposta.ok, status: resposta.status, erro, mensagem, corpo: json };
  } catch {
    return { ok: false, status: 0 };
  }
}
