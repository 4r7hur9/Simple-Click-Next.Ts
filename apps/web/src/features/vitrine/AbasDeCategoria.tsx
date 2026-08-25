/**
 * O filtro de categoria da vitrine (AC-405).
 *
 * CADA ABA É UM LINK, e não um botão que troca estado no navegador. Três coisas
 * decorrem disso, e as três importam mais que a economia de uma requisição:
 * o filtro funciona com JavaScript desligado, que é o que o AC-415 exige da
 * vitrine; o endereço filtrado pode ser compartilhado e leva a pessoa ao mesmo
 * lugar; e o "voltar" do navegador desfaz o filtro sem uma linha de código
 * nossa. Aba em `<button>` perde as três de uma vez.
 *
 * A FAIXA É GRUDADA NO TOPO (`position: sticky`, em `vitrine.css`) porque o
 * AC-405 pede duas coisas ao mesmo tempo: que o filtro em vigor fique VISÍVEL,
 * e que dê para voltar a todas com UM toque. Numa loja com quarenta produtos, a
 * faixa que fica no topo da página some na primeira rolagem, e as duas promessas
 * somem com ela. Grudar a faixa não sequestra a rolagem: a página continua indo
 * onde o dedo mandar.
 */
import type { AbaDeCategoria } from "../../lib/catalogo.ts";

export interface AbasDeCategoriaProps {
  readonly abas: readonly AbaDeCategoria[];
  /** O nome da categoria escolhida, ou nulo quando são todas. */
  readonly filtroEmVigor: string | null;
}

export function AbasDeCategoria({ abas, filtroEmVigor }: AbasDeCategoriaProps) {
  // Uma loja com uma seção só não tem o que filtrar, e a faixa viraria enfeite
  // ocupando o topo da tela — que é o espaço mais caro da vitrine no celular.
  // (A primeira aba é sempre "Todas".)
  if (abas.length <= 2) return null;

  return (
    <nav className="sc-vitrine__abas" aria-label="Categorias">
      <ul className="sc-vitrine__abas-lista">
        {abas.map((aba) => (
          <li key={aba.link}>
            <a
              className={`sc-vitrine__aba${
                aba.emVigor ? " sc-vitrine__aba--em-vigor" : ""
              }`}
              href={aba.link}
              // `aria-current` é o que conta a escolha para quem não vê a cor
              // de fundo. Sem ele, o filtro em vigor existe só para quem enxerga.
              {...(aba.emVigor ? { "aria-current": "page" as const } : {})}
            >
              {aba.nome}
            </a>
          </li>
        ))}
      </ul>

      {filtroEmVigor === null ? null : (
        // A frase repete em PALAVRAS o que a aba destacada mostra em cor, e não
        // é redundância: cor sozinha não é informação (P-012). E a lista de
        // abas rola na horizontal no celular — com dez categorias, a que está
        // em vigor pode estar fora do campo de visão mesmo com a faixa grudada.
        <p className="sc-vitrine__filtro-em-vigor">
          Mostrando <strong>{filtroEmVigor}</strong>
        </p>
      )}
    </nav>
  );
}
