/**
 * A foto de fundo da vitrine ou do topo do cardápio, com a versão do CELULAR.
 *
 * O dono ajusta uma foto para o computador e outra para o celular (a moldura
 * em pé do cartão, a faixa mais alta do cardápio). Aqui o navegador escolhe: em
 * telas estreitas (até 767 px, o mesmo ponto em que o CSS da vitrine troca a
 * moldura) usa a do celular; nas demais, a do computador. Sem versão do
 * celular, todos veem a do computador. É `<picture>`: a escolha é do navegador,
 * sem script, e a página já sai certa do servidor.
 */
import type { ImgHTMLAttributes } from "react";

/** A tela estreita: celular e o que vem abaixo do tablet (768 px). */
export const TELA_ESTREITA = "(max-width: 767px)";

export interface FotoDaLojaProps extends Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src" | "alt"
> {
  /** A foto do computador (e de quem não tem a do celular). */
  readonly src: string;
  /** A foto do celular; nula: o celular usa a do computador. */
  readonly celular?: string | null | undefined;
}

export function FotoDaLoja({ src, celular, ...resto }: FotoDaLojaProps) {
  return (
    <picture className="sc-foto-da-loja">
      {celular ? <source media={TELA_ESTREITA} srcSet={celular} /> : null}
      <img src={src} alt="" {...resto} />
    </picture>
  );
}
