/**
 * A busca na vitrine (AC-408, AC-409).
 *
 * ELA DEVOLVE QUEM CASA, e não como agrupar. Quem agrupa é o catálogo, que já
 * sabe a ordem das seções e o vínculo de cada produto — e é isso que faz o
 * resultado sair "agrupado por categoria" sem uma segunda implementação da
 * mesma montagem.
 *
 * A CONSULTA É CRUA, e é uma das poucas do projeto. Busca de texto é o caso em
 * que o construtor tipado não alcança: `tsvector`, `plainto_tsquery` e o índice
 * de expressão não têm equivalente no Prisma, e escrevê-los por aproximação
 * daria uma busca que ignora o índice em silêncio. O isolamento continua valendo
 * — a consulta roda na MESMA transação, com o mesmo contexto, e a política do
 * banco decide o que ela enxerga (P-004).
 *
 * A EXPRESSÃO É A DA FUNÇÃO, e não copiada dela. `app.texto_de_busca` mora na
 * migração 0021, e a consulta a chama pelo nome: expressão copiada diverge, e
 * quando diverge o índice para de ser usado sem ninguém notar — a busca fica
 * lenta e nada acusa.
 */
import { transacaoAtual } from "../../core/db.ts";

/**
 * Tamanho máximo do termo aceito.
 *
 * Não é sobre desempenho: é sobre não deixar alguém mandar um parágrafo para o
 * analisador de texto a cada tecla digitada. Quem procura produto digita
 * palavras, e sessenta caracteres cobrem qualquer nome de produto que exista.
 */
export const MAXIMO_DO_TERMO = 60;

/**
 * Quantos produtos a busca traz, no máximo.
 *
 * A vitrine mostra o que casa, e não tudo que existe. Loja com mil produtos e
 * termo genérico ("a") devolveria a loja inteira — e a tela de resultado viraria
 * o catálogo, que a pessoa já tinha.
 */
export const MAXIMO_DE_ACERTOS = 200;

/**
 * O termo, limpo do que não deve chegar ao analisador.
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
 * Os produtos que casam com o termo, na loja que está no contexto.
 *
 * Devolve os identificadores, e nada mais. Quem os transforma em seções é o
 * catálogo — que já filtra o que não é público pela política do banco, e por
 * isso um identificador que escape daqui não vira produto visível.
 */
export async function produtosQueCasam(
  termo: string,
): Promise<readonly string[]> {
  const tx = transacaoAtual();

  const linhas = await tx.$queryRaw<{ id: string }[]>`
    SELECT p.id
      FROM app.products p
     WHERE app.texto_de_busca(p.name, p.description)
           @@ plainto_tsquery('portuguese'::regconfig, app.sem_acento(${termo}))
     ORDER BY ts_rank(
                app.texto_de_busca(p.name, p.description),
                plainto_tsquery('portuguese'::regconfig, app.sem_acento(${termo}))
              ) DESC,
              p.sort_order ASC
     LIMIT ${MAXIMO_DE_ACERTOS}
  `;

  return linhas.map((linha) => linha.id);
}
