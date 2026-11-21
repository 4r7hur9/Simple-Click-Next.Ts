"use client";

/**
 * O período do resumo no topo de Meus pedidos (cards #35 e #151): 30 dias, 90
 * dias, este ano ou um intervalo livre no calendário do `@simpleclick/ui`. A
 * escolha mora no endereço (`?resumo=`, e `de`/`ate` no intervalo livre), então
 * a página se refaz com os números do período — e dá para voltar e
 * compartilhar. O nome é `resumo` e não `periodo` porque a lista logo abaixo já
 * usa `?periodo=` (7, 30, 90 dias); trocar um NÃO desfaz o outro: o endereço
 * novo parte do que já está na URL (situação, loja e período da lista).
 */
import { Botao, SeletorDePeriodo as Calendario, hojeNoFuso } from "@simpleclick/ui";
import { useRouter, useSearchParams } from "next/navigation";

import { PAGINA_DE_FUNDO_DO_MODAL } from "../../lib/abas-da-conta.ts";
import type { AtalhoDaVisao, PeriodoDaVisao } from "../../lib/conta-do-cliente.ts";

const ATALHOS: readonly { id: AtalhoDaVisao; rotulo: string }[] = [
  { id: "30d", rotulo: "30 dias" },
  { id: "90d", rotulo: "90 dias" },
  { id: "ano", rotulo: "Este ano" },
];

/** O endereço de Pedidos com outro período do resumo; o resto da busca fica. */
export function enderecoDoResumo(
  atual: URLSearchParams | null,
  troca: { readonly resumo: AtalhoDaVisao | "personalizado"; readonly de?: string; readonly ate?: string },
): string {
  const consulta = new URLSearchParams(atual ?? undefined);
  for (const nome of ["resumo", "de", "ate", "conta", "estado"]) consulta.delete(nome);
  if (troca.resumo !== "30d") consulta.set("resumo", troca.resumo);
  if (troca.de !== undefined) consulta.set("de", troca.de);
  if (troca.ate !== undefined) consulta.set("ate", troca.ate);
  const texto = consulta.toString();
  return texto === "" ? PAGINA_DE_FUNDO_DO_MODAL : `${PAGINA_DE_FUNDO_DO_MODAL}?${texto}`;
}

export function SeletorDoPeriodoDaConta({ periodo }: { readonly periodo: PeriodoDaVisao }) {
  const roteador = useRouter();
  const atual = useSearchParams();
  const hoje = hojeNoFuso("America/Sao_Paulo");

  return (
    <div data-seletor-de-periodo data-atalho={periodo.atalho} className="flex flex-wrap items-center gap-2">
      {ATALHOS.map((atalho) => (
        <Botao
          key={atalho.id}
          type="button"
          forma="pilula"
          variante={periodo.atalho === atalho.id ? "primaria" : "secundaria"}
          aria-pressed={periodo.atalho === atalho.id}
          onClick={() => roteador.push(enderecoDoResumo(atual, { resumo: atalho.id }))}
        >
          {atalho.rotulo}
        </Botao>
      ))}
      <Calendario
        value={{ inicio: periodo.de, fim: periodo.ate }}
        max={hoje}
        hoje={hoje}
        fuso="America/Sao_Paulo"
        rotulo="Escolher outro período"
        onChange={(novo) =>
          roteador.push(enderecoDoResumo(atual, { resumo: "personalizado", de: novo.inicio, ate: novo.fim }))
        }
      />
    </div>
  );
}
