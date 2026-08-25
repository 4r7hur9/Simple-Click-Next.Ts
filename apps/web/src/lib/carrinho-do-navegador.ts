/**
 * O carrinho, chamado direto do NAVEGADOR (AC-411, AC-500).
 *
 * POR QUE ESTA CHAMADA NÃO PASSA PELO SERVIDOR DO SITE. O carrinho é do
 * visitante, identificado por um cookie que a API emite. Se o servidor do Next
 * fizesse a chamada, o cookie seria dele — e todos os visitantes dividiriam o
 * mesmo carrinho, que é exatamente a falha que a migração 0012 corrigiu no
 * banco. Quem precisa carregar o cookie é o navegador de quem está comprando.
 *
 * É O CAMINHO QUE A DECISÃO DE 17/08 DESENHOU: site e API no mesmo domínio
 * registrável, em subdomínios. É por isso que o cookie `SameSite=Lax` viaja, e
 * é por isso que `core/cors.ts` existe com lista fechada de origens — a
 * conferência de origem é o que substitui um token anti-falsificação separado.
 *
 * `credentials: "include"` NÃO É OPCIONAL. Sem ele o navegador não manda o
 * cookie para outro subdomínio, a API emite uma sessão nova a cada requisição,
 * e o carrinho nasce vazio toda vez — sem erro nenhum para explicar por quê.
 *
 * MORA EM `lib` porque é daqui que o componente pode alcançá-la: a tabela de
 * fronteiras não deixa `features` chegar a `server`, e `server` é a camada que
 * roda no servidor do Next — que é justamente quem NÃO pode fazer esta chamada.
 */
import {
  esquemaDoCarrinho,
  type CarrinhoNoContrato,
} from "@simpleclick/contracts";

/** O item que a tela monta para mandar. */
export interface ItemParaEnviar {
  readonly produtoId: string;
  readonly variacaoId: string | null;
  readonly quantidade: number;
  readonly observacao: string | null;
  readonly escolhas: readonly {
    readonly grupoId: string;
    readonly opcaoId: string;
    readonly quantidade: number;
  }[];
  /** O total que a tela mostrou. A API o usa só para anotar divergência. */
  readonly totalVistoCentavos: number;
}

/** O que a tela recebe de volta. */
export type ResultadoDeAdicionar =
  | { readonly estado: "adicionado"; readonly carrinho: CarrinhoNoContrato }
  /** O catálogo mudou desde que a página abriu, e o item não fecha mais. */
  | { readonly estado: "nao-fecha" }
  | { readonly estado: "falhou"; readonly motivo: string };

/**
 * O endereço da API como o NAVEGADOR o vê.
 *
 * Precisa ser `NEXT_PUBLIC_`, e não a variável do servidor: o valor é embutido
 * na página durante a construção, e a variável privada não chega ao navegador —
 * a chamada iria para o endereço vazio.
 */
function enderecoDaApiNoNavegador(): string {
  return (
    process.env["NEXT_PUBLIC_API_URL"] ?? "https://api.simpleclick.localhost"
  );
}

/** Manda um item ao carrinho da loja. */
export async function adicionarAoCarrinho(
  apelidoDaLoja: string,
  item: ItemParaEnviar,
  buscar: typeof fetch = fetch,
): Promise<ResultadoDeAdicionar> {
  const endereco = `${enderecoDaApiNoNavegador()}/v1/vitrine/${encodeURIComponent(
    apelidoDaLoja,
  )}/carrinho/itens`;

  let resposta: Response;
  try {
    resposta = await buscar(endereco, {
      method: "POST",
      // Sem isto o cookie não viaja, e cada requisição vira uma sessão nova.
      credentials: "include",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(item),
    });
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : "falha de rede";
    return { estado: "falhou", motivo };
  }

  // 409 é o catálogo tendo mudado desde que a página abriu — o dono esgotou uma
  // opção, ou tirou o grupo do produto. Não é erro nosso nem culpa de quem
  // comprou, e a tela precisa dizer isso de um jeito diferente de "deu ruim".
  if (resposta.status === 409) return { estado: "nao-fecha" };

  if (!resposta.ok) {
    return {
      estado: "falhou",
      motivo: `a API respondeu ${resposta.status}`,
    };
  }

  let corpo: unknown;
  try {
    corpo = await resposta.json();
  } catch {
    return { estado: "falhou", motivo: "a API respondeu algo que não é JSON" };
  }

  const conferido = esquemaDoCarrinho.safeParse(corpo);
  if (!conferido.success) {
    return {
      estado: "falhou",
      motivo: "a resposta da API não bate com o contrato publicado",
    };
  }

  return { estado: "adicionado", carrinho: conferido.data };
}
