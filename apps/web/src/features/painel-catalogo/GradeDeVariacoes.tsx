"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";

import { centavosDoTexto, escreverDinheiro } from "../../lib/dinheiro.ts";
import { Seletor } from "@simpleclick/ui";

import { EXPLICACOES } from "./explicacoes.ts";
import {
  CampoComRotulo as Linha,
  RotuloComInfo,
  TituloComInfo,
  descritoDoInfo,
} from "./RotuloComInfo.tsx";

interface Opcao {
  readonly id: string;
  readonly nome: string;
  readonly disponivel: boolean;
}

interface Grupo {
  readonly id: string;
  readonly nome: string;
  readonly tipo: string;
  readonly eixoDeVariacao: boolean;
  readonly opcoes: readonly Opcao[];
}

interface Variacao {
  readonly id: string;
  readonly nome: string;
  readonly sku: string | null;
  readonly precoCentavos: number | null;
  readonly estoque: number | null;
  readonly padrao: boolean;
  readonly disponivel: boolean;
  readonly combinacoes: readonly { grupoId: string; opcaoId: string }[];
}

interface Props {
  readonly produtoId: string;
}

const VARIACAO_VAZIA = {
  nome: "",
  sku: "",
  codigoDeBarras: "",
  preco: "",
  estoque: "",
  minimo: "",
  padrao: false,
  disponivel: true,
  escolhas: {} as Record<string, string>,
};

function dinheiro(centavos: number | null) {
  if (centavos === null) return "Sem preço";
  return escreverDinheiro(centavos);
}

export function GradeDeVariacoes({ produtoId }: Props) {
  const base = useId();
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [variacoes, setVariacoes] = useState<Variacao[]>([]);
  const [formulario, setFormulario] = useState(VARIACAO_VAZIA);
  const [mensagem, setMensagem] = useState("Carregando grade…");
  const [salvando, setSalvando] = useState(false);
  // O ramo decide (AC-337). Até a resposta chegar o campo de quantidade fica
  // fora: surgir depois incomoda menos do que aparecer e sumir diante do dono.
  const [controlaEstoque, setControlaEstoque] = useState(false);

  const eixos = useMemo(
    () => grupos.filter((grupo) => grupo.eixoDeVariacao),
    [grupos],
  );

  async function carregar() {
    try {
      const [respostaDeGrupos, respostaDeVariacoes] = await Promise.all([
        fetch(`/api/catalogo/produtos/${produtoId}/opcoes`, {
          cache: "no-store",
        }),
        fetch(`/api/catalogo/produtos/${produtoId}/variacoes`, {
          cache: "no-store",
        }),
      ]);
      if (!respostaDeGrupos.ok || !respostaDeVariacoes.ok) throw new Error();
      const dadosDosGrupos = (await respostaDeGrupos.json()) as {
        grupos: Grupo[];
      };
      const dadosDasVariacoes = (await respostaDeVariacoes.json()) as {
        variacoes: Variacao[];
        controlaEstoque?: boolean;
      };
      setGrupos(dadosDosGrupos.grupos);
      setVariacoes(dadosDasVariacoes.variacoes);
      setControlaEstoque(dadosDasVariacoes.controlaEstoque === true);
      setMensagem(
        `${dadosDasVariacoes.variacoes.length} variação(ões) cadastrada(s).`,
      );
    } catch {
      setMensagem("Não foi possível carregar a grade.");
    }
  }

  useEffect(() => {
    void carregar();
  }, [produtoId]);

  function escolhaDaVariacao(variacao: Variacao, grupoId: string): string {
    return (
      variacao.combinacoes.find((combinacao) => combinacao.grupoId === grupoId)
        ?.opcaoId ?? ""
    );
  }

  function nomeDaCombinacao(variacao: Variacao): string {
    const nomes = eixos.flatMap((grupo) => {
      const opcaoId = escolhaDaVariacao(variacao, grupo.id);
      return grupo.opcoes
        .filter((opcao) => opcao.id === opcaoId)
        .map((opcao) => `${grupo.nome}: ${opcao.nome}`);
    });
    return nomes.length === 0 ? "Sem eixo" : nomes.join(" · ");
  }

  async function criarVariacao(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const preco = formulario.preco.trim();
    const estoque = formulario.estoque.trim();
    // Centavos lidos como texto, sem ponto flutuante no caminho (AC-311):
    // "19,99" vira 1999, e não 1998,9999… arredondado na sorte.
    const precoCentavos = preco === "" ? null : centavosDoTexto(preco);
    if (preco !== "" && (precoCentavos === null || precoCentavos < 0)) {
      setMensagem("Preço inválido. Escreva em reais, como 89,90.");
      return;
    }
    // Sem controle de estoque no ramo, nenhuma contagem vai: a variação nasce
    // com estoque nulo, que é "não controla", e o dono usa disponível/esgotado.
    const unidades =
      !controlaEstoque || estoque === "" ? null : Number(estoque);
    const minimo =
      !controlaEstoque || formulario.minimo.trim() === ""
        ? null
        : Number(formulario.minimo);
    if (
      [unidades, minimo].some(
        (valor) => valor !== null && (!Number.isInteger(valor) || valor < 0),
      )
    ) {
      setMensagem("Estoque inválido. Use um número inteiro, ou deixe vazio.");
      return;
    }
    setSalvando(true);
    const combinacoes = eixos.flatMap((grupo) => {
      const opcaoId = formulario.escolhas[grupo.id];
      return opcaoId === undefined || opcaoId === ""
        ? []
        : [{ grupoId: grupo.id, opcaoId }];
    });
    try {
      const resposta = await fetch(
        `/api/catalogo/produtos/${produtoId}/variacoes`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            nome: formulario.nome,
            sku: formulario.sku.trim() || null,
            codigoDeBarras: formulario.codigoDeBarras.trim() || null,
            precoCentavos,
            estoque: unidades,
            estoqueMinimo: minimo,
            pesoGramas: null,
            padrao: formulario.padrao,
            disponivel: formulario.disponivel,
            combinacoes,
          }),
        },
      );
      if (resposta.status === 409) {
        // O código de estoque é da variação, e não se repete na loja (AC-316).
        setMensagem("Esse SKU já está em outra variação da loja. Use outro.");
        return;
      }
      if (!resposta.ok) throw new Error();
      setFormulario(VARIACAO_VAZIA);
      await carregar();
    } catch {
      setMensagem("Não foi possível salvar. Revise SKU e eixos escolhidos.");
    } finally {
      setSalvando(false);
    }
  }

  async function alternarDisponibilidade(variacao: Variacao) {
    const resposta = await fetch(
      `/api/catalogo/produtos/${produtoId}/variacoes/${variacao.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ disponivel: !variacao.disponivel }),
      },
    );
    if (resposta.ok) await carregar();
    else setMensagem("Não foi possível alterar a disponibilidade.");
  }

  async function remover(variacao: Variacao) {
    if (!window.confirm(`Remover a variação ${variacao.nome}?`)) return;
    const resposta = await fetch(
      `/api/catalogo/produtos/${produtoId}/variacoes/${variacao.id}`,
      { method: "DELETE" },
    );
    if (resposta.ok) await carregar();
    else setMensagem("Não foi possível remover a variação.");
  }

  return (
    <section
      className="mt-8 max-w-5xl rounded-[var(--raio-cartao)] border border-[var(--cor-borda)] bg-[var(--cor-superficie-alta)] shadow-[var(--sombra-larga)] p-6 sm:p-8"
      aria-labelledby="grade-de-variacoes"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="grade-de-variacoes" className="text-2xl font-semibold">
            Grade de variações
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--cor-tinta-suave)]">
            Cada linha pode ter preço, SKU e estoque próprios. A combinação dos
            eixos identifica a unidade que o cliente compra.
          </p>
        </div>
        <p role="status" className="text-sm text-[var(--cor-tinta-suave)]">
          {mensagem}
        </p>
      </div>

      {eixos.length === 0 ? (
        <p className="mt-6 rounded-[var(--raio-botao)] bg-[var(--cor-papel)] p-4 text-sm leading-6">
          Crie um grupo marcado como eixo de variação antes de cadastrar a
          grade.{" "}
          <Link href={`/painel/produtos/${produtoId}/opcoes`}>
            Abrir escolhas e adicionais
          </Link>
          .
        </p>
      ) : null}

      {variacoes.length > 0 ? (
        <TituloComInfo
          className="mt-6"
          nome="Esgotar e remover variações"
          info={EXPLICACOES.esgotarVariacao}
        >
          Variações cadastradas
        </TituloComInfo>
      ) : null}
      <ul className="mt-2 space-y-2">
        {variacoes.map((variacao) => (
          <li
            key={variacao.id}
            className="flex flex-wrap items-center gap-3 rounded-[var(--raio-botao)] border border-[var(--cor-borda)] p-4"
          >
            <span className="min-w-48 flex-1">
              <strong>{variacao.nome}</strong>
              <span className="mt-1 block text-sm text-[var(--cor-tinta-suave)]">
                {nomeDaCombinacao(variacao)} ·{" "}
                {dinheiro(variacao.precoCentavos)}
                {variacao.sku ? ` · SKU ${variacao.sku}` : ""}
                {variacao.estoque === null
                  ? controlaEstoque
                    ? " · estoque não controlado"
                    : ""
                  : ` · ${variacao.estoque} un.`}
                {variacao.padrao ? " · já vem escolhida" : ""}
              </span>
            </span>
            <span className="text-xs font-semibold">
              {variacao.disponivel ? "Disponível" : "Esgotada"}
            </span>
            <button
              className="sc-botao sc-botao--secundaria text-xs"
              type="button"
              onClick={() => void alternarDisponibilidade(variacao)}
            >
              {variacao.disponivel ? "Esgotar" : "Reativar"}
            </button>
            <button
              className="sc-botao sc-botao--secundaria text-xs"
              type="button"
              onClick={() => void remover(variacao)}
            >
              Remover
            </button>
          </li>
        ))}
      </ul>

      {eixos.length > 0 ? (
        <form
          onSubmit={(evento) => void criarVariacao(evento)}
          className="mt-6 grid gap-5 border-t border-[var(--cor-borda)] pt-6 sm:grid-cols-2"
        >
          <h3 className="text-xl font-semibold sm:col-span-2">Nova variação</h3>
          <Linha
            id={`${base}-nome`}
            rotulo="Nome interno"
            info={EXPLICACOES.nomeDaVariacao}
          >
            <input
              id={`${base}-nome`}
              className="sc-campo__controle w-full"
              value={formulario.nome}
              aria-describedby={descritoDoInfo(
                `${base}-nome`,
                EXPLICACOES.nomeDaVariacao,
              )}
              onChange={(evento) =>
                setFormulario((anterior) => ({
                  ...anterior,
                  nome: evento.target.value,
                }))
              }
              placeholder="Ex.: Camiseta azul M"
              maxLength={160}
              required
            />
          </Linha>
          {eixos.map((grupo) => (
            <Linha
              key={grupo.id}
              id={`${base}-eixo-${grupo.id}`}
              rotulo={grupo.nome}
            >
              <Seletor
                id={`${base}-eixo-${grupo.id}`}
                className="w-full"
                value={formulario.escolhas[grupo.id] ?? ""}
                onChange={(valor) =>
                  setFormulario((anterior) => ({
                    ...anterior,
                    escolhas: {
                      ...anterior.escolhas,
                      [grupo.id]: valor,
                    },
                  }))
                }
              >
                <option value="">Selecione…</option>
                {grupo.opcoes.map((opcao) => (
                  <option
                    key={opcao.id}
                    value={opcao.id}
                    disabled={!opcao.disponivel}
                  >
                    {opcao.nome}
                    {opcao.disponivel ? "" : " (esgotada)"}
                  </option>
                ))}
              </Seletor>
            </Linha>
          ))}
          <Linha
            id={`${base}-preco`}
            rotulo="Preço desta variação (R$)"
            info={EXPLICACOES.precoDaVariacao}
          >
            <input
              id={`${base}-preco`}
              className="sc-campo__controle w-full"
              inputMode="decimal"
              value={formulario.preco}
              aria-describedby={descritoDoInfo(
                `${base}-preco`,
                EXPLICACOES.precoDaVariacao,
              )}
              onChange={(evento) =>
                setFormulario((anterior) => ({
                  ...anterior,
                  preco: evento.target.value,
                }))
              }
              placeholder="Ex.: 89,90"
              required
            />
          </Linha>
          <Linha
            id={`${base}-sku`}
            rotulo="SKU (opcional)"
            info={EXPLICACOES.sku}
          >
            <input
              id={`${base}-sku`}
              className="sc-campo__controle w-full"
              value={formulario.sku}
              maxLength={100}
              aria-describedby={descritoDoInfo(`${base}-sku`, EXPLICACOES.sku)}
              onChange={(evento) =>
                setFormulario((anterior) => ({
                  ...anterior,
                  sku: evento.target.value,
                }))
              }
              placeholder="Ex.: CAM-AZ-M"
            />
          </Linha>
          <Linha
            id={`${base}-barras`}
            rotulo="Código de barras (opcional)"
            info={EXPLICACOES.codigoDeBarras}
          >
            <input
              id={`${base}-barras`}
              className="sc-campo__controle w-full"
              inputMode="numeric"
              value={formulario.codigoDeBarras}
              maxLength={100}
              aria-describedby={descritoDoInfo(
                `${base}-barras`,
                EXPLICACOES.codigoDeBarras,
              )}
              onChange={(evento) =>
                setFormulario((anterior) => ({
                  ...anterior,
                  codigoDeBarras: evento.target.value,
                }))
              }
            />
          </Linha>
          {controlaEstoque ? (
            <>
              <Linha
                id={`${base}-estoque`}
                rotulo="Estoque (unidades)"
                info={EXPLICACOES.estoqueDaVariacao}
              >
                <input
                  id={`${base}-estoque`}
                  className="sc-campo__controle w-full"
                  type="number"
                  inputMode="numeric"
                  name="estoque"
                  min={0}
                  value={formulario.estoque}
                  aria-describedby={descritoDoInfo(
                    `${base}-estoque`,
                    EXPLICACOES.estoqueDaVariacao,
                  )}
                  onChange={(evento) =>
                    setFormulario((anterior) => ({
                      ...anterior,
                      estoque: evento.target.value,
                    }))
                  }
                  placeholder="Vazio = não controla"
                />
              </Linha>
              <Linha
                id={`${base}-minimo`}
                rotulo="Alerta de estoque mínimo (unidades)"
                info={EXPLICACOES.alertaDeEstoque}
              >
                <input
                  id={`${base}-minimo`}
                  className="sc-campo__controle w-full"
                  type="number"
                  inputMode="numeric"
                  name="minimo"
                  min={0}
                  value={formulario.minimo}
                  aria-describedby={descritoDoInfo(
                    `${base}-minimo`,
                    EXPLICACOES.alertaDeEstoque,
                  )}
                  onChange={(evento) =>
                    setFormulario((anterior) => ({
                      ...anterior,
                      minimo: evento.target.value,
                    }))
                  }
                  placeholder="Vazio = sem aviso"
                />
              </Linha>
            </>
          ) : null}
          <span className="flex items-center gap-3 text-sm sm:col-span-2">
            <input
              id={`${base}-padrao`}
              className="h-5 w-5"
              type="checkbox"
              checked={formulario.padrao}
              aria-describedby={descritoDoInfo(
                `${base}-padrao`,
                EXPLICACOES.variacaoPadrao,
              )}
              onChange={(evento) =>
                setFormulario((anterior) => ({
                  ...anterior,
                  padrao: evento.target.checked,
                }))
              }
            />
            <RotuloComInfo
              htmlFor={`${base}-padrao`}
              nome="Já vem escolhida"
              info={EXPLICACOES.variacaoPadrao}
            >
              Já vem escolhida (padrão)
            </RotuloComInfo>
          </span>
          <button
            className="sc-botao sc-botao--primaria w-fit"
            type="submit"
            disabled={salvando}
          >
            Criar variação
          </button>
        </form>
      ) : null}
    </section>
  );
}
