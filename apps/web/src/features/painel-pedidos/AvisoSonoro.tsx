"use client";

import { useEffect, useState } from "react";

const CHAVE_DO_SOM = "simpleclick.painel-pedidos.som-silenciado";

function tocarAlerta(): void {
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
    // bloqueia áudio ou o dispositivo não oferece uma saída sonora.
  }
}

export function AvisoSonoro({
  quantidadeDeNovos,
}: {
  readonly quantidadeDeNovos: number;
}) {
  const [silenciado, setSilenciado] = useState(true);

  useEffect(() => {
    setSilenciado(window.localStorage.getItem(CHAVE_DO_SOM) === "true");
  }, []);

  useEffect(() => {
    if (quantidadeDeNovos > 0 && !silenciado) tocarAlerta();
  }, [quantidadeDeNovos, silenciado]);

  function alternarSom(): void {
    setSilenciado((anterior) => {
      const novoValor = !anterior;
      window.localStorage.setItem(CHAVE_DO_SOM, String(novoValor));
      return novoValor;
    });
  }

  return (
    <div
      className="flex flex-wrap items-center gap-3"
      role="status"
      aria-live="polite"
    >
      {quantidadeDeNovos > 0 ? (
        <strong className="rounded-full bg-[var(--cor-primaria)] px-3 py-1 text-sm text-white">
          {quantidadeDeNovos === 1
            ? "1 pedido novo"
            : `${quantidadeDeNovos} pedidos novos`}
        </strong>
      ) : null}
      <button
        className="sc-botao sc-botao--fantasma"
        type="button"
        aria-pressed={silenciado}
        onClick={alternarSom}
      >
        {silenciado ? "Ativar som" : "Silenciar som"}
      </button>
    </div>
  );
}
