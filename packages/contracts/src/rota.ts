/**
 * Definição de rota: uma fonte, dois usos.
 *
 * A mesma declaração serve para **validar a entrada em execução** — é a borda
 * que P-007 exige — e para **descrever a rota no documento publicado**, de
 * onde os aplicativos Kotlin e Swift vão gerar o cliente deles. Manter as duas
 * coisas separadas seria manter duas verdades, e a segunda envelheceria em
 * silêncio (decisão de 17/08, "Contrato nasce de um esquema único").
 *
 * O que NÃO mora aqui: OpenAPI. A conversão para o documento é da API
 * (`apps/api/src/contracts/gerar.ts`), porque o contrato não deve saber em qual
 * formato ele é publicado — trocar o formato não pode obrigar a mexer nos
 * esquemas de domínio.
 */

import { z } from "zod";

/** Métodos que este contrato descreve. */
export const METODOS_HTTP = ["get", "post", "put", "patch", "delete"] as const;

export type MetodoHttp = (typeof METODOS_HTTP)[number];

/** Métodos em que corpo de requisição não faz sentido. */
const METODOS_SEM_CORPO: readonly MetodoHttp[] = ["get", "delete"];

/** Parte da requisição em que a validação reprovou. */
export type ParteDaRequisicao = "parametros" | "consulta" | "corpo";

export interface ProblemaDeValidacao {
  readonly parte: ParteDaRequisicao;
  /** Caminho do campo dentro da parte, com pontos: `contato.telefone`. */
  readonly campo: string;
  readonly mensagem: string;
}

/**
 * Entrada recusada pelo contrato.
 *
 * Carrega a lista de problemas em vez de uma frase só: a borda da API precisa
 * responder qual campo reprovou, e um texto colado não dá para desmontar.
 */
export class ErroDeValidacaoDoContrato extends Error {
  readonly rota: string;
  readonly problemas: readonly ProblemaDeValidacao[];

  /** Resume os campos recusados na mensagem; a lista fica em `problemas`. */
  constructor(rota: string, problemas: readonly ProblemaDeValidacao[]) {
    const resumo = problemas
      .map((problema) => `${problema.parte}.${problema.campo}`)
      .join(", ");
    super(`entrada recusada pelo contrato de ${rota}: ${resumo}`);
    this.name = "ErroDeValidacaoDoContrato";
    this.rota = rota;
    this.problemas = problemas;
  }
}

/**
 * Definição de rota malformada.
 *
 * É lançado ao declarar a rota, não ao chamá-la: contrato quebrado precisa
 * derrubar a partida da API, e não devolver 500 para o primeiro cliente.
 */
export class ErroDeDefinicaoDeRota extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeDefinicaoDeRota";
  }
}

/** O que se declara ao criar uma rota. */
export interface DefinicaoDeRota<TParametros, TConsulta, TCorpo, TResposta> {
  readonly metodo: MetodoHttp;
  /** Caminho no formato do Express, com `:nome` nos parâmetros. */
  readonly caminho: string;
  /** Domínio a que a rota pertence: agrupa o documento publicado. */
  readonly etiqueta: string;
  readonly resumo: string;
  readonly descricao?: string;
  readonly parametros?: z.ZodType<TParametros>;
  readonly consulta?: z.ZodType<TConsulta>;
  readonly corpo?: z.ZodType<TCorpo>;
  readonly resposta: z.ZodType<TResposta>;
  /** Situação devolvida no caminho feliz. Padrão: 200. */
  readonly status?: number;
  /** Situações de falha que esta rota pode devolver, além do padrão. */
  readonly errosPossiveis?: readonly number[];
  /**
   * Outras situações de SUCESSO com o mesmo corpo (só metadado do documento).
   * Ex.: criação 201 e reenvio idempotente 200. Não altera a validação.
   */
  readonly statusAlternativosDeSucesso?: readonly number[];
}

/** Entrada crua da requisição, como o Express a entrega. */
export interface EntradaBruta {
  readonly parametros?: unknown;
  readonly consulta?: unknown;
  readonly corpo?: unknown;
}

/** Entrada já conferida pelo contrato, com os tipos que a rota declarou. */
export interface EntradaValidada<TParametros, TConsulta, TCorpo> {
  readonly parametros: TParametros;
  readonly consulta: TConsulta;
  readonly corpo: TCorpo;
}

/** Rota pronta: valida em execução e se descreve para o documento. */
export interface RotaDoContrato<
  TParametros = unknown,
  TConsulta = unknown,
  TCorpo = unknown,
  TResposta = unknown,
> {
  readonly metodo: MetodoHttp;
  /** Caminho como o Express entende: `/v1/storefront/:slug`. */
  readonly caminho: string;
  /** Caminho como o documento publicado entende: `/v1/storefront/{slug}`. */
  readonly caminhoDoDocumento: string;
  readonly etiqueta: string;
  readonly resumo: string;
  readonly descricao: string | undefined;
  /** Nome estável da operação no documento. Cliente gerado vira método. */
  readonly identificador: string;
  readonly nomesDosParametros: readonly string[];
  readonly parametros: z.ZodType<TParametros> | undefined;
  readonly consulta: z.ZodType<TConsulta> | undefined;
  readonly corpo: z.ZodType<TCorpo> | undefined;
  readonly resposta: z.ZodType<TResposta>;
  readonly status: number;
  readonly errosPossiveis: readonly number[];
  readonly statusAlternativosDeSucesso: readonly number[];
  /** Uso 1: confere a entrada da requisição, ou recusa nomeando o campo. */
  validar(
    entrada: EntradaBruta,
  ): EntradaValidada<TParametros, TConsulta, TCorpo>;
}

/** Acha os `:nome` de um caminho do Express, na ordem em que aparecem. */
function nomesNoCaminho(caminho: string): string[] {
  return [...caminho.matchAll(/:([A-Za-z_][A-Za-z0-9_]*)/g)].map(
    (achado) => achado[1] ?? "",
  );
}

/**
 * Nomes declarados no esquema de parâmetros, quando dá para saber.
 *
 * Só um objeto tem campos nomeados. Se alguém declarar parâmetro com outro
 * tipo de esquema, devolve `null` e a conferência abaixo se cala — melhor não
 * conferir do que conferir errado.
 */
function nomesNoEsquema(esquema: z.ZodType | undefined): string[] | null {
  if (esquema === undefined) return null;
  if (!(esquema instanceof z.ZodObject)) return null;
  return Object.keys(esquema.shape);
}

/** Confere que caminho e esquema de parâmetros contam a mesma história. */
function conferirParametros(
  identificacao: string,
  caminho: string,
  esquema: z.ZodType | undefined,
): void {
  const noCaminho = nomesNoCaminho(caminho);
  if (noCaminho.length > 0 && esquema === undefined) {
    throw new ErroDeDefinicaoDeRota(
      `${identificacao}: o caminho tem ${noCaminho.join(", ")}, mas a rota não declara esquema de parâmetros — entrada sem validação é falha de segurança (P-007)`,
    );
  }
  if (noCaminho.length === 0 && esquema !== undefined) {
    throw new ErroDeDefinicaoDeRota(
      `${identificacao}: a rota declara esquema de parâmetros, mas o caminho não tem nenhum`,
    );
  }

  const noEsquema = nomesNoEsquema(esquema);
  if (noEsquema === null) return;

  const faltando = noCaminho.filter((nome) => !noEsquema.includes(nome));
  const sobrando = noEsquema.filter((nome) => !noCaminho.includes(nome));
  if (faltando.length === 0 && sobrando.length === 0) return;

  throw new ErroDeDefinicaoDeRota(
    `${identificacao}: caminho e esquema de parâmetros divergem — sem esquema: ${faltando.join(", ") || "nenhum"}; sem caminho: ${sobrando.join(", ") || "nenhum"}`,
  );
}

/** Confere o resto da declaração: caminho, método e corpo. */
function conferirDefinicao(
  identificacao: string,
  definicao: DefinicaoDeRota<unknown, unknown, unknown, unknown>,
): void {
  if (!definicao.caminho.startsWith("/")) {
    throw new ErroDeDefinicaoDeRota(
      `${identificacao}: o caminho precisa começar com barra`,
    );
  }
  if (definicao.caminho.length > 1 && definicao.caminho.endsWith("/")) {
    throw new ErroDeDefinicaoDeRota(
      `${identificacao}: o caminho não termina com barra — duas grafias do mesmo endereço viram duas entradas no documento`,
    );
  }
  if (!METODOS_HTTP.includes(definicao.metodo)) {
    throw new ErroDeDefinicaoDeRota(
      `${identificacao}: método desconhecido; use um de ${METODOS_HTTP.join(", ")}`,
    );
  }
  if (
    definicao.corpo !== undefined &&
    METODOS_SEM_CORPO.includes(definicao.metodo)
  ) {
    throw new ErroDeDefinicaoDeRota(
      `${identificacao}: ${definicao.metodo.toUpperCase()} não carrega corpo — o que a rota precisa receber vai no caminho ou na consulta`,
    );
  }
  conferirParametros(identificacao, definicao.caminho, definicao.parametros);
}

/** `/v1/storefront/:slug` → `/v1/storefront/{slug}`. */
function paraCaminhoDoDocumento(caminho: string): string {
  return caminho.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, "{$1}");
}

/**
 * Nome estável da operação: `get_v1_storefront_por_slug`.
 *
 * Estável importa mais do que bonito: é ele que vira nome de método no cliente
 * gerado do aplicativo nativo, e mudar o nome quebra o código de quem gerou.
 */
function identificadorDaRota(metodo: MetodoHttp, caminho: string): string {
  const partes = caminho
    .split("/")
    .filter((parte) => parte.length > 0)
    .map((parte) =>
      parte.startsWith(":")
        ? `por_${parte.slice(1)}`
        : parte.replace(/[^A-Za-z0-9]+/g, "_"),
    );
  return [metodo, ...(partes.length > 0 ? partes : ["raiz"])].join("_");
}

/** Confere uma parte da entrada, acumulando os problemas encontrados. */
function validarParte(
  parte: ParteDaRequisicao,
  esquema: z.ZodType | undefined,
  valor: unknown,
  problemas: ProblemaDeValidacao[],
): unknown {
  if (esquema === undefined) return undefined;

  const parecer = esquema.safeParse(valor);
  if (parecer.success) return parecer.data;

  for (const reclamacao of parecer.error.issues) {
    problemas.push({
      parte,
      campo: reclamacao.path.join(".") || "(raiz)",
      mensagem: reclamacao.message,
    });
  }
  return undefined;
}

/**
 * Declara uma rota do contrato.
 *
 * A declaração é conferida na hora: caminho com parâmetro que o esquema não
 * conhece, esquema com parâmetro que o caminho não tem, corpo em GET — tudo
 * isso derruba aqui, ao carregar o módulo, e não na primeira requisição.
 */
export function definirRota<
  TParametros = undefined,
  TConsulta = undefined,
  TCorpo = undefined,
  TResposta = unknown,
>(
  definicao: DefinicaoDeRota<TParametros, TConsulta, TCorpo, TResposta>,
): RotaDoContrato<TParametros, TConsulta, TCorpo, TResposta> {
  const identificacao = `${definicao.metodo.toUpperCase()} ${definicao.caminho}`;
  conferirDefinicao(
    identificacao,
    definicao as DefinicaoDeRota<unknown, unknown, unknown, unknown>,
  );

  const rota: RotaDoContrato<TParametros, TConsulta, TCorpo, TResposta> = {
    metodo: definicao.metodo,
    caminho: definicao.caminho,
    caminhoDoDocumento: paraCaminhoDoDocumento(definicao.caminho),
    etiqueta: definicao.etiqueta,
    resumo: definicao.resumo,
    descricao: definicao.descricao,
    identificador: identificadorDaRota(definicao.metodo, definicao.caminho),
    nomesDosParametros: Object.freeze(nomesNoCaminho(definicao.caminho)),
    parametros: definicao.parametros,
    consulta: definicao.consulta,
    corpo: definicao.corpo,
    resposta: definicao.resposta,
    status: definicao.status ?? 200,
    errosPossiveis: Object.freeze([...(definicao.errosPossiveis ?? [])]),
    statusAlternativosDeSucesso: Object.freeze([
      ...(definicao.statusAlternativosDeSucesso ?? []),
    ]),
    // Confere as três partes e recusa com TODOS os problemas, não o primeiro.
    validar(entrada) {
      const problemas: ProblemaDeValidacao[] = [];
      const parametros = validarParte(
        "parametros",
        definicao.parametros,
        entrada.parametros,
        problemas,
      );
      const consulta = validarParte(
        "consulta",
        definicao.consulta,
        entrada.consulta,
        problemas,
      );
      const corpo = validarParte(
        "corpo",
        definicao.corpo,
        entrada.corpo,
        problemas,
      );
      if (problemas.length > 0) {
        throw new ErroDeValidacaoDoContrato(identificacao, problemas);
      }
      return {
        parametros: parametros as TParametros,
        consulta: consulta as TConsulta,
        corpo: corpo as TCorpo,
      };
    },
  };

  return Object.freeze(rota);
}

/**
 * Junta as rotas num catálogo estável.
 *
 * Ordena por caminho e método para o documento sair igual em qualquer máquina
 * — se a ordem dependesse da ordem dos `import`, o portão acusaria diferença
 * que ninguém escreveu. E recusa rota repetida: duas declarações do mesmo
 * endereço fariam a segunda apagar a primeira no documento, sem aviso.
 */
export function montarCatalogo(
  rotas: readonly RotaDoContrato[],
): readonly RotaDoContrato[] {
  const vistas = new Set<string>();
  for (const rota of rotas) {
    const chave = `${rota.metodo} ${rota.caminhoDoDocumento}`;
    if (vistas.has(chave)) {
      throw new ErroDeDefinicaoDeRota(`rota declarada duas vezes: ${chave}`);
    }
    vistas.add(chave);
  }

  const ordenadas = [...rotas].sort((uma, outra) => {
    const porCaminho = uma.caminhoDoDocumento.localeCompare(
      outra.caminhoDoDocumento,
      "en",
    );
    if (porCaminho !== 0) return porCaminho;
    return (
      METODOS_HTTP.indexOf(uma.metodo) - METODOS_HTTP.indexOf(outra.metodo)
    );
  });

  return Object.freeze(ordenadas);
}
