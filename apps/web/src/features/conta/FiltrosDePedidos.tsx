/**
 * Os filtros da lista de pedidos (card #35): situação em chips e, num
 * formulário GET, a loja e o período. Funciona sem JavaScript — o filtro mora
 * no endereço, então dá para voltar e compartilhar a lista filtrada.
 */
import Link from "next/link";

import type { FiltroDePedidos, Situacao } from "../../lib/conta-do-cliente.ts";
import { Seletor } from "@simpleclick/ui";

const SITUACOES: readonly { valor: Situacao; rotulo: string }[] = [
  { valor: "todos", rotulo: "Todos" },
  { valor: "andamento", rotulo: "Em andamento" },
  { valor: "concluidos", rotulo: "Concluídos" },
  { valor: "cancelados", rotulo: "Cancelados" },
];

const PERIODOS: readonly { valor: string; rotulo: string }[] = [
  { valor: "todos", rotulo: "Todo o período" },
  { valor: "7", rotulo: "Últimos 7 dias" },
  { valor: "30", rotulo: "Últimos 30 dias" },
  { valor: "90", rotulo: "Últimos 90 dias" },
];

function endereco(filtro: FiltroDePedidos, troca: Partial<FiltroDePedidos>): string {
  const f = { ...filtro, ...troca };
  const q = new URLSearchParams();
  if (f.situacao !== "todos") q.set("situacao", f.situacao);
  if (f.periodo !== "todos") q.set("periodo", f.periodo);
  if (f.loja !== "") q.set("loja", f.loja);
  const texto = q.toString();
  return texto === "" ? "/conta/pedidos" : `/conta/pedidos?${texto}`;
}

export function FiltrosDePedidos({
  filtro,
  lojas,
}: {
  readonly filtro: FiltroDePedidos;
  readonly lojas: readonly { apelido: string; nome: string }[];
}) {
  const ativo = filtro.situacao !== "todos" || filtro.periodo !== "todos" || filtro.loja !== "";
  return (
    <div className="sc-filtros">
      <nav aria-label="Situação do pedido">
        <ul className="sc-filtros__chips">
          {SITUACOES.map((s) => (
            <li key={s.valor}>
              <Link
                href={endereco(filtro, { situacao: s.valor })}
                aria-current={filtro.situacao === s.valor ? "true" : undefined}
              >
                {s.rotulo}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <form className="sc-filtros__form" method="get" action="/conta/pedidos" aria-label="Filtrar por loja e período">
        {filtro.situacao === "todos" ? null : <input type="hidden" name="situacao" value={filtro.situacao} />}
        <label>
          <span>Loja</span>
          <Seletor name="loja" defaultValue={filtro.loja}>
            <option value="">Todas as lojas</option>
            {lojas.map((l) => (
              <option key={l.apelido} value={l.apelido}>{l.nome}</option>
            ))}
          </Seletor>
        </label>
        <label>
          <span>Período</span>
          <Seletor name="periodo" defaultValue={filtro.periodo}>
            {PERIODOS.map((p) => (
              <option key={p.valor} value={p.valor}>{p.rotulo}</option>
            ))}
          </Seletor>
        </label>
        <button type="submit" className="sc-botao sc-botao--secundaria">Filtrar</button>
        {ativo ? <Link href="/conta/pedidos">Limpar filtros</Link> : null}
      </form>
    </div>
  );
}
