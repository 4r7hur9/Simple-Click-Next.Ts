/**
 * Apagar a imagem que o dono trocou — sem nunca apagar uma que ainda está em uso.
 *
 * Quem troca a logo, a capa, o fundo ou o topo envia um arquivo novo (o nome é
 * único em cada envio) e o antigo ficaria para sempre no disco ou na nuvem. A
 * limpeza roda DEPOIS da gravação e é melhor esforço: se apagar falhar, a troca
 * já valeu e só sobra um arquivo órfão.
 *
 * Três proteções, porque apagar é o único passo sem volta:
 *
 * 1. só apaga o que a PRÓPRIA loja enviou (`chaveDaMidiaPelaUrl` recusa o seed,
 *    as imagens de outra loja e qualquer endereço colado à mão);
 * 2. não apaga o que ainda aparece em algum outro lugar da apresentação (a capa
 *    antiga e o fundo da vitrine são a mesma foto até o tema ser salvo);
 * 3. apagar nunca derruba a resposta.
 */
import { transacaoAtual } from "../../core/db.ts";
import type { ArmazenamentoDeImagens } from "../../core/midia.ts";

const CAMPOS_COM_IMAGEM = [
  "logo",
  "capa",
  "fundoVitrine",
  "topoCardapio",
  "fundoVitrineCelular",
  "topoCardapioCelular",
] as const;

/** Os endereços dos originais guardados junto dos ajustes das fotos. */
export function originaisDosAjustes(ajustes: unknown): string[] {
  if (typeof ajustes !== "object" || ajustes === null) return [];
  const originais: string[] = [];
  for (const ajuste of Object.values(ajustes)) {
    const original = (ajuste as { original?: unknown } | null)?.original;
    if (typeof original === "string" && original !== "") originais.push(original);
  }
  return originais;
}

/** O que a apresentação da loja do contexto usa agora. */
export interface ImagensEmUso {
  readonly lojaId: string;
  readonly enderecos: readonly string[];
}

/** Todas as imagens que a apresentação da loja do contexto usa agora. */
export async function imagensEmUsoDaLoja(): Promise<ImagensEmUso> {
  const [linha] = await transacaoAtual().$queryRaw<
    { store_id: string; landing: unknown }[]
  >`SELECT store_id::text AS store_id, landing FROM app.store_settings WHERE store_id = app.current_store_id()`;
  const landing =
    typeof linha?.landing === "object" && linha.landing !== null
      ? (linha.landing as Record<string, unknown>)
      : {};
  const enderecos: string[] = [];
  for (const campo of CAMPOS_COM_IMAGEM) {
    const valor = landing[campo];
    if (typeof valor === "string" && valor !== "") enderecos.push(valor);
  }
  // O original de cada foto (guardado para reabrir o ajuste) também está em uso.
  enderecos.push(...originaisDosAjustes(landing["ajustesDasFotos"]));
  return { lojaId: linha?.store_id ?? "", enderecos };
}

/** Apaga as `candidatas` que não estão em `emUso`. Nunca lança. */
export async function apagarImagensSubstituidas(
  armazenamento: ArmazenamentoDeImagens,
  lojaId: string,
  candidatas: readonly (string | null | undefined)[],
  emUso: readonly string[],
): Promise<void> {
  if (armazenamento.apagar === undefined) return;
  const vistas = new Set<string>();
  for (const endereco of candidatas) {
    if (endereco === null || endereco === undefined || endereco === "") continue;
    if (vistas.has(endereco) || emUso.includes(endereco)) continue;
    vistas.add(endereco);
    try {
      await armazenamento.apagar(endereco, lojaId);
    } catch {
      // Arquivo órfão não é motivo para desfazer a troca.
    }
  }
}
