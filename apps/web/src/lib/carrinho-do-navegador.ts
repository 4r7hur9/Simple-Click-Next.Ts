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

/**
 * O nome do aviso que a página dispara quando o carrinho muda.
 *
 * O carrinho flutuante, o contador da barra e o formulário do produto são
 * ilhas separadas na mesma página, e nenhuma manda na outra. Quem muda o
 * carrinho avisa pela janela; quem mostra o carrinho escuta e recarrega. É
 * mais simples que um estado global, e cada ilha continua funcionando sozinha.
 */
export const EVENTO_CARRINHO_MUDOU = "sc:carrinho-mudou";

/** Avisa a página de que o carrinho mudou. Fora do navegador, não faz nada. */
export function avisarQueOCarrinhoMudou(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENTO_CARRINHO_MUDOU));
}

/** O carrinho como a API o devolve, ou o motivo de não ter vindo. */
export type ResultadoDoCarrinho =
  | { readonly estado: "visto"; readonly carrinho: CarrinhoNoContrato }
  | { readonly estado: "falhou"; readonly motivo: string };

/**
 * Lê o carrinho da sessão.
 *
 * `cache: "no-store"` porque a pergunta é "quantos itens AGORA": uma cópia
 * guardada pelo navegador mostraria a contagem de antes de a pessoa adicionar.
 */
export async function verCarrinho(
  apelidoDaLoja: string,
  buscar: typeof fetch = fetch,
): Promise<ResultadoDoCarrinho> {
  const endereco = `${enderecoDaApiNoNavegador()}/v1/vitrine/${encodeURIComponent(
    apelidoDaLoja,
  )}/carrinho`;

  let resposta: Response;
  try {
    resposta = await buscar(endereco, {
      credentials: "include",
      cache: "no-store",
      headers: { accept: "application/json" },
    });
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : "falha de rede";
    return { estado: "falhou", motivo };
  }

  return carrinhoDaResposta(resposta);
}

/** Muda a quantidade de um item. Zero tira o item do carrinho. */
export async function mudarQuantidadeNoCarrinho(
  apelidoDaLoja: string,
  itemId: string,
  quantidade: number,
  buscar: typeof fetch = fetch,
): Promise<ResultadoDoCarrinho> {
  const endereco = `${enderecoDaApiNoNavegador()}/v1/vitrine/${encodeURIComponent(
    apelidoDaLoja,
  )}/carrinho/itens/${encodeURIComponent(itemId)}`;

  let resposta: Response;
  try {
    resposta = await buscar(endereco, {
      method: "PATCH",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ quantidade }),
    });
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : "falha de rede";
    return { estado: "falhou", motivo };
  }

  return carrinhoDaResposta(resposta);
}

/** O caminho comum de ver e de mudar: confere o status e o contrato. */
async function carrinhoDaResposta(
  resposta: Response,
): Promise<ResultadoDoCarrinho> {
  if (!resposta.ok) {
    return { estado: "falhou", motivo: `a API respondeu ${resposta.status}` };
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

  return { estado: "visto", carrinho: conferido.data };
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

/** O que a conferência devolve, já com os valores do servidor. */
export interface ConferenciaNaTela {
  readonly mudancas: readonly {
    readonly itemId: string;
    readonly nome: string;
    readonly tipo: string;
    readonly deEmCentavos: number | null;
    readonly paraEmCentavos: number | null;
    readonly explicacao: string;
  }[];
  readonly precisaConfirmar: boolean;
  readonly itens: readonly {
    readonly itemId: string;
    readonly produtoId: string;
    readonly nome: string;
    readonly quantidade: number;
    readonly precoUnitarioCentavos: number;
    readonly totalDaLinhaCentavos: number;
    /** Qual preço foi usado e por quê, quando não é o normal (AC-310). */
    readonly precoAplicado?: {
      readonly rotulo: string;
      readonly motivo: string;
    } | null;
  }[];
  readonly subtotalCentavos: number;
}

export type ResultadoDaConferencia =
  | { readonly estado: "conferido"; readonly conferencia: ConferenciaNaTela }
  | { readonly estado: "falhou"; readonly motivo: string };

/**
 * Confere o carrinho contra o catálogo de agora.
 *
 * É POST porque carrega a declaração do que a tela mostrou, e porque REGISTRA a
 * divergência quando os números não batem — um GET que escreve no registro de
 * segurança mente sobre o que é.
 */
export async function conferirCarrinho(
  apelidoDaLoja: string,
  totalVistoCentavos: number | null = null,
  buscar: typeof fetch = fetch,
): Promise<ResultadoDaConferencia> {
  const resposta = await chamar(
    apelidoDaLoja,
    "/carrinho/conferencia",
    { totalVistoCentavos },
    buscar,
  );

  if (resposta.estado === "conflito") {
    // A conferência não devolve 409 hoje; se um dia devolver, ele é falha de
    // rede do ponto de vista desta tela — ela não tem o que fazer com isso.
    return { estado: "falhou", motivo: "a API recusou a conferência" };
  }
  if (resposta.estado !== "ok") return resposta;
  return {
    estado: "conferido",
    conferencia: resposta.corpo as ConferenciaNaTela,
  };
}

/** O que a tela envia para fechar o pedido. */
export interface PedidoParaEnviar {
  readonly contato: {
    readonly nome: string;
    readonly telefone: string;
    readonly logradouro?: string | null;
    readonly numero?: string | null;
    readonly complemento?: string | null;
    readonly bairro?: string | null;
    readonly cidade?: string | null;
    readonly estado?: string | null;
    readonly cep?: string | null;
  };
  readonly entrega: "DELIVERY" | "PICKUP";
  readonly formaDePagamento: string | null;
  readonly trocoParaCentavos: number | null;
  readonly observacao: string | null;
  readonly chaveDeIdempotencia: string;
  readonly totalVistoCentavos: number;
}

/** O pedido criado, como a tela o mostra. */
export interface PedidoNaTela {
  readonly id: string;
  readonly numero: number;
  readonly codigo: string;
  readonly tokenPublico: string;
  readonly jaExistia: boolean;
  readonly subtotalCentavos: number;
  readonly taxaDeEntregaCentavos: number;
  readonly totalCentavos: number;
  /**
   * A mensagem pronta para a loja. Nula quando a loja não cadastrou número —
   * o pedido existe do mesmo jeito, e a tela mostra o código (AC-523).
   */
  readonly whatsapp: {
    readonly endereco: string;
    readonly texto: string;
    readonly completo: boolean;
  } | null;
}

export type ResultadoDoFechamento =
  | { readonly estado: "criado"; readonly pedido: PedidoNaTela }
  /** A loja fechou, o carrinho esvaziou, ou o mínimo não foi alcançado. */
  | { readonly estado: "nao-pode"; readonly motivo: string }
  | { readonly estado: "falhou"; readonly motivo: string };

/** Fecha o pedido. */
export async function criarPedido(
  apelidoDaLoja: string,
  pedido: PedidoParaEnviar,
  buscar: typeof fetch = fetch,
): Promise<ResultadoDoFechamento> {
  const resposta = await chamar(apelidoDaLoja, "/pedidos", pedido, buscar);

  if (resposta.estado === "conflito") {
    // 409 é o mundo tendo mudado desde que a página abriu — a loja fechou, o
    // preço subiu, o item acabou. Não é erro nosso nem culpa de quem comprou.
    // Loja fechada é o 409 que mais acontece, e o AC-517 manda dizer quando
    // ela abre. O corpo do erro não traz detalhe (`CorpoDeErro`); a vitrine
    // pública traz, com o mesmo cálculo da criação do pedido.
    const fechada = await motivoDaLojaFechada(apelidoDaLoja, buscar);
    return {
      estado: "nao-pode",
      motivo:
        fechada ??
        "Não foi possível fechar o pedido agora. Confira o carrinho e tente de novo.",
    };
  }
  if (resposta.estado !== "ok") {
    return { estado: "falhou", motivo: resposta.motivo };
  }

  return { estado: "criado", pedido: resposta.corpo as PedidoNaTela };
}

/**
 * Pergunta à vitrine se a loja está fechada e, se estiver, devolve a frase que
 * diz quando ela abre — a mesma que a API monta na recusa. Nulo quando a loja
 * está aberta (o 409 foi outro) ou quando a vitrine não respondeu: aí vale o
 * texto genérico, e nunca um "fechada" inventado.
 */
async function motivoDaLojaFechada(
  apelidoDaLoja: string,
  buscar: typeof fetch,
): Promise<string | null> {
  try {
    const resposta = await buscar(
      `${enderecoDaApiNoNavegador()}/v1/vitrine/${encodeURIComponent(apelidoDaLoja)}`,
      { headers: { accept: "application/json" }, cache: "no-store" },
    );
    if (!resposta.ok) return null;
    const corpo = (await resposta.json()) as {
      abertura?: { aberta?: unknown; proximaAbertura?: unknown };
    };
    const abertura = corpo.abertura;
    if (abertura === undefined || abertura.aberta !== false) return null;
    return typeof abertura.proximaAbertura === "string" &&
      abertura.proximaAbertura !== ""
      ? `A loja está fechada agora. Ela ${abertura.proximaAbertura}.`
      : "A loja está fechada agora e ainda não informou o próximo horário de funcionamento.";
  } catch {
    return null;
  }
}

/** Registra que o cliente abriu a conversa do pedido. */
export async function registrarCliqueNoWhatsApp(
  apelidoDaLoja: string,
  tokenDoPedido: string,
  buscar: typeof fetch = fetch,
): Promise<boolean> {
  return registrarAcaoDoWhatsApp(
    apelidoDaLoja,
    tokenDoPedido,
    "whatsapp-clique",
    buscar,
  );
}

/** Registra que o cliente confirmou o envio da mensagem. */
export async function confirmarMensagemNoWhatsApp(
  apelidoDaLoja: string,
  tokenDoPedido: string,
  buscar: typeof fetch = fetch,
): Promise<boolean> {
  return registrarAcaoDoWhatsApp(
    apelidoDaLoja,
    tokenDoPedido,
    "whatsapp-confirmado",
    buscar,
  );
}

async function registrarAcaoDoWhatsApp(
  apelidoDaLoja: string,
  tokenDoPedido: string,
  acao: "whatsapp-clique" | "whatsapp-confirmado",
  buscar: typeof fetch,
): Promise<boolean> {
  try {
    const resposta = await buscar(
      `${enderecoDaApiNoNavegador()}/v1/vitrine/${encodeURIComponent(apelidoDaLoja)}/pedidos/${encodeURIComponent(tokenDoPedido)}/${acao}`,
      {
        method: "POST",
        credentials: "include",
        headers: { accept: "application/json" },
      },
    );
    return resposta.ok;
  } catch {
    // A abertura da conversa e a confirmação visual não podem ser desfeitas
    // por uma falha transitória de rede. O cliente poderá tentar novamente.
    return false;
  }
}

type Resposta =
  | { readonly estado: "ok"; readonly corpo: unknown }
  | { readonly estado: "conflito" }
  | { readonly estado: "falhou"; readonly motivo: string };

/**
 * O caminho comum das três chamadas: cookie junto, JSON de ida e de volta.
 *
 * `credentials: "include"` NÃO É OPCIONAL em nenhuma delas — sem o cookie, a
 * API emite uma sessão nova e a chamada fala com um carrinho vazio. É também
 * ele que leva o `sc_access` de quem está logado: a página não lê o token e
 * não monta `Authorization`, e é pelo cookie que a API liga o pedido à conta
 * do cliente (AC-616, `cliente-da-compra.ts`).
 */
async function chamar(
  apelidoDaLoja: string,
  caminho: string,
  corpo: unknown,
  buscar: typeof fetch,
): Promise<Resposta> {
  const endereco = `${enderecoDaApiNoNavegador()}/v1/vitrine/${encodeURIComponent(
    apelidoDaLoja,
  )}${caminho}`;

  let resposta: Response;
  try {
    resposta = await buscar(endereco, {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(corpo),
    });
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : "falha de rede";
    return { estado: "falhou", motivo };
  }

  if (resposta.status === 409) return { estado: "conflito" };
  if (!resposta.ok) {
    return { estado: "falhou", motivo: `a API respondeu ${resposta.status}` };
  }

  try {
    return { estado: "ok", corpo: await resposta.json() };
  } catch {
    return { estado: "falhou", motivo: "a API respondeu algo que não é JSON" };
  }
}
