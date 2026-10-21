"use client";

/**
 * Passo 2 do importador: que coluna vira que campo (card #61).
 *
 * Uma linha por COLUNA DO ARQUIVO, na ordem da planilha: é como o dono pensa
 * ("a coluna Celular é o telefone"). O seletor já vem com a sugestão da API.
 * Cada campo fica com uma coluna só: escolher "Telefone" numa coluna tira o
 * telefone da outra, e a tela diz isso.
 */
import { Aviso, Botao, Info, Seletor, Selo } from "@simpleclick/ui";

import type {
  CampoDaImportacao,
  PreviaDaImportacao,
} from "../../../lib/importacao-de-clientes.ts";

/** Coluna → campo escolhido ("" = não importar). */
export type EscolhaPorColuna = Readonly<Record<string, CampoDaImportacao | "">>;

export interface PassoDoMapeamentoProps {
  readonly previa: PreviaDaImportacao;
  readonly escolhas: EscolhaPorColuna;
  readonly aoEscolher: (coluna: string, campo: CampoDaImportacao | "") => void;
  /** A frase de quando um campo trocou de coluna. */
  readonly recado: string | null;
  readonly conferindo: boolean;
  readonly erro: string | null;
  readonly aoVoltar: () => void;
  readonly aoContinuar: () => void;
}

/** Os campos obrigatórios que nenhuma coluna alimenta. */
export function obrigatoriosSemColuna(
  previa: PreviaDaImportacao,
  escolhas: EscolhaPorColuna,
): readonly string[] {
  const usados = new Set(Object.values(escolhas));
  return previa.campos
    .filter((campo) => campo.obrigatorio && !usados.has(campo.campo))
    .map((campo) => campo.rotulo);
}

export function PassoDoMapeamento({
  previa,
  escolhas,
  aoEscolher,
  recado,
  conferindo,
  erro,
  aoVoltar,
  aoContinuar,
}: PassoDoMapeamentoProps) {
  const faltando = obrigatoriosSemColuna(previa, escolhas);
  const opcoes = [
    { valor: "", rotulo: "Não importar" },
    ...previa.campos.map((campo) => ({
      valor: campo.campo,
      rotulo: campo.obrigatorio
        ? `${campo.rotulo} (obrigatório)`
        : campo.rotulo,
    })),
  ];

  return (
    <div className="grid gap-4">
      <p className="m-0 text-sm text-[var(--cor-tinta-suave)]">
        Já sugerimos o campo de cada coluna pelo nome dela. Confira e troque o
        que precisar; colunas marcadas como “Não importar” ficam de fora.
      </p>

      <div className="overflow-x-auto rounded-[var(--raio-janela)] border border-[var(--cor-borda)] bg-[var(--cor-superficie-alta)]">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">
            Colunas do arquivo e o campo de cada uma
          </caption>
          <thead>
            <tr className="border-b border-[var(--cor-borda)]">
              <th scope="col" className="px-4 py-3 font-semibold">
                Coluna do arquivo
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Exemplos
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                <span className="inline-flex items-center gap-1">
                  Vai para o campo
                  <Info
                    rotulo="o campo de cada coluna"
                    conteudo={{
                      texto:
                        "Diga em qual campo do SimpleClick entra cada coluna da sua planilha. “Não importar” deixa a coluna de fora. Nome e telefone são obrigatórios.",
                      exemplo: "a coluna “Celular” vai para Telefone.",
                    }}
                  />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {previa.colunas.map((coluna) => {
              const id = `importar-coluna-${coluna.indice}`;
              return (
                <tr
                  key={coluna.indice}
                  data-coluna={coluna.nome}
                  className="border-b border-[var(--cor-borda)] last:border-b-0"
                >
                  <th scope="row" className="px-4 py-3 align-top font-semibold">
                    <span id={id}>{coluna.nome}</span>
                  </th>
                  <td className="px-4 py-3 align-top text-[var(--cor-tinta-suave)]">
                    {coluna.exemplos.length === 0 ? (
                      <em>coluna vazia</em>
                    ) : (
                      <ul className="m-0 grid list-none gap-1 p-0">
                        {coluna.exemplos.map((exemplo, indice) => (
                          <li key={indice} className="break-words">
                            {exemplo}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="min-w-56 px-4 py-3 align-top">
                    <Seletor
                      className="min-h-11 w-full"
                      aria-labelledby={id}
                      name={`mapa-${coluna.indice}`}
                      busca={false}
                      value={escolhas[coluna.nome] ?? ""}
                      opcoes={opcoes}
                      onChange={(valor) =>
                        aoEscolher(coluna.nome, valor as CampoDaImportacao | "")
                      }
                    />
                    {coluna.campoSugerido !== null &&
                    escolhas[coluna.nome] === coluna.campoSugerido ? (
                      <Selo tom="info" semBolinha className="mt-2">
                        Sugestão
                      </Selo>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {recado === null ? null : <Aviso tom="info">{recado}</Aviso>}

      {faltando.length === 0 ? null : (
        <Aviso tom="atencao" titulo="Falta escolher uma coluna">
          Escolha a coluna de {faltando.join(" e de ")}: sem isso o cliente não
          pode ser cadastrado.
        </Aviso>
      )}

      {erro === null ? null : (
        <Aviso tom="erro" titulo="Não foi possível conferir o arquivo">
          {erro}
        </Aviso>
      )}

      <div className="flex flex-wrap justify-between gap-3">
        <Botao variante="secundaria" onClick={aoVoltar}>
          Trocar arquivo
        </Botao>
        <Botao
          desabilitado={faltando.length > 0}
          carregando={conferindo}
          rotuloDeEspera="Conferindo as linhas…"
          onClick={aoContinuar}
        >
          Conferir as linhas
        </Botao>
      </div>
    </div>
  );
}
