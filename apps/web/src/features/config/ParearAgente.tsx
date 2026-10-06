"use client";
/**
 * Parear o agente de impressão com a loja (T-608 — AC-623).
 *
 * O dono gera aqui um código de seis dígitos e o digita no agente, no
 * computador da loja. O código vale por poucos minutos e serve uma vez; gerar
 * outro invalida o anterior, e parear um agente novo desliga o antigo — uma
 * impressora por loja. O agente recebe uma credencial própria, que nunca é a
 * sessão do dono.
 *
 * Os quatro estados: nada gerado ainda (o convite), gerando, código na tela,
 * e a falha — que diz o que fazer em vez de só "erro".
 */
import { useState } from "react";
import { Aviso, Botao } from "@simpleclick/ui";

import {
  escreverHorarioDaImpressao,
  pedirCodigoDePareamento,
  type CodigoDePareamento,
} from "../../lib/impressao-automatica.ts";

type Fase =
  | { readonly tipo: "inicio" }
  | { readonly tipo: "gerando" }
  | { readonly tipo: "pronto"; readonly codigo: CodigoDePareamento }
  | { readonly tipo: "falhou" };

export interface ParearAgenteProps {
  /** Quem pede o código. A prova troca por um que responde sem rede. */
  readonly pedirCodigo?: (() => Promise<CodigoDePareamento | null>) | undefined;
}

export function ParearAgente({
  pedirCodigo = () => pedirCodigoDePareamento(),
}: ParearAgenteProps = {}) {
  const [fase, setFase] = useState<Fase>({ tipo: "inicio" });

  async function gerar(): Promise<void> {
    setFase({ tipo: "gerando" });
    const codigo = await pedirCodigo();
    setFase(codigo === null ? { tipo: "falhou" } : { tipo: "pronto", codigo });
  }

  return (
    <section
      aria-labelledby="titulo-parear-agente"
      className="mt-10 max-w-2xl space-y-4 border-t border-[var(--cor-borda)] pt-8"
    >
      <h2 id="titulo-parear-agente" className="text-2xl font-semibold">
        Parear o agente de impressão
      </h2>
      <ol className="list-decimal space-y-1 pl-5 text-[var(--cor-tinta-suave)]">
        <li>
          Instale o agente de impressão no computador ligado à impressora.
        </li>
        <li>Gere um código abaixo.</li>
        <li>
          No agente, informe o apelido da loja (o mesmo do endereço da sua
          vitrine) e o código.
        </li>
      </ol>

      {fase.tipo === "pronto" ? (
        <div
          className="rounded-[var(--raio-grande)] border border-[var(--cor-borda)] bg-[var(--cor-superficie)] p-4"
          data-codigo-de-pareamento=""
        >
          <p className="text-sm text-[var(--cor-tinta-suave)]">
            Código de pareamento
          </p>
          <output
            aria-live="polite"
            className="mt-1 block font-mono text-4xl font-semibold tabular-nums tracking-[0.3em]"
          >
            {fase.codigo.codigo}
          </output>
          <p className="mt-2 text-sm text-[var(--cor-tinta-suave)]">
            Vale até {escreverHorarioDaImpressao(fase.codigo.expiraEm)} e serve
            uma vez. Gerar outro código invalida este; parear um agente novo
            desliga o anterior.
          </p>
        </div>
      ) : null}

      {fase.tipo === "falhou" ? (
        <Aviso tom="erro">
          Não foi possível gerar o código agora. Confira a conexão e tente de
          novo.
        </Aviso>
      ) : null}

      <Botao
        variante={fase.tipo === "pronto" ? "secundaria" : "primaria"}
        carregando={fase.tipo === "gerando"}
        rotuloDeEspera="Gerando o código…"
        onClick={() => void gerar()}
      >
        {fase.tipo === "pronto"
          ? "Gerar outro código"
          : "Gerar código de pareamento"}
      </Botao>
    </section>
  );
}
