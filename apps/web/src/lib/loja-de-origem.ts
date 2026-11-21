/**
 * A loja de onde a pessoa veio, para a conta oferecer "Voltar à loja"
 * (card #135, AC-11123).
 *
 * O proxy anota o apelido num cookie só do servidor (`httpOnly`) quando o
 * navegador abre uma página de loja; a conta lê o cookie e PERGUNTA À API se
 * a loja existe. O link sai com o apelido da RESPOSTA da API, nunca com o
 * texto do cookie nem com um parâmetro do endereço.
 *
 * Mora em `lib/` porque o proxy e o servidor usam a mesma regra.
 */
import { destinoSeguro } from "./destino-seguro.ts";
import { ehRotaDaTv } from "./rota-da-tv.ts";

export const COOKIE_DA_LOJA_DE_ORIGEM = "sc_loja_de_origem";

/** Uma semana: depois disso a conta deixa de oferecer a volta. */
export const DURACAO_DA_LOJA_DE_ORIGEM_EM_SEGUNDOS = 7 * 24 * 60 * 60;

/**
 * O formato do apelido da loja (o mesmo de `FORMATO_DO_APELIDO` do contrato):
 * minúsculas, números e hífen, sem hífen nas pontas, até 63 caracteres.
 * Repetido aqui para o proxy não carregar o pacote de contratos inteiro.
 */
const FORMATO_DO_APELIDO = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])$/;

/** O apelido, se tiver o formato de apelido; qualquer outra coisa vira `undefined`. */
export function apelidoDeOrigemValido(valor: unknown): string | undefined {
  if (typeof valor !== "string") return undefined;
  return FORMATO_DO_APELIDO.test(valor) ? valor : undefined;
}

/**
 * O apelido da loja de um caminho do site (`/loja/<apelido>` e o que vem
 * depois). O caminho passa antes pelo `destinoSeguro` do #105, e o cardápio
 * da TV não conta (é a tela da loja, não uma visita de cliente). O que é "a
 * rota da TV" tem UMA definição, `ehRotaDaTv`, a mesma que tira o aviso de
 * cookies da TV (card #137).
 */
export function apelidoDaLojaNoCaminho(caminho: string): string | undefined {
  const seguro = destinoSeguro(caminho);
  if (seguro === undefined) return undefined;
  const soCaminho = seguro.split(/[?#]/, 1)[0] ?? "";
  if (ehRotaDaTv(soCaminho)) return undefined;
  const achado = /^\/loja\/([^/]+)/.exec(soCaminho);
  if (achado === null) return undefined;
  return apelidoDeOrigemValido(achado[1]);
}
