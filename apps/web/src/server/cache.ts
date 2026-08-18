/**
 * Envelopes de cache do site — o identificador da loja SEMPRE no primeiro
 * argumento (AC-027), e invalidação que aparece na leitura seguinte (AC-028).
 *
 * ## Por que a loja é o primeiro argumento, e não um campo de opções
 *
 * O site é multi-loja no mesmo processo: a mesma página, o mesmo componente e a
 * mesma função de leitura atendem lojas diferentes a cada requisição. O cache
 * do Next guarda por chave, e chave sem loja é chave compartilhada — a vitrine
 * da segunda loja receberia o catálogo da primeira, sem nenhum erro aparecer.
 *
 * Primeiro argumento posicional e obrigatório é a forma mais barata de tornar
 * esse esquecimento impossível: não dá para omitir, e a verificação de tipos
 * acusa antes de o código rodar. Um campo opcional em objeto de opções seria
 * exatamente o contrário — silencioso quando ausente.
 *
 * ## Por que o motor é injetável
 *
 * O que guarda de fato é o Next (`unstable_cache` e `revalidateTag`), e essas
 * funções só existem dentro do processo do Next, com contexto de requisição
 * montado. Deixar o motor entrar por parâmetro é o que permite provar a REGRA
 * — chave por loja, etiqueta por loja, alteração refletindo na leitura
 * seguinte — sem subir o servidor inteiro para cada teste.
 *
 * ## Este arquivo é de servidor
 *
 * Nada aqui pode ser importado por componente de cliente: o cache é do
 * servidor, e a fronteira verificada por ESLint impede que `features/` alcance
 * esta camada.
 */

import { revalidateTag, unstable_cache } from "next/cache";

/** Separador entre as partes da chave — o mesmo que a API usa. */
const SEPARADOR = ":";

/**
 * O que pode aparecer em uma parte de chave. O separador fica de fora para que
 * a loja `a` com o dado `b:catalogo` e a loja `a:b` com o dado `catalogo` não
 * possam produzir a mesma chave.
 *
 * A regra é a mesma de `apps/api/src/core/cache.ts`, escrita duas vezes de
 * propósito: a tabela de fronteiras não deixa o site importar a API, e um
 * pacote compartilhado só para uma expressão regular custaria mais do que
 * resolve (P-014). O que amarra as duas pontas é o teste de cada lado exigir
 * exatamente o mesmo formato de chave.
 */
const FORMA_DA_PARTE = /^[A-Za-z0-9_.-]+$/;

/** Prazo de validade padrão de uma entrada do site, em segundos. */
export const TTL_PADRAO_SEGUNDOS = 60;

/** Parte de chave que não serve — com o motivo dito por extenso. */
export class ErroDeChaveDoSite extends Error {
  readonly parte: string;

  constructor(parte: string, motivo: string) {
    super(
      [
        `A chave de cache do site não pode ser montada: ${parte} ${motivo}.`,
        "",
        "Toda chave de cache começa pelo identificador da loja (AC-027). O site",
        "atende lojas diferentes no mesmo processo: chave sem loja entregaria a",
        "vitrine de uma na página da outra.",
      ].join("\n"),
    );
    this.name = "ErroDeChaveDoSite";
    this.parte = parte;
  }
}

/** Devolve a parte já conferida, ou recusa dizendo qual delas está errada. */
function exigirParte(nomeDaParte: string, valor: string): string {
  const limpo = valor.trim();
  if (limpo === "") throw new ErroDeChaveDoSite(nomeDaParte, "veio vazio");
  if (!FORMA_DA_PARTE.test(limpo)) {
    throw new ErroDeChaveDoSite(
      nomeDaParte,
      `tem caractere que a chave não aceita ("${limpo}") — só letras, números, ponto, hífen e sublinhado`,
    );
  }
  return limpo;
}

/** Verdadeiro quando o texto serve como parte de chave. */
export function ehParteDeChaveValida(valor: string): boolean {
  return FORMA_DA_PARTE.test(valor.trim());
}

/** Monta a chave do site: `<loja>:<nome>[:<parte>…]`. */
export function chaveDoCacheDoSite(
  lojaId: string,
  nome: string,
  ...partes: readonly string[]
): string {
  const loja = exigirParte("o identificador da loja", lojaId);
  const dado = exigirParte("o nome do dado", nome);
  const resto = partes.map((parte, indice) =>
    exigirParte(`a parte ${indice + 1} da chave`, parte),
  );
  return [loja, dado, ...resto].join(SEPARADOR);
}

/**
 * A etiqueta que cobre TUDO daquela loja.
 *
 * É o identificador da loja puro: invalidar por ela é dizer "esqueça esta
 * loja", que é o que a API pede quando o catálogo muda e não se sabe ao certo
 * quais páginas dependiam do que mudou.
 */
export function etiquetaDaLoja(lojaId: string): string {
  return exigirParte("o identificador da loja", lojaId);
}

/** A etiqueta de um dado específico de uma loja. */
export function etiquetaDoDado(lojaId: string, nome: string): string {
  return chaveDoCacheDoSite(lojaId, nome);
}

/**
 * As etiquetas de uma entrada: a da loja inteira e a do dado.
 *
 * As duas juntas dão os dois níveis de invalidação que a operação precisa —
 * "mudou este produto" e "mudou alguma coisa nesta loja" — sem manter índice
 * de dependências em lugar nenhum.
 */
export function etiquetasDaEntrada(
  lojaId: string,
  nome: string,
): readonly string[] {
  return [etiquetaDaLoja(lojaId), etiquetaDoDado(lojaId, nome)];
}

/** O que o motor de cache precisa saber para guardar uma leitura. */
export interface PedidoDeLembranca<T> {
  readonly chave: string;
  readonly etiquetas: readonly string[];
  readonly ttlSegundos: number;
  readonly calcular: () => Promise<T>;
}

/** Quem guarda de fato. Em produção é o Next; no teste, um dublê fiel. */
export interface MotorDeCacheDoSite {
  lembrar<T>(pedido: PedidoDeLembranca<T>): Promise<T>;
  invalidar(etiqueta: string): void;
}

/**
 * O motor do Next.
 *
 * `unstable_cache` guarda por partes de chave e aceita etiquetas;
 * `revalidateTag` com o perfil `"max"` expira a etiqueta na hora, que é o
 * comportamento que AC-028 pede — a próxima leitura recalcula, sem reinício de
 * serviço nem limpeza manual.
 */
export const motorDoNext: MotorDeCacheDoSite = {
  lembrar<T>(pedido: PedidoDeLembranca<T>): Promise<T> {
    const guardado = unstable_cache(pedido.calcular, [pedido.chave], {
      tags: [...pedido.etiquetas],
      revalidate: pedido.ttlSegundos,
    });
    return guardado();
  },
  invalidar(etiqueta: string): void {
    revalidateTag(etiqueta, "max");
  },
};

/** Ajustes de uma leitura com cache no site. */
export interface OpcoesDeLembrancaDoSite {
  /** Partes extras da chave, depois do nome do dado. */
  readonly partes?: readonly string[];
  /** Prazo desta entrada, em segundos. */
  readonly ttlSegundos?: number;
  /** Quem guarda. Só o teste passa outro. */
  readonly motor?: MotorDeCacheDoSite;
}

/**
 * Lê com cache, com a loja no primeiro argumento.
 *
 * A leitura em si continua sendo responsabilidade de quem chama: este envelope
 * não sabe buscar nada, só sabe guardar sob a chave certa e apagar sob a
 * etiqueta certa.
 */
export function lembrarNoSite<T>(
  lojaId: string,
  nome: string,
  calcular: () => Promise<T>,
  opcoes: OpcoesDeLembrancaDoSite = {},
): Promise<T> {
  const motor = opcoes.motor ?? motorDoNext;
  return motor.lembrar({
    chave: chaveDoCacheDoSite(lojaId, nome, ...(opcoes.partes ?? [])),
    etiquetas: etiquetasDaEntrada(lojaId, nome),
    ttlSegundos: opcoes.ttlSegundos ?? TTL_PADRAO_SEGUNDOS,
    calcular,
  });
}

/**
 * Esquece o que é daquela loja e devolve as etiquetas invalidadas.
 *
 * Sem `nomes`, invalida a loja inteira. Com `nomes`, invalida só aqueles dados
 * — o que evita derrubar todo o cache de uma loja movimentada por causa da
 * alteração de um produto.
 */
export function invalidarNoSite(
  lojaId: string,
  nomes: readonly string[] = [],
  motor: MotorDeCacheDoSite = motorDoNext,
): readonly string[] {
  const etiquetas =
    nomes.length === 0
      ? [etiquetaDaLoja(lojaId)]
      : nomes.map((nome) => etiquetaDoDado(lojaId, nome));

  for (const etiqueta of etiquetas) motor.invalidar(etiqueta);
  return etiquetas;
}
