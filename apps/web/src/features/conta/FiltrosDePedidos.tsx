/**
 * Os filtros da lista de pedidos (card #35): situação em chips (`Chip` do #104) e, num
 * formulário GET, a loja e o período. Funciona sem JavaScript — o filtro mora
 * no endereço, então dá para voltar e compartilhar a lista filtrada.
 */
import Link from "next/link";

import type { FiltroDePedidos, PeriodoDaVisao, Situacao } from "../../lib/conta-do-cliente.ts";
import { Chip, FaixaDeChips, Seletor } from "@simpleclick/ui";

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

/**
 * O que o resumo do topo (`?resumo=`, `de`, `ate`) leva na URL, para trocar o
 * filtro da lista NÃO desfazer o período do resumo (e o contrário também).
 */
function consultaDoResumo(resumo: PeriodoDaVisao | undefined): [string, string][] {
  if (resumo === undefined || resumo.atalho === "30d") return [];
  return resumo.atalho === "personalizado"
    ? [["resumo", resumo.atalho], ["de", resumo.de], ["ate", resumo.ate]]
    : [["resumo", resumo.atalho]];
}

function endereco(
  filtro: FiltroDePedidos,
  troca: Partial<FiltroDePedidos>,
  resumo?: PeriodoDaVisao,
): string {
  const f = { ...filtro, ...troca };
  const q = new URLSearchParams(consultaDoResumo(resumo));
  if (f.situacao !== "todos") q.set("situacao", f.situacao);
  if (f.periodo !== "todos") q.set("periodo", f.periodo);
  if (f.loja !== "") q.set("loja", f.loja);
  const texto = q.toString();
  return texto === "" ? "/conta/pedidos" : `/conta/pedidos?${texto}`;
}

export function FiltrosDePedidos({
  filtro,
  lojas,
  resumo,
}: {
  readonly filtro: FiltroDePedidos;
  readonly lojas: readonly { apelido: string; nome: string }[];
  /** O período do resumo do topo, que os filtros preservam. */
  readonly resumo?: PeriodoDaVisao | undefined;
}) {
  const ativo = filtro.situacao !== "todos" || filtro.periodo !== "todos" || filtro.loja !== "";
  return (
    <div className="sc-meus-pedidos__filtros">
      <FaixaDeChips rotulo="Situação do pedido" navegacao>
        {SITUACOES.map((s) => (
          <Chip
            key={s.valor}
            href={endereco(filtro, { situacao: s.valor }, resumo)}
            ativo={filtro.situacao === s.valor}
            componenteDeLink={Link}
          >
            {s.rotulo}
          </Chip>
        ))}
      </FaixaDeChips>
      <form className="sc-meus-pedidos__form" method="get" action="/conta/pedidos" aria-label="Filtrar por loja e período">
        {filtro.situacao === "todos" ? null : <input type="hidden" name="situacao" value={filtro.situacao} />}
        {consultaDoResumo(resumo).map(([nome, valor]) => (
          <input key={nome} type="hidden" name={nome} value={valor} />
        ))}
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
        {ativo ? <Link href={endereco({ situacao: "todos", periodo: "todos", loja: "" }, {}, resumo)}>Limpar filtros</Link> : null}
      </form>
    </div>
  );
}
