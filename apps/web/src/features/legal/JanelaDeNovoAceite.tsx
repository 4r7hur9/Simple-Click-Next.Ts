"use client";

/**
 * A janela de novo aceite (LGPD, card #79): quando a versão dos Termos de Uso,
 * da Política de Privacidade ou dos Termos do Lojista muda — e para as contas
 * criadas antes do aceite existir —, quem está logado vê esta janela no
 * primeiro acesso, pedindo o aceite da versão nova.
 *
 * NÃO TRAVA A NAVEGAÇÃO: "Agora não" fecha a janela. O freio mora na API,
 * que recusa só as ações de CRIAÇÃO (fazer pedido, cadastrar, publicar) com
 * 403 `aceite_pendente` até a pessoa aceitar; ver, exportar e excluir os
 * próprios dados continuam livres. Por isso a janela não segura um checkout
 * em andamento, e volta no próximo acesso.
 *
 * QUALQUER 403 `aceite_pendente` abre a janela, em qualquer tela: ao montar, o
 * componente embrulha o `fetch` do navegador (e o desfaz ao sair) e, quando uma
 * resposta traz esse código, mostra a janela com os documentos que vieram nela.
 * Assim os formulários do painel, o checkout e o resto não precisam tratar o
 * código um a um.
 *
 * Visitante (sem sessão) recebe 200 sem pendências (`anonimo`) e não vê nada. A checagem roda ao montar
 * e a cada mudança de página, no máximo uma vez por minuto.
 */
import "@simpleclick/ui/styles/aceite.css";

import {
  ROTULO_DOS_DOCUMENTOS_LEGAIS,
  type DocumentoLegal,
  type SituacaoDosAceites,
} from "@simpleclick/contracts";
import { Aviso, Botao } from "@simpleclick/ui";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { chamarConta } from "../conta/chamar-conta.ts";
import { LinkDoDocumento } from "./AceiteDosTermos.tsx";

const INTERVALO_ENTRE_CHECAGENS_EM_MS = 60_000;

/** O que a janela mostra para cada documento pendente. */
function textoDoDocumento(documento: DocumentoLegal): string {
  return documento === "MERCHANT_TERMS"
    ? "Regras para quem tem loja no SimpleClick."
    : documento === "TERMS_OF_USE"
      ? "Como usar o SimpleClick."
      : "Como cuidamos dos seus dados.";
}

type Pendentes = SituacaoDosAceites["pendentes"];

/** Só entram documentos que o site conhece (ignora `__proto__`, `toString`…). */
function filtrarPendentes(lista: unknown): Pendentes {
  if (!Array.isArray(lista)) return [];
  return lista.filter(
    (p): p is Pendentes[number] =>
      typeof p === "object" &&
      p !== null &&
      typeof (p as { documento?: unknown }).documento === "string" &&
      typeof (p as { versao?: unknown }).versao === "string" &&
      Object.hasOwn(
        ROTULO_DOS_DOCUMENTOS_LEGAIS,
        (p as { documento: string }).documento,
      ),
  );
}

const FOCAVEL =
  "button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex='-1'])";

export function JanelaDeNovoAceite() {
  const caminho = usePathname();
  const ultimaChecagem = useRef(0);
  const pendentesAtuais = useRef<Pendentes>([]);
  const [pendentes, setPendentesBruto] = useState<Pendentes>([]);
  const [dispensada, setDispensada] = useState(false);
  const [marcado, setMarcado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string>();

  /** Toda lista nova chega com a caixa desmarcada: o aceite é um ato explícito. */
  const definirPendentes = useCallback((lista: Pendentes) => {
    pendentesAtuais.current = lista;
    setPendentesBruto(lista);
    setMarcado(false);
  }, []);

  const checar = useCallback(
    (forcar: boolean) => {
      const agora = Date.now();
      if (
        !forcar &&
        agora - ultimaChecagem.current < INTERVALO_ENTRE_CHECAGENS_EM_MS
      )
        return () => undefined;
      ultimaChecagem.current = agora;
      let cancelado = false;
      void chamarConta("GET", "aceites").then((resposta) => {
        if (cancelado) return;
        const corpo = resposta.corpo as
          { pendentes?: unknown; anonimo?: boolean } | undefined;
        if (resposta.ok && Array.isArray(corpo?.pendentes)) {
          definirPendentes(filtrarPendentes(corpo.pendentes));
        } else {
          // Sem sessão (ou API fora): nada a pedir, e a próxima página confere de novo.
          definirPendentes([]);
          if (resposta.status === 401) ultimaChecagem.current = 0;
        }
        // Visitante: a próxima página confere de novo (pode ter entrado agora).
        if (corpo?.anonimo === true) ultimaChecagem.current = 0;
      });
      return () => {
        cancelado = true;
      };
    },
    [definirPendentes],
  );

  useEffect(() => {
    // `caminho` só dispara a checagem; o intervalo evita pedir a cada clique.
    void caminho;
    return checar(false);
  }, [caminho, checar]);

  // Qualquer 403 `aceite_pendente` (de qualquer tela) reabre a janela.
  useEffect(() => {
    const original = window.fetch;
    const embrulhado: typeof fetch = async (...argumentos) => {
      const resposta = await original(...argumentos);
      if (resposta.status === 403) {
        void resposta
          .clone()
          .json()
          .then((corpo: { erro?: string; pendentes?: unknown }) => {
            if (corpo.erro !== "aceite_pendente") return;
            const lista = filtrarPendentes(corpo.pendentes);
            if (lista.length > 0) {
              definirPendentes(lista);
            } else {
              // Nada aproveitável no 403: mantém a lista e confere de novo.
              checar(true);
            }
            setDispensada(false);
            ultimaChecagem.current = 0;
          })
          .catch(() => undefined);
      }
      return resposta;
    };
    window.fetch = embrulhado;
    return () => {
      if (window.fetch === embrulhado) window.fetch = original;
    };
  }, [checar, definirPendentes]);

  async function aceitar() {
    setErro(undefined);
    setEnviando(true);
    const resposta = await chamarConta("POST", "aceites", {
      documentos: pendentes.map((p) => p.documento),
    });
    setEnviando(false);
    if (resposta.ok) {
      const corpo = resposta.corpo as { pendentes?: unknown } | undefined;
      definirPendentes(filtrarPendentes(corpo?.pendentes));
      return;
    }
    setErro("Não foi possível registrar o aceite agora. Tente de novo.");
  }

  function dispensar() {
    setDispensada(true);
    setMarcado(false);
  }

  if (pendentes.length === 0 || dispensada) return null;

  return (
    <JanelaVisivel
      pendentes={pendentes}
      marcado={marcado}
      enviando={enviando}
      erro={erro}
      aoMarcar={setMarcado}
      aoDispensar={dispensar}
      aoAceitar={() => void aceitar()}
    />
  );
}

/**
 * O `<dialog>` nativo, montado só enquanto a janela está visível: abre com
 * `showModal()` (camada do topo, acima de qualquer outra janela modal e sem
 * ocupar espaço no layout) e, ao sair, fecha e devolve o foco.
 */
function JanelaVisivel({
  pendentes,
  marcado,
  enviando,
  erro,
  aoMarcar,
  aoDispensar,
  aoAceitar,
}: {
  readonly pendentes: Pendentes;
  readonly marcado: boolean;
  readonly enviando: boolean;
  readonly erro: string | undefined;
  readonly aoMarcar: (marcado: boolean) => void;
  readonly aoDispensar: () => void;
  readonly aoAceitar: () => void;
}) {
  const janela = useRef<HTMLDialogElement>(null);
  const id = "janela-de-novo-aceite";

  useEffect(() => {
    const elemento = janela.current;
    if (elemento === null) return;
    const quemAbriu = document.activeElement;
    if (!elemento.open) {
      if (typeof elemento.showModal === "function") elemento.showModal();
      else elemento.setAttribute("open", "");
    }
    return () => {
      if (elemento.open) {
        if (typeof elemento.close === "function") elemento.close();
        else elemento.removeAttribute("open");
      }
      if (
        quemAbriu instanceof HTMLElement &&
        quemAbriu !== document.body &&
        quemAbriu.isConnected
      ) {
        quemAbriu.focus();
        return;
      }
      // Quem abriu foi o body: o foco vai para outra janela modal ainda aberta.
      const outra = [
        ...document.querySelectorAll<HTMLDialogElement>(
          'dialog[open][aria-modal="true"]',
        ),
      ].find((d) => d !== elemento && d.id !== id);
      outra?.querySelector<HTMLElement>(FOCAVEL)?.focus();
    };
  }, []);

  return (
    <dialog
      ref={janela}
      id={id}
      className="sc-dialogo sc-dialogo--flutuante"
      aria-labelledby={`${id}-titulo`}
      aria-describedby={`${id}-descricao`}
      aria-modal="true"
      onCancel={(evento) => {
        evento.preventDefault();
        aoDispensar();
      }}
    >
      <div className="sc-dialogo__corpo">
        <div className="sc-dialogo__cabecalho">
          <div>
            <h2 className="sc-dialogo__titulo" id={`${id}-titulo`}>
              Atualizamos nossos termos
            </h2>
            <p className="sc-dialogo__descricao" id={`${id}-descricao`}>
              Para continuar criando pedidos, cadastros e publicações, leia e
              aceite a versão nova.
            </p>
          </div>
        </div>
        <ul className="sc-aceite__lista">
          {pendentes.map((p) => (
            <li key={p.documento}>
              <LinkDoDocumento documento={p.documento} />
              <br />
              <span className="sc-privacidade__quando">
                {textoDoDocumento(p.documento)} Versão de{" "}
                {formatarVersao(p.versao)}.
              </span>
            </li>
          ))}
        </ul>
        {erro === undefined ? null : <Aviso tom="erro">{erro}</Aviso>}
        <div className="sc-aceite">
          <label className="sc-aceite__rotulo" htmlFor="novo-aceite-marca">
            <input
              id="novo-aceite-marca"
              className="sc-aceite__caixa"
              type="checkbox"
              checked={marcado}
              onChange={(evento) => aoMarcar(evento.target.checked)}
            />
            <span>
              Li e aceito{" "}
              {pendentes.length === 1 ? "o documento" : "os documentos"} acima:{" "}
              {pendentes
                .map((p) => ROTULO_DOS_DOCUMENTOS_LEGAIS[p.documento])
                .join(", ")}
              .
            </span>
          </label>
        </div>
        <div className="sc-dialogo__rodape">
          <Botao
            variante="discreta"
            type="button"
            onClick={aoDispensar}
            desabilitado={enviando}
          >
            Agora não
          </Botao>
          <Botao
            type="button"
            carregando={enviando}
            rotuloDeEspera="Registrando…"
            desabilitado={!marcado}
            onClick={aoAceitar}
          >
            Aceitar e continuar
          </Botao>
        </div>
      </div>
    </dialog>
  );
}

/** `2026-10-19` → `19/10/2026`. */
export function formatarVersao(versao: string): string {
  const [ano, mes, dia] = versao.split("-");
  return ano !== undefined && mes !== undefined && dia !== undefined
    ? `${dia}/${mes}/${ano}`
    : versao;
}
