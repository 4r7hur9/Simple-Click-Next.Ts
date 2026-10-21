"use client";

/**
 * A gaveta de comentários do post (card #49): sobe de baixo no celular e
 * abre ao lado no computador. Mostra os comentários APROVADOS pela loja e,
 * para quem escreveu, os próprios que ainda esperam aprovação. Escrever
 * exige conta: sem ela, o campo vira "Entre para comentar" com volta aqui.
 */
import Link from "next/link";
import { X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ProdutoDoFeed } from "@simpleclick/contracts";
import { IconeEntrar } from "@simpleclick/ui";

import {
  comentariosVisiveis,
  tempoRelativo,
  TAMANHO_MAXIMO_DO_COMENTARIO,
  type AcoesDoFeed,
  type Comentario,
} from "./social.ts";

type Estado =
  | { readonly fase: "carregando" }
  | { readonly fase: "pronto"; readonly lista: readonly Comentario[] }
  | { readonly fase: "erro" };

export function GavetaDeComentarios({
  produto,
  logado,
  voltarPara,
  acoes,
  aoFechar,
}: {
  /** Aberta quando há produto. */
  readonly produto: ProdutoDoFeed | null;
  readonly logado: boolean;
  readonly voltarPara: string;
  readonly acoes: AcoesDoFeed;
  readonly aoFechar: () => void;
}) {
  const janela = useRef<HTMLDialogElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [retorno, setRetorno] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const id = produto?.id;

  useEffect(() => {
    const el = janela.current;
    if (el === null) return;
    if (produto !== null && !el.open) el.showModal?.();
    if (produto === null && el.open) el.close();
  }, [produto]);

  useEffect(() => {
    if (id === undefined) return;
    let vivo = true;
    setEstado({ fase: "carregando" });
    setRetorno(null);
    void acoes.comentarios(id).then((r) => {
      if (!vivo) return;
      if (r.ok) setEstado({ fase: "pronto", lista: r.dados });
      // Sem a API de comentários ainda (ou fora do ar): lista vazia é melhor
      // que erro na primeira abertura; o "tentar de novo" fica para falha real.
      else if (r.motivo === "indisponivel" && tentativa === 0) setEstado({ fase: "pronto", lista: [] });
      else setEstado({ fase: "erro" });
    });
    return () => {
      vivo = false;
    };
  }, [id, acoes, tentativa]);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (id === undefined) return;
    const limpo = texto.trim();
    if (limpo === "" || enviando) return;
    setEnviando(true);
    setRetorno(null);
    const r = await acoes.comentar(id, limpo);
    setEnviando(false);
    if (r.ok) {
      setTexto("");
      setEstado((e) => ({
        fase: "pronto",
        lista: [...(e.fase === "pronto" ? e.lista : []), r.dados],
      }));
      setRetorno({ tom: "ok", texto: "Seu comentário aguarda aprovação da loja." });
      return;
    }
    setRetorno({
      tom: "erro",
      texto:
        r.motivo === "precisa-entrar"
          ? "Sua sessão acabou. Entre de novo para comentar."
          : (r.mensagem ?? "Não deu para enviar agora. Tente de novo."),
    });
  }

  const visiveis = estado.fase === "pronto" ? comentariosVisiveis(estado.lista) : [];
  const agora = Date.now();

  return (
    <dialog
      ref={janela}
      className="sc-comentarios"
      aria-labelledby="sc-comentarios-titulo"
      onClose={aoFechar}
      onClick={(e) => {
        // Toque no fundo escuro fecha.
        if (e.target === e.currentTarget) janela.current?.close();
      }}
    >
      {produto === null ? null : (
        <div className="sc-comentarios__caixa">
          <header className="sc-comentarios__topo">
            <span className="sc-comentarios__puxador" aria-hidden="true" />
            <h2 id="sc-comentarios-titulo">Comentários</h2>
            <p className="sc-comentarios__sobre">
              {produto.nome} · {produto.loja.nome}
            </p>
            <button
              type="button"
              className="sc-comentarios__fechar"
              aria-label="Fechar comentários"
              onClick={() => janela.current?.close()}
            >
              <X aria-hidden="true" size={22} />
            </button>
          </header>

          <div className="sc-comentarios__lista" tabIndex={-1} autoFocus aria-live="polite" aria-busy={estado.fase === "carregando"}>
            {estado.fase === "carregando" ? (
              <ul className="sc-comentarios__itens" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <li key={i} className="sc-comentario sc-comentario--carregando">
                    <span className="sc-comentario__avatar" />
                    <span className="sc-post__traco sc-post__traco--longo" />
                  </li>
                ))}
              </ul>
            ) : estado.fase === "erro" ? (
              <div className="sc-comentarios__vazio">
                <p>Os comentários não carregaram.</p>
                <button type="button" className="sc-feed__chamada" onClick={() => setTentativa((n) => n + 1)}>
                  Tentar de novo
                </button>
              </div>
            ) : visiveis.length === 0 ? (
              <div className="sc-comentarios__vazio">
                <p className="sc-comentarios__vazio-titulo">Ainda sem comentários</p>
                <p>Conte o que achou. A loja aprova antes de aparecer para todos.</p>
              </div>
            ) : (
              <ul className="sc-comentarios__itens">
                {visiveis.map((c) => (
                  <li key={c.id} className="sc-comentario" data-pendente={c.situacao === "pendente" || undefined}>
                    <span className="sc-comentario__avatar" aria-hidden="true">
                      {c.autor.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="sc-comentario__corpo">
                      <p>
                        <strong>{c.meu ? "Você" : c.autor}</strong> {c.texto}
                      </p>
                      <span className="sc-comentario__meta">
                        {tempoRelativo(c.criadoEm, agora)}
                        {c.situacao === "pendente" ? (
                          <span className="sc-comentario__pendente">Aguardando aprovação da loja</span>
                        ) : null}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {retorno === null ? null : (
            <p className="sc-comentarios__retorno" data-tom={retorno.tom} role="status">
              {retorno.texto}
            </p>
          )}

          {logado ? (
            <form className="sc-comentarios__form" onSubmit={(e) => void enviar(e)}>
              <label className="sc-feed__oculto" htmlFor="sc-comentario-texto">
                Escreva um comentário
              </label>
              <textarea
                ref={campo}
                id="sc-comentario-texto"
                rows={1}
                maxLength={TAMANHO_MAXIMO_DO_COMENTARIO}
                placeholder={`Comente sobre ${produto.nome}…`}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <button type="submit" disabled={enviando || texto.trim() === ""}>
                {enviando ? "Enviando…" : "Publicar"}
              </button>
            </form>
          ) : (
            <div className="sc-comentarios__entrar">
              <IconeEntrar aria-hidden="true" size={18} />
              <span>Para comentar, entre na sua conta.</span>
              <Link className="sc-feed__chamada" href={`/entrar?proximo=${encodeURIComponent(voltarPara)}`}>
                Entrar
              </Link>
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}
