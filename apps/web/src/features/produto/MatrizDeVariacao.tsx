/**
 * A escolha da variante: tamanho, cor, sabor (AC-410, AC-413).
 *
 * DUAS FORMAS, E A DIFERENÇA É DO CATÁLOGO. Quando o produto declara EIXOS de
 * variação, cada eixo vira uma linha de escolhas e a combinação resolve a peça
 * — é a camiseta P azul. Quando não declara, as variantes são listadas pelo
 * nome — é a pizza P e G. As duas existem no modelo de dados, e forçar a
 * segunda no formato da primeira criaria um eixo de mentira chamado "Tamanho".
 *
 * O QUE NÃO TEM SAÍDA VEM DESABILITADO. Escolhido "azul", os tamanhos que
 * sobram são os que existem em azul. A alternativa — deixar montar e recusar no
 * fim — faz a pessoa descobrir no botão que a combinação não existe, depois de
 * ter escolhido tudo.
 *
 * SÃO `radio` DE VERDADE, e não `div` com clique. O teclado percorre o grupo
 * com as setas, o leitor de tela anuncia "1 de 3", e o navegador já garante que
 * só um fique marcado — três comportamentos que teriam de ser reescritos à mão,
 * e que costumam nascer errados.
 */
import {
  ancoraDoGrupo,
  type GrupoNaTela,
  type VariacaoNaTela,
} from "../../lib/produto.ts";

/** A âncora (e a chave de pendência) da lista simples de variações. */
export const CHAVE_DA_LISTA_DE_VARIACOES = "lista-de-variacoes";

export interface MatrizDeVariacaoProps {
  /**
   * A palavra do RAMO para variação: "Sabor" na lanchonete, "Tamanho" na loja
   * de roupas, "Aplicação" na autopeça, "Modelo" na de eletrônicos.
   *
   * Só é usada na lista simples — quando o produto declara EIXOS, cada eixo já
   * tem nome próprio dado pelo dono, e sobrescrevê-lo seria pior que genérico.
   */
  readonly rotuloDaVariacao: string;
  readonly variacoes: readonly VariacaoNaTela[];
  /** Os grupos marcados como eixo de variação. Vazio usa a lista simples. */
  readonly eixos: readonly GrupoNaTela[];
  /** O que está marcado em cada eixo: grupo → opção. */
  readonly escolhaDeEixo: Readonly<Record<string, string>>;
  /** Quais opções de cada eixo ainda levam a alguma variante à venda. */
  readonly comSaida: Readonly<Record<string, ReadonlySet<string>>>;
  readonly variacaoEscolhida: string | null;
  readonly aoEscolherEixo: (grupoId: string, opcaoId: string) => void;
  readonly aoEscolherVariacao: (variacaoId: string) => void;
  /** Os grupos pendentes depois da tentativa, e a frase de cada um. */
  readonly pendencias?: Readonly<Record<string, string>> | undefined;
}

export function MatrizDeVariacao({
  rotuloDaVariacao,
  variacoes,
  eixos,
  escolhaDeEixo,
  comSaida,
  variacaoEscolhida,
  aoEscolherEixo,
  aoEscolherVariacao,
  pendencias = {},
}: MatrizDeVariacaoProps) {
  if (variacoes.length === 0) return null;
  // Só a variação padrão ("Único"): não há o que escolher, e um grupo com uma
  // opção pré-marcada só confunde. Quem escolhe por ela é EscolhasDoProduto.
  if (
    eixos.length === 0 &&
    variacoes.length === 1 &&
    variacoes[0]?.disponivel
  ) {
    return null;
  }

  if (eixos.length === 0) {
    return (
      <fieldset
        className={`sc-produto__grupo${
          pendencias[CHAVE_DA_LISTA_DE_VARIACOES]
            ? " sc-produto__grupo--pendente"
            : ""
        }`}
        id={ancoraDoGrupo(CHAVE_DA_LISTA_DE_VARIACOES)}
        tabIndex={-1}
      >
        <legend className="sc-produto__grupo-nome">
          {rotuloDaVariacao}
          <span className="sc-produto__grupo-regra sc-produto__grupo-regra--exigida">
            Escolha 1 · obrigatório
          </span>
        </legend>
        {pendencias[CHAVE_DA_LISTA_DE_VARIACOES] ? (
          <p className="sc-produto__pendencia" role="alert">
            {pendencias[CHAVE_DA_LISTA_DE_VARIACOES]}
          </p>
        ) : null}
        <div className="sc-produto__escolhas">
          {variacoes.map((variacao) => (
            <label
              className={`sc-produto__escolha sc-produto__escolha--pilula${
                variacao.disponivel ? "" : " sc-produto__escolha--indisponivel"
              }`}
              key={variacao.id}
            >
              <input
                type="radio"
                name="variacao"
                value={variacao.id}
                checked={variacaoEscolhida === variacao.id}
                disabled={!variacao.disponivel}
                onChange={() => aoEscolherVariacao(variacao.id)}
              />
              <span className="sc-produto__escolha-nome">{variacao.nome}</span>
              {variacao.preco ? (
                <span className="sc-produto__escolha-valor">
                  {variacao.preco}
                </span>
              ) : null}
              {variacao.disponivel ? null : (
                <span className="sc-produto__escolha-aviso">Esgotado</span>
              )}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  return (
    <>
      {eixos.map((eixo) => {
        const possiveis = comSaida[eixo.id];
        return (
          <fieldset
            className={`sc-produto__grupo${
              pendencias[eixo.id] ? " sc-produto__grupo--pendente" : ""
            }`}
            id={ancoraDoGrupo(eixo.id)}
            key={eixo.id}
            tabIndex={-1}
          >
            <legend className="sc-produto__grupo-nome">
              {eixo.nome}
              <span
                className={`sc-produto__grupo-regra${
                  eixo.obrigatorio ? " sc-produto__grupo-regra--exigida" : ""
                }`}
              >
                {eixo.obrigatorio ? `${eixo.regra} · obrigatório` : eixo.regra}
              </span>
            </legend>
            {pendencias[eixo.id] ? (
              <p className="sc-produto__pendencia" role="alert">
                {pendencias[eixo.id]}
              </p>
            ) : null}
            <div className="sc-produto__escolhas">
              {eixo.opcoes.map((opcao) => {
                // Sem conjunto calculado, nada é desabilitado: é melhor deixar
                // escolher e recusar depois do que esconder o catálogo inteiro
                // por causa de um cálculo que não chegou.
                const temSaida =
                  possiveis === undefined || possiveis.has(opcao.id);
                const bloqueada = !opcao.disponivel || !temSaida;

                return (
                  <label
                    className={`sc-produto__escolha sc-produto__escolha--pilula${
                      bloqueada ? " sc-produto__escolha--indisponivel" : ""
                    }`}
                    key={opcao.id}
                  >
                    <input
                      type="radio"
                      name={`eixo-${eixo.id}`}
                      value={opcao.id}
                      checked={escolhaDeEixo[eixo.id] === opcao.id}
                      disabled={bloqueada}
                      onChange={() => aoEscolherEixo(eixo.id, opcao.id)}
                    />
                    <span className="sc-produto__escolha-nome">
                      {opcao.nome}
                    </span>
                    {bloqueada ? (
                      <span className="sc-produto__escolha-aviso">
                        Indisponível
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </>
  );
}
