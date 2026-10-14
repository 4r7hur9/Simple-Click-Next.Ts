import type { ReactNode } from "react";
import { Carregando, Erro, Sucesso } from "./estados";
import type { EstadoDaTela } from "./estados";
import { IconeFechar } from "./icones";

/**
 * Caixa de diálogo.
 *
 * Usa o elemento nativo `dialog` para herdar de graça o que costuma ser
 * reimplementado errado: fecho com a tecla de escape, fundo escurecido e
 * empilhamento acima de todo o resto. O que o elemento nativo **não** dá é
 * nome acessível — sem `aria-labelledby`, o leitor de tela anuncia apenas
 * "diálogo" e o usuário não sabe o que abriu.
 *
 * O componente é controlado por `aberto`: quem decide se o diálogo existe é a
 * tela, nunca o próprio diálogo. Isso o mantém renderizável no servidor e
 * testável sem navegador.
 *
 * Estados: **carregando** (a ação confirmada está em andamento), **erro** (ela
 * falhou) e **sucesso** (ela deu certo). Vazio não é estado de diálogo —
 * diálogo sem conteúdo não deveria ter aberto.
 */

export type DialogoProps = {
  /** Identificador base, usado para ligar título e descrição ao diálogo. */
  id: string;
  aberto: boolean;
  titulo: string;
  descricao?: string | undefined;
  estado?: EstadoDaTela | undefined;
  rotuloDeEspera?: string | undefined;
  mensagemDeErro?: string | undefined;
  referenciaDoErro?: string | undefined;
  tituloDeSucesso?: string | undefined;
  descricaoDeSucesso?: string | undefined;
  /** Botões de decisão. Ficam no fim, na ordem de leitura. */
  rodape?: ReactNode | undefined;
  /** Recebe o pedido de fechamento vindo do botão de fechar. */
  aoFechar?: (() => void) | undefined;
  rotuloDoFechar?: string | undefined;
  /**
   * Diálogo modal bloqueia o resto da página. Falso para o caso em que o
   * diálogo é exibido embutido, como na vitrine de componentes — anunciar
   * modal sem bloquear nada mente para o leitor de tela.
   */
  modal?: boolean | undefined;
  children?: ReactNode | undefined;
  className?: string | undefined;
};

/** Diálogo nativo controlado por `aberto`, com nome acessível e estados. */
export function Dialogo({
  id,
  aberto,
  titulo,
  descricao,
  estado = "pronto",
  rotuloDeEspera = "Processando…",
  mensagemDeErro = "Não foi possível concluir. Tente de novo.",
  referenciaDoErro,
  tituloDeSucesso = "Pronto",
  descricaoDeSucesso,
  rodape,
  aoFechar,
  rotuloDoFechar = "Fechar",
  modal = true,
  children,
  className,
}: DialogoProps) {
  if (!aberto) return null;

  const idTitulo = `${id}-titulo`;
  const idDescricao = `${id}-descricao`;

  return (
    <dialog
      open
      id={id}
      className={["sc-dialogo", className].filter(Boolean).join(" ")}
      aria-labelledby={idTitulo}
      aria-describedby={descricao !== undefined ? idDescricao : undefined}
      aria-modal={modal || undefined}
      aria-busy={estado === "carregando" || undefined}
    >
      <div className="sc-dialogo__corpo">
        <div className="sc-dialogo__cabecalho">
          <div>
            <h2 className="sc-dialogo__titulo" id={idTitulo}>
              {titulo}
            </h2>
            {descricao !== undefined && (
              <p className="sc-dialogo__descricao" id={idDescricao}>
                {descricao}
              </p>
            )}
          </div>
          {aoFechar !== undefined && (
            <button
              type="button"
              className="sc-dialogo__fechar"
              onClick={aoFechar}
            >
              <IconeFechar />
              <span className="sc-so-leitor">{rotuloDoFechar}</span>
            </button>
          )}
        </div>

        {estado === "carregando" && <Carregando rotulo={rotuloDeEspera} />}
        {estado === "erro" && (
          <Erro mensagem={mensagemDeErro} referencia={referenciaDoErro} />
        )}
        {estado === "sucesso" && (
          <Sucesso descricao={descricaoDeSucesso} titulo={tituloDeSucesso} />
        )}
        {estado === "pronto" && children}

        {rodape !== undefined && (
          <div className="sc-dialogo__rodape">{rodape}</div>
        )}
      </div>
    </dialog>
  );
}
