"use client";

/**
 * Passo 4 do importador: o que foi gravado (card #61).
 *
 * O relatório de erros já vem pronto no resultado (CSV que abre no Excel); o
 * botão só o entrega ao navegador. Sem relatório, não há botão.
 */
import Link from "next/link";
import { Aviso, Botao, IconeVoltar } from "@simpleclick/ui";

import {
  baixarRelatorio,
  type ResultadoDaImportacao,
} from "../../../lib/importacao-de-clientes.ts";
import { Contagem } from "./PassoDaRevisao.tsx";

export interface PassoDoResultadoProps {
  readonly resultado: ResultadoDaImportacao;
  readonly aoRecomecar: () => void;
  /** Troca o download, na prova. */
  readonly baixar?: typeof baixarRelatorio | undefined;
}

export function PassoDoResultado({
  resultado,
  aoRecomecar,
  baixar = baixarRelatorio,
}: PassoDoResultadoProps) {
  const { criados, atualizados, repetidos, invalidos, foraDoLimite } =
    resultado;
  const completou = resultado.repetidosComo === "completar";

  return (
    <div className="grid gap-5">
      <Aviso
        tom={criados + atualizados > 0 ? "sucesso" : "atencao"}
        titulo={
          criados > 0
            ? `${criados.toLocaleString("pt-BR")} cliente${criados === 1 ? "" : "s"} importado${criados === 1 ? "" : "s"}`
            : "Nenhum cliente novo foi cadastrado"
        }
      >
        {resultado.arquivo.nome === null
          ? "A importação terminou."
          : `A importação de ${resultado.arquivo.nome} terminou.`}
      </Aviso>

      <dl className="m-0 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Contagem rotulo="Criados" valor={criados} tom="sucesso" />
        {completou ? (
          <Contagem
            rotulo="Completados"
            valor={atualizados}
            detalhe="fichas com campos vazios preenchidos"
          />
        ) : null}
        <Contagem
          rotulo="Repetidos"
          valor={repetidos.length}
          tom={repetidos.length > 0 ? "atencao" : "neutro"}
        />
        <Contagem
          rotulo="Inválidos"
          valor={invalidos.length}
          tom={invalidos.length > 0 ? "erro" : "neutro"}
        />
        {foraDoLimite.length > 0 ? (
          <Contagem
            rotulo="Fora do limite"
            valor={foraDoLimite.length}
            tom="erro"
            detalhe="a loja chegou ao limite de clientes"
          />
        ) : null}
      </dl>

      <div className="flex flex-wrap gap-3">
        {resultado.relatorio === null ? null : (
          <Botao
            variante="secundaria"
            onClick={() => {
              if (resultado.relatorio !== null) baixar(resultado.relatorio);
            }}
          >
            Baixar relatório de erros (CSV)
          </Botao>
        )}
        <Link className="sc-botao sc-botao--primaria" href="/painel/clientes">
          <IconeVoltar aria-hidden="true" />
          Ver lista de clientes
        </Link>
        <Botao variante="discreta" onClick={aoRecomecar}>
          Importar outro arquivo
        </Botao>
      </div>
    </div>
  );
}
