/**
 * A busca da vitrine (AC-408, AC-409).
 *
 * É UM FORMULÁRIO `GET`, e não um campo que filtra enquanto se digita. Três
 * coisas decorrem disso, e as três valem mais que a economia de um Enter:
 *
 *   * funciona com JavaScript desligado, que é o que o AC-415 exige da vitrine
 *     — e buscar é mostrar produto;
 *   * o resultado fica no ENDEREÇO, e endereço se compartilha: "olha o que
 *     achei na loja" vira um link, e não uma descrição;
 *   * o "voltar" do navegador desfaz a busca sem uma linha de código nossa.
 *
 * FILTRAR ENQUANTO DIGITA custaria uma ida ao servidor por tecla, numa tela
 * feita para rede ruim — ou obrigaria a baixar o catálogo inteiro para filtrar
 * no navegador, que é o mesmo peso que o AC-415 proíbe.
 */
import { IconeBuscar } from "@simpleclick/ui";

import {
  PARAMETRO_DA_BUSCA,
  PARAMETRO_DA_ORDEM,
  PARAMETRO_DO_ATACADO,
  type OrdemDoCatalogo,
} from "../../lib/catalogo.ts";

export interface BuscaProdutoProps {
  /** Para onde o formulário envia — o próprio catálogo da loja. */
  readonly acao: string;
  /** O que já está sendo buscado, para o campo abrir preenchido. */
  readonly termo: string | null;
  /** Como a loja chama o catálogo: "cardápio" ou "catálogo". */
  readonly rotuloDoCatalogo: string;
  /** A ordem em vigor atravessa a busca, como atravessa as abas. */
  readonly ordem?: OrdemDoCatalogo | undefined;
  /** O filtro de atacado ligado atravessa a busca também (card #59). */
  readonly atacado?: boolean | undefined;
  /** O `id` do campo. Duas buscas na mesma página precisam de ids diferentes. */
  readonly id?: string | undefined;
}

export function BuscaProduto({
  acao,
  termo,
  rotuloDoCatalogo,
  ordem = "relevancia",
  atacado = false,
  id = "busca-na-vitrine",
}: BuscaProdutoProps) {
  return (
    <form
      className="sc-vitrine__busca"
      action={acao}
      method="get"
      role="search"
    >
      {ordem === "relevancia" ? null : (
        <input type="hidden" name={PARAMETRO_DA_ORDEM} value={ordem} />
      )}
      {atacado ? (
        <input type="hidden" name={PARAMETRO_DO_ATACADO} value="1" />
      ) : null}
      <label className="sc-so-leitor" htmlFor={id}>
        Buscar no {rotuloDoCatalogo.toLowerCase()}
      </label>
      <input
        className="sc-vitrine__busca-campo"
        id={id}
        type="search"
        name={PARAMETRO_DA_BUSCA}
        defaultValue={termo ?? ""}
        // A dica é curta porque o campo divide a barra com as categorias, o
        // filtro e a ordem. O nome completo, com a palavra do ramo, está no
        // `label`.
        placeholder="Buscar"
        // `search` no celular troca o "enter" por uma lupa: é o teclado dizendo
        // o que aquele botão faz, sem a pessoa ter de descobrir.
        enterKeyHint="search"
        autoComplete="off"
      />
      {/*
        O botão continua existindo, mesmo virando só a lupa: sem script, ele é
        a única forma de enviar para quem não descobre que "enter" busca. O
        nome "Buscar" fica para o leitor de tela.
      */}
      <button className="sc-vitrine__busca-botao" type="submit">
        <IconeBuscar />
        <span className="sc-so-leitor">Buscar</span>
      </button>
    </form>
  );
}

export interface SemResultadoProps {
  /** O termo digitado. Ele aparece na mensagem, e é o ponto (AC-409). */
  readonly termo: string;
  /** Para onde vai quem quer ver tudo de novo. */
  readonly linkDeTodos: string;
  readonly rotuloDoCatalogo: string;
}

/**
 * O que a tela diz quando a loja não vende o que foi procurado (AC-409).
 *
 * O TERMO APARECE NA MENSAGEM, e não é enfeite: "nada encontrado" sozinho deixa
 * a pessoa em dúvida se ela digitou errado, se a busca funcionou, ou se a loja
 * não tem mesmo. Repetir o que ela digitou responde as três de uma vez.
 *
 * E há SAÍDA. Vazio sem caminho de volta é beco sem saída — a pessoa fecha a
 * página em vez de procurar outra coisa.
 */
export function SemResultado({
  termo,
  linkDeTodos,
  rotuloDoCatalogo,
}: SemResultadoProps) {
  return (
    <div className="sc-vitrine__sem-resultado">
      <span className="sc-vitrine__sem-resultado-icone" aria-hidden="true">
        <IconeBuscar />
      </span>
      <p className="sc-vitrine__sem-resultado-titulo">
        Nada encontrado para <strong>{termo}</strong>
      </p>
      <p className="sc-vitrine__sem-resultado-texto">
        Tente outra palavra, ou veja o {rotuloDoCatalogo.toLowerCase()} inteiro.
      </p>
      <a className="sc-vitrine__aba" href={linkDeTodos}>
        Limpar a busca
      </a>
    </div>
  );
}
