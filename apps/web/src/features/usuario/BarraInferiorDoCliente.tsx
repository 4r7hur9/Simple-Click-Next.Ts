"use client";

/**
 * A barra de navegação inferior do cliente (card #105): Explorar, Lojas,
 * Favoritos, Pedidos e Perfil, só no celular (abaixo de 64rem; acima dela
 * valem as abas do topo, nunca as duas).
 *
 * Usa a `BarraInferior` do #104 com o `Link` do Next. O nome da navegação é
 * "Navegação principal" — NUNCA "Atalhos": o aviso de cookies e o tutorial do
 * painel casam com esse nome. Some enquanto o teclado virtual está aberto
 * (`oculta`, que tira a barra da tela e do Tab) e na TV da loja.
 */
import "./navegacao.css";

import { BarraInferior } from "@simpleclick/ui";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import {
  caminhoSemBarra,
  type UsuarioDaBarra,
} from "../../lib/quem-esta-logado.ts";
import { ICONES_DA_NAVEGACAO } from "./icones-do-usuario.ts";
import {
  eCampoDeTexto,
  itensPrincipais,
  tecladoAberto,
} from "./regras-da-navegacao.ts";

/** Acompanha o teclado virtual pela área visível (`visualViewport`). */
function useTecladoAberto(): boolean {
  const [aberto, setAberto] = useState(false);
  const referencia = useRef(0);

  useEffect(() => {
    const janela = window.visualViewport;
    function alturaVisivel(): number {
      return janela?.height ?? window.innerHeight;
    }
    function conferir() {
      const campoEmFoco = eCampoDeTexto(document.activeElement);
      // A referência é a maior área vista com nenhum campo em foco.
      if (!campoEmFoco) {
        referencia.current = Math.max(window.innerHeight, alturaVisivel());
      }
      setAberto(
        tecladoAberto({
          alturaDeReferencia: referencia.current,
          alturaVisivel: alturaVisivel(),
          campoEmFoco,
        }),
      );
    }
    referencia.current = Math.max(window.innerHeight, alturaVisivel());
    document.addEventListener("focusin", conferir);
    document.addEventListener("focusout", conferir);
    window.addEventListener("resize", conferir);
    window.addEventListener("orientationchange", conferir);
    janela?.addEventListener("resize", conferir);
    return () => {
      document.removeEventListener("focusin", conferir);
      document.removeEventListener("focusout", conferir);
      window.removeEventListener("resize", conferir);
      window.removeEventListener("orientationchange", conferir);
      janela?.removeEventListener("resize", conferir);
    };
  }, []);

  return aberto;
}

function Barra({
  usuario,
  busca,
}: {
  readonly usuario: UsuarioDaBarra;
  readonly busca?: URLSearchParams;
}) {
  const caminho = usePathname();
  const oculta = useTecladoAberto();
  const itens = itensPrincipais({ usuario, caminho, busca }).map((item) => {
    const Desenho = ICONES_DA_NAVEGACAO[item.id];
    return {
      id: item.id,
      rotulo: item.rotulo,
      href: item.href,
      ativo: item.ativo,
      icone: <Desenho aria-hidden="true" />,
      // `data-navegacao` é o gancho do tutorial (e do e2e) para cada destino.
      atributos: { "data-navegacao": item.id, ...item.atributos },
    };
  });
  return (
    <BarraInferior
      rotulo="Navegação principal"
      itens={itens}
      componenteDeLink={Link}
      oculta={oculta}
    />
  );
}

function BarraComBusca({ usuario }: { readonly usuario: UsuarioDaBarra }) {
  return <Barra usuario={usuario} busca={useSearchParams()} />;
}

export function BarraInferiorDoCliente({
  usuario,
}: {
  readonly usuario: UsuarioDaBarra;
}) {
  const caminho = usePathname();
  if (caminhoSemBarra(caminho)) return null;
  return (
    <div className="sc-barra-cliente">
      <Suspense fallback={<Barra usuario={usuario} />}>
        <BarraComBusca usuario={usuario} />
      </Suspense>
    </div>
  );
}
