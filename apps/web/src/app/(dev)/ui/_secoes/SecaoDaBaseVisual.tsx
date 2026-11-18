// A base visual do redesign Stitch (card #104): as peças novas em cada estado,
// no tema claro, no escuro e dentro de uma loja (sem cor própria).
// Os exemplos são de ramos variados e não trazem dado nem imagem do Stitch.
import { TemaDaMarca } from "@simpleclick/ui";

import { DemosDaBaseVisual, type RamoDeExemplo } from "./DemosDaBaseVisual.tsx";
import { Secao } from "./SecaoDaVitrine.tsx";

const PAINEIS_DE_TEMA = [
  {
    ramo: "lanchonete",
    nome: "Tema claro",
    prefixo: "bv-claro",
    tema: "claro",
    tom: "sucesso",
  },
  {
    ramo: "mercado",
    nome: "Tema escuro",
    prefixo: "bv-escuro",
    tema: "escuro",
    tom: "erro",
  },
] as const satisfies readonly {
  ramo: RamoDeExemplo;
  nome: string;
  prefixo: string;
  tema: "claro" | "escuro";
  tom: "sucesso" | "erro";
}[];

const MOLDURA =
  "sc-raiz flex min-w-0 flex-col gap-4 rounded-[var(--raio-janela)] border border-borda p-5";

export function SecaoDaBaseVisual() {
  return (
    <Secao
      descricao="Botão, campo, chips, abas, gaveta, aviso flutuante, barra inferior, cartão e ícones em cada estado. Cada painel fixa o próprio tema; o último é uma loja, que usa o mesmo verde."
      id="secao-base-visual"
      titulo="Base visual do redesign"
    >
      <div className="grid min-w-0 gap-4">
        {PAINEIS_DE_TEMA.map(({ nome, prefixo, ramo, tema, tom }) => (
          <div className={MOLDURA} data-tema={tema} key={prefixo}>
            <h3 className="font-display text-lg font-semibold">{nome}</h3>
            <DemosDaBaseVisual
              nome={nome}
              prefixo={prefixo}
              ramo={ramo}
              tom={tom}
            />
          </div>
        ))}

        <TemaDaMarca>
          {/* A loja segue o tema do aparelho (card #131): o painel não fixa
              fundo nem tema. */}
          <div className={MOLDURA}>
            <h3 className="font-display text-lg font-semibold">
              Dentro de uma loja (sempre o verde SimpleClick)
            </h3>
            <DemosDaBaseVisual
              nome="Loja de moda"
              prefixo="bv-loja"
              ramo="moda"
              tom="sucesso"
            />
          </div>
        </TemaDaMarca>
      </div>
    </Secao>
  );
}
