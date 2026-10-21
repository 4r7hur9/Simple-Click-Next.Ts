/**
 * Para onde a pessoa volta depois de entrar ou criar a conta.
 *
 * O destino vem do endereço (`?proximo=` ou `?retorno=`), e endereço qualquer
 * um escreve: sem esta conferência, um link `/entrar?proximo=https://golpe`
 * levaria a pessoa, já logada, para fora do site (open redirect). Só passa
 * caminho interno do próprio site; o resto vira `undefined` e a tela usa o
 * destino do papel, como antes.
 */

/** Telas de acesso: voltar para elas depois de entrar não faz sentido. */
const TELAS_DE_ACESSO =
  /^\/(?:entrar|cadastrar|vender|recuperar-senha|definir-senha|verificar-email)(?:[/?#]|$)/;

export function destinoSeguro(valor: unknown): string | undefined {
  if (typeof valor !== "string") return undefined;
  const caminho = valor.trim();
  if (caminho === "" || caminho.length > 512) return undefined;
  // Só caminho absoluto do próprio site: `//outro` e `/\outro` o navegador
  // lê como outro domínio.
  if (!caminho.startsWith("/") || caminho.startsWith("//")) return undefined;
  if (caminho.includes("\\")) return undefined;
  // Caractere de controle (quebra de linha, tab) não aparece em caminho de
  // verdade e é usado para enganar a conferência.
  for (const letra of caminho) {
    const codigo = letra.charCodeAt(0);
    if (codigo < 0x20 || codigo === 0x7f) return undefined;
  }
  if (caminho.startsWith("/api/")) return undefined;
  if (TELAS_DE_ACESSO.test(caminho)) return undefined;
  return caminho;
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

/** O endereço de uma tela de acesso levando o destino junto. */
export function comDestino(tela: string, destino: string | undefined): string {
  if (destino === undefined) return tela;
  const separador = tela.includes("?") ? "&" : "?";
  return `${tela}${separador}proximo=${encodeURIComponent(destino)}`;
}
