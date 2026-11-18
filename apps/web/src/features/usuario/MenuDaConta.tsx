"use client";

/**
 * O menu da conta do topo (card #105): o avatar abre os itens do papel, o
 * "Ver tutorial" (cliente) e o "Sair". Substitui a lateral do usuário nas
 * áreas do cliente.
 *
 * É um botão que mostra e esconde um painel (`aria-expanded`), com Esc, clique
 * fora e devolução do foco ao botão. Os itens vêm de `itensDoUsuario`, a mesma
 * tabela da lateral: nenhum item novo, e quem decide o que a pessoa vê é o
 * papel lido da sessão NO SERVIDOR (a interface não autoriza nada).
 *
 * Na loja, "Entrar" e "Criar conta" abrem a janela de acesso sem sair da
 * página (um `<a>` comum com `data-abre-acesso`, porque o `Link` do Next trata
 * o toque antes e a janela, que escuta no documento, não abriria).
 */
import { IconeInfo, IconeSair, IconeUsuario } from "@simpleclick/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import {
  itemAtivo,
  itensDoUsuario,
  nomeLegivel,
  SELO_DO_PAPEL,
  type LojaNaBarra,
  type UsuarioDaBarra,
} from "../../lib/quem-esta-logado.ts";
import { EVENTO_VER_TUTORIAL } from "../tutorial/passos.ts";
import { ICONES_DO_USUARIO } from "./icones-do-usuario.ts";
import { limparDadosLocaisDoCliente } from "./local-do-aparelho.ts";

export interface MenuDaContaProps {
  readonly usuario: UsuarioDaBarra;
  /** A loja aberta, quando o topo está numa página de loja. */
  readonly loja?: LojaNaBarra | undefined;
  /** A ação do servidor que encerra a sessão e volta para `caminho`. */
  readonly sair: (caminho: string) => Promise<void>;
}

function abaDeAcesso(
  id: string,
  loja: LojaNaBarra | undefined,
): "entrar" | "criar" | undefined {
  if (loja === undefined) return undefined;
  if (id === "entrar") return "entrar";
  if (id === "criar-conta") return "criar";
  return undefined;
}

export function MenuDaConta({ usuario, loja, sair }: MenuDaContaProps) {
  const caminho = usePathname();
  const idDoPainel = useId();
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const [aberto, setAberto] = useState(false);
  const [saindo, iniciarSaida] = useTransition();

  // Aberto: Esc fecha (e devolve o foco ao botão); clique fora fecha.
  useEffect(() => {
    if (!aberto) return;
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key !== "Escape") return;
      setAberto(false);
      botao.current?.focus();
    }
    function aoClicar(evento: PointerEvent) {
      const alvo = evento.target;
      if (alvo instanceof Node && raiz.current?.contains(alvo)) return;
      setAberto(false);
    }
    document.addEventListener("keydown", aoTeclar);
    document.addEventListener("pointerdown", aoClicar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.removeEventListener("pointerdown", aoClicar);
    };
  }, [aberto]);

  const visitante = usuario.papel === "visitante";
  const itens = itensDoUsuario(usuario, caminho, loja);
  const selo = SELO_DO_PAPEL[usuario.papel];
  const nome = visitante ? "Boas-vindas" : nomeLegivel(usuario.nome);
  const detalhe = visitante ? "Entre para pedir e acompanhar" : usuario.email;

  return (
    <div ref={raiz} className="sc-menu-conta" data-papel={usuario.papel}>
      <button
        ref={botao}
        type="button"
        className="sc-menu-conta__botao"
        data-menu-da-conta=""
        data-abre-lateral=""
        aria-expanded={aberto}
        aria-controls={idDoPainel}
        aria-label={
          visitante
            ? "Menu da conta: entrar ou criar conta"
            : // As iniciais do avatar são texto que se vê: entram no nome
              // (WCAG 2.5.3, card #132). Sem parênteses: quem compara nome e
              // texto à mostra (o axe, a voz) descarta o que está entre eles.
              `Menu da conta de ${usuario.primeiroNome}, ${usuario.iniciais}`
        }
        onClick={() => setAberto((antes) => !antes)}
      >
        <span className="sc-menu-conta__avatar" aria-hidden="true">
          {visitante ? <IconeUsuario /> : <span>{usuario.iniciais}</span>}
        </span>
        {visitante && (
          <span className="sc-menu-conta__entrar" aria-hidden="true">
            Entrar
          </span>
        )}
      </button>

      <div
        id={idDoPainel}
        className="sc-menu-conta__painel"
        hidden={!aberto}
        data-aberto={aberto || undefined}
      >
        <header className="sc-menu-conta__quem">
          <strong className="sc-menu-conta__nome">{nome}</strong>
          <span className="sc-menu-conta__detalhe">{detalhe}</span>
          {selo !== null && <span className="sc-menu-conta__selo">{selo}</span>}
        </header>

        <nav aria-label="Menu da conta">
          <ul className="sc-menu-conta__lista">
            {itens.map((item) => {
              const Desenho = ICONES_DO_USUARIO[item.icone];
              const atual = itemAtivo(caminho, item.href, item.exato === true);
              const aba = abaDeAcesso(item.id, loja);
              const conteudo = (
                <>
                  <Desenho aria-hidden="true" />
                  <span>{item.rotulo}</span>
                </>
              );
              return (
                <li key={item.id}>
                  {aba !== undefined ? (
                    <a
                      href={item.href}
                      className="sc-menu-conta__item"
                      data-destaque={item.destaque === true || undefined}
                      data-abre-acesso={aba}
                      onClick={() => setAberto(false)}
                    >
                      {conteudo}
                    </a>
                  ) : (
                    <Link
                      href={item.href}
                      prefetch={false}
                      className="sc-menu-conta__item"
                      aria-current={atual ? "page" : undefined}
                      data-destaque={item.destaque === true || undefined}
                      onClick={() => setAberto(false)}
                    >
                      {conteudo}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        {!visitante && (
          <footer className="sc-menu-conta__rodape">
            {/* O tutorial do cliente (card #39) mora junto do menu da conta. */}
            {usuario.papel === "cliente" && (
              <button
                type="button"
                className="sc-menu-conta__item"
                data-ver-tutorial=""
                onClick={() => {
                  setAberto(false);
                  window.dispatchEvent(new Event(EVENTO_VER_TUTORIAL));
                }}
              >
                <IconeInfo aria-hidden="true" />
                <span>Ver tutorial</span>
              </button>
            )}
            <button
              type="button"
              className="sc-menu-conta__item sc-menu-conta__item--sair"
              disabled={saindo}
              onClick={() => {
                // Sair apaga o que o feed guardou neste aparelho (localização, stories).
                limparDadosLocaisDoCliente();
                iniciarSaida(async () => {
                  await sair(caminho ?? "/");
                });
              }}
            >
              <IconeSair aria-hidden="true" />
              <span>{saindo ? "Saindo…" : "Sair"}</span>
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
