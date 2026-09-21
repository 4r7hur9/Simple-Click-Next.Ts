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

/** Formulário GET: cada seleção é um link/controle funcional sem JavaScript. */
export function FiltroEspecificacao({
  filtros,
  selecionados,
  acao,
  categoria,
  busca,
}: FiltroEspecificacaoProps) {
  if (filtros.length === 0) return null;
  return (
    <form action={acao} method="get" aria-label="Filtrar por especificação">
      {categoria ? (
        <input type="hidden" name="categoria" value={categoria} />
      ) : null}
      {busca ? <input type="hidden" name="busca" value={busca} /> : null}
      {filtros.map((filtro) => (
        <fieldset key={filtro.chave}>
          <legend>{filtro.nome}</legend>
          {filtro.valores.map((valor) => {
            const chave = `${filtro.chave}=${valor}`;
            return (
              <label key={chave}>
                <input
                  type="checkbox"
                  name="filtro"
                  value={chave}
                  defaultChecked={selecionados.includes(chave)}
                />
                {valor}
              </label>
            );
          })}
        </fieldset>
      ))}
      <button type="submit">Filtrar</button>
    </form>
  );
}
