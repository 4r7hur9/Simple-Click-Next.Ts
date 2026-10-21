import "@simpleclick/ui/styles/stories.css";

import { COR_DE_DESTAQUE_PADRAO, iniciaisDaLoja } from "@simpleclick/contracts";
import type { Metadata } from "next";

import { TelaDeStories } from "../../../../features/stories-painel/TelaDeStories.tsx";
import { permissoesDaLoja } from "../../../../lib/permissoes.ts";
import { exigirLojaDaPagina } from "../../../../server/loja-da-pagina.ts";
import { buscarVitrine } from "../../../../server/vitrine.ts";

export const metadata: Metadata = { title: "Stories | SimpleClick" };

export default async function PaginaDosStories() {
  const { loja } = await exigirLojaDaPagina();
  // A foto de perfil é a logo publicada; com a vitrine fora do ar, as iniciais.
  const vitrine = await buscarVitrine(loja.apelido);
  const publica = vitrine.estado === "encontrada" ? vitrine.vitrine.loja : null;
  const nome = publica?.nome ?? loja.nome;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--cor-primaria)]">
        Minha loja
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
        Stories
      </h1>
      <p className="mt-3 max-w-2xl text-lg leading-8 text-[var(--cor-tinta-suave)]">
        Uma foto ou um vídeo rápido da loja, que aparece na bolinha do seu
        perfil em Explorar e na vitrine. Fica no ar por 24 horas e some
        sozinho.
      </p>
      <TelaDeStories
        perfil={{
          apelido: loja.apelido,
          nome,
          fotoDePerfil: publica?.logo ?? null,
          iniciais: iniciaisDaLoja(nome),
          corDestaque: publica?.tema?.corDestaque ?? COR_DE_DESTAQUE_PADRAO,
          podeTrocarFoto: permissoesDaLoja(loja).has("personalizacao"),
        }}
      />
    </main>
  );
}
