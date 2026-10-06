/**
 * Os endereços salvos da pessoa, como a conta e o fechamento os consomem
 * (T-707, AC-509).
 *
 * Duas portas. A TELA DA CONTA fala com a rota do próprio site
 * (`/api/conta/enderecos`), que leva a sessão à API sem o script da página ver
 * o token (P-008). O FECHAMENTO pede do lado do servidor, com o token do
 * cookie, só para saber qual é o endereço padrão — é ele que chega preenchido
 * e editável no formulário (AC-509).
 *
 * Nunca lança: rede fora, sessão vencida e resposta estranha viram estados.
 */
import {
  esquemaDoEnderecoSalvo,
  esquemaDosEnderecosSalvos,
  type EnderecoParaSalvarNoContrato,
  type EnderecoSalvoNoContrato,
} from "@simpleclick/contracts";

export type {
  EnderecoParaSalvarNoContrato as EnderecoParaSalvar,
  EnderecoSalvoNoContrato as EnderecoSalvo,
};

/** Onde a tela da conta pede os endereços: a rota do próprio site. */
export const ENDERECO_DOS_ENDERECOS = "/api/conta/enderecos";

const API_PADRAO = "https://api.simpleclick.localhost";
const ESPERA_MAXIMA_EM_MS = 5_000;

type Buscar = typeof fetch;

export type LeituraDosEnderecos =
  | {
      readonly estado: "ok";
      readonly enderecos: readonly EnderecoSalvoNoContrato[];
    }
  | { readonly estado: "nao-autenticado" }
  | { readonly estado: "erro"; readonly motivo: string };

async function lerLista(
  resposta: Response | null,
): Promise<LeituraDosEnderecos> {
  if (resposta === null) return { estado: "erro", motivo: "falha de rede" };
  if (resposta.status === 401) return { estado: "nao-autenticado" };
  if (!resposta.ok) {
    return { estado: "erro", motivo: `a API respondeu ${resposta.status}` };
  }
  try {
    const lido = esquemaDosEnderecosSalvos.safeParse(await resposta.json());
    return lido.success
      ? { estado: "ok", enderecos: lido.data.enderecos }
      : {
          estado: "erro",
          motivo: "os endereços vieram num formato inesperado",
        };
  } catch {
    return { estado: "erro", motivo: "a resposta não era JSON" };
  }
}

async function pedir(
  buscar: Buscar,
  endereco: string,
  metodo: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  corpo?: unknown,
): Promise<Response | null> {
  try {
    return await buscar(endereco, {
      method: metodo,
      cache: "no-store",
      headers: {
        accept: "application/json",
        ...(corpo === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
    });
  } catch {
    return null;
  }
}

/** A lista da pessoa, o padrão primeiro. */
export async function listarEnderecosSalvos(
  buscar: Buscar = fetch,
): Promise<LeituraDosEnderecos> {
  return lerLista(await pedir(buscar, ENDERECO_DOS_ENDERECOS));
}

export type ResultadoDoEndereco =
  | { readonly estado: "salvo"; readonly endereco: EnderecoSalvoNoContrato }
  | { readonly estado: "recusado" }
  | { readonly estado: "erro"; readonly motivo: string };

async function lerSalvo(
  resposta: Response | null,
): Promise<ResultadoDoEndereco> {
  if (resposta === null) return { estado: "erro", motivo: "falha de rede" };
  if (resposta.status === 400) return { estado: "recusado" };
  if (!resposta.ok) {
    return { estado: "erro", motivo: `a API respondeu ${resposta.status}` };
  }
  try {
    const lido = esquemaDoEnderecoSalvo.safeParse(await resposta.json());
    return lido.success
      ? { estado: "salvo", endereco: lido.data }
      : { estado: "erro", motivo: "o endereço veio num formato inesperado" };
  } catch {
    return { estado: "erro", motivo: "a resposta não era JSON" };
  }
}

/** Salva um endereço novo. */
export async function salvarEnderecoDaConta(
  dados: EnderecoParaSalvarNoContrato,
  buscar: Buscar = fetch,
): Promise<ResultadoDoEndereco> {
  return lerSalvo(await pedir(buscar, ENDERECO_DOS_ENDERECOS, "POST", dados));
}

/** Troca um endereço inteiro — inclusive para marcá-lo como padrão. */
export async function trocarEnderecoDaConta(
  id: string,
  dados: EnderecoParaSalvarNoContrato,
  buscar: Buscar = fetch,
): Promise<ResultadoDoEndereco> {
  return lerSalvo(
    await pedir(
      buscar,
      `${ENDERECO_DOS_ENDERECOS}/${encodeURIComponent(id)}`,
      "PUT",
      dados,
    ),
  );
}

/** Apaga um endereço. Verdadeiro quando apagou. */
export async function apagarEnderecoDaConta(
  id: string,
  buscar: Buscar = fetch,
): Promise<boolean> {
  const resposta = await pedir(
    buscar,
    `${ENDERECO_DOS_ENDERECOS}/${encodeURIComponent(id)}`,
    "DELETE",
  );
  return resposta !== null && resposta.status === 204;
}

/** O endereço salvo de volta ao formato de envio, para trocar só o padrão. */
export function paraSalvar(
  endereco: EnderecoSalvoNoContrato,
  padrao: boolean,
): EnderecoParaSalvarNoContrato {
  return {
    rotulo: endereco.rotulo,
    destinatario: endereco.destinatario,
    logradouro: endereco.logradouro,
    numero: endereco.numero,
    complemento: endereco.complemento,
    bairro: endereco.bairro,
    cidade: endereco.cidade,
    estado: endereco.estado,
    cep: endereco.cep,
    pontoDeReferencia: endereco.pontoDeReferencia,
    padrao,
  };
}

/** Uma linha para a lista: "Rua das Flores, 123 · Vila Mariana · São Paulo/SP". */
export function enderecoEmUmaLinha(endereco: EnderecoSalvoNoContrato): string {
  return [
    [endereco.logradouro, endereco.numero].filter(Boolean).join(", "),
    endereco.complemento,
    endereco.bairro,
    [endereco.cidade, endereco.estado].filter(Boolean).join("/"),
  ]
    .filter(Boolean)
    .join(" · ");
}

// ---------------------------------------------------------------------------
// O pré-preenchimento do fechamento (AC-509)
// ---------------------------------------------------------------------------

/** O endereço do fechamento, no formato dos campos do formulário (`EnderecoNaTela`). */
export interface EnderecoConhecido {
  readonly logradouro: string;
  readonly numero: string;
  readonly complemento: string;
  readonly bairro: string;
  readonly cidade: string;
  readonly cep: string;
  readonly pontoDeReferencia: string;
}

/** O que o fechamento já sabe de quem está pedindo. */
export interface DadosConhecidosDaConta {
  readonly nome?: string;
  readonly endereco?: Partial<EnderecoConhecido>;
}

/**
 * O endereço PADRÃO da pessoa logada, pronto para o fechamento (AC-509).
 *
 * Chamado só do lado do servidor, com o token do cookie. Sem sessão, sem
 * endereço ou com a API fora do ar, devolve vazio — e o formulário abre em
 * branco, que é o fechamento de sempre, e não uma página quebrada.
 */
export async function conhecidosDaConta(
  tokenDeAcesso: string | undefined,
  buscar: Buscar = fetch,
): Promise<DadosConhecidosDaConta> {
  if (tokenDeAcesso === undefined || tokenDeAcesso === "") return {};
  let resposta: Response;
  try {
    resposta = await buscar(
      `${(process.env.NEXT_PUBLIC_API_URL ?? API_PADRAO).replace(/\/+$/, "")}/v1/conta/enderecos`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(ESPERA_MAXIMA_EM_MS),
        headers: {
          accept: "application/json",
          authorization: `Bearer ${tokenDeAcesso}`,
        },
      },
    );
  } catch {
    return {};
  }
  const leitura = await lerLista(resposta);
  if (leitura.estado !== "ok") return {};
  const padrao =
    leitura.enderecos.find((e) => e.padrao) ?? leitura.enderecos[0];
  if (padrao === undefined) return {};
  return {
    ...(padrao.destinatario ? { nome: padrao.destinatario } : {}),
    endereco: {
      logradouro: padrao.logradouro,
      numero: padrao.numero ?? "",
      complemento: padrao.complemento ?? "",
      bairro: padrao.bairro ?? "",
      cidade: padrao.cidade ?? "",
      cep: padrao.cep ?? "",
      pontoDeReferencia: padrao.pontoDeReferencia ?? "",
    },
  };
}
