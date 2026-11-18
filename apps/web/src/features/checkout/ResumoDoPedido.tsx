/**
 * Resumo de valores do pedido, na tela do fechamento (AC-507).
 *
 * Esta tela NÃO faz conta. Ela recebe as linhas já em texto de
 * `apps/web/src/server/resumo-de-valores.ts`, que é a única camada autorizada a
 * conversar com o cálculo. Um componente que soma os próprios números é um
 * componente que, um dia, soma diferente do pedido que foi guardado — e a
 * divergência aparece no extrato, não na tela.
 *
 * A marcação é uma lista de descrição (`dl`) porque é exatamente disso que se
 * trata: pares de nome e valor. Uma tabela prometeria linhas e colunas que não
 * existem, e uma pilha de `div` não diria nada a quem usa leitor de tela.
 */
import { useId } from "react";
import { Aviso, type EstadoDaTela } from "@simpleclick/ui";

/** Uma linha do resumo, já formatada pelo servidor. */
export interface LinhaDoResumo {
  readonly chave: string;
  readonly rotulo: string;
  readonly valor: string;
  readonly observacao?: string | undefined;
}

export interface ResumoDoPedidoProps {
  readonly linhas: readonly LinhaDoResumo[];
  readonly rotuloDoTotal: string;
  readonly total: string;
  /** Frase do que impede fechar; nulo quando o pedido pode seguir (AC-908). */
  readonly impedimento?: string | null | undefined;
  readonly estado?: EstadoDaTela | undefined;
  /**
   * O total ainda é uma estimativa: a taxa só é confirmada quando o pedido é
   * criado. A nota fica FORA da lista de descrição, para cada valor continuar
   * ligado ao próprio rótulo.
   */
  readonly estimativa?: boolean | undefined;
}

export function ResumoDoPedido({
  linhas,
  rotuloDoTotal,
  total,
  impedimento,
  estado = "pronto",
  estimativa = false,
}: ResumoDoPedidoProps) {
  const idDoTitulo = useId();

  // Uma seção com título, e não um cartão dentro da janela: no fechamento o
  // resumo é o último bloco antes do botão, e caixa dentro de caixa só pesa.
  return (
    <section
      className="sc-fechar__grupo sc-resumo-bloco"
      aria-labelledby={idDoTitulo}
    >
      <h3 className="sc-fechar__titulo" id={idDoTitulo}>
        Resumo do pedido
      </h3>
      {estado === "carregando" ? (
        <p role="status">Calculando os valores do seu pedido…</p>
      ) : null}
      <dl className="sc-resumo">
        {linhas.map((linha) => (
          <div className="sc-resumo__linha" key={linha.chave}>
            <dt className="sc-resumo__rotulo">{linha.rotulo}</dt>
            <dd className="sc-resumo__valor">
              {linha.valor}
              {linha.observacao ? (
                // A observação fica DENTRO do valor de propósito: lida em voz
                // alta, "R$ 0,00 entrega grátis" é uma informação só. Separada,
                // vira um texto solto que não se sabe a que linha pertence.
                <span className="sc-resumo__observacao">
                  {" "}
                  {linha.observacao}
                </span>
              ) : null}
            </dd>
          </div>
        ))}
        <div className="sc-resumo__linha sc-resumo__linha--total">
          <dt className="sc-resumo__rotulo">{rotuloDoTotal}</dt>
          <dd className="sc-resumo__valor">{total}</dd>
        </div>
      </dl>

      {estimativa ? (
        <p className="sc-resumo__estimativa">
          Valor estimado: a taxa de entrega é confirmada quando o pedido é
          criado.
        </p>
      ) : null}

      {impedimento ? (
        <Aviso tom="atencao" titulo="Ainda não dá para fechar">
          {impedimento}
        </Aviso>
      ) : null}
    </section>
  );
}
