/**
 * O vocabulário comum da carga de exemplo — e o que a torna determinística
 * (AC-037).
 *
 * A exigência é dura e vale a pena repetir: rodar a carga duas vezes, em dois
 * bancos vazios distintos, tem de produzir exatamente os mesmos dados. Isso
 * quebra de três formas conhecidas, e as três morrem aqui:
 *
 * 1. **Identificador sorteado.** `gen_random_uuid()` no banco, `crypto.randomUUID()`
 *    no código e qualquer contador de tempo dão valores diferentes a cada
 *    execução. Aqui todo identificador é DERIVADO de um nome estável, por
 *    resumo criptográfico — o mesmo nome dá sempre o mesmo identificador, em
 *    qualquer máquina, sem guardar tabela de correspondência em lugar nenhum.
 * 2. **"Agora".** `now()` e `new Date()` mudam a cada execução, e uma data
 *    plantada hoje envelheceria a captura de tela de amanhã. Toda data desta
 *    carga nasce de um deslocamento em minutos a partir de UMA data de
 *    referência, que entra por parâmetro.
 * 3. **Ordem de inserção.** Chave sequencial (a de `audit_log`, por exemplo) só
 *    é previsível se a ordem for. Por isso o cenário é uma lista, e não um
 *    conjunto: quem monta decide a ordem, e ela é a mesma sempre.
 *
 * Nada aqui conhece banco: são funções puras, e é por isso que a prova de
 * determinismo não precisa acreditar nelas — ela compara os dois bancos.
 */

import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Identificadores previsíveis
// ---------------------------------------------------------------------------

/**
 * Raiz fixa dos identificadores da carga de exemplo.
 *
 * Existe para que um identificador de exemplo nunca colida com um identificador
 * de outra origem: tudo que sai daqui é uma derivação desta raiz. Trocar este
 * valor troca TODOS os identificadores do cenário de uma vez — o que é útil
 * exatamente uma vez, se algum dia for preciso invalidar a base inteira.
 */
const RAIZ_DOS_IDENTIFICADORES = "5d0f2a7c-9b41-4c8e-8f3a-6e2b1d0c4a91";

const BYTES_DA_RAIZ = Buffer.from(
  RAIZ_DOS_IDENTIFICADORES.replaceAll("-", ""),
  "hex",
);

/**
 * Identificador previsível a partir de um nome estável.
 *
 * É a construção de identificador por nome descrita na RFC 9562 (versão 5):
 * resumo SHA-1 da raiz concatenada ao nome, com os bits de versão e de variante
 * ajustados. O resultado é um UUID legítimo — o PostgreSQL o aceita em coluna
 * `uuid` sem conversão — e é sempre o mesmo para o mesmo nome.
 *
 * O SHA-1 aqui não protege nada: ele distribui. Não há segredo envolvido e o
 * valor não autentica ninguém, então a fraqueza criptográfica dele é
 * irrelevante neste uso — o que importa é ser estável entre máquinas.
 */
export function idDeExemplo(nome: string): string {
  const resumo = createHash("sha1")
    .update(BYTES_DA_RAIZ)
    .update(Buffer.from(nome, "utf8"))
    .digest();

  const bytes = Buffer.alloc(16);
  resumo.copy(bytes, 0, 0, 16);
  // Versão 5 nos quatro bits altos do byte 6; variante RFC nos dois bits altos
  // do byte 8. Sem isso o valor seria hexadecimal de 32 dígitos, não um UUID.
  bytes.writeUInt8((bytes.readUInt8(6) & 0x0f) | 0x50, 6);
  bytes.writeUInt8((bytes.readUInt8(8) & 0x3f) | 0x80, 8);

  const hexa = bytes.toString("hex");
  return [
    hexa.slice(0, 8),
    hexa.slice(8, 12),
    hexa.slice(12, 16),
    hexa.slice(16, 20),
    hexa.slice(20, 32),
  ].join("-");
}

/**
 * Token opaco previsível, para a página pública de acompanhamento do pedido.
 *
 * O token real precisa ser imprevisível — é a chave de leitura de um pedido sem
 * login. O de exemplo precisa ser PREVISÍVEL, senão a captura de tela do
 * acompanhamento mudaria de endereço a cada carga. São 256 bits de resumo em
 * base 36, o que mantém o formato longo e não enumerável sem introduzir sorteio.
 */
export function tokenDeExemplo(nome: string): string {
  return createHash("sha256")
    .update(BYTES_DA_RAIZ)
    .update(Buffer.from(`token:${nome}`, "utf8"))
    .digest("hex")
    .slice(0, 40);
}

// ---------------------------------------------------------------------------
// Datas previsíveis
// ---------------------------------------------------------------------------

/**
 * A data de referência padrão da carga.
 *
 * É uma constante escrita, e não "agora": duas cargas em bancos distintos
 * precisam produzir as mesmas datas. Quem quiser outra data passa a sua por
 * parâmetro — é para isso que a referência é parâmetro em toda a carga.
 */
export const DATA_DE_REFERENCIA_PADRAO = new Date("2026-01-05T12:00:00.000Z");

/** Um minuto em milissegundos. */
const MINUTO_MS = 60_000;

/**
 * Instante deslocado da referência, em minutos. Negativo é passado.
 *
 * Toda data do cenário passa por aqui. É o que permite ler o cenário e saber,
 * sem executar nada, que o pedido concluído aconteceu antes do pedido em
 * preparo — e é o que faz as duas cargas concordarem no milissegundo.
 */
export function instanteDeExemplo(referencia: Date, minutos: number): Date {
  return new Date(referencia.getTime() + minutos * MINUTO_MS);
}

// ---------------------------------------------------------------------------
// A forma de um cenário
// ---------------------------------------------------------------------------

/**
 * O que cabe numa coluna. `null` é valor, e não ausência: coluna que precisa
 * ficar nula é escrita como nula, em vez de ser omitida — omitir deixaria o
 * padrão da tabela decidir, e padrão de tabela pode mudar.
 */
export type ValorDeColuna =
  string | number | boolean | Date | null | readonly string[];

/** Uma linha a plantar: nome da coluna → valor. */
export type LinhaDeExemplo = Readonly<Record<string, ValorDeColuna>>;

/**
 * As linhas de uma tabela. A tabela é nomeada sem o esquema porque o esquema é
 * sempre `app` — o único onde as políticas de isolamento valem.
 */
export interface ConjuntoDeExemplo {
  readonly tabela: string;
  readonly linhas: readonly LinhaDeExemplo[];
}

/**
 * Valor de coluna `jsonb`, já como texto.
 *
 * Precisa ser texto porque o driver traduz arranjo de JavaScript para arranjo
 * do PostgreSQL, e não para JSON: uma lista de opções enumeradas viraria
 * `{'110V','220V'}` em vez de `["110V","220V"]`. Serializando aqui, o parâmetro
 * chega como texto e o PostgreSQL o converte para `jsonb` pela coluna de
 * destino — que é o comportamento correto para os dois casos.
 */
export function json(valor: unknown): string {
  return JSON.stringify(valor);
}

// ---------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------

/** Um comando de inserção pronto, com os valores fora do texto. */
export interface InsercaoPreparada {
  readonly texto: string;
  readonly valores: readonly unknown[];
}

/**
 * Monta a inserção de uma linha, com os valores em parâmetros.
 *
 * Valor nunca entra no texto do comando — nem em carga de exemplo. Não é
 * preciosismo: o nome de uma loja de exemplo tem apóstrofo com frequência
 * ("Pastelaria d'Ávila"), e concatenar produziria um erro de sintaxe hoje e uma
 * porta de injeção no dia em que alguém copiar este código para um lugar onde o
 * dado vem de fora.
 */
export function montarInsercao(
  tabela: string,
  linha: LinhaDeExemplo,
): InsercaoPreparada {
  const colunas = Object.keys(linha);
  const marcadores = colunas.map((_coluna, indice) => `$${indice + 1}`);
  return {
    texto: `INSERT INTO app.${tabela} (${colunas.map((coluna) => `"${coluna}"`).join(", ")}) VALUES (${marcadores.join(", ")})`,
    valores: colunas.map((coluna) => linha[coluna] ?? null),
  };
}
