"use client";
/**
 * O seletor de cor da loja: quadro de saturação e brilho, barra de matiz,
 * campo hexadecimal e amostras sugeridas.
 *
 * É PRÓPRIO, sem biblioteca: o quadro é um degradê de CSS (branco → matiz por
 * cima, preto por baixo) e o ponto se move com o dedo, o mouse ou as setas do
 * teclado. O que sai daqui é sempre `#rrggbb` — o formato que a API guarda.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AMOSTRAS_DE_DESTAQUE_DA_LOJA } from "@simpleclick/ui";

import { idDoInfo, InfoDoPainel } from "./RotuloComInfo.tsx";

import {
  hexParaHsv,
  hsvParaHex,
  normalizarHex,
  type Hsv,
} from "../../lib/cor-hsv.ts";

export interface SeletorDeCorProps {
  /** A cor atual, `#rrggbb`. */
  readonly valor: string;
  readonly aoMudar: (hex: string) => void;
  /** A cor de "voltar ao padrão". */
  readonly padrao: string;
  readonly rotulo?: string;
}

const PASSO = 0.01;
const PASSO_GRANDE = 0.1;

export function SeletorDeCor({
  valor,
  aoMudar,
  padrao,
  rotulo = "Cor de destaque",
}: SeletorDeCorProps) {
  const id = useId();
  const quadro = useRef<HTMLDivElement>(null);
  const [hsv, setHsv] = useState<Hsv>(() => hexParaHsv(valor));
  const [texto, setTexto] = useState(valor);
  const [textoInvalido, setTextoInvalido] = useState(false);

  // Mudou por fora (amostra, "voltar ao verde", carregamento): acompanha. O
  // matiz é mantido quando a cor é cinza/preta, que não tem matiz próprio.
  useEffect(() => {
    if (hsvParaHex(hsv).toLowerCase() === valor.toLowerCase()) return;
    const novo = hexParaHsv(valor);
    setHsv((anterior) =>
      novo.s === 0 || novo.v === 0 ? { ...novo, h: anterior.h } : novo,
    );
    setTexto(valor);
    setTextoInvalido(false);
  }, [valor]);

  const aplicar = useCallback(
    (proximo: Hsv) => {
      setHsv(proximo);
      const hex = hsvParaHex(proximo);
      setTexto(hex);
      setTextoInvalido(false);
      aoMudar(hex);
    },
    [aoMudar],
  );

  function moverPeloPonteiro(evento: React.PointerEvent<HTMLDivElement>) {
    const caixa = quadro.current?.getBoundingClientRect();
    if (caixa === undefined || caixa.width === 0 || caixa.height === 0) return;
    const s = Math.min(
      1,
      Math.max(0, (evento.clientX - caixa.left) / caixa.width),
    );
    const v =
      1 - Math.min(1, Math.max(0, (evento.clientY - caixa.top) / caixa.height));
    aplicar({ h: hsv.h, s, v });
  }

  function teclado(evento: React.KeyboardEvent<HTMLDivElement>) {
    const passo = evento.shiftKey ? PASSO_GRANDE : PASSO;
    const mudancas: Record<string, Partial<Hsv>> = {
      ArrowLeft: { s: hsv.s - passo },
      ArrowRight: { s: hsv.s + passo },
      ArrowUp: { v: hsv.v + passo },
      ArrowDown: { v: hsv.v - passo },
    };
    const mudanca = mudancas[evento.key];
    if (mudanca === undefined) return;
    evento.preventDefault();
    aplicar({
      ...hsv,
      s: Math.min(1, Math.max(0, mudanca.s ?? hsv.s)),
      v: Math.min(1, Math.max(0, mudanca.v ?? hsv.v)),
    });
  }

  const corDoMatiz = hsvParaHex({ h: hsv.h, s: 1, v: 1 });
  const corAtual = hsvParaHex(hsv);

  return (
    <div className="space-y-4" data-seletor-de-cor="">
      <div
        ref={quadro}
        role="slider"
        tabIndex={0}
        aria-label={`${rotulo}: saturação e brilho`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.s * 100)}
        aria-valuetext={`Saturação ${Math.round(hsv.s * 100)}%, brilho ${Math.round(hsv.v * 100)}%`}
        onKeyDown={teclado}
        onPointerDown={(evento) => {
          evento.currentTarget.setPointerCapture(evento.pointerId);
          moverPeloPonteiro(evento);
        }}
        onPointerMove={(evento) => {
          if (evento.currentTarget.hasPointerCapture(evento.pointerId)) {
            moverPeloPonteiro(evento);
          }
        }}
        className="sc-seletor-quadro relative h-44 w-full cursor-crosshair touch-none rounded-2xl outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cor-foco)] sm:h-52"
        style={{ backgroundColor: corDoMatiz }}
        data-quadro-de-cor=""
      >
        <span
          aria-hidden="true"
          className="sc-seletor-ponto pointer-events-none absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
            backgroundColor: corAtual,
          }}
        />
      </div>

      <label className="block">
        <span className="sr-only">{rotulo}: matiz</span>
        <input
          type="range"
          min={0}
          max={360}
          step={1}
          value={Math.round(hsv.h)}
          onChange={(evento) =>
            aplicar({ ...hsv, h: Number(evento.target.value) })
          }
          aria-valuetext={`Matiz ${Math.round(hsv.h)} graus`}
          className="sc-seletor-matiz h-4 w-full cursor-pointer appearance-none rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cor-foco)]"
        />
      </label>

      <div className="flex flex-wrap items-end gap-3">
        <span
          aria-hidden="true"
          className="size-11 shrink-0 rounded-2xl border border-[var(--cor-borda)]"
          style={{ backgroundColor: corAtual }}
        />
        <div className="block min-w-0 flex-1 basis-40">
          <span className="flex items-center gap-1.5">
            <label
              className="text-sm font-medium"
              id={`${id}-hex`}
              htmlFor={`${id}-hex-campo`}
            >
              Código da cor (hexadecimal)
            </label>
            <InfoDoPainel
              explicacao="codigoDaCor"
              nome="Código da cor"
              id={`${id}-hex-campo`}
            />
          </span>
          <input
            id={`${id}-hex-campo`}
            aria-describedby={idDoInfo(`${id}-hex-campo`)}
            className="sc-campo mt-1.5 w-full font-mono uppercase"
            value={texto}
            maxLength={7}
            placeholder={`Ex.: ${padrao.toUpperCase()}`}
            spellCheck={false}
            autoComplete="off"
            aria-labelledby={`${id}-hex`}
            aria-invalid={textoInvalido ? true : undefined}
            onChange={(evento) => {
              const digitado = evento.target.value;
              setTexto(digitado);
              const hex = normalizarHex(digitado);
              if (hex === null) {
                setTextoInvalido(true);
                return;
              }
              setTextoInvalido(false);
              setHsv((anterior) => {
                const novo = hexParaHsv(hex);
                return novo.s === 0 || novo.v === 0
                  ? { ...novo, h: anterior.h }
                  : novo;
              });
              aoMudar(hex);
            }}
            onBlur={() => {
              setTexto(valor);
              setTextoInvalido(false);
            }}
          />
        </div>
        <button
          type="button"
          className="sc-botao sc-botao--secundaria"
          onClick={() => aoMudar(padrao)}
          disabled={valor.toLowerCase() === padrao.toLowerCase()}
        >
          Voltar ao verde SimpleClick
        </button>
      </div>
      {textoInvalido ? (
        <p className="text-sm text-[var(--cor-erro)]" role="status">
          Use o código com 6 letras e números, como #b7ff00.
        </p>
      ) : null}

      <div>
        <p className="text-sm font-medium">Sugestões</p>
        <ul className="mt-2 flex flex-wrap gap-2" aria-label="Cores sugeridas">
          {AMOSTRAS_DE_DESTAQUE_DA_LOJA.map((amostra) => {
            const atual = amostra.valor === valor.toLowerCase();
            return (
              <li key={amostra.valor}>
                <button
                  type="button"
                  title={amostra.nome}
                  aria-label={`${amostra.nome} (${amostra.valor})`}
                  aria-pressed={atual}
                  onClick={() => aoMudar(amostra.valor)}
                  className={`size-9 rounded-full border-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cor-foco)] ${
                    atual
                      ? "border-[var(--cor-tinta)] shadow-[0_0_0_2px_var(--cor-fundo)]"
                      : "border-[var(--cor-borda)]"
                  }`}
                  style={{ backgroundColor: amostra.valor }}
                />
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
