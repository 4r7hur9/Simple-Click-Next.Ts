/**
 * Os grupos de escolha do produto (AC-410, AC-412).
 *
 * O TIPO DO CONTROLE SAI DA REGRA DO GRUPO, e não de uma coluna própria: grupo
 * que aceita no máximo uma escolha vira `radio`; o resto vira `checkbox`. É a
 * mesma derivação que o banco faz para obrigatoriedade — e ter um campo
 * "tipoDeControle" abriria a chance de ele divergir do máximo que de fato
 * bloqueia.
 *
 * O QUE FALTA É DITO NO GRUPO, e não só no rodapé. O AC-412 pede que a página
 * role até o grupo pendente e o MARQUE — por isso cada grupo carrega a âncora
 * (`id`) que a rolagem procura, e a mensagem aparece dentro dele, ligada aos
 * controles por `aria-describedby`. Um aviso só no botão obrigaria a pessoa a
 * procurar sozinha qual dos oito grupos está pendente.
 *
 * OPÇÃO ESGOTADA APARECE, desabilitada. Sumir com ela faria o produto parecer
 * ter menos opções do que tem, e quem procurou o cheddar concluiria que a loja
 * nunca teve.
 */
import { ancoraDoGrupo, type GrupoNaTela } from "../../lib/produto.ts";

export interface SelecaoDeOpcoesProps {
  readonly grupos: readonly GrupoNaTela[];
  /** Quantas vezes cada opção está marcada: opção → quantidade. */
  readonly marcadas: Readonly<Record<string, number>>;
  /** Os grupos com pendência, e a frase de cada um. */
  readonly pendencias: Readonly<Record<string, string>>;
  readonly aoAlternar: (grupo: GrupoNaTela, opcaoId: string) => void;
}

export function SelecaoDeOpcoes({
  grupos,
  marcadas,
  pendencias,
  aoAlternar,
}: SelecaoDeOpcoesProps) {
  if (grupos.length === 0) return null;

  return (
    <>
      {grupos.map((grupo) => {
        const pendencia = pendencias[grupo.id];
        // Uma escolha no máximo é comportamento de rádio: marcar uma desmarca a
        // outra. Mais de uma, ou sem teto, é caixa de seleção.
        const escolhaUnica = grupo.maximo === 1;
        const idDoAviso = `pendencia-${grupo.id}`;

        return (
          <fieldset
            className={`sc-produto__grupo${
              pendencia ? " sc-produto__grupo--pendente" : ""
            }`}
            id={ancoraDoGrupo(grupo.id)}
            key={grupo.id}
            // `tabindex="-1"` para a rolagem poder DAR FOCO ao grupo. Sem foco,
            // quem usa leitor de tela seria levado visualmente até o grupo e
            // continuaria ouvindo o botão lá embaixo.
            tabIndex={-1}
          >
            <legend className="sc-produto__grupo-nome">
              {grupo.nome}
              <span
                className={`sc-produto__grupo-regra${
                  grupo.obrigatorio ? " sc-produto__grupo-regra--exigida" : ""
                }`}
              >
                {grupo.obrigatorio
                  ? `${grupo.regra} · obrigatório`
                  : grupo.regra}
              </span>
            </legend>

            {grupo.descricao ? (
              <p className="sc-produto__grupo-descricao">{grupo.descricao}</p>
            ) : null}

            {pendencia ? (
              // `role="alert"` porque ele NASCE de uma ação da pessoa (apertar
              // adicionar), e interromper é o comportamento certo — diferente
              // do aviso de loja fechada, que já está na página quando ela abre.
              <p className="sc-produto__pendencia" id={idDoAviso} role="alert">
                {pendencia}
              </p>
            ) : null}

            <div className="sc-produto__escolhas">
              {grupo.opcoes.map((opcao) => {
                const quantas = marcadas[opcao.id] ?? 0;

                return (
                  <label
                    className={`sc-produto__escolha${
                      opcao.disponivel
                        ? ""
                        : " sc-produto__escolha--indisponivel"
                    }`}
                    key={opcao.id}
                  >
                    <input
                      type={escolhaUnica ? "radio" : "checkbox"}
                      name={escolhaUnica ? `grupo-${grupo.id}` : undefined}
                      value={opcao.id}
                      checked={quantas > 0}
                      disabled={!opcao.disponivel}
                      onChange={() => aoAlternar(grupo, opcao.id)}
                      {...(pendencia ? { "aria-describedby": idDoAviso } : {})}
                    />
                    <span className="sc-produto__escolha-nome">
                      {opcao.nome}
                    </span>
                    {opcao.acrescimo ? (
                      <span className="sc-produto__escolha-valor">
                        {opcao.acrescimo}
                      </span>
                    ) : null}
                    {opcao.disponivel ? null : (
                      <span className="sc-produto__escolha-aviso">Acabou</span>
                    )}
                    {grupo.permiteRepetir && quantas > 1 ? (
                      <span className="sc-produto__escolha-vezes">
                        {quantas}×
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
