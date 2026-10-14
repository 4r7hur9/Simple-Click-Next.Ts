"use client";

/**
 * O aviso de pedido novo: som, que pode ser silenciado, e alerta visual, que
 * não pode (AC-603).
 *
 * Silenciar é para o ambiente onde o som incomoda — e a escolha fica gravada
 * NESTE navegador, porque é uma preferência do lugar (o balcão, a cozinha), e
 * não da conta. O alerta visual continua de pé até o dono marcar os pedidos
 * como vistos: silenciar nunca pode virar "deixar de ver o pedido".
 */
import { useCallback, useEffect, useState } from "react";

/** Chave da preferência no navegador. Não guarda sessão nem dado pessoal. */
export const CHAVE_DO_SOM_SILENCIADO =
  "simpleclick.painel-pedidos.som-silenciado";

/** Um bipe curto, gerado na hora: não depende de arquivo de áudio. */
export function tocarBipe(): void {
  try {
    const contexto = new AudioContext();
    const oscilador = contexto.createOscillator();
    const ganho = contexto.createGain();
    oscilador.frequency.value = 880;
    ganho.gain.setValueAtTime(0.0001, contexto.currentTime);
    ganho.gain.exponentialRampToValueAtTime(0.15, contexto.currentTime + 0.01);
    ganho.gain.exponentialRampToValueAtTime(0.0001, contexto.currentTime + 0.2);
    oscilador.connect(ganho);
    ganho.connect(contexto.destination);
    oscilador.start();
    oscilador.stop(contexto.currentTime + 0.2);
    oscilador.addEventListener("ended", () => void contexto.close());
  } catch {
    // O alerta visual continua sendo a fonte principal quando o navegador
    // bloqueia áudio ou o aparelho não tem saída sonora.
  }
}

function lerPreferencia(): boolean {
  try {
    return window.localStorage.getItem(CHAVE_DO_SOM_SILENCIADO) === "true";
  } catch {
    // Navegador com armazenamento bloqueado: o padrão é o som ligado, que é o
    // que faz o pedido novo não passar despercebido.
    return false;
  }
}

function gravarPreferencia(silenciado: boolean): void {
  try {
    window.localStorage.setItem(CHAVE_DO_SOM_SILENCIADO, String(silenciado));
  } catch {
    // Sem armazenamento, a escolha vale até fechar a aba — e só isso.
  }
}

/** A escolha de silenciar, lida e gravada no navegador da loja. */
export function useSomSilenciado(): {
  readonly silenciado: boolean;
  readonly alternar: () => void;
} {
  const [silenciado, setSilenciado] = useState(false);

  useEffect(() => {
    setSilenciado(lerPreferencia());
  }, []);

  const alternar = useCallback(() => {
    setSilenciado((anterior) => {
      const novoValor = !anterior;
      gravarPreferencia(novoValor);
      return novoValor;
    });
  }, []);

  return { silenciado, alternar };
}

export interface AvisoSonoroProps {
  readonly quantidadeDeNovos: number;
  readonly silenciado: boolean;
  readonly aoAlternarSom: () => void;
  readonly aoMarcarComoVistos: () => void;
}

export function AvisoSonoro({
  quantidadeDeNovos,
  silenciado,
  aoAlternarSom,
  aoMarcarComoVistos,
}: AvisoSonoroProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div role="status" aria-live="polite" aria-atomic="true">
        {quantidadeDeNovos > 0 ? (
          <strong className="inline-flex min-h-[var(--altura-toque)] items-center gap-2 rounded-full bg-[var(--cor-primaria)] px-4 text-sm text-[var(--cor-em-primaria)]">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 animate-pulse rounded-full bg-current motion-reduce:animate-none"
            />
            {quantidadeDeNovos === 1
              ? "1 pedido novo"
              : `${quantidadeDeNovos} pedidos novos`}
          </strong>
        ) : null}
      </div>
      {quantidadeDeNovos > 0 ? (
        <button
          className="sc-botao sc-botao--secundaria"
          type="button"
          onClick={aoMarcarComoVistos}
        >
          Marcar como vistos
        </button>
      ) : null}
      {/* Rótulo fixo com estado em `aria-pressed`: é assim que o leitor de
          tela entende um botão de ligar e desligar. */}
      <button
        className="sc-botao sc-botao--secundaria"
        type="button"
        aria-pressed={silenciado}
        onClick={aoAlternarSom}
      >
        Silenciar som
      </button>
      {silenciado ? (
        <span className="text-sm text-[var(--cor-tinta-suave)]">
          Som desligado neste computador. O pedido novo continua destacado na
          tela.
        </span>
      ) : null}
    </div>
  );
}
