"use client";

/**
 * O menu lateral das áreas logadas (painel do dono e administração).
 *
 * Não sabe nada de loja nem de papel: recebe as SEÇÕES prontas e só decide
 * como mostrá-las em cada tamanho de tela. Todas as funções ficam à vista, em
 * seções com título — não há grupo que abra e feche. Se a lista passar da
 * altura da tela, a rolagem é interna ao menu e sem barra à vista (roda do
 * mouse, toque e Tab continuam rolando: o item focado entra na tela sozinho).
 *
 * - Computador (lg+): o menu inteiro, com nome e ícone.
 * - Tablet (md até lg): uma faixa só de ícones, que também rola por dentro
 *   (sem ela, os ícones que não cabem esticavam a página para baixo). O nome
 *   aparece numa dica ao passar o mouse E ao chegar pelo teclado, desenhada
 *   numa camada fixa fora da faixa para a rolagem não cortá-la; no link ele
 *   continua como texto, que é o que o leitor de tela lê.
 * - Celular (abaixo de md): uma barra no topo abre o menu como gaveta, sobre um
 *   fundo escurecido. Esc, o fundo e o botão de fechar fecham. Embaixo fica uma
 *   barra fixa com os atalhos e o botão "Menu", que abre a gaveta.
 *
 * O menu é grafite nos dois temas (`data-tema="escuro"` só neste trecho), e o
 * item da página atual leva o verde da marca com letra escura. A gaveta desliza
 * com uma transição CSS curta, e só quando a pessoa não pediu menos movimento.
 */

import {
  Botao,
  IconeFechar,
  IconeMenu,
  SeloDaAdministracao,
} from "@simpleclick/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as EventoDeTeclado,
  type MouseEvent as EventoDeMouse,
  type ReactNode,
} from "react";

import { FOCO } from "./estilo-do-menu.ts";
import { SecaoDoMenu } from "./SecaoDoMenu.tsx";
import {
  itemEstaAtivo,
  type ItemDoMenu,
  type SecaoDoMenu as SecaoNoMenu,
} from "./tipos-do-menu.ts";

export { itemEstaAtivo };
export type { ItemDoMenu, SecaoNoMenu as SecaoDoMenu };

export interface PropsDoMenuLateral {
  /** Nome da navegação para o leitor de tela. */
  readonly rotulo: string;
  /** A marca no topo do menu (normalmente um link para o início). */
  readonly marca: ReactNode;
  /** Sob a marca, no menu: por exemplo, a loja aberta. */
  readonly contexto?: ReactNode;
  /** Sob a marca, na barra do topo do celular (cabe pouco). Padrão: `contexto`. */
  readonly contextoDoTopo?: ReactNode;
  /** As seções do menu, em ordem. Tem precedência sobre `itens`. */
  readonly secoes?: readonly SecaoNoMenu[];
  /** Atalho para uma lista simples, sem títulos (a administração usa). */
  readonly itens?: readonly ItemDoMenu[];
  /** Itens secundários no pé do menu, depois de `itens`. */
  readonly itensDoRodape?: readonly ItemDoMenu[];
  /** Os atalhos da barra de baixo do celular. Use de 3 a 5. */
  readonly atalhos?: readonly ItemDoMenu[];
  /** Acrescenta o botão "Menu" à barra de baixo, para abrir a gaveta. */
  readonly botaoDoMenuNosAtalhos?: boolean;
  /** Quem está logado (avatar, Minha conta, Sair), no pé do menu. */
  readonly usuario?: ReactNode;
  /** Marca o menu lateral para o tutorial achá-lo (`data-tutorial`). */
  readonly alvoDoTutorial?: string;
  /**
   * `administracao` veste o menu com o modo da plataforma (card 170, D-13):
   * classe `sc-menu--administracao` e o selo no topo da sidebar e da barra do
   * celular. O padrão (`painel`) deixa o menu do dono como sempre foi.
   */
  readonly modo?: "painel" | "administracao";
}

/** A largura a partir da qual o menu deixa de ser gaveta (o `md` do Tailwind). */
const SEM_GAVETA = "(min-width: 48rem)";

/** A faixa só de ícones (do `md` ao `lg` do Tailwind). */
const FAIXA_DE_ICONES = "(min-width: 48rem) and (max-width: 63.99rem)";

interface Dica {
  readonly texto: string;
  readonly esquerda: number;
  readonly meio: number;
}

/** A dica do item sob o mouse ou o foco, só na faixa de ícones. */
function dicaDoItem(alvo: EventTarget | null): Dica | null {
  if (!(alvo instanceof Element)) return null;
  if (!window.matchMedia(FAIXA_DE_ICONES).matches) return null;
  const item = alvo.closest("a, button");
  const texto = item?.querySelector("[data-nome-do-item]")?.textContent?.trim();
  if (item == null || !texto) return null;
  const caixa = item.getBoundingClientRect();
  return {
    texto,
    esquerda: caixa.right + 12,
    meio: caixa.top + caixa.height / 2,
  };
}

function secoesDoMenu(props: PropsDoMenuLateral): readonly SecaoNoMenu[] {
  if (props.secoes !== undefined) return props.secoes;
  const lista: SecaoNoMenu[] = [];
  if (props.itens !== undefined && props.itens.length > 0) {
    lista.push({ itens: props.itens });
  }
  if (props.itensDoRodape !== undefined && props.itensDoRodape.length > 0) {
    lista.push({ itens: props.itensDoRodape });
  }
  return lista;
}

const SELETOR_DE_FOCAVEIS =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focaveis(painel: HTMLElement): HTMLElement[] {
  return [...painel.querySelectorAll<HTMLElement>(SELETOR_DE_FOCAVEIS)].filter(
    (elemento) =>
      elemento.offsetParent !== null && !elemento.closest("[hidden]"),
  );
}

export function MenuLateral(props: PropsDoMenuLateral) {
  const {
    rotulo,
    marca,
    contexto,
    contextoDoTopo = contexto,
    atalhos = [],
    botaoDoMenuNosAtalhos = false,
    usuario,
    alvoDoTutorial,
    modo = "painel",
  } = props;
  const administracao = modo === "administracao";
  const classeDoModo = administracao ? "sc-menu--administracao" : "";
  const selo = administracao ? <SeloDaAdministracao /> : null;
  const secoes = secoesDoMenu(props);
  const caminho = usePathname();
  const idDoMenu = useId();
  const painel = useRef<HTMLElement>(null);
  const quemAbriu = useRef<HTMLElement | null>(null);
  const [aberta, setAberta] = useState(false);
  const [dica, setDica] = useState<Dica | null>(null);
  const abrir = useCallback(() => {
    quemAbriu.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setAberta(true);
  }, []);

  const fechar = useCallback(() => setAberta(false), []);

  // Com a gaveta aberta: o foco entra nela, a página de trás não rola, Esc
  // fecha, e ao fechar o foco volta para o botão que abriu.
  useEffect(() => {
    if (!aberta) return;
    const elemento = painel.current;
    if (elemento !== null) focaveis(elemento)[0]?.focus();
    const rolagemAntes = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") {
        evento.preventDefault();
        setAberta(false);
      }
    }
    // Se a tela crescer até o menu deixar de ser gaveta, a gaveta fecha.
    const largura = window.matchMedia(SEM_GAVETA);
    function aoMudarLargura() {
      if (largura.matches) setAberta(false);
    }
    document.addEventListener("keydown", aoTeclar);
    largura.addEventListener("change", aoMudarLargura);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      largura.removeEventListener("change", aoMudarLargura);
      document.body.style.overflow = rolagemAntes;
      quemAbriu.current?.focus();
    };
  }, [aberta]);

  /** O Tab dá a volta dentro da gaveta enquanto ela está aberta. */
  function prenderFoco(evento: EventoDeTeclado<HTMLElement>) {
    if (!aberta || evento.key !== "Tab" || painel.current === null) return;
    const lista = focaveis(painel.current);
    const primeiro = lista[0];
    const ultimo = lista.at(-1);
    if (primeiro === undefined || ultimo === undefined) return;
    if (evento.shiftKey && document.activeElement === primeiro) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault();
      primeiro.focus();
    }
  }

  /** Escolher um destino na gaveta fecha a gaveta. */
  function aoClicarNoMenu(evento: EventoDeMouse<HTMLElement>) {
    if (evento.target instanceof Element && evento.target.closest("a")) {
      setAberta(false);
    }
  }

  const botaoDeAbrir = (
    <Botao
      variante="discreta"
      soIcone
      icone={<IconeMenu />}
      aria-expanded={aberta}
      aria-controls={idDoMenu}
      onClick={abrir}
    >
      Abrir menu
    </Botao>
  );

  return (
    <>
      {/* Celular: a barra do topo, com a marca e o botão da gaveta. */}
      <header
        data-tema={administracao ? undefined : "escuro"}
        className={`sticky top-0 z-30 flex h-16 items-center justify-between gap-3 bg-[var(--cor-superficie)] px-4 text-[var(--cor-tinta)] md:hidden ${classeDoModo}`}
      >
        <div className="flex min-w-0 flex-col items-start">
          {marca}
          {contextoDoTopo}
          {selo}
        </div>
        {botaoDeAbrir}
      </header>

      {/* Celular: o fundo escurecido atrás da gaveta. */}
      <div
        aria-hidden="true"
        onClick={fechar}
        className={`fixed inset-0 z-40 bg-[var(--cor-sobreposicao)] motion-safe:transition-opacity motion-safe:duration-200 md:hidden ${aberta ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />

      <aside
        ref={painel}
        id={idDoMenu}
        data-tema={administracao ? undefined : "escuro"}
        data-tutorial={alvoDoTutorial}
        data-modo={administracao ? "administracao" : undefined}
        data-aberta={aberta || undefined}
        {...(aberta
          ? { role: "dialog", "aria-modal": true, "aria-label": rotulo }
          : {})}
        onKeyDown={prenderFoco}
        onClick={aoClicarNoMenu}
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(18rem,85vw)] flex-col gap-4 overflow-hidden rounded-r-[var(--raio-cartao)] bg-[var(--cor-superficie)] p-3 text-[var(--cor-tinta)] motion-safe:transition-[translate,visibility] motion-safe:duration-200 md:sticky md:top-3 md:z-20 md:m-3 md:h-[calc(100dvh-1.5rem)] md:w-20 md:shrink-0 md:translate-x-0 md:rounded-[var(--raio-cartao)] md:visible lg:w-64 ${classeDoModo} ${aberta ? "translate-x-0" : "invisible -translate-x-full"}`}
      >
        <div className="flex items-start justify-between gap-2 px-2 pt-2 md:max-lg:justify-center md:max-lg:px-0">
          <div className="flex min-w-0 flex-col md:max-lg:hidden">
            {marca}
            {contexto}
            {selo !== null ? <span className="mt-2">{selo}</span> : null}
          </div>
          <span className="hidden md:max-lg:flex">
            {/* Na faixa de ícones, só a inicial da marca. */}
            <span
              aria-hidden="true"
              className="flex size-10 items-center justify-center rounded-[var(--raio)] bg-[var(--cor-primaria)] font-[family-name:var(--fonte-titulo)] text-lg font-bold text-[var(--cor-em-primaria)]"
            >
              s
            </span>
          </span>
          <span className="md:hidden">
            <Botao
              variante="discreta"
              soIcone
              icone={<IconeFechar />}
              onClick={fechar}
            >
              Fechar menu
            </Botao>
          </span>
        </div>

        <nav
          aria-label={rotulo}
          onPointerOver={(evento) => setDica(dicaDoItem(evento.target))}
          onPointerLeave={() => setDica(null)}
          onFocus={(evento) =>
            setDica(
              evento.target.matches(":focus-visible")
                ? dicaDoItem(evento.target)
                : null,
            )
          }
          onBlur={() => setDica(null)}
          onScroll={() => setDica(null)}
          className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain [scrollbar-width:none] md:max-lg:gap-2 [&::-webkit-scrollbar]:hidden"
        >
          {secoes.map((secao, indice) => (
            <SecaoDoMenu
              key={secao.titulo ?? `secao-${indice}`}
              secao={secao}
              caminho={caminho}
            />
          ))}
          {usuario !== undefined ? (
            <div className="mt-auto border-t border-[var(--cor-borda)] pt-3">
              {usuario}
            </div>
          ) : null}
        </nav>
      </aside>

      {dica !== null ? (
        <span
          aria-hidden="true"
          data-tema="escuro"
          className="pointer-events-none fixed z-50 hidden -translate-y-1/2 whitespace-nowrap rounded-[var(--raio)] bg-[var(--cor-superficie-alta)] px-3 py-1.5 text-sm font-medium text-[var(--cor-tinta)] shadow-[var(--sombra-larga)] md:max-lg:block"
          style={{ left: dica.esquerda, top: dica.meio }}
        >
          {dica.texto}
        </span>
      ) : null}

      {/* Celular: os atalhos na barra de baixo. */}
      {atalhos.length > 0 ? (
        <nav
          aria-label="Atalhos"
          data-tema={administracao ? undefined : "escuro"}
          className={`fixed inset-x-0 bottom-0 z-30 border-t border-[var(--cor-borda)] bg-[var(--cor-superficie)] pb-[env(safe-area-inset-bottom)] text-[var(--cor-tinta)] md:hidden ${classeDoModo}`}
        >
          <ul
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${atalhos.length + (botaoDoMenuNosAtalhos ? 1 : 0)}, 1fr)`,
            }}
          >
            {atalhos.map((atalho) => {
              const ativo = itemEstaAtivo(caminho, atalho);
              const Desenho = atalho.icone;
              const novos = atalho.contador ?? 0;
              return (
                <li key={atalho.href}>
                  <Link
                    href={atalho.href}
                    aria-current={ativo ? "page" : undefined}
                    className={`flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-xs font-medium ${FOCO} ${ativo ? "text-[var(--cor-tinta)]" : "text-[var(--cor-tinta-suave)]"}`}
                  >
                    <span
                      className={`relative flex h-8 w-12 items-center justify-center rounded-[var(--raio-completo)] motion-safe:transition-colors motion-safe:duration-150 ${ativo ? "bg-[var(--cor-primaria)] text-[var(--cor-em-primaria)]" : ""}`}
                    >
                      <Desenho />
                      {novos > 0 ? (
                        <>
                          <span
                            aria-hidden="true"
                            className="absolute -top-1 right-0 min-w-4 rounded-[var(--raio-completo)] bg-[var(--cor-primaria)] px-1 text-center text-[0.625rem] font-bold leading-4 text-[var(--cor-em-primaria)] ring-2 ring-[var(--cor-superficie)]"
                          >
                            {novos > 99 ? "99+" : novos}
                          </span>
                          <span className="sr-only">
                            , {novos} {novos === 1 ? "novo" : "novos"}
                          </span>
                        </>
                      ) : null}
                    </span>
                    <span className="max-w-full truncate" title={atalho.rotulo}>
                      {atalho.rotulo}
                    </span>
                  </Link>
                </li>
              );
            })}
            {botaoDoMenuNosAtalhos ? (
              <li>
                <button
                  type="button"
                  aria-expanded={aberta}
                  aria-controls={idDoMenu}
                  onClick={abrir}
                  className={`flex min-h-16 w-full flex-col items-center justify-center gap-1 rounded-none border-0 bg-transparent px-1 text-xs font-medium text-[var(--cor-tinta-suave)] ${FOCO}`}
                >
                  <span className="flex h-8 w-12 items-center justify-center">
                    <IconeMenu />
                  </span>
                  <span>Menu</span>
                </button>
              </li>
            ) : null}
          </ul>
        </nav>
      ) : null}
    </>
  );
}
