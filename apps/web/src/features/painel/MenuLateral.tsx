"use client";

/**
 * O menu lateral das áreas logadas (painel do dono e, depois, a administração).
 *
 * Não sabe nada de loja: recebe os itens por propriedade e só decide como
 * mostrá-los em cada tamanho de tela.
 *
 * - Computador (lg+): o menu inteiro, com nome e ícone.
 * - Tablet (md até lg): uma faixa só de ícones. O nome aparece numa dica ao
 *   passar o mouse E ao chegar pelo teclado, e continua no texto do link, que
 *   é o que o leitor de tela lê.
 * - Celular (abaixo de md): uma barra no topo abre o menu como gaveta, sobre um
 *   fundo escurecido. Esc, o fundo e o botão de fechar fecham. Embaixo fica uma
 *   barra fixa com os atalhos.
 *
 * O menu é grafite nos dois temas (`data-tema="escuro"` só neste trecho), e o
 * item da página atual leva o verde da marca com letra escura. A gaveta desliza
 * com uma transição CSS curta, e só quando a pessoa não pediu menos movimento.
 */

import {
  Botao,
  IconeFechar,
  IconeMenu,
  IconeSeta,
  type Icone,
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

export interface SubitemDoMenu {
  readonly rotulo: string;
  readonly href: string;
}

export interface ItemDoMenu {
  readonly rotulo: string;
  readonly href: string;
  readonly icone: Icone;
  /** Ativo só no endereço exato (a página inicial, que é prefixo de todas). */
  readonly exato?: boolean;
  /**
   * Com subitens, o item vira um grupo que abre e fecha (`aria-expanded`). Na
   * faixa só de ícones o grupo não cabe: o item vira link para o `href`.
   */
  readonly subitens?: readonly SubitemDoMenu[];
}

export interface PropsDoMenuLateral {
  /** Nome da navegação para o leitor de tela. */
  readonly rotulo: string;
  /** A marca no topo do menu (normalmente um link para o início). */
  readonly marca: ReactNode;
  /** Uma linha de contexto sob a marca — por exemplo, a loja aberta. */
  readonly contexto?: ReactNode;
  readonly itens: readonly ItemDoMenu[];
  /** Itens secundários no pé do menu (ver a loja, trocar de loja, conta). */
  readonly itensDoRodape?: readonly ItemDoMenu[];
  /** Os atalhos da barra de baixo do celular. Use de 4 a 5. */
  readonly atalhos?: readonly ItemDoMenu[];
}

/** A largura a partir da qual o menu deixa de ser gaveta (o `md` do Tailwind). */
const SEM_GAVETA = "(min-width: 48rem)";

function bateCom(caminho: string | null, href: string, exato = false): boolean {
  if (caminho === null) return false;
  if (exato) return caminho === href;
  return caminho === href || caminho.startsWith(`${href}/`);
}

/** O item é a página atual, ou o grupo contém a página atual. */
export function itemEstaAtivo(
  caminho: string | null,
  item: ItemDoMenu,
): boolean {
  if (bateCom(caminho, item.href, item.exato)) return true;
  return (item.subitens ?? []).some((sub) => bateCom(caminho, sub.href));
}

const FOCO =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cor-foco)]";

const BASE_DO_ITEM = `group relative flex min-h-[var(--altura-toque-grande)] w-full items-center gap-3 rounded-[var(--raio)] px-3 text-left text-sm font-medium motion-safe:transition-colors motion-safe:duration-150 md:max-lg:justify-center md:max-lg:px-0 ${FOCO}`;

const ITEM_ATIVO =
  "bg-[var(--cor-primaria)] font-semibold text-[var(--cor-em-primaria)]";
const ITEM_COM_ATIVO_DENTRO =
  "bg-[var(--cor-superficie-alta)] text-[var(--cor-tinta)]";
const ITEM_PARADO =
  "text-[var(--cor-tinta-suave)] hover:bg-[var(--cor-superficie-alta)] hover:text-[var(--cor-tinta)]";

/**
 * O nome do item. Na faixa de ícones ele vira dica: continua no DOM (o link
 * segue com nome), só fica transparente até o mouse ou o foco chegar.
 */
const NOME_DO_ITEM =
  "truncate md:max-lg:pointer-events-none md:max-lg:absolute md:max-lg:left-full md:max-lg:z-50 md:max-lg:ml-3 md:max-lg:rounded-[var(--raio)] md:max-lg:bg-[var(--cor-superficie-alta)] md:max-lg:px-3 md:max-lg:py-1.5 md:max-lg:font-medium md:max-lg:whitespace-nowrap md:max-lg:text-[var(--cor-tinta)] md:max-lg:opacity-0 md:max-lg:shadow-[var(--sombra-larga)] md:max-lg:group-hover:opacity-100 md:max-lg:group-focus-visible:opacity-100";

function classeDoItem(ativo: boolean, comAtivoDentro = false): string {
  if (ativo) return `${BASE_DO_ITEM} ${ITEM_ATIVO}`;
  if (comAtivoDentro) return `${BASE_DO_ITEM} ${ITEM_COM_ATIVO_DENTRO}`;
  return `${BASE_DO_ITEM} ${ITEM_PARADO}`;
}

function LinkDoMenu({
  item,
  caminho,
  className = "",
}: {
  readonly item: ItemDoMenu;
  readonly caminho: string | null;
  readonly className?: string;
}) {
  const pagina = bateCom(caminho, item.href, item.exato);
  const dentro = !pagina && itemEstaAtivo(caminho, item);
  const Desenho = item.icone;
  return (
    <Link
      href={item.href}
      aria-current={pagina ? "page" : dentro ? "true" : undefined}
      className={`${classeDoItem(pagina, dentro)} ${className}`}
    >
      <Desenho className="shrink-0" />
      <span className={NOME_DO_ITEM}>{item.rotulo}</span>
    </Link>
  );
}

function GrupoDoMenu({
  item,
  caminho,
  aberto,
  alternar,
}: {
  readonly item: ItemDoMenu & { readonly subitens: readonly SubitemDoMenu[] };
  readonly caminho: string | null;
  readonly aberto: boolean;
  readonly alternar: () => void;
}) {
  const idDaLista = useId();
  const dentro = itemEstaAtivo(caminho, item);
  const Desenho = item.icone;
  return (
    <>
      {/* Faixa de ícones: o grupo vira link para a primeira tela dele. */}
      <LinkDoMenu
        item={item}
        caminho={caminho}
        className="hidden md:max-lg:flex"
      />
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls={idDaLista}
        onClick={alternar}
        className={`${classeDoItem(false, dentro)} md:max-lg:hidden`}
      >
        <Desenho className="shrink-0" />
        <span className="flex-1 truncate">{item.rotulo}</span>
        <IconeSeta
          className={`shrink-0 motion-safe:transition-transform motion-safe:duration-150 ${aberto ? "rotate-180" : ""}`}
        />
      </button>
      <ul
        id={idDaLista}
        hidden={!aberto}
        className="mt-1 ml-5 flex flex-col gap-1 border-l border-[var(--cor-borda)] pl-3 md:max-lg:hidden"
      >
        {item.subitens.map((sub) => {
          const pagina = bateCom(caminho, sub.href);
          return (
            <li key={sub.href}>
              <Link
                href={sub.href}
                aria-current={pagina ? "page" : undefined}
                className={`flex min-h-[var(--altura-toque)] items-center rounded-[var(--raio)] px-3 text-sm motion-safe:transition-colors motion-safe:duration-150 ${FOCO} ${pagina ? ITEM_ATIVO : ITEM_PARADO}`}
              >
                {sub.rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function ListaDoMenu({
  itens,
  caminho,
  abertos,
  alternar,
}: {
  readonly itens: readonly ItemDoMenu[];
  readonly caminho: string | null;
  readonly abertos: Readonly<Record<string, boolean>>;
  readonly alternar: (rotulo: string, agora: boolean) => void;
}) {
  return (
    <ul className="flex flex-col gap-1">
      {itens.map((item) => {
        const subitens = item.subitens;
        if (subitens === undefined || subitens.length === 0) {
          return (
            <li key={item.href}>
              <LinkDoMenu item={item} caminho={caminho} />
            </li>
          );
        }
        // Fechado ou aberto à mão vale; sem toque, o grupo da página atual abre.
        const aberto = abertos[item.rotulo] ?? itemEstaAtivo(caminho, item);
        return (
          <li key={item.href}>
            <GrupoDoMenu
              item={{ ...item, subitens }}
              caminho={caminho}
              aberto={aberto}
              alternar={() => alternar(item.rotulo, aberto)}
            />
          </li>
        );
      })}
    </ul>
  );
}

const SELETOR_DE_FOCAVEIS =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focaveis(painel: HTMLElement): HTMLElement[] {
  return [...painel.querySelectorAll<HTMLElement>(SELETOR_DE_FOCAVEIS)].filter(
    (elemento) =>
      elemento.offsetParent !== null && !elemento.closest("[hidden]"),
  );
}

export function MenuLateral({
  rotulo,
  marca,
  contexto,
  itens,
  itensDoRodape = [],
  atalhos = [],
}: PropsDoMenuLateral) {
  const caminho = usePathname();
  const idDoMenu = useId();
  const painel = useRef<HTMLElement>(null);
  const quemAbriu = useRef<HTMLElement | null>(null);
  const [aberta, setAberta] = useState(false);
  const [abertos, setAbertos] = useState<Readonly<Record<string, boolean>>>({});

  const alternarGrupo = useCallback((nome: string, agora: boolean) => {
    setAbertos((antes) => ({ ...antes, [nome]: !agora }));
  }, []);

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
        data-tema="escuro"
        className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 bg-[var(--cor-superficie)] px-4 text-[var(--cor-tinta)] md:hidden"
      >
        <div className="flex min-w-0 flex-col">
          {marca}
          {contexto}
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
        data-tema="escuro"
        data-aberta={aberta || undefined}
        {...(aberta
          ? { role: "dialog", "aria-modal": true, "aria-label": rotulo }
          : {})}
        onKeyDown={prenderFoco}
        onClick={aoClicarNoMenu}
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(18rem,85vw)] flex-col gap-4 overflow-y-auto rounded-r-[var(--raio-cartao)] bg-[var(--cor-superficie)] p-3 text-[var(--cor-tinta)] motion-safe:transition-[translate,visibility] motion-safe:duration-200 md:sticky md:top-3 md:z-20 md:m-3 md:h-[calc(100dvh-1.5rem)] md:w-20 md:shrink-0 md:translate-x-0 md:rounded-[var(--raio-cartao)] md:visible md:max-lg:overflow-visible lg:w-64 ${aberta ? "translate-x-0" : "invisible -translate-x-full"}`}
      >
        <div className="flex items-start justify-between gap-2 px-2 pt-2 md:max-lg:justify-center md:max-lg:px-0">
          <div className="flex min-w-0 flex-col md:max-lg:hidden">
            {marca}
            {contexto}
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

        <nav aria-label={rotulo} className="flex flex-1 flex-col gap-4">
          <ListaDoMenu
            itens={itens}
            caminho={caminho}
            abertos={abertos}
            alternar={alternarGrupo}
          />
          {itensDoRodape.length > 0 ? (
            <div className="mt-auto border-t border-[var(--cor-borda)] pt-3">
              <ListaDoMenu
                itens={itensDoRodape}
                caminho={caminho}
                abertos={abertos}
                alternar={alternarGrupo}
              />
            </div>
          ) : null}
        </nav>
      </aside>

      {/* Celular: os atalhos na barra de baixo. */}
      {atalhos.length > 0 ? (
        <nav
          aria-label="Atalhos"
          data-tema="escuro"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--cor-borda)] bg-[var(--cor-superficie)] pb-[env(safe-area-inset-bottom)] text-[var(--cor-tinta)] md:hidden"
        >
          <ul
            className="grid"
            style={{ gridTemplateColumns: `repeat(${atalhos.length}, 1fr)` }}
          >
            {atalhos.map((atalho) => {
              const pagina = bateCom(caminho, atalho.href, atalho.exato);
              const ativo = itemEstaAtivo(caminho, atalho);
              const Desenho = atalho.icone;
              return (
                <li key={atalho.href}>
                  <Link
                    href={atalho.href}
                    aria-current={pagina ? "page" : ativo ? "true" : undefined}
                    className={`flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-xs font-medium ${FOCO} ${ativo ? "text-[var(--cor-tinta)]" : "text-[var(--cor-tinta-suave)]"}`}
                  >
                    <span
                      className={`flex h-8 w-12 items-center justify-center rounded-[var(--raio-completo)] motion-safe:transition-colors motion-safe:duration-150 ${ativo ? "bg-[var(--cor-primaria)] text-[var(--cor-em-primaria)]" : ""}`}
                    >
                      <Desenho />
                    </span>
                    <span className="max-w-full truncate">{atalho.rotulo}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
    </>
  );
}
