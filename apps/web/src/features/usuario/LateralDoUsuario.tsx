"use client";

/**
 * A lateral do usuário: um trilho estreito e flutuante à esquerda que se abre
 * num painel com ícone e nome de cada item (card #22).
 *
 * - Telas largas (1024px+): o trilho fica sempre à vista, com 64px. Passar o
 *   mouse, chegar pelo teclado (qualquer foco dentro dele) ou tocar no avatar
 *   abre o painel por cima do conteúdo; o conteúdo da página reserva só a
 *   coluna do trilho.
 * - Telas menores (celular e tablet): o MESMO trilho, deitado no topo — uma
 *   pílula grafite flutuante com o avatar à esquerda, os ícones em linha e o
 *   Sair à direita. Tocar no avatar abre o painel inteiro (nome, selo e itens
 *   com texto) por cima da página; o X, o fundo e o Esc fecham. A barra de
 *   categorias do catálogo gruda logo abaixo da pílula (`--altura-da-barra`),
 *   e a sacola não é arrastada para cima dela.
 *
 * Componente de propriedades: quem monta (`app/_usuario/`) lê a sessão no
 * servidor e entrega a pessoa já pronta, junto com a ação de sair. Os links
 * saem no HTML do servidor, então funcionam antes de qualquer script.
 */
import "@simpleclick/ui/styles/usuario.css";

import {
  IconeConfiguracoes,
  IconeExplorar,
  IconeEstrela,
  IconeCriarConta,
  IconeFechar,
  IconeEntrar,
  IconeLocal,
  IconeLoja,
  IconeMetricas,
  IconePedido,
  IconeSair,
  IconeSeguranca,
  IconeAbrirFora,
  IconeTrocar,
  IconeUsuario,
  IconeDashboard,
  IconeInicio,
  IconeInfo,
  type Icone,
} from "@simpleclick/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";

/** Abaixo disto a lateral fica no topo (o mesmo corte do CSS). */
const COMO_GAVETA = "(max-width: 63.99rem)";

import {
  caminhoSemBarra,
  itemAtivo,
  nomeLegivel,
  itensDoUsuario,
  SELO_DO_PAPEL,
  type IconeDoItem,
  type LojaNaBarra,
  type UsuarioDaBarra,
} from "../../lib/quem-esta-logado.ts";
import { EVENTO_VER_TUTORIAL } from "../tutorial/passos.ts";

/** O desenho de cada item, pelo nome que a lógica de papéis devolve. */
export const ICONES_DO_USUARIO: Readonly<Record<IconeDoItem, Icone>> = {
  entrar: IconeEntrar,
  "criar-conta": IconeCriarConta,
  loja: IconeInicio,
  inicio: IconeDashboard,
  pedidos: IconePedido,
  dados: IconeUsuario,
  enderecos: IconeLocal,
  favoritos: IconeEstrela,
  explorar: IconeExplorar,
  seguranca: IconeSeguranca,
  painel: IconeMetricas,
  "ver-loja": IconeAbrirFora,
  conta: IconeUsuario,
  trocar: IconeTrocar,
  admin: IconeConfiguracoes,
  auditoria: IconeSeguranca,
};

export interface LateralDoUsuarioProps {
  readonly usuario: UsuarioDaBarra;
  /** A loja aberta, quando a lateral está numa página de loja. */
  readonly loja?: LojaNaBarra | undefined;
  /** A ação do servidor que encerra a sessão e volta para `caminho`. */
  readonly sair: (caminho: string) => Promise<void>;
}

/**
 * Na loja, Entrar e Criar conta abrem a janela de acesso (card #23) sem sair
 * da página; fora dela, o link navega para /entrar ou /cadastrar.
 */
function abaDeAcesso(
  id: string,
  loja: LojaNaBarra | undefined,
): "entrar" | "criar" | undefined {
  if (loja === undefined) return undefined;
  if (id === "entrar") return "entrar";
  if (id === "criar-conta") return "criar";
  return undefined;
}

/** O quadradinho do topo: as iniciais de quem entrou, ou a marca. */
function Avatar({ usuario }: { readonly usuario: UsuarioDaBarra }) {
  return (
    <span className="sc-usuario-lateral__avatar" aria-hidden="true">
      {usuario.papel === "visitante" ? (
        <IconeLoja />
      ) : (
        <span>{usuario.iniciais}</span>
      )}
    </span>
  );
}

export function LateralDoUsuario({
  usuario,
  loja,
  sair,
}: LateralDoUsuarioProps) {
  const caminho = usePathname();
  const idDoPainel = useId();
  const raiz = useRef<HTMLElement>(null);
  const botaoDoAvatar = useRef<HTMLButtonElement>(null);
  const botaoDeFechar = useRef<HTMLButtonElement>(null);
  const [aberta, setAberta] = useState(false);
  const [saindo, iniciarSaida] = useTransition();

  // Aberta: Esc e clique fora fecham.
  useEffect(() => {
    if (!aberta) return;
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") setAberta(false);
    }
    function aoClicar(evento: PointerEvent) {
      const alvo = evento.target;
      if (alvo instanceof Node && raiz.current?.contains(alvo)) return;
      if (alvo instanceof Element && alvo.closest("[data-abre-lateral]")) {
        return;
      }
      setAberta(false);
    }
    document.addEventListener("keydown", aoTeclar);
    document.addEventListener("pointerdown", aoClicar);

    // Aberta no celular: o foco entra no painel (no X), a página de trás não
    // rola, e ao fechar o foco volta para o avatar.
    const gaveta = window.matchMedia(COMO_GAVETA).matches;
    const rolagemAntes = document.body.style.overflow;
    if (gaveta) {
      botaoDeFechar.current?.focus();
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.removeEventListener("pointerdown", aoClicar);
      if (gaveta) {
        document.body.style.overflow = rolagemAntes;
        botaoDoAvatar.current?.focus();
      }
    };
  }, [aberta]);

  if (caminhoSemBarra(caminho)) return null;

  const itens = itensDoUsuario(usuario, caminho, loja);
  const selo = SELO_DO_PAPEL[usuario.papel];
  const nome = usuario.papel === "visitante" ? "Boas-vindas" : nomeLegivel(usuario.nome);
  const detalhe =
    usuario.papel === "visitante"
      ? "Entre para pedir e acompanhar"
      : usuario.email;

  return (
    <>
      <div
        aria-hidden="true"
        className="sc-usuario-lateral__fundo"
        data-aberta={aberta || undefined}
      />

      <aside
        ref={raiz}
        id={idDoPainel}
        className="sc-usuario-lateral"
        data-tema="escuro"
        data-papel={usuario.papel}
        data-aberta={aberta || undefined}
        aria-label="Sua conta"
      >
        <header className="sc-usuario-lateral__topo">
          <button
            ref={botaoDoAvatar}
            type="button"
            className="sc-usuario-lateral__alternar"
            data-abre-lateral=""
            aria-expanded={aberta}
            aria-controls={idDoPainel}
            onClick={() => setAberta((antes) => !antes)}
          >
            <Avatar usuario={usuario} />
            <span className="sc-so-leitor">
              {aberta ? "Recolher menu da conta" : "Abrir menu da conta"}
            </span>
          </button>
          <div className="sc-usuario-lateral__quem">
            <strong className="sc-usuario-lateral__nome">{nome}</strong>
            <span className="sc-usuario-lateral__detalhe">{detalhe}</span>
            {selo !== null && (
              <span className="sc-usuario-lateral__selo">{selo}</span>
            )}
          </div>
          {/* Só no painel aberto do celular e do tablet. */}
          <button
            ref={botaoDeFechar}
            type="button"
            className="sc-usuario-lateral__fechar"
            aria-label="Fechar menu da conta"
            onClick={() => setAberta(false)}
          >
            <IconeFechar aria-hidden="true" />
          </button>
        </header>

        <nav className="sc-usuario-lateral__nav" aria-label="Menu da conta">
          <ul className="sc-usuario-lateral__lista">
            {itens.map((item) => {
              const Desenho = ICONES_DO_USUARIO[item.icone];
              const atual = itemAtivo(caminho, item.href, item.exato === true);
              const aba = abaDeAcesso(item.id, loja);
              const conteudo = (
                <>
                  <Desenho aria-hidden="true" />
                  <span className="sc-usuario-lateral__rotulo">
                    {item.rotulo}
                  </span>
                </>
              );
              return (
                <li key={item.id}>
                  {aba !== undefined ? (
                    // Link comum, e não o do Next: o do Next trata o toque
                    // antes e a janela de acesso (que escuta no documento)
                    // não abriria. Sem script, navega para /entrar.
                    <a
                      href={item.href}
                      aria-label={item.rotulo}
                      data-destaque={item.destaque === true || undefined}
                      data-abre-acesso={aba}
                      className="sc-usuario-lateral__item"
                      onClick={() => setAberta(false)}
                    >
                      {conteudo}
                    </a>
                  ) : (
                    <Link
                      href={item.href}
                      prefetch={false}
                      aria-label={item.rotulo}
                      aria-current={atual ? "page" : undefined}
                      data-destaque={item.destaque === true || undefined}
                      className="sc-usuario-lateral__item"
                      onClick={() => setAberta(false)}
                    >
                      {conteudo}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        {usuario.papel !== "visitante" && (
          <footer className="sc-usuario-lateral__rodape">
            {/* O tutorial do cliente (card #39) mora junto desta lateral. */}
            {usuario.papel === "cliente" && (
              <button
                type="button"
                className="sc-usuario-lateral__item"
                aria-label="Ver tutorial"
                data-ver-tutorial=""
                onClick={() => {
                  setAberta(false);
                  window.dispatchEvent(new Event(EVENTO_VER_TUTORIAL));
                }}
              >
                <IconeInfo aria-hidden="true" />
                <span className="sc-usuario-lateral__rotulo">Ver tutorial</span>
              </button>
            )}
            <button
              type="button"
              className="sc-usuario-lateral__item sc-usuario-lateral__item--sair"
              aria-label={saindo ? "Saindo…" : "Sair"}
              disabled={saindo}
              onClick={() => {
                iniciarSaida(async () => {
                  await sair(caminho ?? "/");
                });
              }}
            >
              <IconeSair aria-hidden="true" />
              <span className="sc-usuario-lateral__rotulo">
                {saindo ? "Saindo…" : "Sair"}
              </span>
            </button>
          </footer>
        )}
      </aside>
    </>
  );
}
