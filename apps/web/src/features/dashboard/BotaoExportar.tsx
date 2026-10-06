"use client";

/**
 * Baixar a planilha do período em vigor (T-808; AC-815, AC-816).
 *
 * A PLANILHA É DO PERÍODO QUE ESTÁ NA TELA. O botão recebe o período em vigor
 * — e não o último que alguém tentou escolher —, então a planilha nunca cobre
 * um recorte diferente dos números que o dono está vendo.
 *
 * O ARQUIVO É BAIXADO PELA TELA, e não por um link direto: se a sessão
 * acabou ou a API recusou, o dono lê o motivo aqui, em vez de baixar um
 * arquivo com uma mensagem de erro dentro. O que vai na planilha (um pedido
 * por linha, sem telefone nem endereço) é decidido pela API; o texto abaixo
 * do botão só conta isso ao dono.
 */
import { useState } from "react";
import { Aviso, Botao } from "@simpleclick/ui";

import {
  baixarPlanilhaDoPeriodo,
  descreverPeriodo,
  escreverPedidos,
  type BaixarPlanilha,
  type ConsultaDoPeriodo,
  type PeriodoDeMetricasNoContrato,
} from "../../lib/metricas.ts";

/** Entrega o arquivo ao navegador, com o nome que a API deu a ele. */
export function salvarArquivo(arquivo: Blob, nome: string): void {
  const endereco = URL.createObjectURL(arquivo);
  const ancora = document.createElement("a");
  ancora.href = endereco;
  ancora.download = nome;
  ancora.hidden = true;
  document.body.append(ancora);
  ancora.click();
  ancora.remove();
  // O navegador já começou a baixar; o endereço temporário pode ir embora.
  setTimeout(() => URL.revokeObjectURL(endereco), 0);
}

export interface BotaoExportarProps {
  /** O período em vigor (nulo enquanto nenhum valeu). */
  readonly consulta: ConsultaDoPeriodo | null;
  readonly periodo: PeriodoDeMetricasNoContrato | null;
  /** Leitor da planilha. A prova troca por um que responde sem rede. */
  readonly baixar?: BaixarPlanilha | undefined;
  /** Quem entrega o arquivo ao navegador. */
  readonly salvar?: ((arquivo: Blob, nome: string) => void) | undefined;
}

type Situacao =
  | { readonly fase: "parada" }
  | { readonly fase: "baixando" }
  | { readonly fase: "baixada"; readonly texto: string }
  | { readonly fase: "falhou"; readonly texto: string };

export function BotaoExportar({
  consulta,
  periodo,
  baixar = baixarPlanilhaDoPeriodo,
  salvar = salvarArquivo,
}: BotaoExportarProps) {
  const [situacao, setSituacao] = useState<Situacao>({ fase: "parada" });

  async function exportar(): Promise<void> {
    if (consulta === null) return;
    setSituacao({ fase: "baixando" });
    const planilha = await baixar(consulta);

    if (planilha.estado === "ok") {
      salvar(planilha.arquivo, planilha.nome);
      const pedidos =
        planilha.quantidade === null
          ? ""
          : ` com ${escreverPedidos(planilha.quantidade)}`;
      const recorte =
        periodo === null ? "" : ` (${descreverPeriodo(periodo).frase})`;
      setSituacao({
        fase: "baixada",
        texto: `Planilha ${planilha.nome} baixada${pedidos}${recorte}.`,
      });
      return;
    }
    setSituacao({
      fase: "falhou",
      texto:
        planilha.estado === "recusada"
          ? planilha.explicacao
          : planilha.semSessao
            ? "Sua sessão terminou. Entre de novo para baixar a planilha."
            : "Não foi possível baixar a planilha agora. Tente de novo em instantes.",
    });
  }

  return (
    <div data-exportar className="space-y-2">
      <div className="flex flex-col gap-2 min-[540px]:flex-row min-[540px]:items-center">
        <Botao
          variante="secundaria"
          carregando={situacao.fase === "baixando"}
          rotuloDeEspera="Preparando a planilha…"
          desabilitado={consulta === null}
          onClick={() => void exportar()}
        >
          Baixar planilha do período
        </Botao>
        <p className="text-sm text-tinta-suave">
          Um pedido por linha: data, número, cliente, canal, itens, status e
          valor. Sem telefone nem endereço do cliente.
        </p>
      </div>
      <p role="status" className="text-sm">
        {situacao.fase === "baixada" ? situacao.texto : ""}
      </p>
      {situacao.fase === "falhou" ? (
        <Aviso tom="erro" titulo="A planilha não foi baixada">
          <p data-exportar-falhou>{situacao.texto}</p>
        </Aviso>
      ) : null}
    </div>
  );
}
