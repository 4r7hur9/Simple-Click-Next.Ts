/**
 * Leitura das respostas da API pelo contrato compartilhado.
 *
 * Este arquivo é o ponto em que o site depende do contrato de verdade: os
 * tipos vêm de `@simpleclick/contracts`, que é a mesma fonte que a API usa
 * para validar (AC-006). Nenhum tipo é redigitado aqui — mudar um campo lá faz
 * a verificação de tipos do site reprovar aqui, e é isso que se prova em
 * `apps/web/tests/contrato-tipos.test.ts`.
 *
 * Função pura de propósito: quem fala com a rede é `src/server/api-client.ts`.
 * Assim a regra de leitura é testável sem servidor no ar.
 */

import {
  esquemaDeErro,
  esquemaDeIdentificacaoDaApi,
  rotaDeIdentificacao,
  type ErroDaApi,
  type IdentificacaoDaApi,
} from "@simpleclick/contracts";

/** Endereço do sinal de vida, tal como o contrato o declara. */
export const CAMINHO_DA_IDENTIFICACAO = rotaDeIdentificacao.caminho;

export type LeituraDaIdentificacao =
  | { readonly lida: true; readonly identificacao: IdentificacaoDaApi }
  | { readonly lida: false; readonly motivo: string };

/**
 * Confere a resposta da raiz da API contra o contrato.
 *
 * Devolve o motivo em vez de lançar: resposta fora do contrato é informação de
 * tela ("a API respondeu algo que não entendemos"), não falha de programação.
 */
export function lerIdentificacao(bruto: unknown): LeituraDaIdentificacao {
  const parecer = esquemaDeIdentificacaoDaApi.safeParse(bruto);
  if (parecer.success) return { lida: true, identificacao: parecer.data };

  const campos = parecer.error.issues
    .map((reclamacao) => reclamacao.path.join(".") || "(raiz)")
    .join(", ");
  return { lida: false, motivo: `resposta fora do contrato em: ${campos}` };
}

/** Frase que a tela mostra sobre a API. */
export function descreverIdentificacao(
  identificacao: IdentificacaoDaApi,
): string {
  return `${identificacao.servico} está ${identificacao.status}`;
}

/** Confere um corpo de erro da API; devolve `null` quando não é um. */
export function lerErroDaApi(bruto: unknown): ErroDaApi | null {
  const parecer = esquemaDeErro.safeParse(bruto);
  return parecer.success ? parecer.data : null;
}

/**
 * Texto de erro para a tela.
 *
 * Prefere a mensagem que a API mandou; sem ela, mostra o código. Nunca inventa
 * detalhe interno, que é o que AC-024 e P-009 proíbem chegar ao navegador.
 */
export function mensagemDoErro(erro: ErroDaApi): string {
  const base = erro.mensagem ?? `a API recusou com o código ${erro.erro}`;
  return erro.referencia === undefined
    ? base
    : `${base} (referência ${erro.referencia})`;
}
