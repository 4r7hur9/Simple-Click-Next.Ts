import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Leitor mínimo de CSS para os testes das folhas de estilo (card #153).
 *
 * Não é um parser completo: entende regras, `@media`/`@supports` aninhados e
 * `@keyframes`, o que basta para conferir seletores e declarações. Os
 * comentários saem antes da leitura, porque contêm dois-pontos e chaves.
 */

export type Regra = {
  /** Seletores da lista, sem espaços nas pontas. */
  readonly seletores: readonly string[];
  /** As declarações, na ordem em que aparecem (a última de um nome vence). */
  readonly declaracoes: ReadonlyMap<string, string>;
  /** Os `@media`/`@supports` em volta, do mais externo ao mais interno. */
  readonly contexto: readonly string[];
  /** Posição da regra na folha: serve para comparar ordem. */
  readonly ordem: number;
};

export type Folha = {
  readonly texto: string;
  readonly regras: readonly Regra[];
  readonly keyframes: ReadonlyMap<string, string>;
};

export function semComentarios(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

export function lerArquivo(url: URL): string {
  return semComentarios(readFileSync(fileURLToPath(url), "utf8"));
}

/** Divide por `separador` só onde não há parêntese nem colchete aberto. */
function dividir(texto: string, separador: string): string[] {
  const partes: string[] = [];
  let profundidade = 0;
  let atual = "";
  for (const letra of texto) {
    if (letra === "(" || letra === "[") profundidade += 1;
    if (letra === ")" || letra === "]") profundidade -= 1;
    if (letra === separador && profundidade === 0) {
      partes.push(atual);
      atual = "";
    } else {
      atual += letra;
    }
  }
  partes.push(atual);
  return partes;
}

export function declaracoesDe(corpo: string): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const trecho of dividir(corpo, ";")) {
    const separador = trecho.indexOf(":");
    if (separador === -1) continue;
    const nome = trecho.slice(0, separador).trim();
    if (nome === "") continue;
    mapa.set(
      nome,
      trecho
        .slice(separador + 1)
        .trim()
        .replace(/\s+/g, " "),
    );
  }
  return mapa;
}

export function lerFolha(css: string): Folha {
  const regras: Regra[] = [];
  const keyframes = new Map<string, string>();
  let ordem = 0;

  const percorrer = (texto: string, contexto: readonly string[]): void => {
    let cursor = 0;
    while (cursor < texto.length) {
      const abre = texto.indexOf("{", cursor);
      if (abre === -1) break;
      let profundidade = 1;
      let fecha = abre + 1;
      while (fecha < texto.length && profundidade > 0) {
        if (texto[fecha] === "{") profundidade += 1;
        if (texto[fecha] === "}") profundidade -= 1;
        fecha += 1;
      }
      const corpo = texto.slice(abre + 1, fecha - 1);
      // O que vem antes do `{`, depois do último `;` (um `@import`) ou `}`.
      const bruto = texto.slice(cursor, abre);
      const preludio = bruto.slice(bruto.lastIndexOf(";") + 1).trim();
      cursor = fecha;

      if (/^@keyframes\s/i.test(preludio)) {
        keyframes.set(preludio.replace(/^@keyframes\s+/i, "").trim(), corpo);
      } else if (/^@(media|supports|layer|container)\b/i.test(preludio)) {
        percorrer(corpo, [...contexto, preludio.replace(/\s+/g, " ")]);
      } else if (!preludio.startsWith("@")) {
        regras.push({
          seletores: dividir(preludio, ",").map((s) =>
            s.trim().replace(/\s+/g, " "),
          ),
          declaracoes: declaracoesDe(corpo),
          contexto,
          ordem: ordem++,
        });
      }
    }
  };

  percorrer(css, []);
  return { texto: css, regras, keyframes };
}

/** Todas as regras cuja lista de seletores contém EXATAMENTE `seletor`. */
export function regrasDe(folha: Folha, seletor: string): readonly Regra[] {
  return folha.regras.filter((r) => r.seletores.includes(seletor));
}

/** O valor final (a última declaração) de uma propriedade num seletor sem `@media`. */
export function valorDe(
  folha: Folha,
  seletor: string,
  propriedade: string,
): string | undefined {
  let valor: string | undefined;
  for (const regra of regrasDe(folha, seletor)) {
    if (regra.contexto.length > 0) continue;
    const achado = regra.declaracoes.get(propriedade);
    if (achado !== undefined) valor = achado;
  }
  return valor;
}

/** Quantas vezes `backdrop-filter` aparece sem e com o prefixo do Safari. */
export function contarFiltros(css: string): { puro: number; webkit: number } {
  const webkit = (css.match(/-webkit-backdrop-filter\s*:/g) ?? []).length;
  const total = (css.match(/backdrop-filter\s*:/g) ?? []).length;
  return { puro: total - webkit, webkit };
}
