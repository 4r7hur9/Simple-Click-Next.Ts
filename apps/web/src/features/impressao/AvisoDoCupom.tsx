/**
 * Quando o cupom não sai: sessão vencida, pedido que não existe, API fora do
 * ar (T-606, P-011). Cada caso diz o que aconteceu e oferece a saída — nunca
 * uma folha em branco que o dono mandaria para a impressora.
 */

export type MotivoSemCupom =
  "sem-sessao" | "escolher-loja" | "nao-encontrado" | "indisponivel";

const TEXTO: Readonly<
  Record<
    MotivoSemCupom,
    {
      readonly titulo: string;
      readonly explicacao: string;
      readonly acao: string;
    }
  >
> = {
  "sem-sessao": {
    titulo: "Entre de novo para imprimir",
    explicacao:
      "Sua sessão terminou. Entre na sua conta e abra o pedido outra vez.",
    acao: "Entrar",
  },
  // Dono de mais de uma loja que ainda não escolheu, ou cuja escolha deixou
  // de valer (T-115): sem saber a loja, nenhuma via é emitida.
  "escolher-loja": {
    titulo: "Escolha a loja para imprimir",
    explicacao:
      "Sua conta tem mais de uma loja. Escolha a loja e abra o pedido outra vez. Nenhuma via foi contada.",
    acao: "Escolher a loja",
  },
  "nao-encontrado": {
    titulo: "Pedido não encontrado",
    explicacao:
      "Este pedido não existe ou não é da sua loja. Nenhuma via foi contada.",
    acao: "Voltar para a fila",
  },
  indisponivel: {
    titulo: "Não foi possível gerar o cupom agora",
    explicacao:
      "A impressão está indisponível neste momento. Tente de novo em alguns segundos.",
    acao: "Tentar de novo",
  },
};

function destino(motivo: MotivoSemCupom, pedidoId: string): string {
  if (motivo === "sem-sessao") return "/entrar";
  if (motivo === "escolher-loja") return "/escolher-loja";
  if (motivo === "nao-encontrado") return "/painel/pedidos";
  return `/imprimir/${encodeURIComponent(pedidoId)}`;
}

export function AvisoDoCupom({
  motivo,
  pedidoId,
}: {
  readonly motivo: MotivoSemCupom;
  readonly pedidoId: string;
}) {
  const texto = TEXTO[motivo];
  return (
    <section className="sc-cupom-aviso" role="alert">
      <h1 className="sc-cupom-aviso__titulo">{texto.titulo}</h1>
      <p>{texto.explicacao}</p>
      <a
        className="sc-botao sc-botao--primario"
        href={destino(motivo, pedidoId)}
      >
        {texto.acao}
      </a>
    </section>
  );
}
