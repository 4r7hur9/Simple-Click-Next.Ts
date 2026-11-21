import { hojeNoFuso } from "@simpleclick/ui";
import { redirect } from "next/navigation";

import { PAGINA_DE_FUNDO_DO_MODAL, textoDaConsulta } from "../../../lib/abas-da-conta.ts";
import { lerPeriodoDaVisao } from "../../../lib/conta-do-cliente.ts";
import { tokenOuEntrar } from "./_token.ts";

export const metadata = { title: "Minha conta | SimpleClick" };
export const dynamic = "force-dynamic";

/**
 * `/conta` deixou de ser uma tela (card #151): o resumo que ela mostrava mora
 * no topo de Meus pedidos. O endereço continua valendo (links antigos, e-mails,
 * o "Perfil" de versões anteriores) e leva para lá, no servidor. O período da
 * antiga Visão geral (`?periodo=`, `de`, `ate`) vira o `?resumo=` de Pedidos,
 * já conferido por `lerPeriodoDaVisao`: nada do que veio na URL é repassado
 * como está.
 */
export default async function PaginaInicialDaConta({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await tokenOuEntrar("/conta");
  const consulta = await searchParams;
  const periodo = lerPeriodoDaVisao(
    {
      periodo: textoDaConsulta(consulta["periodo"]),
      de: textoDaConsulta(consulta["de"]),
      ate: textoDaConsulta(consulta["ate"]),
    },
    hojeNoFuso("America/Sao_Paulo"),
  );
  const destino = new URLSearchParams();
  if (periodo.atalho !== "30d") destino.set("resumo", periodo.atalho);
  if (periodo.atalho === "personalizado") {
    destino.set("de", periodo.de);
    destino.set("ate", periodo.ate);
  }
  const texto = destino.toString();
  redirect(texto === "" ? PAGINA_DE_FUNDO_DO_MODAL : `${PAGINA_DE_FUNDO_DO_MODAL}?${texto}`);
}
