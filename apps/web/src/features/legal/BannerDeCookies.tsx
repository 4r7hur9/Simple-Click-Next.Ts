"use client";

/**
 * Aviso de cookies: aparece na primeira visita (e quando a versão da política
 * muda) em todo o site público, e reabre pelo link "Preferências de cookies" do
 * rodapé.
 *
 * NÃO BLOQUEIA A PÁGINA: é um cartão no canto, sem fundo escurecido, sem prender
 * o foco e sem travar a rolagem. Quando a pessoa rola a página, ou fica
 * `TEMPO_PARA_RECOLHER_MS` sem mexer nele, o cartão recolhe numa pílula pequena
 * "Cookies" (botão que reabre o cartão). Recolher NÃO grava consentimento: a
 * escolha continua pendente até a pessoa decidir. Nunca recolhe com o foco
 * dentro do cartão, nem quando foi aberto pelo link do rodapé. No celular ele deixa livre a faixa da direita
 * (onde fica a sacola flutuante) e fica abaixo dela na pilha de camadas.
 * Só lê o cookie depois de montar, para o HTML do servidor ser igual ao
 * primeiro desenho do navegador.
 */
import "@simpleclick/ui/styles/legal.css";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  EVENTO_ABRIR_PREFERENCIAS,
  consentimentoAtual,
  gravarConsentimento,
} from "./consentimento.ts";

/** Sem interação por este tempo, o cartão recolhe na pílula. */
export const TEMPO_PARA_RECOLHER_MS = 8000;
/** Rolagem mínima (px) que conta como "a pessoa rolou a página". */
const ROLAGEM_PARA_RECOLHER_PX = 24;

interface Escolha {
  desempenho: boolean;
  funcionais: boolean;
}

export function BannerDeCookies() {
  const [aberto, setAberto] = useState(false);
  const [personalizando, setPersonalizando] = useState(false);
  const [recolhido, setRecolhido] = useState(false);
  const [escolha, setEscolha] = useState<Escolha>({
    desempenho: false,
    funcionais: false,
  });
  const titulo = useId();
  const caixa = useRef<HTMLDivElement>(null);
  const voltarAoCartao = useRef(false);
  const quemAbriu = useRef<Element | null>(null);
  const abertoPeloLink = useRef(false);

  useEffect(() => {
    const atual = consentimentoAtual();
    if (atual === null) setAberto(true);
    else
      setEscolha({
        desempenho: atual.desempenho,
        funcionais: atual.funcionais,
      });

    function reabrir() {
      const vigente = consentimentoAtual();
      setEscolha({
        desempenho: vigente?.desempenho ?? false,
        funcionais: vigente?.funcionais ?? false,
      });
      quemAbriu.current = document.activeElement;
      abertoPeloLink.current = true;
      setRecolhido(false);
      setPersonalizando(true);
      setAberto(true);
    }
    window.addEventListener(EVENTO_ABRIR_PREFERENCIAS, reabrir);
    return () => window.removeEventListener(EVENTO_ABRIR_PREFERENCIAS, reabrir);
  }, []);

  // Conta a altura do aviso para a sacola flutuante ficar acima dele.
  useLayoutEffect(() => {
    const el = caixa.current;
    if (!aberto || el === null) return;
    const raiz = document.documentElement;
    let ultimaAltura = -1;
    const medir = () => {
      const altura = el.getBoundingClientRect().height;
      // Só avisa o resto da página quando a altura muda de fato: cada `resize`
      // faz a landing recalcular as seções fixadas e a sacola re-medir.
      if (altura === ultimaAltura) return;
      ultimaAltura = altura;
      raiz.style.setProperty("--altura-do-aviso-de-cookies", `${altura}px`);
      // A sacola re-mede a área dela quando a janela muda de tamanho.
      window.dispatchEvent(new Event("resize"));
    };
    medir();
    const observador =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(medir);
    observador?.observe(el);
    return () => {
      observador?.disconnect();
      raiz.style.removeProperty("--altura-do-aviso-de-cookies");
      window.dispatchEvent(new Event("resize"));
    };
  }, [aberto, personalizando, recolhido]);

  // Aberto pelo link: leva o foco para dentro (quem usa teclado ou leitor de
  // tela pediu isso). Na primeira visita o foco não é roubado.
  useEffect(() => {
    if (aberto && abertoPeloLink.current) {
      caixa.current?.focus();
    }
  }, [aberto]);

  // Recolhe na pílula ao rolar a página ou depois de um tempo sem interação.
  // Com o foco dentro do cartão (teclado) ou aberto pelo link, nunca recolhe.
  useEffect(() => {
    if (!aberto || recolhido || abertoPeloLink.current) return;
    const comFocoDentro = () =>
      caixa.current?.contains(document.activeElement) === true;
    const recolher = () => {
      if (comFocoDentro()) return;
      setRecolhido(true);
    };
    let relogio = window.setTimeout(recolher, TEMPO_PARA_RECOLHER_MS);
    const reiniciar = () => {
      window.clearTimeout(relogio);
      relogio = window.setTimeout(recolher, TEMPO_PARA_RECOLHER_MS);
    };
    const origem = window.scrollY;
    const aoRolar = () => {
      if (Math.abs(window.scrollY - origem) >= ROLAGEM_PARA_RECOLHER_PX)
        recolher();
    };
    const el = caixa.current;
    window.addEventListener("scroll", aoRolar, { passive: true });
    el?.addEventListener("pointerdown", reiniciar);
    el?.addEventListener("pointermove", reiniciar);
    el?.addEventListener("keydown", reiniciar);
    el?.addEventListener("focusin", reiniciar);
    return () => {
      window.clearTimeout(relogio);
      window.removeEventListener("scroll", aoRolar);
      el?.removeEventListener("pointerdown", reiniciar);
      el?.removeEventListener("pointermove", reiniciar);
      el?.removeEventListener("keydown", reiniciar);
      el?.removeEventListener("focusin", reiniciar);
    };
  }, [aberto, recolhido, personalizando]);

  // Reaberto pela pílula: devolve o foco ao cartão (quem clicou ou usou teclado).
  useEffect(() => {
    if (!recolhido && voltarAoCartao.current) {
      voltarAoCartao.current = false;
      caixa.current?.focus();
    }
  }, [recolhido]);

  const fechar = useCallback(() => {
    setAberto(false);
    setRecolhido(false);
    setPersonalizando(false);
    if (abertoPeloLink.current) {
      abertoPeloLink.current = false;
      if (quemAbriu.current instanceof HTMLElement) quemAbriu.current.focus();
    }
  }, []);

  function decidir(proxima: Escolha) {
    gravarConsentimento(proxima);
    setEscolha(proxima);
    fechar();
  }

  if (!aberto) return null;

  if (recolhido) {
    return (
      <div
        ref={caixa}
        className="sc-cookies sc-cookies--recolhido"
        data-tema="escuro"
      >
        <button
          type="button"
          className="sc-cookies__pilula"
          aria-haspopup="dialog"
          aria-expanded={false}
          onClick={() => {
            voltarAoCartao.current = true;
            setRecolhido(false);
          }}
        >
          Cookies
        </button>
      </div>
    );
  }

  return (
    <div
      ref={caixa}
      className="sc-cookies"
      data-tema="escuro"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titulo}
      tabIndex={-1}
      onKeyDown={(evento) => {
        if (evento.key === "Escape" && abertoPeloLink.current) fechar();
      }}
    >
      <h2 id={titulo} className="sc-cookies__titulo">
        Sua privacidade, sua escolha
      </h2>
      <p className="sc-cookies__texto">
        Usamos cookies essenciais para o site funcionar. Os de desempenho e os
        de preferências só entram se você deixar. Veja a{" "}
        <Link href="/cookies">Política de Cookies</Link>.
      </p>

      {personalizando ? (
        <fieldset className="sc-cookies__categorias">
          <legend className="sc-cookies__legenda">Categorias</legend>
          <label className="sc-cookies__categoria">
            <input type="checkbox" checked disabled />
            <span>
              <strong>Essenciais</strong>
              <small>
                Entrar na conta, guardar a sacola e proteger o site. Sempre
                ligados.
              </small>
            </span>
          </label>
          <label className="sc-cookies__categoria">
            <input
              type="checkbox"
              checked={escolha.desempenho}
              onChange={(evento) =>
                setEscolha({ ...escolha, desempenho: evento.target.checked })
              }
            />
            <span>
              <strong>Desempenho e análise</strong>
              <small>
                Medem como o site é usado, sem identificar você, para
                melhorarmos as telas.
              </small>
            </span>
          </label>
          <label className="sc-cookies__categoria">
            <input
              type="checkbox"
              checked={escolha.funcionais}
              onChange={(evento) =>
                setEscolha({ ...escolha, funcionais: evento.target.checked })
              }
            />
            <span>
              <strong>Funcionais e preferências</strong>
              <small>
                Lembram escolhas como tema, filtros e a última loja visitada.
              </small>
            </span>
          </label>
        </fieldset>
      ) : null}

      <div className="sc-cookies__acoes">
        {personalizando ? (
          <button
            type="button"
            className="sc-cookies__botao sc-cookies__botao--principal"
            onClick={() => decidir(escolha)}
          >
            Salvar escolhas
          </button>
        ) : (
          <button
            type="button"
            className="sc-cookies__botao sc-cookies__botao--principal"
            onClick={() => decidir({ desempenho: true, funcionais: true })}
          >
            Aceitar todos
          </button>
        )}
        <button
          type="button"
          className="sc-cookies__botao"
          onClick={() => decidir({ desempenho: false, funcionais: false })}
        >
          Recusar não essenciais
        </button>
        {personalizando ? null : (
          <button
            type="button"
            className="sc-cookies__botao sc-cookies__botao--discreto"
            aria-expanded={false}
            onClick={() => setPersonalizando(true)}
          >
            Personalizar
          </button>
        )}
      </div>
    </div>
  );
}
