/**
 * O filtro por especificação da vitrine (T-312, AC-328).
 *
 * UM FORMULÁRIO GET, SEM SCRIPT. Cada opção é uma caixa de marcar dentro de
 * um formulário comum: filtrar funciona na fila do ônibus com a página ainda
 * sem JavaScript, e o resultado fica no endereço — compartilhável e refeito
 * pelo "voltar" do navegador. Quem decide o que vira filtro é a API: aqui só
 * chega especificação marcada como filtrável, com os valores que os produtos
 * publicados têm.
 *
 * FICA DENTRO DE UM `details`, fechado até alguém precisar: no celular, três
 * grupos de caixas abertos empurram o primeiro produto para fora da tela. O
 * `details` abre e fecha pelo próprio navegador, sem script, e nasce aberto
 * quando há filtro em vigor — quem filtrou precisa ver o que marcou.
 */
import { IconeSeta } from "@simpleclick/ui";

type Filtro = {
  readonly chave: string;
  readonly nome: string;
  readonly valores: readonly string[];
};

export interface FiltroEspecificacaoProps {
  readonly filtros: readonly Filtro[];
  readonly selecionados: readonly string[];
  readonly acao: string;
  readonly categoria: string | null;
  readonly busca: string | null;
}

/**
 * O que o cliente lê em cada opção. O valor que vai no endereço não muda —
 * só a leitura: "true" é como o banco escreve, "Sim" é como a gente fala.
 */
function rotuloDoValor(valor: string): string {
  if (valor === "true") return "Sim";
  if (valor === "false") return "Não";
  return valor;
}

/** Formulário GET: cada seleção é um controle funcional sem JavaScript. */
export function FiltroEspecificacao({
  filtros,
  selecionados,
  acao,
  categoria,
  busca,
}: FiltroEspecificacaoProps) {
  if (filtros.length === 0) return null;
  return (
    <details
      className="sc-filtro"
      open={selecionados.length > 0 || undefined}
    >
      <summary className="sc-filtro__titulo">
        <span>
          Filtrar
          {selecionados.length > 0 ? (
            <span className="sc-filtro__contagem">
              {" "}
              ({selecionados.length})
            </span>
          ) : null}
        </span>
        <IconeSeta className="sc-filtro__seta" />
      </summary>
      <form
        className="sc-filtro__formulario"
        action={acao}
        method="get"
        aria-label="Filtrar por especificação"
      >
        {categoria ? (
          <input type="hidden" name="categoria" value={categoria} />
        ) : null}
        {busca ? <input type="hidden" name="busca" value={busca} /> : null}
        {filtros.map((filtro) => (
          <fieldset className="sc-filtro__grupo" key={filtro.chave}>
            <legend className="sc-filtro__nome">{filtro.nome}</legend>
            {filtro.valores.map((valor) => {
              const chave = `${filtro.chave}=${valor}`;
              return (
                <label className="sc-filtro__opcao" key={chave}>
                  <input
                    type="checkbox"
                    name="filtro"
                    value={chave}
                    defaultChecked={selecionados.includes(chave)}
                  />
                  {rotuloDoValor(valor)}
                </label>
              );
            })}
          </fieldset>
        ))}
        <button
          className="sc-botao sc-botao--primaria sc-botao--pilula"
          type="submit"
        >
          Filtrar
        </button>
      </form>
    </details>
  );
}
