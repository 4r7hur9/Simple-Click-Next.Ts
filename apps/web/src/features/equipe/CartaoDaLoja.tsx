import { Botao, IconeLoja, IconePedido, Selo, type TomDeSelo } from "@simpleclick/ui";
import type { LojaDaSessao } from "@simpleclick/contracts";

import type { ResumoDaLoja } from "../../lib/resumo-da-loja.ts";

type Situacao = LojaDaSessao["situacao"];

/** Como cada situação aparece e se dá para abrir o painel. */
export const SITUACOES_DA_LOJA: Readonly<
  Record<Situacao, { rotulo: string; tom: TomDeSelo; abre: boolean; aviso: string | null }>
> = {
  ACTIVE: { rotulo: "No ar", tom: "sucesso", abre: true, aviso: null },
  INACTIVE: {
    rotulo: "Desativada",
    tom: "atencao",
    abre: true,
    aviso: "A administração desativou esta loja. Você ainda vê o painel, mas ela não aparece para os clientes.",
  },
  PENDING_APPROVAL: {
    rotulo: "Aguardando aprovação",
    tom: "info",
    abre: false,
    aviso: "A administração ainda está analisando esta loja. O painel abre quando ela for aprovada.",
  },
  REJECTED: {
    rotulo: "Recusada",
    tom: "erro",
    abre: false,
    aviso: "Esta loja foi recusada. Fale com o suporte para entender o motivo.",
  },
};

export interface CartaoDaLojaProps {
  readonly loja: LojaDaSessao;
  readonly resumo: ResumoDaLoja | undefined;
  readonly atual: boolean;
  readonly acao: (dados: FormData) => Promise<void>;
}

/** Um cartão da escolha de loja: logo, nome, situação, pedidos de hoje e o botão. */
export function CartaoDaLoja({ loja, resumo, atual, acao }: CartaoDaLojaProps) {
  const situacao = SITUACOES_DA_LOJA[loja.situacao];
  const idAviso = `loja-${loja.apelido}-aviso`;
  return (
    <article
      className={[
        "grid gap-4 rounded-3xl border bg-[var(--cor-superficie)] p-5",
        atual
          ? "border-[var(--cor-primaria-texto)]"
          : "border-[var(--cor-borda)]",
      ].join(" ")}
      data-loja={loja.apelido}
    >
      <div className="flex items-center gap-4">
        <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[var(--cor-superficie-alta)] text-[var(--cor-primaria-texto)]">
          {resumo?.logo ? (
            <img src={resumo.logo} alt="" className="size-full object-cover" />
          ) : (
            <IconeLoja />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">{loja.nome}</h2>
          <p className="truncate font-mono text-sm text-[var(--cor-tinta-suave)]">
            /loja/{loja.apelido}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Selo tom={situacao.tom}>{situacao.rotulo}</Selo>
        {loja.papel === "STAFF" ? (
          <Selo tom="neutro" semBolinha>Você é da equipe</Selo>
        ) : null}
        {atual ? <Selo tom="sucesso" semBolinha>Loja atual</Selo> : null}
        {resumo?.pedidosHoje != null ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-[var(--cor-tinta-suave)]">
            <IconePedido />
            {resumo.pedidosHoje === 1 ? "1 pedido hoje" : `${resumo.pedidosHoje} pedidos hoje`}
          </span>
        ) : null}
      </div>
      {situacao.aviso ? (
        <p id={idAviso} className="text-sm text-[var(--cor-tinta-suave)]">
          {situacao.aviso}
        </p>
      ) : null}
      <form action={acao}>
        <input type="hidden" name="apelido" value={loja.apelido} />
        <Botao
          type="submit"
          variante={atual ? "primaria" : "secundaria"}
          desabilitado={!situacao.abre}
          aria-describedby={situacao.aviso ? idAviso : undefined}
        >
          Abrir {loja.nome}
        </Botao>
      </form>
    </article>
  );
}
