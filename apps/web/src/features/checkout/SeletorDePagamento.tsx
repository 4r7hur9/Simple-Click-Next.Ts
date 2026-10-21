"use client";

/**
 * Escolha da forma de pagamento no fechamento (AC-512, AC-513).
 *
 * As opções vêm PRONTAS do servidor, calculadas por
 * `apps/api/src/modules/orders/pagamento.ts`. A tela não decide o que a loja
 * aceita — decidir aqui faria a lista da tela e a regra do servidor divergirem,
 * e o cliente escolheria uma forma que a criação do pedido depois recusa.
 *
 * NENHUM CAMPO DE CARTÃO existe aqui, e nem pode existir: "cartão na entrega" é
 * uma combinação com o entregador, não uma cobrança do sistema (AC-513). A
 * ausência tem prova própria, em `infra/tests/sem-cobranca.test.ts`, porque
 * promessa sem verificação dura até a primeira pressa.
 *
 * A escolha é um grupo de botões de rádio dentro de `fieldset` com `legend`.
 * É o que faz um leitor de tela anunciar "Forma de pagamento, PIX, 1 de 3" em
 * vez de ler três botões soltos sem dizer do que se trata.
 */
import { useId, useState } from "react";
import { Campo } from "@simpleclick/ui";

/** Uma forma oferecida, como o servidor a descreve. */
export interface FormaParaEscolher {
  readonly forma: string;
  readonly rotulo: string;
  readonly perguntaTroco: boolean;
}

export interface SeletorDePagamentoProps {
  readonly formas: readonly FormaParaEscolher[];
  readonly escolhida?: string | undefined;
  readonly aoEscolher?: ((forma: string) => void) | undefined;
  /** Total do pedido em centavos, usado na dica do troco. */
  readonly totalEmCentavos?: number | undefined;
  /** O troco como a pessoa digitou ("100" ou "100,00"); sem ele, o campo fica solto. */
  readonly troco?: string | undefined;
  readonly aoMudarTroco?: ((valor: string) => void) | undefined;
  /** Recusa do troco (menor que o total, valor que não é dinheiro). */
  readonly erroDoTroco?: string | undefined;
}

export function SeletorDePagamento({
  formas,
  escolhida,
  aoEscolher,
  totalEmCentavos,
  troco,
  aoMudarTroco,
  erroDoTroco,
}: SeletorDePagamentoProps) {
  const prefixo = useId();
  const [selecionada, setSelecionada] = useState(escolhida ?? formas[0]?.forma);

  function escolher(forma: string) {
    setSelecionada(forma);
    aoEscolher?.(forma);
  }

  const atual = formas.find((item) => item.forma === selecionada);

  return (
    <fieldset className="sc-pagamento">
      <legend className="sc-pagamento__titulo">Forma de pagamento</legend>

      {formas.map((item) => {
        const identificador = `${prefixo}-${item.forma}`;
        return (
          <div className="sc-pagamento__opcao" key={item.forma}>
            <input
              type="radio"
              id={identificador}
              name={`${prefixo}-forma`}
              value={item.forma}
              checked={selecionada === item.forma}
              onChange={() => escolher(item.forma)}
            />
            <label htmlFor={identificador}>{item.rotulo}</label>
          </div>
        );
      })}

      {atual?.perguntaTroco ? (
        <Campo
          id={`${prefixo}-troco`}
          name="trocoPara"
          rotulo="Precisa de troco? Para quanto (R$)"
          dica={
            totalEmCentavos === undefined
              ? "Opcional. Escreva a nota que vai usar, ex.: 100. Deixe em branco se tiver o valor exato."
              : `Opcional. Escreva a nota que vai usar, ex.: 100. O pedido está em ${emReaisSimples(totalEmCentavos)}; deixe em branco se tiver o valor exato.`
          }
          placeholder="Ex.: 100,00"
          inputMode="decimal"
          autoComplete="off"
          {...(troco === undefined
            ? {}
            : {
                value: troco,
                onChange: (evento: { target: { value: string } }) =>
                  aoMudarTroco?.(evento.target.value),
              })}
          {...(erroDoTroco ? { erro: erroDoTroco } : {})}
        />
      ) : null}
    </fieldset>
  );
}

/**
 * Escreve centavos como dinheiro para a dica do campo.
 *
 * É uma cópia curta de propósito: a tabela de fronteiras não autoriza esta
 * camada a importar as regras, e trazer o pacote inteiro para formatar uma dica
 * abriria a porta para a tela fazer conta — que é o que a fronteira existe para
 * impedir. O que se paga aqui são cinco linhas sem regra de negócio nenhuma.
 */
function emReaisSimples(centavos: number): string {
  const inteiro = Math.trunc(centavos / 100);
  const resto = String(centavos % 100).padStart(2, "0");
  return `R$ ${inteiro},${resto}`;
}
