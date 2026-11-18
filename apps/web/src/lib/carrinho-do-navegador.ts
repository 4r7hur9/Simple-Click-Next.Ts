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
  type AtacadoNoItemNoContrato,
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

/**
 * O nome do aviso que a página dispara quando o carrinho muda.
 *
 * O carrinho flutuante e o formulário do produto são ilhas separadas na mesma
 * página, e nenhuma das duas manda na outra. Um evento na janela é o fio mais
 * curto entre elas: quem adiciona avisa, quem mostra a contagem escuta.
 */
export const AVISO_DE_CARRINHO_MUDOU = "sc:carrinho-mudou";

/**
 * O pedido para abrir a sacola (card #105): o ícone da sacola do topo dispara
 * este evento com `detail: { atendido: false }`; quem abre a sacola (o
 * `CarrinhoFlutuante`) marca `atendido = true`. Se ninguém atender, o topo
 * leva à página da sacola da loja. O destino NUNCA vem do evento.
 */
export const EVENTO_ABRIR_SACOLA = "sc:abrir-sacola";

/** O `detail` do evento de abrir a sacola. */
export interface PedidoDeAbrirASacola {
  atendido: boolean;
}

/** Avisa a página de que o carrinho mudou. */
export function avisarQueOCarrinhoMudou(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AVISO_DE_CARRINHO_MUDOU));
}

/** Quantos itens o carrinho da sessão tem. Nulo quando a API não respondeu. */
export async function contarItensDoCarrinho(
  apelidoDaLoja: string,
  buscar: typeof fetch = fetch,
): Promise<number | null> {
  try {
    const resposta = await buscar(
      `${enderecoDaApiNoNavegador()}/v1/vitrine/${encodeURIComponent(apelidoDaLoja)}/carrinho`,
      {
        credentials: "include",
        headers: { accept: "application/json" },
        cache: "no-store",
      },
    );
    if (!resposta.ok) return null;
    const conferido = esquemaDoCarrinho.safeParse(await resposta.json());
    return conferido.success ? conferido.data.totalDeItens : null;
  } catch {
    return null;
  }
}

/**
 * Os itens do carrinho como a sessão os guarda: variação, opções escolhidas e
 * observação. Nome e preço NÃO vêm daqui — vêm da conferência, que é quem sabe
 * os valores de agora. Nulo quando a API não respondeu.
 */
export async function verItensDoCarrinho(
  apelidoDaLoja: string,
  buscar: typeof fetch = fetch,
): Promise<CarrinhoNoContrato["itens"] | null> {
  try {
    const resposta = await buscar(
      `${enderecoDaApiNoNavegador()}/v1/vitrine/${encodeURIComponent(apelidoDaLoja)}/carrinho`,
      {
        credentials: "include",
        headers: { accept: "application/json" },
        cache: "no-store",
      },
    );
    if (!resposta.ok) return null;
    const conferido = esquemaDoCarrinho.safeParse(await resposta.json());
    return conferido.success ? conferido.data.itens : null;
  } catch {
    return null;
  }
}

/**
 * Muda a quantidade de um item. Zero remove — é a API quem decide isso.
 *
 * Devolve falso em qualquer falha: quem chama recarrega o carrinho e mostra o
 * que o servidor tem, que é a única versão que vale.
 */
export async function mudarQuantidadeNoCarrinho(
  apelidoDaLoja: string,
  itemId: string,
  quantidade: number,
  buscar: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const resposta = await buscar(
      `${enderecoDaApiNoNavegador()}/v1/vitrine/${encodeURIComponent(apelidoDaLoja)}/carrinho/itens/${encodeURIComponent(itemId)}`,
      {
        method: "PATCH",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ quantidade }),
      },
    );
    return resposta.ok;
  } catch {
    return false;
  }
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
    /** `BASE`, `PROMO` ou `WHOLESALE` (card #57). */
    readonly tipoDePreco?: string;
    /** O varejo por unidade, riscado ao lado, quando o cobrado é menor. */
    readonly varejoUnitarioCentavos?: number | null;
    /** A faixa de atacado aplicada, a próxima e quantas peças faltam. */
    readonly atacado?: AtacadoNoItemNoContrato | null;
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
  if (resposta.estado === "recusado") {
    return { estado: "falhou", motivo: `a API respondeu ${resposta.status}` };
  }
  if (resposta.estado !== "ok") return resposta;
  return {
    estado: "conferido",
    conferencia: resposta.corpo as ConferenciaNaTela,
  };
}

/** Um endereço novo de entrega, que a API guarda na conta de quem pede. */
export interface EnderecoNovoParaEnviar {
  readonly logradouro: string;
  readonly numero?: string | null;
  readonly complemento?: string | null;
  readonly bairro?: string | null;
  readonly cidade?: string | null;
  readonly estado?: string | null;
  readonly cep?: string | null;
  readonly pontoDeReferencia?: string | null;
}

/**
 * O que a tela envia para fechar o pedido.
 *
 * QUEM PEDE É A CONTA LOGADA: nome, e-mail e telefone saem dela, no servidor.
 * O corpo só traz o telefone quando a conta ainda não tem, e na entrega um
 * endereço salvo (`enderecoId`) ou um novo (`endereco`). O `contato` é o
 * formato antigo, que a API ainda aceita.
 */
export interface PedidoParaEnviar {
  readonly contato?: {
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
  readonly telefone?: string;
  readonly enderecoId?: string;
  readonly endereco?: EnderecoNovoParaEnviar;
  readonly entrega: "DELIVERY" | "PICKUP";
  readonly formaDePagamento: string | null;
  readonly trocoParaCentavos: number | null;
  readonly observacao: string | null;
  readonly chaveDeIdempotencia: string;
  readonly totalVistoCentavos: number;
  /**
   * O subtotal dos itens que a conferência mostrou. A API recalcula com a
   * faixa de atacado de agora e recusa (409) quando não bate (card #57).
   */
  readonly subtotalVistoCentavos?: number;
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
  /** Sem sessão (401 `conta_obrigatoria`): a pessoa entra e tenta de novo. */
  | { readonly estado: "sem-conta" }
  /**
   * A API recusou um dado que a pessoa corrige na tela (422): telefone,
   * endereço. `codigo` é o da API (`telefone_invalido`, `endereco_obrigatorio`…).
   */
  | {
      readonly estado: "recusado";
      readonly codigo: string;
      readonly motivo: string;
    }
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
  if (resposta.estado === "recusado") {
    if (resposta.status === 401) return { estado: "sem-conta" };
    const corpo = resposta.corpo as { erro?: unknown; mensagem?: unknown };
    return {
      estado: "recusado",
      codigo: typeof corpo.erro === "string" ? corpo.erro : "recusado",
      motivo:
        typeof corpo.mensagem === "string" && corpo.mensagem !== ""
          ? corpo.mensagem
          : "Confira os dados do pedido e tente de novo.",
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
  /** 401 e 422: recusas com corpo `{ erro, mensagem }` que a tela resolve. */
  | {
      readonly estado: "recusado";
      readonly status: number;
      readonly corpo: unknown;
    }
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
  if (resposta.status === 401 || resposta.status === 422) {
    let corpo: unknown = {};
    try {
      corpo = await resposta.json();
    } catch {
      // Sem corpo legível, a recusa vale do mesmo jeito, com o texto padrão.
    }
    return { estado: "recusado", status: resposta.status, corpo };
  }
  if (!resposta.ok) {
    return { estado: "falhou", motivo: `a API respondeu ${resposta.status}` };
  }

  try {
    return { estado: "ok", corpo: await resposta.json() };
  } catch {
    return { estado: "falhou", motivo: "a API respondeu algo que não é JSON" };
  }
}
