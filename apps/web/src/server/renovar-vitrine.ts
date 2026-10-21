/**
 * Depois que o dono grava algo que a vitrine mostra (imagem, tema, foto do
 * produto), o site esquece a vitrine dele NA HORA.
 *
 * Sem isto, a página da loja, o cardápio e a página do produto continuavam
 * mostrando a versão de antes por até um minuto — o dono trocava a logo, abria
 * a loja e via a velha. Quem avisa o site pela API (`SEGREDO_DE_REVALIDACAO`)
 * cobre a produção; aqui o próprio site, que acabou de encaminhar a gravação,
 * faz a renovação sem depender de configuração nenhuma (é o que vale no
 * desenvolvimento).
 *
 * Duas frentes, porque o cache do Next tem duas portas: a etiqueta da vitrine
 * (as leituras da API) e o caminho de cada página (o HTML pronto). A gravação
 * já foi confirmada quando isto roda: falhar aqui nunca desfaz nada, só deixa
 * o prazo de validade assumir.
 */
import { revalidatePath } from "next/cache";

import { vencerVitrineNoSite, type MotorDeCacheDoSite } from "./cache.ts";

const PAGINAS_DA_LOJA = ["", "/sobre", "/cardapio", "/carrinho", "/checkout"];

export function renovarVitrineDaLoja(
  apelido: string,
  motor?: MotorDeCacheDoSite,
): void {
  try {
    vencerVitrineNoSite(apelido, motor);
  } catch {
    // Fora do contexto do Next (ou apelido impossível): o prazo assume.
  }
  for (const pagina of PAGINAS_DA_LOJA) {
    try {
      revalidatePath(`/loja/${apelido}${pagina}`);
    } catch {
      // idem
    }
  }
}

/** Verbos que gravam; leitura não renova nada. */
const VERBOS_QUE_GRAVAM = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Renova só quando a gravação deu certo (2xx) e o verbo grava. */
export function renovarAposGravar(
  apelido: string,
  metodo: string,
  status: number,
): void {
  if (!VERBOS_QUE_GRAVAM.has(metodo.toUpperCase())) return;
  if (status < 200 || status >= 300) return;
  renovarVitrineDaLoja(apelido);
}
