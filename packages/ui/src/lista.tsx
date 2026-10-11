import type { ReactNode } from "react";
import { Carregando, Erro, Esqueleto, Sucesso, Vazio } from "./estados";
import type { EstadoDaTela } from "./estados";

/**
 * Lista de itens com os quatro estados.
 *
 * A lista é o componente que mais precisa deles: pedido, produto, cliente e
 * categoria são todos listas que vêm do servidor. O erro clássico é tratar
 * "ainda não chegou" e "chegou vazio" como a mesma coisa — o cliente que abre a
 * vitrine de uma loja sem produto vê a mesma tela em branco de quem está sem
 * internet, e não sabe se espera ou se desiste.
 *
 * Por isso o estado é explícito, e não deduzido do tamanho do array.
 */

export type ListaProps<T> = {
  /** Rótulo acessível da lista; obrigatório porque `ul` sozinha não se explica. */
  rotulo: string;
  itens: readonly T[];
  renderizarItem: (item: T, indice: number) => ReactNode;
  /** Chave estável de cada item. Sem ela o React reordena errado ao atualizar. */
  chaveDoItem: (item: T, indice: number) => string;
  estado?: EstadoDaTela | undefined;
  tituloVazio?: string | undefined;
  descricaoVazio?: string | undefined;
  acaoDoVazio?: ReactNode | undefined;
  mensagemDeErro?: string | undefined;
  referenciaDoErro?: string | undefined;
  acaoDoErro?: ReactNode | undefined;
  tituloDeSucesso?: string | undefined;
  descricaoDeSucesso?: string | undefined;
  rotuloDeEspera?: string | undefined;
  /** Quantas linhas cinzentas desenhar na espera; 0 usa o indicador simples. */
  linhasDeEspera?: number | undefined;
  className?: string | undefined;
};

/** Espera, erro ou vazio pelo estado declarado; pronta, vira `ul` rotulada. */
export function Lista<T>({
  rotulo,
  itens,
  renderizarItem,
  chaveDoItem,
  estado = "pronto",
  tituloVazio = "Nenhum item por aqui",
  descricaoVazio,
  acaoDoVazio,
  mensagemDeErro = "Não foi possível carregar a lista. Tente de novo em instantes.",
  referenciaDoErro,
  acaoDoErro,
  tituloDeSucesso = "Lista atualizada",
  descricaoDeSucesso,
  rotuloDeEspera = "Carregando itens…",
  linhasDeEspera = 3,
  className,
}: ListaProps<T>) {
  if (estado === "carregando") {
    return linhasDeEspera > 0 ? (
      <Esqueleto
        className={className}
        linhas={linhasDeEspera}
        rotulo={rotuloDeEspera}
      />
    ) : (
      <Carregando className={className} rotulo={rotuloDeEspera} />
    );
  }

  if (estado === "erro") {
    return (
      <Erro
        acao={acaoDoErro}
        className={className}
        mensagem={mensagemDeErro}
        referencia={referenciaDoErro}
      />
    );
  }

  // "Vazio" é declarado por quem busca o dado, mas uma lista pronta e sem
  // nenhum item também é vazio — deixar passar devolveria uma `ul` oca.
  if (estado === "vazio" || itens.length === 0) {
    return (
      <Vazio
        acao={acaoDoVazio}
        className={className}
        descricao={descricaoVazio}
        titulo={tituloVazio}
      />
    );
  }

  return (
    <>
      {estado === "sucesso" && (
        <Sucesso descricao={descricaoDeSucesso} titulo={tituloDeSucesso} />
      )}
      <ul
        aria-label={rotulo}
        className={["sc-lista", className].filter(Boolean).join(" ")}
      >
        {itens.map((item, indice) => (
          <li className="sc-lista__item" key={chaveDoItem(item, indice)}>
            {renderizarItem(item, indice)}
          </li>
        ))}
      </ul>
    </>
  );
}
