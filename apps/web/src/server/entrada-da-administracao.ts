/**
 * A entrada própria da administração (`/admin/entrar`, card #11).
 *
 * O login é o MESMO do `/entrar` (a ponte `/api/auth/*`, o segundo fator, os
 * cookies, a origem e o limite de tentativas não mudam). O que muda é quem
 * decide para onde a pessoa vai depois: a página do SERVIDOR, pelo grant ao
 * vivo de `GET /v1/eu` (`euDoPedidoAtual`), e não o `redirecionarPara` da
 * ponte nem o cliente. Assim:
 *
 * - administrador confirmado vai para o `/admin` (ou para o `proximo`, se for
 *   um caminho do próprio `/admin`);
 * - qualquer outra conta logada NÃO é levada ao `/admin`: vê uma mensagem
 *   neutra, com o caminho de volta para a própria área;
 * - sem sessão, o formulário; com a API fora do ar, o formulário com um aviso
 *   (nada de "sem acesso" falso, nem redirecionamento).
 */
import { destinoSeguro } from "../lib/destino-seguro.ts";
import {
  DESTINO_DO_PAPEL,
  type DestinoDoPapel,
  papelDoEu,
} from "./area-do-papel.ts";
import type { EuDoPedido } from "./eu-do-pedido.ts";

/** O que a página `/admin/entrar` faz com o pedido. */
export type EntradaDaAdministracao =
  | { readonly acao: "ir"; readonly destino: string }
  | { readonly acao: "sem-acesso"; readonly areaDoPapel: DestinoDoPapel }
  | { readonly acao: "formulario"; readonly indisponivel: boolean };

/** Origem inventada só para ler o caminho do destino já conferido. */
const BASE = "https://site.invalid";

/**
 * O `proximo` só vale se for um caminho do próprio `/admin`, já aprovado pela
 * regra única (`destinoSeguro`, que recusa endereço de fora e as telas de
 * acesso, inclusive `/admin/entrar`). Barra repetida no caminho é recusada
 * (o Next a normaliza e ela poderia levar de volta à entrada). A consulta não
 * entra na conferência.
 */
export function destinoDaAdministracao(proximo: unknown): string | undefined {
  const seguro = destinoSeguro(proximo);
  if (seguro === undefined) return undefined;
  const caminho = new URL(seguro, BASE).pathname;
  if (caminho.includes("//")) return undefined;
  if (caminho !== "/admin" && !caminho.startsWith("/admin/")) return undefined;
  return seguro;
}

/** Os parâmetros do endereço como a página do Next os entrega. */
export type ParametrosDoEndereco = Readonly<
  Record<string, string | string[] | undefined>
>;

/**
 * Os parâmetros do endereço como `URLSearchParams`, com UM valor por nome:
 * o que vier repetido (`?proximo=a&proximo=b`) é descartado, para nenhuma
 * conferência ler um valor e o navegador usar outro.
 */
export function parametrosDoEndereco(
  parametros: ParametrosDoEndereco,
): URLSearchParams {
  const lidos = new URLSearchParams();
  for (const [nome, valor] of Object.entries(parametros)) {
    if (typeof valor === "string") lidos.set(nome, valor);
  }
  return lidos;
}

/** A decisão da entrada, sem efeito colateral. */
export function decidirEntradaDaAdministracao(
  leitura: EuDoPedido,
  proximo: unknown,
): EntradaDaAdministracao {
  if (leitura.estado === "sem-sessao") {
    return { acao: "formulario", indisponivel: false };
  }
  if (leitura.estado === "indisponivel") {
    return { acao: "formulario", indisponivel: true };
  }
  const papel = papelDoEu(leitura.eu);
  if (papel === "admin") {
    return {
      acao: "ir",
      destino: destinoDaAdministracao(proximo) ?? DESTINO_DO_PAPEL.admin,
    };
  }
  return { acao: "sem-acesso", areaDoPapel: DESTINO_DO_PAPEL[papel] };
}
