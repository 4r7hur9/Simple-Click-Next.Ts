"use client";

/**
 * A JANELA DE ACESSO: entrar ou criar conta sem sair da página da loja.
 *
 * Uso (de qualquer componente do cliente):
 *
 *   import { abrirJanelaDeAcesso } from "…/features/auth/JanelaDeAcesso.tsx";
 *   abrirJanelaDeAcesso({ aoEntrar: () => finalizarPedido() });
 *   abrirJanelaDeAcesso({ aba: "criar", motivo: "Para finalizar o pedido, entre na sua conta." });
 *
 * Ou num link, sem script nenhum de quem o escreve:
 *
 *   <a href="/entrar?proximo=/loja/loja" data-abre-acesso="entrar">Entrar</a>
 *   <a href="/cadastrar?proximo=/loja/loja" data-abre-acesso="criar">Criar conta</a>
 *
 * A janela mora uma vez na moldura da loja (`<JanelaDeAcesso />`). Ao
 * concluir ela fecha, atualiza a página (`router.refresh`, para a barra e o
 * resto lerem a sessão nova), chama `aoEntrar` e avisa a página com o evento
 * `sc:acesso-concluido`. Se a janela não estiver montada na página, abrir
 * vira navegação para `/entrar` (ou `/cadastrar`) com `?proximo=` de volta.
 *
 * É o `dialog` nativo aberto com `showModal()`, como o Sobre: foco preso,
 * Esc fecha, fundo inerte e o foco volta a quem abriu.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { IconeFechar } from "@simpleclick/ui";

import { CadastroForm } from "./CadastroForm.tsx";
import { LoginForm } from "./LoginForm.tsx";
import { enviarCadastro, enviarLogin } from "./acesso-na-ponte.ts";
import { comDestino, destinoSeguro } from "./destino-seguro.ts";

export type AbaDeAcesso = "entrar" | "criar";

export interface ResultadoDoAcesso {
  /** `true` quando a pessoa acabou de criar a conta. */
  readonly novaConta: boolean;
}

export interface OpcoesDaJanelaDeAcesso {
  /** A aba que abre primeiro. Padrão: entrar. */
  readonly aba?: AbaDeAcesso;
  /** Uma linha acima das abas dizendo por que pedimos a conta. */
  readonly motivo?: string;
  /** Chamado depois que a sessão abriu e a janela fechou. */
  readonly aoEntrar?: (resultado: ResultadoDoAcesso) => void;
}

/** O pedido de abrir, levado pelo evento até a janela montada. */
interface PedidoDeAbrir extends OpcoesDaJanelaDeAcesso {
  atendido: boolean;
}

export const EVENTO_ABRIR_ACESSO = "sc:abrir-janela-de-acesso";
export const EVENTO_ACESSO_CONCLUIDO = "sc:acesso-concluido";
const ATRIBUTO_DO_GATILHO = "data-abre-acesso";

/** O endereço atual, para voltar a ele depois de entrar. */
function caminhoAtual(): string | undefined {
  return destinoSeguro(`${window.location.pathname}${window.location.search}`);
}

/** Abre a janela de acesso; sem janela na página, vai para a tela cheia. */
export function abrirJanelaDeAcesso(opcoes: OpcoesDaJanelaDeAcesso = {}): void {
  const pedido: PedidoDeAbrir = { ...opcoes, atendido: false };
  window.dispatchEvent(
    new CustomEvent<PedidoDeAbrir>(EVENTO_ABRIR_ACESSO, { detail: pedido }),
  );
  if (pedido.atendido) return;
  const tela = opcoes.aba === "criar" ? "/cadastrar" : "/entrar";
  window.location.assign(comDestino(tela, caminhoAtual()));
}

const TEXTOS: Record<AbaDeAcesso, { titulo: string; descricao: string }> = {
  entrar: {
    titulo: "Entrar",
    descricao: "Use o e-mail e a senha da sua conta SimpleClick.",
  },
  criar: {
    titulo: "Criar conta",
    descricao: "Leva um minuto, e você já volta para a loja logado.",
  },
};

export function JanelaDeAcesso() {
  const roteador = useRouter();
  const janela = useRef<HTMLDialogElement>(null);
  const opcoes = useRef<OpcoesDaJanelaDeAcesso>({});
  const [aberta, setAberta] = useState(false);
  const [aba, setAba] = useState<AbaDeAcesso>("entrar");
  const [motivo, setMotivo] = useState<string>();
  /** Muda a cada abertura: os formulários voltam limpos. */
  const [abertura, setAbertura] = useState(0);

  const abrir = useCallback((pedido: OpcoesDaJanelaDeAcesso) => {
    opcoes.current = pedido;
    setAba(pedido.aba ?? "entrar");
    setMotivo(pedido.motivo);
    setAbertura((atual) => atual + 1);
    setAberta(true);
  }, []);

  // O `dialog` acompanha o estado: modal quando aberto.
  useEffect(() => {
    const elemento = janela.current;
    if (!elemento) return;
    if (aberta && !elemento.open) {
      if (typeof elemento.showModal === "function") elemento.showModal();
      else elemento.setAttribute("open", "");
      elemento.scrollTop = 0;
      // O foco começa no primeiro campo, não no fechar: a pessoa veio digitar.
      elemento.querySelector<HTMLInputElement>("form input")?.focus();
    } else if (!aberta && elemento.open) {
      if (typeof elemento.close === "function") elemento.close();
      else elemento.removeAttribute("open");
    }
  }, [aberta]);

  useEffect(() => {
    const elemento = janela.current;

    function aoPedirAbertura(evento: Event): void {
      const pedido = (evento as CustomEvent<PedidoDeAbrir>).detail;
      if (pedido === null || typeof pedido !== "object") return;
      pedido.atendido = true;
      abrir(pedido);
    }

    // Links com `data-abre-acesso` em qualquer lugar da página abrem a janela;
    // abrir em outra aba (Ctrl, botão do meio) continua indo à tela cheia.
    function aoClicar(evento: MouseEvent): void {
      if (
        evento.defaultPrevented ||
        evento.button !== 0 ||
        evento.metaKey ||
        evento.ctrlKey ||
        evento.shiftKey ||
        evento.altKey
      ) {
        return;
      }
      const alvo = evento.target;
      if (!(alvo instanceof Element)) return;
      const link = alvo.closest(`[${ATRIBUTO_DO_GATILHO}]`);
      if (!link) return;
      evento.preventDefault();
      const pedida = link.getAttribute(ATRIBUTO_DO_GATILHO);
      abrir({ aba: pedida === "criar" ? "criar" : "entrar" });
    }

    // Esc ou o fecho nativo: o estado acompanha.
    function aoFechar(): void {
      setAberta(false);
    }

    // Clique no fundo (o próprio `dialog`, fora da moldura) fecha.
    function aoClicarNaJanela(evento: MouseEvent): void {
      if (evento.target === elemento) setAberta(false);
    }

    window.addEventListener(EVENTO_ABRIR_ACESSO, aoPedirAbertura);
    document.addEventListener("click", aoClicar);
    elemento?.addEventListener("close", aoFechar);
    elemento?.addEventListener("click", aoClicarNaJanela);
    return () => {
      window.removeEventListener(EVENTO_ABRIR_ACESSO, aoPedirAbertura);
      document.removeEventListener("click", aoClicar);
      elemento?.removeEventListener("close", aoFechar);
      elemento?.removeEventListener("click", aoClicarNaJanela);
    };
  }, [abrir]);

  function concluir(novaConta: boolean): void {
    setAberta(false);
    roteador.refresh();
    const resultado: ResultadoDoAcesso = { novaConta };
    opcoes.current.aoEntrar?.(resultado);
    opcoes.current = {};
    window.dispatchEvent(
      new CustomEvent<ResultadoDoAcesso>(EVENTO_ACESSO_CONCLUIDO, {
        detail: resultado,
      }),
    );
  }

  /** Setas trocam de aba, como pede o padrão de abas acessível. */
  function aoTeclarNasAbas(evento: KeyboardEvent<HTMLDivElement>): void {
    if (evento.key !== "ArrowLeft" && evento.key !== "ArrowRight") return;
    evento.preventDefault();
    const proxima: AbaDeAcesso = aba === "entrar" ? "criar" : "entrar";
    setAba(proxima);
    document.getElementById(`janela-acesso-aba-${proxima}`)?.focus();
  }

  const texto = TEXTOS[aba];

  return (
    <dialog
      ref={janela}
      className="sc-acesso-janela"
      aria-labelledby="janela-acesso-titulo"
      aria-describedby="janela-acesso-descricao"
    >
      <div className="sc-acesso-janela__moldura">
        <button
          type="button"
          className="sc-acesso-janela__fechar"
          onClick={() => setAberta(false)}
        >
          <IconeFechar aria-hidden="true" />
          <span className="sc-so-leitor">Fechar</span>
        </button>

        <header className="sc-acesso-janela__cabecalho">
          <p className="sc-conta__etiqueta">Sua conta SimpleClick</p>
          <h2 id="janela-acesso-titulo" className="sc-acesso-janela__titulo">
            {texto.titulo}
          </h2>
          <p
            id="janela-acesso-descricao"
            className="sc-acesso-janela__descricao"
          >
            {motivo ?? texto.descricao}
          </p>
        </header>

        <div
          className="sc-acesso-janela__abas"
          role="tablist"
          aria-label="Entrar ou criar conta"
          onKeyDown={aoTeclarNasAbas}
        >
          {(["entrar", "criar"] as const).map((cada) => (
            <button
              key={cada}
              id={`janela-acesso-aba-${cada}`}
              type="button"
              role="tab"
              className="sc-acesso-janela__aba"
              aria-selected={aba === cada}
              aria-controls="janela-acesso-painel"
              tabIndex={aba === cada ? 0 : -1}
              onClick={() => setAba(cada)}
            >
              {TEXTOS[cada].titulo}
            </button>
          ))}
        </div>

        <div
          id="janela-acesso-painel"
          role="tabpanel"
          aria-labelledby={`janela-acesso-aba-${aba}`}
          className="sc-acesso-janela__painel"
        >
          {!aberta ? null : aba === "entrar" ? (
            <LoginForm
              key={`entrar-${abertura}`}
              prefixo="janela-entrar"
              aoEntrar={enviarLogin}
              aoPedirSegundoFator={(desafioId, canal) =>
                // O segundo fator (dono e administração) tem tela própria; a
                // pessoa volta para esta página depois.
                window.location.assign(
                  comDestino(
                    `/entrar/verificacao?desafio=${encodeURIComponent(desafioId)}&canal=${canal}`,
                    caminhoAtual(),
                  ),
                )
              }
              aoCriarSessao={() => concluir(false)}
            />
          ) : (
            <CadastroForm
              key={`criar-${abertura}`}
              prefixo="janela-cadastro"
              aoCadastrar={enviarCadastro}
              aoCriarConta={() => concluir(true)}
              linkParaEntrar={
                <button
                  type="button"
                  className="sc-acesso-janela__trocar"
                  onClick={() => setAba("entrar")}
                >
                  Entrar
                </button>
              }
            />
          )}
        </div>

        <p className="sc-acesso-janela__rodape">
          <a href="/cadastrar?tipo=dono">Quero cadastrar minha loja</a>
        </p>
      </div>
    </dialog>
  );
}
