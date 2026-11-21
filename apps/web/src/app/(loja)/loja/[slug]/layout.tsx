/**
 * Moldura das páginas de uma loja.
 *
 * A folha da narrativa entra AQUI, e não no layout raiz: ela vale para as
 * páginas de apresentação, e carregá-la em todo o site faria o painel do dono
 * pagar por estilo que ele não usa.
 */
import "@simpleclick/ui/styles/narrativa.css";
import "@simpleclick/ui/styles/sobre.css";

import type { ReactNode } from "react";
import { TemaDaMarca } from "@simpleclick/ui";

import {
  BarraInferiorDaSessao,
  NavegacaoDaSessao,
} from "../../../_usuario/sessao.tsx";
import { RodapeLegal } from "../../../../features/legal/RodapeLegal.tsx";
import { JanelaDeAcesso } from "../../../../features/auth/JanelaDeAcesso.tsx";
import { ForaDaTv } from "../../../../features/tv/ForaDaTv.tsx";
import { buscarVitrine } from "../../../../server/vitrine.ts";

export default async function MolduraDaLoja({
  children,
  params,
}: {
  readonly children: ReactNode;
  readonly params: Promise<{ slug: string }>;
}) {
  // A mesma busca da página (guardada pelo Next): a lateral só pega o nome.
  const { slug } = await params;
  const vitrine = await buscarVitrine(slug);
  const loja =
    vitrine.estado === "encontrada"
      ? {
          apelido: vitrine.vitrine.loja.apelido,
          nome: vitrine.vitrine.loja.nome,
        }
      : undefined;
  // Envelope da loja: sem cor própria, tudo no verde SimpleClick. Janelas
  // (carrinho, produto, entrar) também ficam dentro dele.
  return (
    <TemaDaMarca>
      <NavegacaoDaSessao loja={loja} />
      {children}
      <RodapeLegal />
      <BarraInferiorDaSessao />
      {/* Entrar / criar conta sem sair da loja: abrirJanelaDeAcesso(). */}
      <ForaDaTv>
        <JanelaDeAcesso />
      </ForaDaTv>
    </TemaDaMarca>
  );
}
