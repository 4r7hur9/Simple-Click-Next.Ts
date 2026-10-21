/**
 * A busca na vitrine (AC-408, AC-409; tolerante desde o card #75).
 *
 * ELA DEVOLVE QUEM CASA, e não como agrupar. Quem agrupa e pagina é o
 * catálogo, que já sabe a ordem das seções e o vínculo de cada produto.
 *
 * SEM TETO. A busca devolve TODOS os acertos, na ordem de relevância; quem
 * corta é a página do catálogo (`/catalogo/produtos`, por cursor) e o resumo
 * (os primeiros de cada seção). Antes ela parava em 200, e "filtro" numa loja
 * de autopeças (538 acertos) mostrava 195.
 *
 * TOLERANTE. O termo vira palavras sem acento e sem maiúscula; cada palavra
 * casa com o COMEÇO de uma palavra do produto ("amort" acha "AMORTECEDOR"), e
 * o produto precisa casar com todas. Cada palavra também vale pelas suas
 * equivalentes no dicionário do ramo da loja (`sinonimos-da-busca.json`):
 * "pastilha" acha "PAST". O texto procurado não é só o nome: é a coluna
 * `products.search_text` (migração 0071), com descrição, marca, referência do
 * fabricante, similares, especificações e SKU — "SNA500" e "VOX" acham.
 *
 * A CONSULTA É A FUNÇÃO `app.buscar_produtos_da_vitrine`, que usa o índice
 * trigram da coluna. Ela corre com direitos de quem a definiu (com a política
 * de linha ligada o PostgreSQL não usa índice para expressão regular), presa à
 * loja do contexto e a produto publicado, e devolve só identificadores: o
 * cartão é montado pelo catálogo, sob a política de linha.
 */
import dicionario from "./sinonimos-da-busca.json" with { type: "json" };

import { transacaoAtual } from "../../core/db.ts";

/**
 * Tamanho máximo do termo aceito.
 *
 * Não é sobre desempenho: é sobre não deixar alguém mandar um parágrafo para o
 * banco a cada tecla digitada. Quem procura produto digita palavras, e
 * sessenta caracteres cobrem qualquer nome de produto que exista.
 */
export const MAXIMO_DO_TERMO = 60;

/** Quantas palavras do termo contam. As demais são ignoradas. */
export const MAXIMO_DE_PALAVRAS = 8;

/**
 * Abreviação com até este tamanho só casa com a palavra INTEIRA no produto:
 * "ret" (retentor) não pode achar "RETROVISOR".
 */
export const ABREVIACAO_CURTA = 5;

/** Palavras que não ajudam a achar nada quando vêm junto de outras. */
const PALAVRAS_VAZIAS = new Set([
  "a", "o", "as", "os", "de", "da", "do", "das", "dos", "e", "em", "com",
  "para", "pra", "p", "c", "na", "no", "um", "uma",
]);

/**
 * O termo, limpo do que não deve chegar ao banco.
 *
 * APARA, CORTA E APARA DE NOVO. O primeiro apare faz o limite contar CONTEÚDO —
 * dez espaços colados na frente não podem comer dez letras do que foi digitado.
 * O segundo apara o espaço que o corte deixou no fim, quando ele cai no meio de
 * uma frase.
 *
 * VAZIO VIRA NULO, e essa é a distinção que decide a tela inteira: nulo é "sem
 * busca" e devolve o catálogo completo; string vazia devolveria zero produtos, e
 * quem apertou "buscar" sem digitar veria a loja como se ela não tivesse nada.
 */
export function prepararTermo(bruto: string): string | null {
  const limpo = bruto.trim().slice(0, MAXIMO_DO_TERMO).trim();
  return limpo === "" ? null : limpo;
}

/**
 * Minúsculas, sem acento, só letras e números separados por um espaço. A MESMA
 * regra de `app.normalizar_busca` (migração 0071), sem os espaços das pontas.
 */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * O singular aproximado de uma palavra: "pastilhas" → "pastilha",
 * "amortecedores" → "amortecedor", "botões" → "botao". Serve para achar a
 * palavra no dicionário e para o prefixo casar com o singular do produto.
 */
export function singular(palavra: string): string {
  if (/[0-9]/.test(palavra) || palavra.length < 4) return palavra;
  if (/(oes|aes)$/.test(palavra)) return palavra.slice(0, -3) + "ao";
  if (/ais$/.test(palavra)) return palavra.slice(0, -3) + "al";
  if (palavra.length >= 6 && /(res|zes|ses)$/.test(palavra)) {
    return palavra.slice(0, -2);
  }
  if (palavra.endsWith("s") && !palavra.endsWith("ss")) {
    return palavra.slice(0, -1);
  }
  return palavra;
}

/** Os grupos de equivalentes, já normalizados. A 1ª palavra é a por extenso. */
export type Dicionario = readonly (readonly string[])[];

interface ArquivoDeSinonimos {
  readonly todos: readonly (readonly string[])[];
  readonly ramos: Readonly<Record<string, readonly (readonly string[])[]>>;
}

const ARQUIVO = dicionario as ArquivoDeSinonimos;
const porRamo = new Map<string, Dicionario>();

/** O dicionário do ramo da loja (código do ramo, ex.: AUTO_PARTS) + o comum. */
export function dicionarioDoRamo(ramo: string | null | undefined): Dicionario {
  const chave = ramo ?? "";
  const pronto = porRamo.get(chave);
  if (pronto !== undefined) return pronto;
  const grupos = [...ARQUIVO.todos, ...(ARQUIVO.ramos[chave] ?? [])]
    .map((grupo) => grupo.map(normalizarTexto).filter((p) => p !== ""))
    .filter((grupo) => grupo.length > 1);
  porRamo.set(chave, grupos);
  return grupos;
}

/** Uma palavra do termo, pronta para o banco. */
export interface PalavraDaBusca {
  /** A palavra (ou expressão de duas, "para choque") como foi digitada. */
  readonly palavra: string;
  /** A expressão regular que o texto do produto precisa casar. */
  readonly padrao: string;
  /** A palavra inteira, que só pesa na ordem. */
  readonly exata: string;
}

/**
 * O termo em palavras, cada uma com as alternativas do dicionário.
 *
 * Expressão de duas ou três palavras do dicionário ("para choque") é uma
 * palavra só. A palavra digitada casa com o começo; a equivalente por extenso
 * (1ª do grupo) também; a abreviação curta, só inteira.
 */
export function palavrasDaBusca(
  termo: string,
  dicionario: Dicionario = [],
): readonly PalavraDaBusca[] {
  const soltas = normalizarTexto(termo).split(" ").filter((p) => p !== "");
  // Palavra → os grupos em que ela aparece (uma abreviação pode estar em mais
  // de um: "sup" é superior e suporte).
  const indice = new Map<string, (readonly string[])[]>();
  for (const grupo of dicionario) {
    for (const item of grupo) {
      indice.set(item, [...(indice.get(item) ?? []), grupo]);
    }
  }
  const gruposDe = (palavra: string) =>
    indice.get(palavra) ?? indice.get(singular(palavra)) ?? [];

  // Junta as expressões de várias palavras que o dicionário conhece.
  const palavras: string[] = [];
  for (let i = 0; i < soltas.length; ) {
    let tomadas = 1;
    for (let n = 3; n >= 2; n--) {
      const juntas = soltas.slice(i, i + n).join(" ");
      if (i + n <= soltas.length && indice.has(juntas)) {
        tomadas = n;
        break;
      }
    }
    palavras.push(soltas.slice(i, i + tomadas).join(" "));
    i += tomadas;
  }

  const uteis = palavras.filter((p) => !PALAVRAS_VAZIAS.has(p));
  const escolhidas = (uteis.length > 0 ? uteis : palavras).slice(
    0,
    MAXIMO_DE_PALAVRAS,
  );

  return [...new Set(escolhidas)].map((palavra) => {
    const prefixos = new Set<string>([palavra, singular(palavra)]);
    const inteiras = new Set<string>();
    for (const grupo of gruposDe(palavra)) {
      grupo.forEach((outra, posicao) => {
        if (posicao === 0 || outra.length > ABREVIACAO_CURTA) {
          prefixos.add(outra);
          prefixos.add(singular(outra));
        } else {
          inteiras.add(outra);
        }
      });
    }
    for (const p of prefixos) inteiras.delete(p);
    const alternativas = [
      ...[...prefixos].map((p) => ` ${p}`),
      ...[...inteiras].map((p) => ` ${p} `),
    ];
    return {
      palavra,
      padrao: `(${alternativas.join("|")})`,
      exata: `( ${palavra} )`,
    };
  });
}

/** O código do ramo da loja do contexto (para escolher o dicionário). */
async function ramoDaLoja(): Promise<string | null> {
  const [linha] = await transacaoAtual().$queryRaw<{ ramo: string }[]>`
    SELECT vertical_code AS ramo FROM app.stores
     WHERE id = app.current_store_id()
  `;
  return linha?.ramo ?? null;
}

/**
 * Os produtos que casam com o termo, na loja que está no contexto, TODOS e na
 * ordem de relevância (mais palavras no nome, nome que começa pelo termo,
 * palavra inteira; empate na ordem do dono).
 *
 * Devolve os identificadores, e nada mais. Quem os transforma em seções e
 * páginas é o catálogo — que já filtra o que não é público pela política do
 * banco, e por isso um identificador que escape daqui não vira produto visível.
 */
export async function produtosQueCasam(
  termo: string,
  ramo?: string | null,
): Promise<readonly string[]> {
  const tx = transacaoAtual();
  const palavras = palavrasDaBusca(
    termo,
    dicionarioDoRamo(ramo === undefined ? await ramoDaLoja() : ramo),
  );
  if (palavras.length === 0) return [];

  const linhas = await tx.$queryRaw<{ id: string }[]>`
    SELECT product_id::text AS id
      FROM app.buscar_produtos_da_vitrine(
             ${palavras.map((p) => p.padrao)}::text[],
             ${palavras.map((p) => p.exata)}::text[])
  `;

  return linhas.map((linha) => linha.id);
}

/**
 * Cruza os acertos de cada filtro (texto, especificação, atacado).
 *
 * `undefined` é "este filtro não foi pedido" e não restringe nada; lista vazia
 * é "pedido e nada casou", e zera o resultado. A ORDEM é a da primeira lista
 * pedida — a busca de texto vem primeiro e já sai ordenada por relevância.
 * Nenhum filtro pedido devolve `undefined`: o catálogo sai inteiro.
 */
export function cruzarAcertos(
  ...listas: readonly (readonly string[] | undefined)[]
): readonly string[] | undefined {
  const pedidas = listas.filter(
    (lista): lista is readonly string[] => lista !== undefined,
  );
  const [primeira, ...demais] = pedidas;
  if (primeira === undefined) return undefined;
  const conjuntos = demais.map((lista) => new Set(lista));
  return primeira.filter((id) => conjuntos.every((c) => c.has(id)));
}
