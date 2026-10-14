"use client";

/**
 * A que horário os números se referem, e o "atualizar agora" (T-807; AC-814).
 *
 * NÚMERO GUARDADO NUNCA SE PASSA POR NÚMERO DO INSTANTE. A API guarda as
 * métricas por até um minuto, e a tela escreve o horário em que elas foram
 * calculadas — no relógio da loja, como todo o painel. Quem quer o número
 * deste segundo toca em "atualizar agora", e a API recalcula sem o guardado.
 *
 * Durante a atualização os números NÃO saem da tela: eles continuam certos
 * para o horário escrito ao lado. Quando a atualização falha, a tela diz que
 * não conseguiu e mantém o horário antigo — e não finge que atualizou.
 */
import { Botao } from "@simpleclick/ui";

import { escreverHora } from "../../lib/metricas.ts";

export interface HorarioDeReferenciaProps {
  /** O instante a que os números se referem (ISO, em UTC). */
  readonly calculadoEm: string;
  /** O fuso da loja, em que o horário é escrito. */
  readonly fuso: string;
  /** Os números vieram do que a API tinha guardado. */
  readonly deCache: boolean;
  readonly atualizando: boolean;
  readonly atualizacaoFalhou: boolean;
  readonly aoAtualizar: () => void;
}

export function HorarioDeReferencia({
  calculadoEm,
  fuso,
  deCache,
  atualizando,
  atualizacaoFalhou,
  aoAtualizar,
}: HorarioDeReferenciaProps) {
  const hora = escreverHora(calculadoEm, fuso);

  return (
    <div
      data-horario-de-referencia
      data-de-cache={deCache ? "sim" : "nao"}
      className="flex flex-col gap-2 rounded-[var(--raio-cartao)] border border-borda bg-superficie px-4 py-3 min-[540px]:flex-row min-[540px]:flex-wrap min-[540px]:items-center min-[540px]:justify-between"
    >
      <div className="text-sm">
        <p>
          Números de{" "}
          <time dateTime={calculadoEm} className="font-semibold">
            {hora}
          </time>{" "}
          <span className="text-tinta-suave">(horário da loja)</span>
        </p>
        <p className="text-tinta-suave">
          Com o painel aberto, eles se atualizam sozinhos a cada minuto.
        </p>
      </div>
      <Botao
        variante="secundaria"
        tamanho="pequeno"
        carregando={atualizando}
        rotuloDeEspera="Atualizando os números…"
        onClick={aoAtualizar}
      >
        Atualizar agora
      </Botao>
      <p role="status" className="sc-so-leitor">
        {atualizando ? "" : `Números de ${hora}.`}
      </p>
      {atualizacaoFalhou ? (
        <p
          data-atualizacao-falhou
          role="alert"
          className="text-sm font-medium text-erro min-[540px]:basis-full"
        >
          Não foi possível atualizar agora. Os números continuam os de {hora}.
        </p>
      ) : null}
    </div>
  );
}
