"use client";

import { useEffect, useState } from "react";

/**
 * As especificações que o produto herda da categoria (T-301, AC-326).
 *
 * Escolheu a categoria Pneus, o formulário passa a pedir Aro, Largura e Índice
 * de carga, na ordem que o dono definiu. Lista mostra só os valores
 * cadastrados (AC-327); a obrigatória aparece marcada e impede salvar em
 * branco.
 *
 * A CONFERÊNCIA DAQUI É CORTESIA, não garantia: ela evita a viagem inútil até
 * a API, mas quem decide é a rota, que confere tudo de novo com a regra do
 * domínio. Por isso o erro da API também chega aos campos, pelo mesmo lugar.
 *
 * MUDAR DE CATEGORIA NÃO APAGA NADA (T-310, AC-329). Os valores preenchidos na
 * categoria anterior ficam guardados e aparecem aqui como "não usados na
 * categoria atual"; só saem se o dono pedir e confirmar.
 */

export type TipoDeValor = "texto" | "numero" | "lista" | "booleano";

export interface EspecificacaoHerdada {
  readonly id: string;
  readonly nome: string;
  readonly tipo: TipoDeValor;
  readonly unidade: string | null;
  readonly obrigatoria: boolean;
  readonly opcoes: readonly string[];
}

export type ValorDaEspecificacao = string | number | boolean | null;
export type ValoresDasEspecificacoes = Readonly<
  Record<string, ValorDaEspecificacao>
>;

/** Um valor guardado que a categoria atual do produto não usa. */
export interface ValorGuardado {
  readonly especificacaoId: string;
  readonly nome: string;
  readonly unidade: string | null;
  readonly categoriaNome: string | null;
  readonly valor: ValorDaEspecificacao;
  readonly motivo: "outra_categoria" | "removida";
}

interface Props {
  /** A categoria escolhida agora no formulário. */
  readonly categoriaId: string;
  /** Presente na edição: os valores já gravados vêm do produto. */
  readonly produtoId?: string | undefined;
  /** A categoria em que o produto está gravado, para saber de onde ler. */
  readonly categoriaGravadaId?: string | null | undefined;
  readonly valores: ValoresDasEspecificacoes;
  readonly erros: Readonly<Record<string, string>>;
  readonly aoMudar: (valores: ValoresDasEspecificacoes) => void;
  readonly aoCarregar: (
    especificacoes: readonly EspecificacaoHerdada[],
  ) => void;
}

function vazio(valor: ValorDaEspecificacao | undefined): boolean {
  return valor === undefined || valor === null || valor === "";
}

/**
 * O que falta ou está fora do lugar, por especificação — o mesmo critério da
 * API, para a tela avisar antes de mandar.
 */
export function conferirEspecificacoes(
  especificacoes: readonly EspecificacaoHerdada[],
  valores: ValoresDasEspecificacoes,
): Record<string, string> {
  const erros: Record<string, string> = {};
  for (const especificacao of especificacoes) {
    const valor = valores[especificacao.id];
    if (vazio(valor)) {
      if (especificacao.obrigatoria) {
        erros[especificacao.id] = `${especificacao.nome} é obrigatória.`;
      }
      continue;
    }
    if (
      especificacao.tipo === "lista" &&
      !especificacao.opcoes.includes(String(valor))
    ) {
      erros[especificacao.id] =
        `Valor inválido para ${especificacao.nome}. Escolha: ${especificacao.opcoes.join(", ")}.`;
    }
    if (
      especificacao.tipo === "numero" &&
      (typeof valor !== "number" || !Number.isFinite(valor))
    ) {
      erros[especificacao.id] = `Informe um número para ${especificacao.nome}.`;
    }
  }
  return erros;
}

type Estado = "carregando" | "erro" | "pronto";

export function CamposDeEspecificacao({
  categoriaId,
  produtoId,
  categoriaGravadaId,
  valores,
  erros,
  aoMudar,
  aoCarregar,
}: Props) {
  const [especificacoes, setEspecificacoes] = useState<
    readonly EspecificacaoHerdada[]
  >([]);
  const [estado, setEstado] = useState<Estado>("carregando");
  const [guardados, setGuardados] = useState<readonly ValorGuardado[]>([]);
  const [pendente, setPendente] = useState<{
    readonly especificacaoId: string;
    readonly aviso: string;
  } | null>(null);
  const [avisoDosGuardados, setAvisoDosGuardados] = useState("");
  const mudandoDeCategoria =
    produtoId !== undefined &&
    typeof categoriaGravadaId === "string" &&
    categoriaGravadaId !== categoriaId;

  async function descartar(especificacaoId: string, confirmado: boolean) {
    if (produtoId === undefined) return;
    const resposta = await fetch(
      `/api/catalogo/produtos/${encodeURIComponent(produtoId)}/especificacoes/${encodeURIComponent(especificacaoId)}`,
      {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(confirmado ? { confirmado: true } : {}),
      },
    );
    const corpo = (await resposta.json().catch(() => ({}))) as {
      aviso?: string;
      naoUsadas?: ValorGuardado[];
    };
    if (resposta.status === 409) {
      setPendente({
        especificacaoId,
        aviso: corpo.aviso ?? "Este valor guardado será apagado.",
      });
      return;
    }
    setPendente(null);
    if (!resposta.ok) {
      setAvisoDosGuardados("Não foi possível descartar o valor guardado.");
      return;
    }
    setGuardados(corpo.naoUsadas ?? []);
    setAvisoDosGuardados("Valor guardado descartado.");
  }

  useEffect(() => {
    if (categoriaId === "") {
      setEspecificacoes([]);
      aoCarregar([]);
      setEstado("pronto");
      return;
    }
    let ativo = true;
    // Na edição, se a categoria não mudou, os valores gravados vêm junto; se
    // mudou, a categoria nova é quem diz o que pedir.
    const doProduto =
      produtoId !== undefined && categoriaGravadaId === categoriaId;
    const endereco = doProduto
      ? `/api/catalogo/produtos/${encodeURIComponent(produtoId)}/especificacoes`
      : `/api/catalogo/categorias/${encodeURIComponent(categoriaId)}/especificacoes`;
    setEstado("carregando");
    void fetch(endereco, { cache: "no-store" })
      .then(async (resposta) => {
        if (!resposta.ok) throw new Error();
        const dados = (await resposta.json()) as {
          especificacoes?: EspecificacaoHerdada[];
          campos?: {
            especificacao: EspecificacaoHerdada;
            valor: ValorDaEspecificacao;
          }[];
          naoUsadas?: ValorGuardado[];
        };
        if (!ativo) return;
        setGuardados(dados.naoUsadas ?? []);
        const lista =
          dados.campos?.map((campo) => campo.especificacao) ??
          dados.especificacoes ??
          [];
        setEspecificacoes(lista);
        aoCarregar(lista);
        if (dados.campos !== undefined) {
          aoMudar(
            Object.fromEntries(
              dados.campos.map((campo) => [
                campo.especificacao.id,
                campo.valor,
              ]),
            ),
          );
        }
        setEstado("pronto");
      })
      .catch(() => {
        if (ativo) setEstado("erro");
      });
    return () => {
      ativo = false;
    };
    // `aoMudar` e `aoCarregar` mudam de identidade a cada desenho do pai; a
    // leitura só deve acontecer quando a categoria ou o produto mudarem.
  }, [categoriaId, produtoId, categoriaGravadaId]);

  function mudar(id: string, valor: ValorDaEspecificacao) {
    aoMudar({ ...valores, [id]: valor });
  }

  if (estado === "carregando") {
    return (
      <p
        className="text-sm text-[var(--cor-tinta-suave)] sm:col-span-2"
        aria-busy="true"
      >
        Carregando as especificações da categoria…
      </p>
    );
  }
  if (estado === "erro") {
    return (
      <p className="text-sm sm:col-span-2" role="alert">
        Não foi possível carregar as especificações desta categoria. Salve o
        produto e preencha-as depois.
      </p>
    );
  }
  const aviso = mudandoDeCategoria ? (
    <p className="text-sm sm:col-span-2" role="note">
      Ao salvar, o produto muda de categoria. Os valores já preenchidos ficam
      guardados, e nada é apagado sem a sua confirmação.
    </p>
  ) : null;

  const secaoDosGuardados =
    guardados.length === 0 ? null : (
      <section
        className="rounded-[var(--raio-botao)] border border-dashed border-[var(--cor-borda)] p-4 sm:col-span-2"
        aria-labelledby="valores-guardados"
      >
        <h3 id="valores-guardados" className="text-sm font-semibold">
          Valores guardados, não usados na categoria atual
        </h3>
        <p role="status" className="text-xs text-[var(--cor-tinta-suave)]">
          {avisoDosGuardados}
        </p>
        <ul className="mt-2 grid gap-2">
          {guardados.map((guardado) => (
            <li key={guardado.especificacaoId} className="text-sm">
              <span>
                {guardado.nome}: {String(guardado.valor)}
                {guardado.unidade ? ` ${guardado.unidade}` : ""}
                {guardado.motivo === "removida"
                  ? " · especificação removida"
                  : guardado.categoriaNome
                    ? ` · de ${guardado.categoriaNome}`
                    : ""}
              </span>
              {pendente?.especificacaoId === guardado.especificacaoId ? (
                <span role="alertdialog" aria-label="Confirmar descarte">
                  <span className="ml-2">{pendente.aviso}</span>
                  <button
                    type="button"
                    className="sc-botao sc-botao--primaria ml-2"
                    onClick={() =>
                      void descartar(guardado.especificacaoId, true)
                    }
                  >
                    Confirmar descarte
                  </button>
                  <button
                    type="button"
                    className="sc-botao sc-botao--secundaria ml-2"
                    onClick={() => setPendente(null)}
                  >
                    Manter
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="sc-botao sc-botao--secundaria ml-2"
                  aria-label={`Descartar ${guardado.nome}`}
                  onClick={() =>
                    void descartar(guardado.especificacaoId, false)
                  }
                >
                  Descartar
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    );

  if (especificacoes.length === 0) {
    return aviso === null && secaoDosGuardados === null ? null : (
      <>
        {aviso}
        {secaoDosGuardados}
      </>
    );
  }

  return (
    <>
      {aviso}
      <fieldset className="grid gap-4 rounded-[var(--raio-botao)] border border-[var(--cor-borda)] p-4 sm:col-span-2 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold">
          Especificações da categoria
        </legend>
        {especificacoes.map((especificacao) => {
          const idDoCampo = `especificacao-${especificacao.id}`;
          const idDoErro = `${idDoCampo}-erro`;
          const erro = erros[especificacao.id];
          const valor = valores[especificacao.id];
          const rotulo = `${especificacao.nome}${especificacao.unidade ? ` (${especificacao.unidade})` : ""}${especificacao.obrigatoria ? " *" : ""}`;
          const comuns = {
            id: idDoCampo,
            className: "sc-campo__controle mt-2 w-full",
            required: especificacao.obrigatoria,
            "aria-invalid": erro === undefined ? undefined : true,
            "aria-describedby": erro === undefined ? undefined : idDoErro,
          } as const;
          return (
            <div key={especificacao.id}>
              <label htmlFor={idDoCampo} className="text-sm font-medium">
                {rotulo}
              </label>
              {especificacao.tipo === "lista" ? (
                <select
                  {...comuns}
                  value={vazio(valor) ? "" : String(valor)}
                  onChange={(evento) =>
                    mudar(especificacao.id, evento.target.value || null)
                  }
                >
                  <option value="">Escolha…</option>
                  {especificacao.opcoes.map((opcao) => (
                    <option key={opcao} value={opcao}>
                      {opcao}
                    </option>
                  ))}
                </select>
              ) : especificacao.tipo === "booleano" ? (
                <select
                  {...comuns}
                  value={vazio(valor) ? "" : valor === true ? "sim" : "nao"}
                  onChange={(evento) =>
                    mudar(
                      especificacao.id,
                      evento.target.value === ""
                        ? null
                        : evento.target.value === "sim",
                    )
                  }
                >
                  <option value="">Escolha…</option>
                  <option value="sim">Sim</option>
                  <option value="nao">Não</option>
                </select>
              ) : (
                <input
                  {...comuns}
                  type={especificacao.tipo === "numero" ? "number" : "text"}
                  inputMode={
                    especificacao.tipo === "numero" ? "decimal" : undefined
                  }
                  step={especificacao.tipo === "numero" ? "any" : undefined}
                  value={vazio(valor) ? "" : String(valor)}
                  onChange={(evento) => {
                    const bruto = evento.target.value;
                    mudar(
                      especificacao.id,
                      bruto === ""
                        ? null
                        : especificacao.tipo === "numero"
                          ? Number(bruto)
                          : bruto,
                    );
                  }}
                />
              )}
              {erro === undefined ? null : (
                <p id={idDoErro} className="mt-1 text-sm" role="alert">
                  {erro}
                </p>
              )}
            </div>
          );
        })}
      </fieldset>
      {secaoDosGuardados}
    </>
  );
}
