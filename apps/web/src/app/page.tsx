/**
 * A landing da plataforma (AC-933, AC-934, AC-937).
 *
 * Componente de SERVIDOR: a página inteira chega pronta ao navegador. Toda a
 * história, todos os links e o caminho para começar existem sem uma linha de
 * script — a narrativa por rolagem e o mundo em três dimensões são camadas por
 * cima, e a ausência delas não tira conteúdo nenhum (AC-934).
 *
 * O sinal de vida da API saiu daqui. Ele existia para provar que o esqueleto
 * subia, e essa prova agora mora onde ela pertence: nas verificações de saúde da
 * própria API. Manter a landing esperando o servidor responder para poder se
 * desenhar seria trocar a página que converte por um diagnóstico.
 */
import "@simpleclick/ui/styles/landing.css";

import type { Metadata } from "next";

import { HistoriaDaLanding } from "../features/landing/HistoriaDaLanding.tsx";
import { PreviaDaLoja } from "../features/landing/PreviaDaLoja.tsx";
import { exemploDaLanding } from "../server/exemplo-da-landing.ts";
import { NarrativaDaLanding } from "../features/landing/NarrativaDaLanding.tsx";

export const metadata: Metadata = {
  title: "SimpleClick — cardápio online e pedidos organizados",
  description:
    "Monte seu cardápio, mande o link para os clientes e receba os pedidos prontos no WhatsApp. Grátis, com todas as funcionalidades.",
};

/** Para onde vai quem decidiu começar. O cadastro do dono ainda não existe. */
const LINK_PARA_COMECAR = "/entrar";

export default function PaginaInicial() {
  // O exemplo é montado AQUI, no servidor, pelo gerador de verdade — a tela não
  // calcula preço nem monta mensagem (P-006).
  const exemplo = exemploDaLanding();

  return (
    <main>
      <HistoriaDaLanding
        linkParaComecar={LINK_PARA_COMECAR}
        previa={
          <PreviaDaLoja
            itens={exemplo.itens}
            total={exemplo.total}
            mensagem={exemplo.mensagem}
          />
        }
      />
      {/*
        A narrativa vem DEPOIS da história, e não em volta dela. Ela não desenha
        nada: acha os capítulos que já estão na página e os anima — e é ela quem
        decide, também, se o mundo em três dimensões chega a ser baixado.
      */}
      <NarrativaDaLanding />
    </main>
  );
}
