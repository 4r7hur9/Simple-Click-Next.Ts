/**
 * O importador de clientes como a tela do painel o consome (card #61, sobre o
 * contrato do #60).
 *
 * A tela fala com a rota do PRÓPRIO SITE (`/api/painel/clientes/importacao/…`),
 * que leva a sessão à API. O arquivo vai CRU no corpo e as escolhas na
 * consulta: nome do arquivo, `repetidos` e o mapeamento `mapa.<campo>`. A
 * prévia e a confirmação mandam o MESMO arquivo — a API não guarda nada entre
 * uma e outra.
 *
 * NUNCA LANÇA, como `clientes-do-painel.ts`: queda de rede, recusa da API e
 * resposta fora do contrato viram estados com frase pronta para a tela.
 */
import {
  CAMPOS_DA_IMPORTACAO,
  MAXIMO_DE_LINHAS_DA_IMPORTACAO,
  TAMANHO_MAXIMO_DA_IMPORTACAO_EM_BYTES,
  esquemaDaPreviaDaImportacao,
  esquemaDaRecusaDaImportacao,
  esquemaDoResultadoDaImportacao,
  type CampoDaImportacao,
  type PreviaDaImportacaoNoContrato,
  type RegraDeRepetidosDaImportacao,
  type ResultadoDaImportacaoNoContrato,
} from "@simpleclick/contracts";

export type {
  CampoDaImportacao,
  PreviaDaImportacaoNoContrato as PreviaDaImportacao,
  RegraDeRepetidosDaImportacao as RegraDeRepetidos,
  ResultadoDaImportacaoNoContrato as ResultadoDaImportacao,
};

/** Onde a tela pede a prévia e a confirmação. */
export const ENDERECO_DA_IMPORTACAO = "/api/painel/clientes/importacao";

/** O modelo para baixar, em `public/modelos/`. */
export const ENDERECO_DO_MODELO = "/modelos/modelo-importacao-clientes.csv";

/** As extensões que o seletor de arquivo oferece. */
export const EXTENSOES_ACEITAS = [
  ".csv",
  ".tsv",
  ".txt",
  ".json",
  ".jsonl",
  ".xlsx",
] as const;

export const TAMANHO_MAXIMO_EM_MB =
  TAMANHO_MAXIMO_DA_IMPORTACAO_EM_BYTES / (1024 * 1024);

export const MAXIMO_DE_LINHAS = MAXIMO_DE_LINHAS_DA_IMPORTACAO;

/** A rede. Entra por parâmetro para a prova responder sem servidor. */
export type Buscar = typeof fetch;

/** Campo → nome da coluna; `null` tira o campo da importação. */
export type Mapeamento = Readonly<
  Partial<Record<CampoDaImportacao, string | null>>
>;

// ---------------------------------------------------------------------------
// Conferência antes de mandar
// ---------------------------------------------------------------------------

function extensao(nome: string): string {
  const ponto = nome.lastIndexOf(".");
  return ponto < 0 ? "" : nome.slice(ponto).toLowerCase();
}

/**
 * O que dá para recusar sem ir à API: arquivo vazio, grande demais ou de um
 * tipo que o importador não lê. `null` quando pode seguir.
 */
export function problemaDoArquivo(arquivo: {
  readonly name: string;
  readonly size: number;
}): string | null {
  const tipo = extensao(arquivo.name);
  if (tipo === ".xls") {
    return "Arquivos .xls (Excel antigo) não são aceitos. No Excel, use Salvar como → .xlsx ou .csv.";
  }
  if (!(EXTENSOES_ACEITAS as readonly string[]).includes(tipo)) {
    return "Esse tipo de arquivo não é aceito. Envie uma planilha .csv, .tsv, .xlsx ou um arquivo .json.";
  }
  if (arquivo.size === 0) {
    return "O arquivo está vazio. Confira se salvou a planilha antes de enviar.";
  }
  if (arquivo.size > TAMANHO_MAXIMO_DA_IMPORTACAO_EM_BYTES) {
    return `O arquivo passa de ${TAMANHO_MAXIMO_EM_MB} MB. Divida em arquivos menores.`;
  }
  return null;
}

/** "1,2 MB", "830 KB". */
export function escreverTamanho(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("pt-BR")} KB`;
}

// ---------------------------------------------------------------------------
// A consulta
// ---------------------------------------------------------------------------

/**
 * A consulta das duas rotas. O mapeamento vai INTEIRO (todo campo, com a
 * coluna ou vazio), para a API não completar com a sugestão um campo que o
 * dono tirou de propósito.
 */
export function consultaDaImportacao(
  nomeDoArquivo: string,
  mapeamento: Mapeamento | null,
  repetidos?: RegraDeRepetidosDaImportacao,
): string {
  const consulta = new URLSearchParams({
    arquivo: nomeDoArquivo.slice(0, 200),
  });
  if (repetidos !== undefined) consulta.set("repetidos", repetidos);
  if (mapeamento !== null) {
    for (const campo of CAMPOS_DA_IMPORTACAO) {
      consulta.set(`mapa.${campo}`, mapeamento[campo] ?? "");
    }
  }
  return consulta.toString();
}

// ---------------------------------------------------------------------------
// As chamadas
// ---------------------------------------------------------------------------

export type Falha = { readonly estado: "erro"; readonly mensagem: string };

const FALHA_DE_REDE: Falha = {
  estado: "erro",
  mensagem:
    "Não foi possível falar com o servidor. Confira a conexão e tente de novo.",
};

const FALHA_INESPERADA: Falha = {
  estado: "erro",
  mensagem: "O servidor respondeu algo inesperado. Tente de novo em instantes.",
};

async function lerJson(resposta: Response): Promise<unknown> {
  try {
    return await resposta.json();
  } catch {
    return null;
  }
}

/** A frase da recusa: a da API quando é do importador, senão uma nossa. */
async function falhaDaResposta(resposta: Response): Promise<Falha> {
  const corpo = await lerJson(resposta);
  const recusa = esquemaDaRecusaDaImportacao.safeParse(corpo);
  if (recusa.success) return { estado: "erro", mensagem: recusa.data.mensagem };
  switch (resposta.status) {
    case 401:
      return {
        estado: "erro",
        mensagem: "Sua sessão terminou. Entre de novo para importar.",
      };
    case 403:
      return {
        estado: "erro",
        mensagem:
          "Sua conta não tem permissão para cadastrar clientes nesta loja.",
      };
    case 413:
      return {
        estado: "erro",
        mensagem: `O arquivo passa do limite (${TAMANHO_MAXIMO_EM_MB} MB ou ${MAXIMO_DE_LINHAS_DA_IMPORTACAO.toLocaleString("pt-BR")} linhas). Divida em arquivos menores.`,
      };
    default:
      return FALHA_INESPERADA;
  }
}

async function postar(
  buscar: Buscar,
  acao: "previa" | "confirmar",
  arquivo: Blob,
  consulta: string,
): Promise<Response | null> {
  try {
    return await buscar(`${ENDERECO_DA_IMPORTACAO}/${acao}?${consulta}`, {
      method: "POST",
      cache: "no-store",
      headers: {
        accept: "application/json",
        "content-type": "application/octet-stream",
      },
      body: arquivo,
    });
  } catch {
    return null;
  }
}

export type LeituraDaPrevia =
  | { readonly estado: "ok"; readonly previa: PreviaDaImportacaoNoContrato }
  | Falha;

/** Lê o arquivo e prevê o resultado; nada é gravado. */
export async function pedirPrevia(
  arquivo: File,
  mapeamento: Mapeamento | null,
  buscar: Buscar = fetch,
): Promise<LeituraDaPrevia> {
  const resposta = await postar(
    buscar,
    "previa",
    arquivo,
    consultaDaImportacao(arquivo.name, mapeamento),
  );
  if (resposta === null) return FALHA_DE_REDE;
  if (!resposta.ok) return falhaDaResposta(resposta);
  const lido = esquemaDaPreviaDaImportacao.safeParse(await lerJson(resposta));
  return lido.success ? { estado: "ok", previa: lido.data } : FALHA_INESPERADA;
}

export type LeituraDoResultado =
  | {
      readonly estado: "ok";
      readonly resultado: ResultadoDaImportacaoNoContrato;
    }
  | Falha;

/** Grava os clientes do arquivo com o mapeamento e a regra escolhidos. */
export async function confirmarImportacao(
  arquivo: File,
  mapeamento: Mapeamento,
  repetidos: RegraDeRepetidosDaImportacao,
  buscar: Buscar = fetch,
): Promise<LeituraDoResultado> {
  const resposta = await postar(
    buscar,
    "confirmar",
    arquivo,
    consultaDaImportacao(arquivo.name, mapeamento, repetidos),
  );
  if (resposta === null) return FALHA_DE_REDE;
  if (!resposta.ok) return falhaDaResposta(resposta);
  const lido = esquemaDoResultadoDaImportacao.safeParse(
    await lerJson(resposta),
  );
  return lido.success
    ? { estado: "ok", resultado: lido.data }
    : FALHA_INESPERADA;
}

/** Baixa o relatório de erros que já veio pronto no resultado. */
export function baixarRelatorio(relatorio: {
  readonly nomeDoArquivo: string;
  readonly csv: string;
}): void {
  const arquivo = new Blob([relatorio.csv], {
    type: "text/csv;charset=utf-8",
  });
  const endereco = URL.createObjectURL(arquivo);
  const link = document.createElement("a");
  link.href = endereco;
  link.download = relatorio.nomeDoArquivo;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(endereco), 0);
}
