/**
 * O catálogo público, pedido direto do NAVEGADOR (AC-928, AC-929).
 *
 * POR QUE ESTA CHAMADA NÃO PASSA PELO SERVIDOR DO SITE. A televisão fica
 * ligada o dia inteiro e precisa saber, sem recarregar a página, que o dono
 * mudou um preço. O servidor do Next guarda o catálogo por um minuto e só o
 * entrega numa página nova; o navegador falando com a API recebe o catálogo
 * como ele está agora — e é o mesmo caminho que o carrinho já usa
 * (`carrinho-do-navegador.ts`), porque leitura pública passa pela lista de
 * origens sem restrição (AC-127).
 *
 * MORA EM `lib` porque é daqui que o componente pode alcançá-la: a tabela de
 * fronteiras não deixa `features` chegar a `server`.
 */
import {
  esquemaDoCatalogo,
  type CatalogoDaVitrineNoContrato,
} from "@simpleclick/contracts";

/** O que a televisão recebe: o catálogo, ou o motivo de não haver catálogo. */
export type ResultadoDoCatalogoNoNavegador =
  | {
      readonly estado: "encontrado";
      readonly catalogo: CatalogoDaVitrineNoContrato;
    }
  | { readonly estado: "falhou"; readonly motivo: string };

/**
 * O endereço da API como o NAVEGADOR o vê.
 *
 * Precisa ser `NEXT_PUBLIC_`: o valor é embutido na página durante a
 * construção, e a variável privada do servidor não chega ao navegador.
 */
function enderecoDaApiNoNavegador(): string {
  return (
    process.env["NEXT_PUBLIC_API_URL"] ?? "https://api.simpleclick.localhost"
  ).replace(/\/+$/, "");
}

/**
 * Busca o catálogo público da loja, como ele está agora.
 *
 * `cache: "no-store"` porque a pergunta é justamente "o que mudou": uma cópia
 * guardada pelo navegador devolveria o mesmo catálogo o dia inteiro.
 */
export async function buscarCatalogoDaLoja(
  apelido: string,
  buscar: typeof fetch = fetch,
): Promise<ResultadoDoCatalogoNoNavegador> {
  const endereco = `${enderecoDaApiNoNavegador()}/v1/vitrine/${encodeURIComponent(apelido)}/catalogo`;

  let resposta: Response;
  try {
    resposta = await buscar(endereco, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : "falha de rede";
    return { estado: "falhou", motivo };
  }

  if (!resposta.ok) {
    return {
      estado: "falhou",
      motivo: `a API respondeu ${String(resposta.status)}`,
    };
  }

  let corpo: unknown;
  try {
    corpo = await resposta.json();
  } catch {
    return { estado: "falhou", motivo: "a API respondeu algo que não é JSON" };
  }

  const conferido = esquemaDoCatalogo.safeParse(corpo);
  if (!conferido.success) {
    return {
      estado: "falhou",
      motivo: "a resposta da API não bate com o contrato publicado",
    };
  }

  return { estado: "encontrado", catalogo: conferido.data };
}
