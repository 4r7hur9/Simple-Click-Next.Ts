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
import {
  esquemaDaPaginaDoCatalogo,
  esquemaDaVitrine,
  esquemaDoCatalogo,
  esquemaDoResumoDoCatalogo,
  type CatalogoDaVitrineNoContrato,
  type OrdemDoCatalogoNoContrato,
  type PaginaDoCatalogoNoContrato,
  type ResumoDoCatalogoNoContrato,
  type Vitrine,
} from "@simpleclick/contracts";

import { PARAMETRO_DA_BUSCA, limitarFiltros } from "../lib/catalogo.ts";
import { enderecoDaApi, ESPERA_MAXIMA_EM_MS } from "./api-client.ts";
import { etiquetasDaVitrine } from "./cache.ts";

/** O que a página recebe: a loja, ou o motivo de não haver loja. */
export type ResultadoDaVitrine =
  | { readonly estado: "encontrada"; readonly vitrine: Vitrine }
  | { readonly estado: "nao-encontrada" }
  | { readonly estado: "indisponivel"; readonly motivo: string };

/**
 * Quanto tempo a vitrine pode ficar guardada antes de ser buscada de novo.
 *
 * É a REDE DE PROTEÇÃO, e não o caminho rápido. O caminho rápido é a etiqueta
 * da vitrine (`etiquetasDaVitrine`): quando o dono altera catálogo ou
 * configuração, a API avisa o site, que vence a etiqueta na hora e a visita
 * seguinte já busca de novo (dívida 93). O prazo só pesa se o aviso se perder.
 */
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
      // A vitrine muda pouco e é lida muito: guardar tira da API a repetição de
      // quem abriu a mesma loja. A etiqueta é o que deixa a alteração do dono
      // aparecer na visita seguinte, sem esperar o prazo vencer.
      next: {
        revalidate: SEGUNDOS_DE_CACHE,
        tags: etiquetasDaVitrine(apelido),
      },
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

/** O que a vitrine recebe: o catálogo, ou o motivo de não haver catálogo. */
export type ResultadoDoCatalogo =
  | {
      readonly estado: "encontrado";
      readonly catalogo: CatalogoDaVitrineNoContrato;
    }
  | { readonly estado: "nao-encontrada" }
  | { readonly estado: "indisponivel"; readonly motivo: string };

/** O que muda o catálogo pedido. */
export interface OpcoesDaBusca {
  readonly busca?: string | null | undefined;
  readonly categoria?: string | null | undefined;
  readonly filtros?: readonly string[] | undefined;
  /** Só produtos com preço de atacado (card #59). */
  readonly atacado?: boolean | undefined;
  /** Só o que não está esgotado (card #108). */
  readonly estoque?: boolean | undefined;
  /** Faixa de preço em CENTAVOS, inclusive (card #108). */
  readonly precoMin?: number | null | undefined;
  readonly precoMax?: number | null | undefined;
}

/**
 * Busca o catálogo público da loja.
 *
 * A MESMA JANELA DE CACHE da apresentação, e de propósito. As duas telas mudam
 * pelo mesmo motivo — o dono mexeu na loja — e janelas diferentes fariam a
 * página mostrar um nome de seção que o cardápio ao lado ainda não tem.
 *
 * CATÁLOGO VAZIO NÃO É ERRO. Loja recém-criada devolve listas vazias, e é a
 * tela que decide dizer "estamos montando o catálogo" (AC-407). Tratar vazio
 * como indisponibilidade faria a loja nova parecer quebrada no primeiro dia,
 * que é justamente quando o dono está decidindo se confia no produto.
 *
 * A BUSCA VAI PARA O SERVIDOR (AC-408), e não é filtrada aqui. O banco tem o
 * índice de texto e a regra de acento; refazer isso no Next significaria baixar
 * o catálogo inteiro para descartar quase tudo — o peso que o AC-415 proíbe.
 */
export async function buscarCatalogo(
  apelido: string,
  opcoes: OpcoesDaBusca = {},
  buscar: typeof fetch = fetch,
): Promise<ResultadoDoCatalogo> {
  const termo = opcoes.busca?.trim() ?? "";
  const parametros = new URLSearchParams();
  if (termo !== "") parametros.set(PARAMETRO_DA_BUSCA, termo);
  if (opcoes.categoria) parametros.set("categoria", opcoes.categoria);
  for (const filtro of opcoes.filtros ?? [])
    parametros.append("filtro", filtro);
  if (opcoes.atacado === true) parametros.set("atacado", "1");
  const consulta =
    parametros.toString() === "" ? "" : `?${parametros.toString()}`;
  const endereco = `${enderecoDaApi()}/v1/vitrine/${encodeURIComponent(apelido)}/catalogo${consulta}`;

  let resposta: Response;
  try {
    resposta = await buscar(endereco, {
      next: {
        revalidate: SEGUNDOS_DE_CACHE,
        tags: etiquetasDaVitrine(apelido),
      },
      signal: AbortSignal.timeout(ESPERA_MAXIMA_EM_MS),
      headers: { accept: "application/json" },
    } as RequestInit);
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : "falha de rede";
    return { estado: "indisponivel", motivo };
  }

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

  const conferido = esquemaDoCatalogo.safeParse(corpo);
  if (!conferido.success) {
    // Fora do contrato é indisponibilidade, e não catálogo vazio: vazio faria a
    // loja parecer sem produto quando o problema é outro.
    return {
      estado: "indisponivel",
      motivo: "a resposta da API não bate com o contrato publicado",
    };
  }

  return { estado: "encontrado", catalogo: conferido.data };
}

// ---------------------------------------------------------------------------
// Catálogo em pedaços (card #74)
// ---------------------------------------------------------------------------

/** O que vem da API, conferido, ou o motivo de não ter vindo. */
export type ResultadoDaLeitura<T> =
  | {
      readonly estado: "encontrado";
      readonly dados: T;
      /**
       * A API ainda não entende os filtros novos (estoque, faixa de preço, ordem
       * nova) e a leitura foi REPETIDA sem eles: a lista veio sem esses filtros,
       * e a tela não pode mostrá-los como aplicados.
       */
      readonly degradado?: boolean;
    }
  | { readonly estado: "nao-encontrada" }
  | {
      readonly estado: "indisponivel";
      readonly motivo: string;
      /** A API recusou (400) um campo dos filtros novos. */
      readonly recusouCampoNovo?: boolean;
    };

/** Os campos que só a API nova conhece. */
const CAMPOS_NOVOS = ["estoque", "precoMin", "precoMax", "ordem"] as const;

function temCampoNovo(opcoes: OpcoesDaBusca & { ordem?: string | undefined }): boolean {
  return (
    opcoes.estoque === true ||
    opcoes.precoMin != null ||
    opcoes.precoMax != null ||
    opcoes.ordem === "maior-desconto-atacado" ||
    opcoes.ordem === "lancamentos"
  );
}

function semCamposNovos<T extends OpcoesDaBusca & { ordem?: string | undefined }>(
  opcoes: T,
): T {
  const { estoque: _e, precoMin: _a, precoMax: _b, ...resto } = opcoes;
  return {
    ...resto,
    ...(opcoes.ordem === "maior-desconto-atacado" || opcoes.ordem === "lancamentos"
      ? { ordem: "relevancia" }
      : {}),
  } as T;
}

/**
 * Repete UMA vez, sem os campos novos, quando a API respondeu 400 apontando um
 * deles: a web saiu antes da API, e um link com a ordem nova não pode derrubar
 * a página. Qualquer outro erro continua sendo erro.
 */
async function comDegradacao<T, O extends OpcoesDaBusca & { ordem?: string | undefined }>(
  opcoes: O,
  ler: (opcoes: O) => Promise<ResultadoDaLeitura<T>>,
): Promise<ResultadoDaLeitura<T>> {
  const resultado = await ler(opcoes);
  if (
    resultado.estado === "indisponivel" &&
    resultado.recusouCampoNovo === true &&
    temCampoNovo(opcoes)
  ) {
    const repetido = await ler(semCamposNovos(opcoes));
    return repetido.estado === "encontrado"
      ? { ...repetido, degradado: true }
      : repetido;
  }
  return resultado;
}

/** Busca, filtros e atacado no endereço da API, como o catálogo inteiro faz. */
function parametrosDosFiltros(opcoes: OpcoesDaBusca): URLSearchParams {
  const parametros = new URLSearchParams();
  const termo = opcoes.busca?.trim() ?? "";
  if (termo !== "") parametros.set(PARAMETRO_DA_BUSCA, termo);
  if (opcoes.categoria) parametros.set("categoria", opcoes.categoria);
  // A API recusa mais de 20 filtros e filtro com mais de 120 caracteres.
  for (const filtro of limitarFiltros(opcoes.filtros ?? [])) {
    parametros.append("filtro", filtro);
  }
  if (opcoes.atacado === true) parametros.set("atacado", "1");
  if (opcoes.estoque === true) parametros.set("estoque", "1");
  if (opcoes.precoMin != null) parametros.set("precoMin", String(opcoes.precoMin));
  if (opcoes.precoMax != null) parametros.set("precoMax", String(opcoes.precoMax));
  return parametros;
}

/** De onde uma leitura da vitrine vem: a loja, o caminho e a consulta. */
interface EnderecoDaLeitura {
  readonly apelido: string;
  readonly caminho: string;
  readonly parametros: URLSearchParams;
}

/**
 * Uma leitura pública da vitrine, com a mesma janela de cache e a mesma
 * etiqueta da apresentação: quando o dono mexe no catálogo, a etiqueta vence
 * e a visita seguinte já lê de novo.
 */
async function lerDaVitrine<T>(
  { apelido, caminho, parametros }: EnderecoDaLeitura,
  esquema: { safeParse(valor: unknown): { success: true; data: T } | { success: false } },
  buscar: typeof fetch,
): Promise<ResultadoDaLeitura<T>> {
  const consulta =
    parametros.toString() === "" ? "" : `?${parametros.toString()}`;
  const endereco = `${enderecoDaApi()}/v1/vitrine/${encodeURIComponent(apelido)}${caminho}${consulta}`;

  let resposta: Response;
  try {
    resposta = await buscar(endereco, {
      next: {
        revalidate: SEGUNDOS_DE_CACHE,
        tags: etiquetasDaVitrine(apelido),
      },
      signal: AbortSignal.timeout(ESPERA_MAXIMA_EM_MS),
      headers: { accept: "application/json" },
    } as RequestInit);
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : "falha de rede";
    return { estado: "indisponivel", motivo };
  }

  if (resposta.status === 404) return { estado: "nao-encontrada" };
  if (!resposta.ok) {
    // 400 que aponta um campo dos filtros novos: a API é mais antiga que a web.
    let recusouCampoNovo = false;
    if (resposta.status === 400) {
      const texto = await resposta.text().catch(() => "");
      recusouCampoNovo = CAMPOS_NOVOS.some((campo) => texto.includes(campo));
    }
    return {
      estado: "indisponivel",
      motivo: `a API respondeu ${resposta.status}`,
      ...(recusouCampoNovo ? { recusouCampoNovo } : {}),
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

  const conferido = esquema.safeParse(corpo);
  if (!conferido.success) {
    return {
      estado: "indisponivel",
      motivo: "a resposta da API não bate com o contrato publicado",
    };
  }
  return { estado: "encontrado", dados: conferido.data };
}

/** O que muda o resumo: os filtros e quantos produtos de cada seção vêm. */
export interface OpcoesDoResumo extends OpcoesDaBusca {
  readonly porSecao?: number | undefined;
  readonly totalMaximo?: number | undefined;
}

/** As seções com contagem (e, se pedido, os primeiros produtos de cada uma). */
export async function buscarResumoDoCatalogo(
  apelido: string,
  opcoes: OpcoesDoResumo = {},
  buscar: typeof fetch = fetch,
): Promise<ResultadoDaLeitura<ResumoDoCatalogoNoContrato>> {
  return comDegradacao(opcoes, (efetivas) => {
    const parametros = parametrosDosFiltros(efetivas);
    if (efetivas.porSecao !== undefined) {
      parametros.set("porSecao", String(efetivas.porSecao));
    }
    if (efetivas.totalMaximo !== undefined) {
      parametros.set("totalMaximo", String(efetivas.totalMaximo));
    }
    return lerDaVitrine(
      { apelido, caminho: "/catalogo/resumo", parametros },
      esquemaDoResumoDoCatalogo,
      buscar,
    );
  });
}

/** O que muda a página: os filtros, a ordem, o cursor e o tamanho. */
export interface OpcoesDaPagina extends OpcoesDaBusca {
  readonly ordem?: OrdemDoCatalogoNoContrato | undefined;
  readonly cursor?: string | null | undefined;
  readonly limite?: number | undefined;
}

/** Uma página de produtos, filtrada e ordenada pela API. */
export async function buscarPaginaDoCatalogo(
  apelido: string,
  opcoes: OpcoesDaPagina = {},
  buscar: typeof fetch = fetch,
): Promise<ResultadoDaLeitura<PaginaDoCatalogoNoContrato>> {
  return comDegradacao(opcoes, (efetivas) => {
    const parametros = parametrosDosFiltros(efetivas);
    if (efetivas.ordem !== undefined && efetivas.ordem !== "relevancia") {
      parametros.set("ordem", efetivas.ordem);
    }
    if (efetivas.cursor) parametros.set("cursor", efetivas.cursor);
    if (efetivas.limite !== undefined) {
      parametros.set("limite", String(efetivas.limite));
    }
    return lerDaVitrine(
      { apelido, caminho: "/catalogo/produtos", parametros },
      esquemaDaPaginaDoCatalogo,
      buscar,
    );
  });
}
