/**
 * Para onde a pessoa volta depois de entrar ou criar a conta — a regra ÚNICA
 * (card #105).
 *
 * O destino vem do endereço (`?proximo=` ou `?retorno=`), e endereço qualquer
 * um escreve: sem esta conferência, um link `/entrar?proximo=https://golpe`
 * levaria a pessoa, já logada, para fora do site (open redirect). Só passa
 * caminho interno do próprio site; o resto vira `undefined` e a tela usa o
 * destino do papel, como antes.
 *
 * Mora em `lib/` (e `features/auth/destino-seguro.ts` reexporta) porque a
 * regra de fronteira só deixa o servidor importar de `lib/`.
 *
 * O que a regra faz, em ordem:
 *  1. recusa o que não é caminho absoluto do próprio site (`//`, `\`, controle);
 *  2. normaliza como o navegador (`.` e `..` resolvidos) e exige a mesma origem;
 *  3. recusa `%2f`, `%5c` e controle codificado (`%00`, `%0d%0a`) no caminho;
 *  4. só então confere `/api/` e as telas de acesso, sem diferenciar caixa;
 *  5. tira o que não pode viajar no endereço de retorno: o código secreto do
 *     acompanhamento do pedido (vira a página da loja) e `lat`/`lng`.
 */

/** Telas de acesso: voltar para elas depois de entrar não faz sentido. */
const TELAS_DE_ACESSO =
  /^\/(?:entrar|cadastrar|vender|recuperar-senha|definir-senha|verificar-email)(?:[/?#]|$)/i;

/** Origem inventada só para o navegador resolver o caminho relativo. */
const BASE = "https://site.invalid";

/** O acompanhamento do pedido: o que vem depois de `pedido/` é uma senha. */
const ACOMPANHAMENTO_DO_PEDIDO = /^\/(?:loja|l)\/([^/]+)\/+pedido(?:\/|$)/i;

/** Parâmetros que nunca vão no endereço de retorno (localização). */
const PARAMETRO_DE_LOCALIZACAO = /^(?:lat|lng)(?:\[\])?$/i;

function decodificar(texto: string): string {
  try {
    return decodeURIComponent(texto);
  } catch {
    return texto;
  }
}

/** `%2f`, `%5c` e controle (`%00` a `%1f`, `%7f`, como `%0d%0a`) no caminho. */
function temCodificacaoPerigosa(caminho: string): boolean {
  return /%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(caminho);
}

export function destinoSeguro(valor: unknown): string | undefined {
  if (typeof valor !== "string") return undefined;
  const bruto = valor.trim();
  if (bruto === "" || bruto.length > 512) return undefined;
  // Só caminho absoluto do próprio site: `//outro` e `/\outro` o navegador
  // lê como outro domínio.
  if (!bruto.startsWith("/") || bruto.startsWith("//")) return undefined;
  if (bruto.includes("\\")) return undefined;
  // Caractere de controle (quebra de linha, tab) não aparece em caminho de
  // verdade e é usado para enganar a conferência.
  for (const letra of bruto) {
    const codigo = letra.charCodeAt(0);
    if (codigo < 0x20 || codigo === 0x7f) return undefined;
  }

  let endereco: URL;
  try {
    endereco = new URL(bruto, BASE);
  } catch {
    return undefined;
  }
  if (endereco.origin !== BASE) return undefined;

  const caminho = endereco.pathname;
  if (temCodificacaoPerigosa(caminho)) return undefined;
  const lido = decodificar(caminho);
  if (!lido.startsWith("/") || lido.startsWith("//") || lido.includes("\\")) {
    return undefined;
  }
  if (/^\/api(?:\/|$)/i.test(lido)) return undefined;
  if (TELAS_DE_ACESSO.test(lido)) return undefined;

  // O código do acompanhamento funciona como senha: o retorno guarda só a loja.
  const acompanhamento = ACOMPANHAMENTO_DO_PEDIDO.exec(lido);
  if (acompanhamento !== null) {
    return `/loja/${encodeURIComponent(acompanhamento[1] ?? "")}`;
  }

  // Localização nunca viaja no endereço de retorno.
  const nomes = [...endereco.searchParams.keys()].filter((nome) =>
    PARAMETRO_DE_LOCALIZACAO.test(nome),
  );
  if (nomes.length === 0) return `${caminho}${endereco.search}`;
  for (const nome of nomes) endereco.searchParams.delete(nome);
  const busca = endereco.searchParams.toString();
  return busca === "" ? caminho : `${caminho}?${busca}`;
}

/** Lê `proximo` (ou o apelido `retorno`) dos parâmetros do endereço. */
export function destinoDosParametros(parametros: {
  get(nome: string): string | null;
}): string | undefined {
  return (
    destinoSeguro(parametros.get("proximo")) ??
    destinoSeguro(parametros.get("retorno"))
  );
}

/**
 * O endereço de uma tela de acesso levando o destino junto. O destino passa
 * pela mesma conferência: quem monta o link não precisa lembrar de validar.
 */
export function comDestino(tela: string, destino: string | undefined): string {
  const seguro = destinoSeguro(destino);
  if (seguro === undefined) return tela;
  const separador = tela.includes("?") ? "&" : "?";
  return `${tela}${separador}proximo=${encodeURIComponent(seguro)}`;
}
