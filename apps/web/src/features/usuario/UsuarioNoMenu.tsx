"use client";

/**
 * Quem está logado, no pé do menu lateral do painel e da administração
 * (card #22). O menu lateral já é a navegação, então a pessoa, "Explorar"
 * (o feed é público), "Minha conta" e "Sair" entram aqui, sem repetir os
 * itens do menu.
 *
 * Na faixa só de ícones do tablet (md até lg) ficam só o avatar e os ícones;
 * o nome de cada ação continua no texto, para o leitor de tela.
 */
import "@simpleclick/ui/styles/usuario.css";

import { IconeExplorar, IconeSair, IconeUsuario } from "@simpleclick/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { limparDadosLocaisDoCliente } from "./local-do-aparelho.ts";

import {
  itemAtivo,
  nomeLegivel,
  SELO_DO_PAPEL,
  type UsuarioDaBarra,
} from "../../lib/quem-esta-logado.ts";

export interface UsuarioNoMenuProps {
  readonly usuario: UsuarioDaBarra;
  readonly sair: (caminho: string) => Promise<void>;
}

export function UsuarioNoMenu({ usuario, sair }: UsuarioNoMenuProps) {
  const caminho = usePathname();
  const [saindo, iniciarSaida] = useTransition();
  if (usuario.papel === "visitante") return null;

  const selo = SELO_DO_PAPEL[usuario.papel];
  const naConta = itemAtivo(caminho, "/conta");
  // "Minha conta" leva a /conta/dados, que abre o modal da conta (card #151).

  return (
    <div className="sc-usuario-menu">
      <div className="sc-usuario-menu__pessoa">
        <span className="sc-usuario-menu__avatar" aria-hidden="true">
          <span>{usuario.iniciais}</span>
        </span>
        <span className="sc-usuario-menu__quem">
          <strong className="sc-usuario-menu__nome">{nomeLegivel(usuario.nome)}</strong>
          {selo !== null && (
            <span className="sc-usuario-menu__selo">{selo}</span>
          )}
        </span>
      </div>
      {usuario.papel !== "admin" && (
        <Link href="/explorar" className="sc-usuario-menu__acao">
          <IconeExplorar aria-hidden="true" />
          <span className="sc-usuario-menu__rotulo">Explorar</span>
        </Link>
      )}
      <Link
        href="/conta/dados"
        {...(usuario.papel === "admin" ? { "data-abre-conta": "dados" } : {})}
        aria-current={naConta ? "page" : undefined}
        className="sc-usuario-menu__acao"
      >
        <IconeUsuario aria-hidden="true" />
        <span className="sc-usuario-menu__rotulo">Minha conta</span>
      </Link>
      <button
        type="button"
        className="sc-usuario-menu__acao sc-usuario-menu__acao--sair"
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
        <span className="sc-usuario-menu__rotulo">
          {saindo ? "Saindo…" : "Sair"}
        </span>
      </button>
    </div>
  );
}
