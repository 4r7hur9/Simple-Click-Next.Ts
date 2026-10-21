/**
 * O endereço da loja (`/loja/<apelido>`) no cadastro de dono: como ele sai do
 * nome, o que dá para conferir na própria tela e a consulta de
 * disponibilidade. A regra final é da API (3 a 63 letras sem acento,
 * números e hífen); aqui só se evita mandar o que ela vai recusar.
 */

/** O apelido a partir do nome: sem acento, minúsculo, com hífen. */
export function apelidoDoNome(nome: string): string {
  return apelidoDigitado(nome).slice(0, 63).replace(/-+$/g, "");
}

/** Normaliza o que a pessoa digita no campo de endereço. */
export function apelidoDigitado(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/g, "");
}

/** `null` quando serve; senão, o que falta ao endereço. */
export function problemaDoApelido(apelido: string): string | null {
  if (apelido === "") return "Escolha o endereço da loja.";
  if (apelido.length < 3) return "Use pelo menos 3 letras ou números.";
  if (apelido.endsWith("-")) return "O endereço não termina com hífen.";
  return null;
}

export type SituacaoDoApelido =
  | { readonly estado: "livre" }
  | { readonly estado: "ocupado"; readonly sugestao: string | null }
  | { readonly estado: "reservado"; readonly mensagem: string }
  | { readonly estado: "indisponivel" };

/** Pergunta ao servidor se o endereço está livre. */
export async function consultarApelido(
  apelido: string,
  sinal?: AbortSignal,
): Promise<SituacaoDoApelido> {
  try {
    const resposta = await fetch(
      `/api/loja/aprovacao/apelido?valor=${encodeURIComponent(apelido)}`,
      { cache: "no-store", ...(sinal === undefined ? {} : { signal: sinal }) },
    );
    const corpo = (await resposta.json()) as Record<string, unknown>;
    if (resposta.status === 400) {
      const campos = corpo["campos"];
      const primeira = Array.isArray(campos)
        ? (campos[0] as Record<string, unknown> | undefined)
        : undefined;
      return {
        estado: "reservado",
        mensagem:
          typeof primeira?.["mensagem"] === "string"
            ? primeira["mensagem"]
            : "Este endereço não pode ser usado.",
      };
    }
    if (!resposta.ok) return { estado: "indisponivel" };
    if (corpo["disponivel"] === true) return { estado: "livre" };
    return {
      estado: "ocupado",
      sugestao: typeof corpo["sugestao"] === "string" ? corpo["sugestao"] : null,
    };
  } catch {
    return { estado: "indisponivel" };
  }
}
