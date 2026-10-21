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
 * Visitante (sem sessão) recebe 401 e não vê nada. A checagem roda ao montar
 * e a cada mudança de página, no máximo uma vez por minuto.
 */
import "@simpleclick/ui/styles/aceite.css";

import {
  ROTULO_DOS_DOCUMENTOS_LEGAIS,
  type DocumentoLegal,
  type SituacaoDosAceites,
} from "@simpleclick/contracts";
import { Aviso, Botao, Dialogo } from "@simpleclick/ui";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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

export function JanelaDeNovoAceite() {
  const caminho = usePathname();
  const ultimaChecagem = useRef(0);
  const [pendentes, setPendentes] = useState<SituacaoDosAceites["pendentes"]>([]);
  const [dispensada, setDispensada] = useState(false);
  const [marcado, setMarcado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string>();

  useEffect(() => {
    // `caminho` só dispara a checagem; o intervalo evita pedir a cada clique.
    void caminho;
    const agora = Date.now();
    if (agora - ultimaChecagem.current < INTERVALO_ENTRE_CHECAGENS_EM_MS) return;
    ultimaChecagem.current = agora;
    let cancelado = false;
    void chamarConta("GET", "aceites").then((resposta) => {
      if (cancelado) return;
      const corpo = resposta.corpo as Partial<SituacaoDosAceites> | undefined;
      if (resposta.ok && Array.isArray(corpo?.pendentes)) {
        setPendentes(corpo.pendentes);
      } else {
        // Sem sessão (ou API fora): nada a pedir, e a próxima página confere de novo.
        setPendentes([]);
        if (resposta.status === 401) ultimaChecagem.current = 0;
      }
    });
    return () => {
      cancelado = true;
    };
  }, [caminho]);

  // Qualquer 403 `aceite_pendente` (de qualquer tela) reabre a janela.
  useEffect(() => {
    const original = window.fetch;
    const embrulhado: typeof fetch = async (...argumentos) => {
      const resposta = await original(...argumentos);
      if (resposta.status === 403) {
        void resposta
          .clone()
          .json()
          .then((corpo: { erro?: string; pendentes?: SituacaoDosAceites["pendentes"] }) => {
            if (corpo.erro !== "aceite_pendente") return;
            if (Array.isArray(corpo.pendentes) && corpo.pendentes.length > 0) {
              setPendentes(corpo.pendentes);
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
  }, []);

  async function aceitar() {
    setErro(undefined);
    setEnviando(true);
    const resposta = await chamarConta("POST", "aceites", {
      documentos: pendentes.map((p) => p.documento),
    });
    setEnviando(false);
    if (resposta.ok) {
      setPendentes([]);
      setMarcado(false);
      return;
    }
    setErro("Não foi possível registrar o aceite agora. Tente de novo.");
  }

  if (pendentes.length === 0 || dispensada) return null;

  return (
    <Dialogo
      id="janela-de-novo-aceite"
      aberto
      titulo="Atualizamos nossos termos"
      descricao="Para continuar criando pedidos, cadastros e publicações, leia e aceite a versão nova."
      rodape={
        <>
          <Botao
            variante="discreta"
            type="button"
            onClick={() => setDispensada(true)}
            desabilitado={enviando}
          >
            Agora não
          </Botao>
          <Botao
            type="button"
            carregando={enviando}
            rotuloDeEspera="Registrando…"
            desabilitado={!marcado}
            onClick={() => void aceitar()}
          >
            Aceitar e continuar
          </Botao>
        </>
      }
    >
      <ul className="sc-aceite__lista">
        {pendentes.map((p) => (
          <li key={p.documento}>
            <LinkDoDocumento documento={p.documento} />
            <br />
            <span className="sc-privacidade__quando">
              {textoDoDocumento(p.documento)} Versão de {formatarVersao(p.versao)}.
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
            onChange={(evento) => setMarcado(evento.target.checked)}
          />
          <span>
            Li e aceito {pendentes.length === 1 ? "o documento" : "os documentos"}{" "}
            acima: {pendentes
              .map((p) => ROTULO_DOS_DOCUMENTOS_LEGAIS[p.documento])
              .join(", ")}
            .
          </span>
        </label>
      </div>
    </Dialogo>
  );
}

/** `2026-10-19` → `19/10/2026`. */
export function formatarVersao(versao: string): string {
  const [ano, mes, dia] = versao.split("-");
  return ano !== undefined && mes !== undefined && dia !== undefined
    ? `${dia}/${mes}/${ano}`
    : versao;
}
