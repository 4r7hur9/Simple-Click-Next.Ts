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
 * É SÓ O FORMULÁRIO. Quem o abre e fecha é a barra do catálogo
 * (`BarraDeCatalogo`), que o guarda num painel `popover` — fechado até alguém
 * tocar em "Filtrar", sem script, e sem empurrar o primeiro produto para fora
 * da tela no celular.
 */
import {
  PARAMETRO_DA_ORDEM,
  PARAMETRO_DO_ATACADO,
  type OrdemDoCatalogo,
} from "../../lib/catalogo.ts";

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
  /** A ordem em vigor vai junto, para filtrar não desfazer o "Ordenar". */
  readonly ordem?: OrdemDoCatalogo | undefined;
  /** O filtro de atacado ligado vai junto (card #59). */
  readonly atacado?: boolean | undefined;
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

/** O mesmo catálogo, sem nenhum `filtro=` — mantém categoria, busca e ordem. */
function limparFiltros(
  acao: string,
  categoria: string | null,
  busca: string | null,
  ordem: OrdemDoCatalogo,
  atacado: boolean,
): string {
  const parametros = new URLSearchParams();
  if (categoria) parametros.set("categoria", categoria);
  if (busca) parametros.set("busca", busca);
  if (atacado) parametros.set(PARAMETRO_DO_ATACADO, "1");
  if (ordem !== "relevancia") parametros.set(PARAMETRO_DA_ORDEM, ordem);
  const consulta = parametros.toString();
  return consulta === "" ? acao : `${acao}?${consulta}`;
}

/** Formulário GET: cada seleção é um controle funcional sem JavaScript. */
export function FiltroEspecificacao({
  filtros,
  selecionados,
  acao,
  categoria,
  busca,
  ordem = "relevancia",
  atacado = false,
}: FiltroEspecificacaoProps) {
  if (filtros.length === 0) return null;
  return (
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
      {ordem === "relevancia" ? null : (
        <input type="hidden" name={PARAMETRO_DA_ORDEM} value={ordem} />
      )}
      {atacado ? (
        <input type="hidden" name={PARAMETRO_DO_ATACADO} value="1" />
      ) : null}
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
      <div className="sc-filtro__acoes">
        {selecionados.length > 0 ? (
          <a
            className="sc-filtro__limpar"
            href={limparFiltros(acao, categoria, busca, ordem, atacado)}
          >
            Limpar filtros
          </a>
        ) : null}
        <button
          className="sc-botao sc-botao--primaria sc-botao--pilula"
          type="submit"
        >
          Aplicar filtros
        </button>
      </div>
    </form>
  );
}
