/**
 * A tela "Sem permissão": o que a pessoa vê ao abrir, pelo endereço, uma área
 * do painel que o papel dela não usa (a equipe na Equipe, no Feed ou nas
 * Configurações). Explica em português simples o porquê e leva de volta ao que
 * ela pode fazer. A API já recusaria cada ação; esta tela só evita mostrar uma
 * página quebrada.
 */
import { IconeSeguranca } from "@simpleclick/ui";
import Link from "next/link";

import {
  nomeDaPermissao,
  rotuloDoPapel,
  type PermissaoDaLoja,
} from "../../lib/permissoes.ts";
import { FOCO } from "./estilo-do-menu.ts";

const LINK_PRIMARIO = `inline-flex min-h-[var(--altura-toque)] items-center justify-center rounded-[var(--raio-completo)] bg-[var(--cor-primaria)] px-5 text-sm font-semibold text-[var(--cor-em-primaria)] ${FOCO}`;
const LINK_SECUNDARIO = `inline-flex min-h-[var(--altura-toque)] items-center justify-center rounded-[var(--raio-completo)] border border-[var(--cor-borda-forte)] px-5 text-sm font-semibold text-[var(--cor-tinta)] hover:bg-[var(--cor-superficie-alta)] ${FOCO}`;

export function SemPermissao({
  permissao,
  papel,
  nomeDaLoja,
  inicioPermitido = true,
}: {
  readonly permissao: PermissaoDaLoja;
  readonly papel: string;
  readonly nomeDaLoja: string;
  /** A pessoa pode abrir o início do painel (métricas)? */
  readonly inicioPermitido?: boolean;
}) {
  return (
    <section
      aria-labelledby="titulo-sem-permissao"
      className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-5 px-6 py-16 text-center"
    >
      <span
        aria-hidden="true"
        className="flex size-16 items-center justify-center rounded-[var(--raio-cartao)] bg-[var(--cor-superficie)] text-[var(--cor-primaria)]"
      >
        <IconeSeguranca className="size-8" />
      </span>
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--cor-primaria-texto)]">
        Sem permissão
      </p>
      <h1
        id="titulo-sem-permissao"
        className="text-3xl font-semibold tracking-[-0.04em]"
      >
        Esta área é só para o dono da loja
      </h1>
      <p className="text-base leading-7 text-[var(--cor-tinta-suave)]">
        Na {nomeDaLoja}, a sua função é <strong>{rotuloDoPapel(papel)}</strong>,
        e ela não inclui <strong>{nomeDaPermissao(permissao)}</strong>. Se você
        precisa mexer nisso, fale com o dono da loja.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        {inicioPermitido ? (
          <Link href="/painel" className={LINK_PRIMARIO}>
            Voltar ao início
          </Link>
        ) : null}
        <Link
          href="/painel/pedidos"
          className={inicioPermitido ? LINK_SECUNDARIO : LINK_PRIMARIO}
        >
          Ir para os pedidos
        </Link>
      </div>
    </section>
  );
}
