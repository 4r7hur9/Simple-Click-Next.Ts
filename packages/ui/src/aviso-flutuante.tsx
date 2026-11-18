"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { TomDeAviso } from "./aviso";
import {
  IconeAlerta,
  IconeConfirmar,
  IconeErro,
  IconeFechar,
  IconeInfo,
} from "./icones";

/**
 * Aviso flutuante: confirmação curta que some sozinha ("adicionado à sacola").
 *
 * - **Anunciado sem roubar o foco.** Há SEMPRE duas regiões vivas montadas, uma
 *   `role="status"` (educada) e uma `role="alert"` (só para erro). O aviso entra
 *   DENTRO da região, e é a mudança de conteúdo que o leitor de tela anuncia:
 *   uma região criada junto com o texto nem sempre é lida. O foco não se mexe.
 * - **Dura pelo menos 5 segundos**, pausa enquanto o mouse ou o foco estão em
 *   cima, e fecha a qualquer momento (botão ou Esc com o foco nele).
 * - A ação opcional ("Desfazer", "Ver sacola") é um botão de verdade, na ordem
 *   do Tab. O texto sempre diz o que aconteceu: a cor não é o único sinal.
 *
 * É controlado: quem chama passa `mensagem` (ou `null` para nada) e recebe o
 * fim da vida do aviso em `aoFechar`.
 */

/** Piso de permanência: menos que isso não dá tempo de ler com calma. */
export const DURACAO_MINIMA_DO_AVISO_MS = 5000;
const DURACAO_PADRAO_DO_AVISO_MS = 6000;

export type AcaoDoAviso = {
  rotulo: string;
  aoAcionar: () => void;
};

export type AvisoFlutuanteProps = {
  tom?: TomDeAviso | undefined;
  /** O que aconteceu. `null` ou ausente: nada à vista. */
  mensagem?: string | null | undefined;
  /** Tempo em milissegundos; nunca abaixo de 5 segundos. */
  duracao?: number | undefined;
  acao?: AcaoDoAviso | undefined;
  aoFechar: () => void;
  rotuloDoFechar?: string | undefined;
  /** Parado na página, sem `position: fixed`. Só para o catálogo `/ui`. */
  embutido?: boolean | undefined;
  className?: string | undefined;
};

const ICONE_DO_TOM = {
  info: IconeInfo,
  sucesso: IconeConfirmar,
  erro: IconeErro,
  atencao: IconeAlerta,
} as const;

export function AvisoFlutuante({
  tom = "sucesso",
  mensagem,
  duracao = DURACAO_PADRAO_DO_AVISO_MS,
  acao,
  aoFechar,
  rotuloDoFechar = "Fechar aviso",
  embutido = false,
  className,
}: AvisoFlutuanteProps) {
  const [sobMouse, setSobMouse] = useState(false);
  const [comFoco, setComFoco] = useState(false);
  const pausado = sobMouse || comFoco;

  const total = Math.max(duracao, DURACAO_MINIMA_DO_AVISO_MS);
  const restante = useRef(total);
  const fechar = useRef(aoFechar);
  useEffect(() => {
    fechar.current = aoFechar;
  });

  const visivel =
    mensagem !== null && mensagem !== undefined && mensagem !== "";

  // Aviso novo começa com o tempo cheio.
  useEffect(() => {
    restante.current = total;
  }, [mensagem, total]);

  // O relógio roda enquanto ninguém está lendo; ao pausar, guarda o que sobrou.
  useEffect(() => {
    if (!visivel || pausado) return undefined;
    const inicio = Date.now();
    const espera = setTimeout(() => fechar.current(), restante.current);
    return () => {
      clearTimeout(espera);
      restante.current = Math.max(0, restante.current - (Date.now() - inicio));
    };
  }, [visivel, pausado, mensagem]);

  const Icone = ICONE_DO_TOM[tom];
  const regiao = tom === "erro" ? "alert" : "status";

  function aoApertarTecla(evento: KeyboardEvent<HTMLDivElement>): void {
    if (evento.key === "Escape") aoFechar();
  }

  const aviso = visivel ? (
    <div
      className={`sc-aviso-flutuante__cartao sc-aviso-flutuante__cartao--${tom}`}
      onMouseEnter={() => setSobMouse(true)}
      onMouseLeave={() => setSobMouse(false)}
      onFocus={() => setComFoco(true)}
      onBlur={(evento) => {
        if (!evento.currentTarget.contains(evento.relatedTarget)) {
          setComFoco(false);
        }
      }}
      onKeyDown={aoApertarTecla}
    >
      <Icone className="sc-aviso-flutuante__icone" />
      <p className="sc-aviso-flutuante__mensagem">{mensagem}</p>
      {acao !== undefined && (
        <button
          type="button"
          className="sc-aviso-flutuante__acao"
          onClick={acao.aoAcionar}
        >
          {acao.rotulo}
        </button>
      )}
      <button
        type="button"
        className="sc-aviso-flutuante__fechar"
        onClick={aoFechar}
      >
        <IconeFechar />
        <span className="sc-so-leitor">{rotuloDoFechar}</span>
      </button>
    </div>
  ) : null;

  return (
    <div
      className={[
        "sc-aviso-flutuante",
        embutido && "sc-aviso-flutuante--embutido",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div role="status" aria-live="polite" aria-atomic="true">
        {regiao === "status" ? aviso : null}
      </div>
      <div role="alert" aria-atomic="true">
        {regiao === "alert" ? aviso : null}
      </div>
    </div>
  );
}
