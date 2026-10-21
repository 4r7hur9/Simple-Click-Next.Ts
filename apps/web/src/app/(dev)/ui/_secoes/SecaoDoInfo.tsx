"use client";

// Vitrine do "i" (Info): campos explicados no fluxo normal, numa caixa com
// rolagem própria e `overflow: hidden`, encostados na borda direita e dentro
// de uma janela modal. É o alvo das capturas que provam que o balão não cobre
// o controle nem sai da tela.
import { useRef } from "react";
import {
  Botao,
  Campo,
  Info,
  Seletor,
  descritoresDoCampo,
} from "@simpleclick/ui";

import { Secao } from "./SecaoDaVitrine.tsx";

const ACRESCIMO = {
  titulo: "Acréscimo",
  texto:
    "Valor somado ao preço do produto quando o cliente marca esta opção. Deixe vazio se a opção não custa nada a mais.",
  exemplo: "Borda recheada de catupiry: + R$ 8,00 na pizza.",
};

const ESTOQUE_MINIMO = {
  texto:
    "Quando a quantidade em estoque chegar neste número, o painel avisa que está acabando. O produto continua à venda até zerar.",
  exemplo: "Com 5, você é avisado ao sobrar a 5ª lata de óleo de motor.",
};

/** Campos com "i" em todos os lugares onde um balão costuma ser cortado. */
export function SecaoDoInfo() {
  const janela = useRef<HTMLDialogElement>(null);

  return (
    <Secao
      descricao="O 'i' fica na linha do rótulo, logo depois do texto. O balão abre por clique, toque, Enter ou Espaço (hover só com mouse), fecha com Esc, clique fora ou rolagem, e nasce fora da caixa para não ser cortado."
      id="secao-info"
      titulo="Info (campo explicado)"
    >
      <div className="grid gap-4 sm:grid-cols-2" id="info-campos">
        <Campo
          id="info-acrescimo"
          inputMode="decimal"
          info={ACRESCIMO}
          rotulo="Acréscimo (R$)"
        />
        <Campo
          dica="Use vírgula para os gramas: 0,350."
          id="info-peso"
          inputMode="decimal"
          info={{
            texto:
              "Peso do produto já embalado. É usado para calcular o frete quando a entrega é por transportadora.",
            exemplo: "Um kit de pastilha de freio embalado: 0,800 kg.",
          }}
          rotulo="Peso (kg)"
        />
        <Campo
          controle={
            <Seletor
              aria-describedby={descritoresDoCampo("info-cobranca", {
                info: true,
              }).join(" ")}
              defaultValue="unidade"
              id="info-cobranca"
            >
              <option value="unidade">Por unidade</option>
              <option value="peso">Por peso (kg)</option>
            </Seletor>
          }
          id="info-cobranca"
          info={{
            texto:
              "Diz como o preço é contado no carrinho. Por peso, o cliente escolhe quantos quilos quer e o preço é multiplicado.",
            exemplo: "Queijo coalho vendido por peso: R$ 49,90 o kg.",
          }}
          rotulo="Forma de cobrar"
        />
        <div className="flex items-center justify-end gap-1 self-end" id="info-borda">
          <span className="text-sm">Na borda direita</span>
          <Info
            conteudo="O balão escorrega para dentro da tela e a seta continua apontando para este ícone."
            rotulo="o balão na borda"
          />
        </div>
      </div>

      <div
        className="max-h-40 overflow-hidden overflow-y-auto rounded-xl border border-borda p-4"
        id="info-rolagem"
      >
        <p className="mb-3 text-sm">
          Caixa com rolagem própria e overflow escondido:
        </p>
        <Campo id="info-minimo" info={ESTOQUE_MINIMO} rotulo="Estoque mínimo (un.)" />
        <div className="h-40" />
      </div>

      <div>
        <Botao
          variante="secundaria"
          onClick={() => janela.current?.showModal()}
        >
          Abrir janela com campo explicado
        </Botao>
        {/* `showModal()`: a janela vai para a camada de topo e o resto da
            página fica inerte — o caso mais difícil para um balão. */}
        <dialog
          aria-labelledby="info-janela-titulo"
          aria-modal="true"
          className="sc-dialogo m-auto"
          id="info-janela"
          ref={janela}
        >
          <div className="sc-dialogo__corpo">
            <h3 className="sc-dialogo__titulo" id="info-janela-titulo">
              Opção do produto
            </h3>
            <Campo
              id="info-acrescimo-janela"
              info={ACRESCIMO}
              rotulo="Acréscimo (R$)"
            />
            <Botao variante="secundaria" onClick={() => janela.current?.close()}>
              Fechar
            </Botao>
          </div>
        </dialog>
      </div>
    </Secao>
  );
}
