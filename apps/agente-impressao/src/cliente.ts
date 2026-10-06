/**
 * O cliente HTTP do agente: as quatro portas da API que ele usa (T-608).
 *
 * - `POST /v1/impressao/agente/pareamento` — troca o código curto pela
 *   credencial, uma vez;
 * - `GET  /v1/impressao/agente/trabalhos` — reivindica o que há para imprimir
 *   (e conta como batimento: é o que faz o painel ver o agente conectado);
 * - `POST /v1/impressao/agente/trabalhos/:id/confirmacao` — impresso;
 * - `POST /v1/impressao/agente/trabalhos/:id/falha` — não saiu, e por quê.
 *
 * Toda resposta passa pelo esquema de `packages/contracts/src/impressao.ts`:
 * resposta fora do contrato é erro, nunca um cupom adivinhado. Os POST levam
 * `Origin`, porque a API só aceita escrita de origem da lista
 * `ORIGENS_PERMITIDAS` (AC-126) — o agente se apresenta com a origem da
 * própria API, que precisa estar na lista.
 */
import {
  esquemaDaConfirmacaoDeImpressao,
  esquemaDaFalhaRegistrada,
  esquemaDoAgentePareado,
  esquemaDosTrabalhosEntregues,
  type AgentePareadoNoContrato,
  type ConfirmacaoDeImpressaoNoContrato,
  type FalhaRegistradaNoContrato,
  type PedidoDePareamentoNoContrato,
  type TrabalhoDeImpressaoNoContrato,
} from "@simpleclick/contracts";

/** A API respondeu com erro (ou fora do contrato). */
export class ErroDaApi extends Error {
  readonly status: number;
  constructor(mensagem: string, status: number) {
    super(mensagem);
    this.name = "ErroDaApi";
    this.status = status;
  }
}

export interface OpcoesDoCliente {
  /** Endereço da API, como `https://api.simpleclick.app`. */
  readonly api: string;
  /** Padrão: a origem do próprio endereço da API. */
  readonly origem?: string;
  /** Padrão: o `fetch` do Node. Os testes trocam pela API falsa. */
  readonly buscar?: typeof fetch;
  /** Quanto esperar cada resposta. Padrão: 10 s. */
  readonly prazoMs?: number;
}

/** O que o laço do agente precisa da API. */
export interface ClienteDaApi {
  buscarTrabalhos(): Promise<TrabalhoDeImpressaoNoContrato[]>;
  confirmar(id: string): Promise<ConfirmacaoDeImpressaoNoContrato>;
  registrarFalha(
    id: string,
    motivo: string,
  ): Promise<FalhaRegistradaNoContrato>;
}

/** Faz a chamada, confere o status e passa o corpo pelo esquema. */
async function chamar<T>(
  opcoes: OpcoesDoCliente,
  caminho: string,
  init: { metodo: "GET" | "POST"; credencial?: string; corpo?: unknown },
  esquema: { parse(valor: unknown): T },
): Promise<T> {
  const base = opcoes.api.replace(/\/+$/, "");
  const cabecalhos: Record<string, string> = { accept: "application/json" };
  if (init.credencial !== undefined) {
    cabecalhos.authorization = `Bearer ${init.credencial}`;
  }
  if (init.metodo === "POST") {
    cabecalhos["content-type"] = "application/json";
    cabecalhos.origin = opcoes.origem ?? new URL(base).origin;
  }
  const resposta = await (opcoes.buscar ?? fetch)(`${base}${caminho}`, {
    method: init.metodo,
    headers: cabecalhos,
    ...(init.metodo === "POST"
      ? { body: JSON.stringify(init.corpo ?? {}) }
      : {}),
    signal: AbortSignal.timeout(opcoes.prazoMs ?? 10_000),
  });
  if (!resposta.ok) {
    let codigo = "";
    try {
      const corpo = (await resposta.json()) as { erro?: unknown };
      if (typeof corpo.erro === "string") codigo = ` (${corpo.erro})`;
    } catch {
      // corpo sem JSON: o status basta
    }
    throw new ErroDaApi(
      `${init.metodo} ${caminho} respondeu ${String(resposta.status)}${codigo}`,
      resposta.status,
    );
  }
  try {
    return esquema.parse(await resposta.json());
  } catch (causa) {
    throw new ErroDaApi(
      `${init.metodo} ${caminho} respondeu fora do contrato: ${causa instanceof Error ? causa.message : String(causa)}`,
      resposta.status,
    );
  }
}

/** O cliente de um agente já pareado. */
export function criarCliente(
  opcoes: OpcoesDoCliente & { readonly credencial: string },
): ClienteDaApi {
  const { credencial } = opcoes;
  return {
    async buscarTrabalhos() {
      const resposta = await chamar(
        opcoes,
        "/v1/impressao/agente/trabalhos",
        { metodo: "GET", credencial },
        esquemaDosTrabalhosEntregues,
      );
      return resposta.trabalhos;
    },
    confirmar(id) {
      return chamar(
        opcoes,
        `/v1/impressao/agente/trabalhos/${encodeURIComponent(id)}/confirmacao`,
        { metodo: "POST", credencial },
        esquemaDaConfirmacaoDeImpressao,
      );
    },
    registrarFalha(id, motivo) {
      return chamar(
        opcoes,
        `/v1/impressao/agente/trabalhos/${encodeURIComponent(id)}/falha`,
        { metodo: "POST", credencial, corpo: { motivo: motivo.slice(0, 500) } },
        esquemaDaFalhaRegistrada,
      );
    },
  };
}

/** Troca o código de pareamento pela credencial (entregue uma vez só). */
export function parearNaApi(
  opcoes: OpcoesDoCliente,
  pedido: PedidoDePareamentoNoContrato,
): Promise<AgentePareadoNoContrato> {
  return chamar(
    opcoes,
    "/v1/impressao/agente/pareamento",
    { metodo: "POST", corpo: pedido },
    esquemaDoAgentePareado,
  );
}
