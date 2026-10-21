"use client";

/**
 * A janela do "Sobre a loja", por cima da apresentação.
 *
 * É o `dialog` NATIVO aberto com `showModal()`: o navegador entrega o foco
 * preso dentro da janela, o Esc, o fundo escurecido, o resto da página inerte
 * e a devolução do foco a quem abriu. Reimplementar isso com `div` é o jeito
 * clássico de errar acessibilidade.
 *
 * O CONTEÚDO VEM PRONTO DO SERVIDOR (`children`): este componente só abre e
 * fecha. E o endereço acompanha — abrir põe `/loja/<loja>/sobre` na barra (link
 * compartilhável; o "voltar" do celular fecha a janela), fechar devolve o
 * endereço da loja.
 *
 * SEM SCRIPT, nada disto roda e nada quebra: o gatilho é um link comum para
 * `/loja/<loja>/sobre`, que o servidor desenha com a janela já aberta (`open`), e
 * o "fechar" é um link de volta para a loja.
 */
import { useEffect, useRef, type ReactNode } from "react";

import { IconeFechar } from "@simpleclick/ui";

/**
 * O atributo que marca os links que abrem a janela, em qualquer lugar da
 * página. Componente de servidor escreve `data-abre-sobre=""` direto: importar
 * esta constante de um módulo "use client" lá daria uma referência, e não o
 * texto.
 */
const ATRIBUTO_DO_GATILHO = "data-abre-sobre";

export interface JanelaDoSobreProps {
  readonly apelido: string;
  /** Nasce aberta — é a rota `/loja/<loja>/sobre`. */
  readonly aberta: boolean;
  /** O id do título que dá nome à janela. */
  readonly idDoTitulo: string;
  readonly children: ReactNode;
}

export function JanelaDoSobre({
  apelido,
  aberta,
  idDoTitulo,
  children,
}: JanelaDoSobreProps) {
  const janela = useRef<HTMLDialogElement>(null);
  /** Se a janela pôs uma entrada no histórico, que o fechar deve desfazer. */
  const empilhou = useRef(false);
  const enderecoDaLoja = `/loja/${apelido}`;
  const enderecoDoSobre = `/loja/${apelido}/sobre`;

  useEffect(() => {
    const elemento = janela.current;
    if (!elemento) return;

    function abrir(): void {
      if (!elemento || (elemento.open && elemento.matches(":modal"))) return;
      // O servidor pode ter entregado a janela aberta, mas NÃO modal: troca
      // para o modo modal, que é o que prende o foco e trava o fundo.
      if (elemento.open) elemento.close();
      elemento.showModal();
      elemento.scrollTop = 0;
    }

    if (aberta) abrir();

    // Os gatilhos são links do servidor, espalhados pela página: um ouvinte só,
    // no documento, pega o clique de todos sem cada um virar componente.
    function aoClicar(evento: MouseEvent): void {
      if (
        evento.defaultPrevented ||
        evento.button !== 0 ||
        evento.metaKey ||
        evento.ctrlKey ||
        evento.shiftKey ||
        evento.altKey
      ) {
        return; // abrir em outra aba continua sendo do navegador
      }
      const alvo = evento.target;
      if (!(alvo instanceof Element)) return;
      if (!alvo.closest(`a[${ATRIBUTO_DO_GATILHO}]`)) return;
      evento.preventDefault();
      if (window.location.pathname !== enderecoDoSobre) {
        window.history.pushState(null, "", enderecoDoSobre);
        empilhou.current = true;
      }
      abrir();
    }

    // O "voltar" do navegador fecha a janela (e o "avançar" reabre).
    function aoVoltar(): void {
      if (!elemento) return;
      if (window.location.pathname === enderecoDoSobre) {
        abrir();
      } else if (elemento.open) {
        empilhou.current = false;
        elemento.close();
      }
    }

    // Fechou por Esc, pelo botão ou pelo fundo: o endereço volta a ser o da
    // loja. Se fomos nós que empilhamos, desempilha; se a pessoa chegou direto
    // pelo link do Sobre, troca no lugar, para o "voltar" não reabrir a janela.
    function aoFechar(): void {
      // O evento chega depois: se já reabriu (a troca para modal em `abrir`
      // fecha e reabre), não foi a pessoa que fechou.
      if (elemento?.open) return;
      if (window.location.pathname !== enderecoDoSobre) return;
      if (empilhou.current) {
        empilhou.current = false;
        window.history.back();
      } else {
        window.history.replaceState(null, "", enderecoDaLoja);
      }
    }

    // Clique no FUNDO fecha. O fundo é o próprio `dialog` (o `::backdrop` não
    // recebe evento à parte); o conteúdo tem a moldura dele por dentro.
    function aoClicarNaJanela(evento: MouseEvent): void {
      if (evento.target === elemento) elemento?.close();
    }

    document.addEventListener("click", aoClicar);
    window.addEventListener("popstate", aoVoltar);
    elemento.addEventListener("close", aoFechar);
    elemento.addEventListener("click", aoClicarNaJanela);
    return () => {
      document.removeEventListener("click", aoClicar);
      window.removeEventListener("popstate", aoVoltar);
      elemento.removeEventListener("close", aoFechar);
      elemento.removeEventListener("click", aoClicarNaJanela);
    };
  }, [aberta, enderecoDaLoja, enderecoDoSobre]);

  return (
    <dialog
      ref={janela}
      className="sc-sobre-janela"
      aria-labelledby={idDoTitulo}
      // Aberta no servidor só quando a rota é o Sobre: é o que mostra o
      // conteúdo para quem está sem script e para o buscador.
      open={aberta || undefined}
    >
      <div className="sc-sobre-janela__moldura">
        {/*
          O fechar é um LINK para a loja: sem script, ele simplesmente navega.
          Com script, o clique fecha a janela no lugar.
        */}
        <a
          className="sc-sobre-janela__fechar"
          href={enderecoDaLoja}
          onClick={(evento) => {
            evento.preventDefault();
            janela.current?.close();
          }}
        >
          <IconeFechar aria-hidden="true" />
          <span className="sc-so-leitor">Fechar</span>
        </a>
        {children}
      </div>
    </dialog>
  );
}
