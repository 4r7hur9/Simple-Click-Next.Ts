/**
 * A marca sobre o cartão de um produto indisponível: "esgotado" ou "fora do
 * horário" (AC-321, AC-322).
 *
 * O PRODUTO CONTINUA VISÍVEL, e isso é decisão de negócio, não de estilo. Sumir
 * com o que acabou faz a vitrine encolher e reaparecer sozinha ao longo do dia,
 * e quem procurou a coxinha de ontem conclui que a loja parou de vender
 * coxinha. Vendo-a marcada como esgotada, a pessoa entende que ela existe e
 * volta amanhã — e o dono não perde o cliente junto com o estoque.
 *
 * O MOTIVO VAI NO SELO porque são duas coisas diferentes para quem lê: "acabou"
 * é "volte amanhã"; "fora do horário" é "volte no sábado" — a feijoada não
 * acabou, ela é de sábado. Um selo só, dizendo "esgotado" para as duas, faria o
 * cliente achar que a loja vive sem feijoada.
 *
 * O que NÃO é decidido aqui é o impedimento de comprar: isso mora na página do
 * produto (AC-413, T-405), onde existe o botão que precisa ser barrado. Uma
 * vitrine que também barrasse teria duas cópias da mesma regra.
 */
import type { MotivoDoCartao } from "../../lib/catalogo.ts";

export interface CartaoEsgotadoProps {
  /** Sem motivo (cliente antigo da API), vale "esgotado", que é o mais comum. */
  readonly motivo?: MotivoDoCartao | null | undefined;
}

/** O que o selo escreve para cada motivo. */
export const TEXTO_DO_SELO: Readonly<Record<MotivoDoCartao, string>> = {
  ESGOTADO: "Esgotado",
  FORA_DO_HORARIO: "Fora do horário",
};

/** A faixa que atravessa a imagem do produto que não está à venda agora. */
export function CartaoEsgotado({ motivo = null }: CartaoEsgotadoProps) {
  return (
    <span className="sc-vitrine__esgotado">
      {/*
        O texto NÃO é `aria-hidden`: quem usa leitor de tela precisa ouvir que
        acabou antes de abrir o produto, e não depois. Ele é lido junto do nome
        porque está dentro do mesmo link.
      */}
      <span className="sc-vitrine__esgotado-selo">
        {TEXTO_DO_SELO[motivo ?? "ESGOTADO"]}
      </span>
    </span>
  );
}
