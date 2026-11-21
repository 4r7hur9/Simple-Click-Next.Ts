import { hojeNoFuso } from "@simpleclick/ui";
import { redirect } from "next/navigation";

import { FiltrosDePedidos } from "../../../../features/conta/FiltrosDePedidos.tsx";
import { MeusPedidos } from "../../../../features/conta/MeusPedidos.tsx";
import { PaginaDaConta } from "../../../../features/conta/PaginaDaConta.tsx";
import { VisaoGeralDaConta } from "../../../../features/conta/VisaoGeralDaConta.tsx";
import {
  lerAbaDaConta,
  PAGINA_DE_FUNDO_DO_MODAL,
  textoDaConsulta,
} from "../../../../lib/abas-da-conta.ts";
import {
  buscarMetricasDaConta,
  calcularMetricas,
  filtrarPedidos,
  lerFiltro,
  lerPeriodoDaVisao,
  lojasDosPedidos,
} from "../../../../lib/conta-do-cliente.ts";
import { buscarMeusPedidos } from "../../../../lib/meus-pedidos.ts";
import { tokenOuEntrar } from "../_token.ts";
import { comDestino } from "../../../../lib/destino-seguro.ts";

export const metadata = { title: "Meus pedidos | SimpleClick" };

// A lista muda a cada passo da loja: nada aqui pode ser gerado de antemão.
export const dynamic = "force-dynamic";

/**
 * Meus pedidos, em todas as lojas (AC-616). No topo, o resumo que a antiga
 * Visão geral mostrava (andamento, período, métricas, gráficos e rankings);
 * abaixo, os filtros por situação, loja e período e a lista (card #151).
 * A sessão vive em cookie que só o servidor lê (P-008). Sem sessão, a pessoa vai
 * entrar — e não recebe uma lista vazia que mentiria — e volta para cá, com o
 * modal "Minha conta" aberto na mesma aba se ela veio por `?conta=`.
 *
 * Também é a página de fundo do modal: `/conta`, `/conta/dados`,
 * `/conta/enderecos` e `/conta/seguranca` terminam aqui.
 */
export default async function PaginaDeMeusPedidos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const consulta = await searchParams;
  // O destino de volta do login: só a aba que passou pela lista de abas entra.
  const aba = lerAbaDaConta(textoDaConsulta(consulta["conta"]));
  const caminho = aba === null ? PAGINA_DE_FUNDO_DO_MODAL : `${PAGINA_DE_FUNDO_DO_MODAL}?conta=${aba}`;
  const token = await tokenOuEntrar(caminho);

  const filtro = lerFiltro({
    situacao: textoDaConsulta(consulta["situacao"]),
    periodo: textoDaConsulta(consulta["periodo"]),
    loja: textoDaConsulta(consulta["loja"]),
  });
  const resumo = lerPeriodoDaVisao(
    {
      periodo: textoDaConsulta(consulta["resumo"]),
      de: textoDaConsulta(consulta["de"]),
      ate: textoDaConsulta(consulta["ate"]),
    },
    hojeNoFuso("America/Sao_Paulo"),
  );

  const [leitura, metricas] = await Promise.all([
    buscarMeusPedidos(token),
    buscarMetricasDaConta(token, resumo),
  ]);
  if (leitura.estado === "nao-autenticado" || metricas.estado === "nao-autenticado") {
    redirect(comDestino("/entrar", caminho));
  }

  const todos = leitura.estado === "ok" ? leitura.pedidos : [];
  const agora = new Date();
  const exibida =
    leitura.estado === "ok"
      ? { ...leitura, pedidos: filtrarPedidos(todos, filtro, agora) }
      : leitura;
  const filtrada = filtro.situacao !== "todos" || filtro.periodo !== "todos" || filtro.loja !== "";

  return (
    <PaginaDaConta
      titulo="Meus pedidos"
      descricao="Tudo que você pediu, em todas as lojas, com o status de agora e o resumo dos seus gastos. Abra um pedido para acompanhá-lo sem precisar do link."
    >
      {todos.length > 0 ? (
        <>
          <VisaoGeralDaConta
            periodo={resumo}
            metricas={metricas.estado === "ok" ? metricas.dados : null}
            lista={calcularMetricas(todos, agora)}
          />
          <h2 className="sc-inicio__titulo" id="todos-os-pedidos">
            Todos os pedidos
          </h2>
          <FiltrosDePedidos filtro={filtro} lojas={lojasDosPedidos(todos)} resumo={resumo} />
        </>
      ) : null}
      <MeusPedidos leitura={exibida} filtrada={filtrada} />
    </PaginaDaConta>
  );
}
