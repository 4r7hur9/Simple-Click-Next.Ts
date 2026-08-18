/**
 * Traduz o cálculo dos valores para as linhas que a tela imprime (AC-507).
 *
 * POR QUE ESTA PEÇA EXISTE, em vez de a tela chamar o cálculo direto. A tabela
 * de fronteiras de `.spec/design/arquitetura.md` não autoriza `web-features` a
 * importar `packages/core` — só esta camada pode. Não é burocracia: é o que
 * garante que a conta do dinheiro acontece em UM lugar, do lado do servidor, e
 * que a tela não tem como recalcular nada por conta própria. Componente que
 * soma seus próprios números é componente que, um dia, soma diferente do
 * pedido que foi guardado.
 *
 * O que sai daqui é texto pronto para ler. A tela não formata dinheiro, não
 * decide o nome da linha e não sabe o que é entrega grátis — ela desenha.
 */
import { emReais, type ResumoDeValores } from "@simpleclick/core";

/** Uma linha do resumo: o que se lê à esquerda e o valor à direita. */
export interface LinhaDoResumo {
  /** Chave estável para a tela e para o teste — não é o que aparece na tela. */
  readonly chave: string;
  readonly rotulo: string;
  readonly valor: string;
  /** Explicação curta ao lado do valor, como "entrega grátis". */
  readonly observacao?: string;
}

/** O resumo já em texto, do jeito que a tela recebe (AC-507). */
export interface ResumoParaTela {
  readonly linhas: readonly LinhaDoResumo[];
  readonly rotuloDoTotal: string;
  readonly total: string;
  /** Frase do que impede fechar, ou nulo quando o pedido pode seguir. */
  readonly impedimento: string | null;
}

/**
 * Monta as linhas do resumo na ordem em que a tela as mostra.
 *
 * A linha da taxa aparece SEMPRE que houve entrega, inclusive zerada: sumir com
 * ela quando a entrega sai de graça esconde do cliente justamente a informação
 * que ele mais quer ver, e faz o total parecer errado para quem esperava a taxa.
 */
export function montarResumoParaTela(resumo: ResumoDeValores): ResumoParaTela {
  const linhas: LinhaDoResumo[] = [
    {
      chave: "itens",
      rotulo: "Itens",
      valor: emReais(resumo.subtotalEmCentavos),
    },
  ];

  const taxa = resumo.taxaDeEntrega;
  if (taxa.modo === "ASK") {
    linhas.push({
      chave: "taxa",
      rotulo: taxa.nome ?? "Taxa de entrega",
      valor: "a combinar",
      observacao: "a loja informa o valor ao confirmar",
    });
  } else if (resumo.entregaGratis) {
    linhas.push({
      chave: "taxa",
      rotulo: taxa.nome ?? "Taxa de entrega",
      valor: emReais(0),
      observacao: "entrega grátis",
    });
  } else if (taxa.valorEmCentavos > 0) {
    linhas.push({
      chave: "taxa",
      rotulo: taxa.nome ?? "Taxa de entrega",
      valor: emReais(taxa.valorEmCentavos),
    });
  }

  return {
    linhas,
    rotuloDoTotal: "Total",
    total: emReais(resumo.totalEmCentavos),
    impedimento: resumo.impedimento?.explicacao ?? null,
  };
}
