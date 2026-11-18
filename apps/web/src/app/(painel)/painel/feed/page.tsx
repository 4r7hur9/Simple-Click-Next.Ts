import type { Metadata } from "next";

import { FormularioDoFeed } from "../../../../features/feed-config/FormularioDoFeed.tsx";
import type { LojaDaPrevia } from "../../../../features/feed-config/PreviaNoFeed.tsx";
import { capaPadraoDe } from "../../../../lib/capa-padrao.ts";
import { enderecoDaApi } from "../../../../server/api-client.ts";
import { exigirLojaDaPagina } from "../../../../server/loja-da-pagina.ts";
import { buscarVitrine } from "../../../../server/vitrine.ts";

export const metadata: Metadata = { title: "Feed da loja | SimpleClick" };

/** O nome do tipo de negócio (`FOOD_SNACK` → "Lanchonete"), ou `null`. */
async function nomeDoTipo(codigo: string): Promise<string | null> {
  try {
    const resposta = await fetch(`${enderecoDaApi()}/v1/tipos-de-negocio`, {
      next: { revalidate: 3600 },
    });
    if (!resposta.ok) return null;
    const { tipos } = (await resposta.json()) as {
      tipos: { codigo: string; nome: string }[];
    };
    return tipos.find((tipo) => tipo.codigo === codigo)?.nome ?? null;
  } catch {
    return null;
  }
}

export default async function PaginaDoFeed() {
  // A guarda do layout já barrou a equipe: aqui só chega o dono.
  const { loja } = await exigirLojaDaPagina();
  // A vitrine só responde com a loja no ar; fora dela a prévia usa o nome.
  const vitrine = await buscarVitrine(loja.apelido);
  const publica = vitrine.estado === "encontrada" ? vitrine.vitrine.loja : null;

  const previa: LojaDaPrevia = {
    nome: publica?.nome ?? loja.nome,
    ramo:
      publica === null
        ? null
        : ((await nomeDoTipo(publica.ramo)) ?? publica.rotulos.catalogo),
    logo: publica?.logo ?? null,
    capa:
      publica?.capa ??
      publica?.tema?.fundoVitrine ??
      capaPadraoDe(publica?.ramo),
    bairro: publica?.enderecoParaRetirada?.bairro ?? null,
    cidade: publica?.enderecoParaRetirada?.cidade ?? null,
    formasDeEntrega: publica?.formasDeEntrega ?? [],
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--cor-primaria)]">
        Minha loja
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
        Feed da loja
      </h1>
      <p className="mt-3 max-w-2xl text-lg leading-8 text-[var(--cor-tinta-suave)]">
        Escolha se a sua loja aparece em Explorar, o feed dos clientes do
        SimpleClick, e o que entra nele sem você precisar marcar um a um.
      </p>
      <FormularioDoFeed loja={previa} lojaAtiva={loja.situacao === "ACTIVE"} />
    </main>
  );
}
