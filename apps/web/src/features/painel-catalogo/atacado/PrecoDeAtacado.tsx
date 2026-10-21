"use client";

import { useEffect, useId, useRef } from "react";

import { LIMITES_DO_ATACADO } from "@simpleclick/contracts";
import { Aviso, Sanfona, Seletor } from "@simpleclick/ui";

import { escreverDinheiro } from "../../../lib/dinheiro.ts";
import { EXPLICACOES, type Explicacao } from "../explicacoes.ts";
import {
  RotuloComInfo,
  TituloComInfo,
  descritoDoInfo,
} from "../RotuloComInfo.tsx";
import type {
  ProblemaDaFaixa,
  TipoDeDescontoDoAtacado,
} from "../../../lib/atacado.ts";

import {
  linhaEmBranco,
  linhaNova,
  mudarModalidade,
  pedidoMinimoNaTela,
  precoDaLinha,
  type AtacadoNaTela,
  type LinhaDeFaixa,
  type ModalidadeDoAtacado,
} from "./faixas-na-tela.ts";

interface Props {
  readonly valor: AtacadoNaTela;
  readonly aoMudar: (proximo: AtacadoNaTela) => void;
  /** O preço de varejo digitado acima; nulo enquanto não é um preço. */
  readonly varejoCentavos: number | null;
  /** O que impede salvar, na linha da tela (nulo = a seção toda). */
  readonly problemas: readonly ProblemaDaFaixa[];
}

const MODALIDADES: readonly {
  readonly valor: ModalidadeDoAtacado;
  readonly titulo: string;
  readonly detalhe: string;
}[] = [
  {
    valor: "UNICA",
    titulo: "Faixa única",
    detalhe: "Um desconto a partir de uma quantidade.",
  },
  {
    valor: "CRESCENTE",
    titulo: "Crescente",
    detalhe: "Quanto mais compra, mais desconto.",
  },
];

function unidades(quantidade: number): string {
  return `${quantidade.toLocaleString("pt-BR")} ${quantidade === 1 ? "unidade" : "unidades"}`;
}

/**
 * Seção "Preço de atacado" do cadastro do produto (card #55).
 *
 * Opcional e recolhida: quem só vende no varejo nem a abre. Painel é a
 * superfície mais sóbria do produto — nada anima aqui; o preço de cada faixa
 * só muda de texto enquanto o dono digita.
 */
export function PrecoDeAtacado({
  valor,
  aoMudar,
  varejoCentavos,
  problemas,
}: Props) {
  const base = useId();
  const caixa = useRef<HTMLDivElement>(null);
  const { modalidade, tipo, linhas } = valor;
  const pedidoMinimo = pedidoMinimoNaTela(valor);
  const preenchidas = linhas.filter((linha) => !linhaEmBranco(linha)).length;
  const daSecao = problemas.filter((problema) => problema.indice === null);
  const crescente = modalidade === "CRESCENTE";
  const podeAdicionar =
    crescente && linhas.length < LIMITES_DO_ATACADO.faixasPorProduto;

  // Problema numa seção fechada passaria despercebido: abre e leva o foco ao
  // primeiro campo com erro.
  useEffect(() => {
    if (problemas.length === 0 || caixa.current === null) return;
    caixa.current.querySelector("details")?.setAttribute("open", "");
    caixa.current
      .querySelector<HTMLElement>('[aria-invalid="true"], [data-erro-secao]')
      ?.focus();
  }, [problemas]);

  function mudarLinha(chave: number, mudanca: Partial<LinhaDeFaixa>) {
    aoMudar({
      ...valor,
      linhas: linhas.map((linha) =>
        linha.chave === chave ? { ...linha, ...mudanca } : linha,
      ),
    });
  }

  function removerLinha(chave: number) {
    const restantes = linhas.filter((linha) => linha.chave !== chave);
    aoMudar({
      ...valor,
      linhas: restantes.length === 0 ? [linhaNova()] : restantes,
    });
  }

  const resumo =
    pedidoMinimo === null
      ? "opcional"
      : `a partir de ${unidades(pedidoMinimo)}`;

  return (
    <div ref={caixa} className="sm:col-span-2">
      <Sanfona
        titulo={
          <>
            Preço de atacado{" "}
            <span className="text-sm font-normal text-[var(--cor-tinta-suave)]">
              ({resumo})
            </span>
          </>
        }
      >
        <div className="grid gap-5">
          <p className="text-sm text-[var(--cor-tinta-suave)]">
            Dê desconto por unidade para quem leva mais. O desconto vale sobre o
            preço de varejo de agora, inclusive o de promoção. Sem faixa, o
            produto vende só no varejo.
          </p>

          <fieldset>
            <legend>
              <TituloComInfo
                nome="Modalidade do atacado"
                info={EXPLICACOES.modalidadeDoAtacado}
              >
                Modalidade
              </TituloComInfo>
            </legend>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {MODALIDADES.map((opcao) => (
                <label
                  key={opcao.valor}
                  className={[
                    "flex cursor-pointer items-start gap-3 rounded-[var(--raio-botao)] border p-4 text-sm",
                    modalidade === opcao.valor
                      ? "border-[var(--cor-primaria)]"
                      : "border-[var(--cor-borda)]",
                  ].join(" ")}
                >
                  <input
                    className="mt-0.5 h-5 w-5"
                    type="radio"
                    name={`${base}-modalidade`}
                    value={opcao.valor}
                    checked={modalidade === opcao.valor}
                    onChange={() =>
                      aoMudar(mudarModalidade(valor, opcao.valor))
                    }
                  />
                  <span>
                    <span className="font-medium">{opcao.titulo}</span>
                    <span className="block text-xs text-[var(--cor-tinta-suave)]">
                      {opcao.detalhe}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <ul className="grid gap-4">
            {linhas.map((linha, indice) => {
              const numero = indice + 1;
              const nome = crescente ? `faixa ${numero}` : "faixa";
              const erros = problemas.filter(
                (problema) => problema.indice === indice,
              );
              const idDoErro = `${base}-erro-${linha.chave}`;
              const comErro = erros.length > 0;
              const preco = precoDaLinha(linha, tipo, varejoCentavos);
              // O "i" só na primeira faixa: repetir em cada linha só polui.
              const comInfo = indice === 0;
              const idQuantidade = `${base}-quantidade-${linha.chave}`;
              const idTipo = `${base}-tipo-${linha.chave}`;
              const idDesconto = `${base}-desconto-${linha.chave}`;
              const descritos = (id: string, info: Explicacao) =>
                [
                  comErro ? idDoErro : undefined,
                  comInfo ? descritoDoInfo(id, info) : undefined,
                ]
                  .filter(Boolean)
                  .join(" ") || undefined;
              return (
                <li
                  key={linha.chave}
                  className="rounded-[var(--raio-botao)] border border-[var(--cor-borda)] p-4"
                >
                  {crescente ? (
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--cor-tinta-suave)]">
                        Faixa {numero}
                      </p>
                      <button
                        className="sc-botao sc-botao--secundaria sc-botao--pequeno"
                        type="button"
                        aria-label={`Remover ${nome}`}
                        onClick={() => removerLinha(linha.chave)}
                      >
                        Remover
                      </button>
                    </div>
                  ) : null}
                  <div className="mt-2 grid gap-3 sm:grid-cols-3 sm:items-end">
                    <div className="grid content-start gap-1">
                      <RotuloComInfo
                        htmlFor={idQuantidade}
                        pequeno
                        nome="A partir de quantas unidades"
                        info={
                          comInfo ? EXPLICACOES.quantidadeDoAtacado : undefined
                        }
                      >
                        A partir de (unidades)
                      </RotuloComInfo>
                      <input
                        id={idQuantidade}
                        className="sc-campo__controle w-full"
                        inputMode="numeric"
                        aria-label={`A partir de quantas unidades, ${nome}`}
                        aria-invalid={comErro || undefined}
                        aria-describedby={descritos(
                          idQuantidade,
                          EXPLICACOES.quantidadeDoAtacado,
                        )}
                        placeholder="Ex.: 10"
                        value={linha.quantidade}
                        onChange={(evento) =>
                          mudarLinha(linha.chave, {
                            quantidade: evento.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="grid content-start gap-1">
                      <RotuloComInfo
                        htmlFor={idTipo}
                        pequeno
                        nome="Tipo de desconto"
                        info={
                          comInfo
                            ? EXPLICACOES.tipoDeDescontoDoAtacado
                            : undefined
                        }
                      >
                        Tipo de desconto
                      </RotuloComInfo>
                      <Seletor
                        id={idTipo}
                        className="w-full"
                        aria-label={`Tipo de desconto, ${nome}`}
                        aria-describedby={
                          comInfo
                            ? descritoDoInfo(
                                idTipo,
                                EXPLICACOES.tipoDeDescontoDoAtacado,
                              )
                            : undefined
                        }
                        value={tipo}
                        onChange={(escolhido) =>
                          aoMudar({
                            ...valor,
                            tipo: escolhido as TipoDeDescontoDoAtacado,
                          })
                        }
                      >
                        <option value="PERCENTUAL">Percentual (%)</option>
                        <option value="VALOR">Em reais (R$)</option>
                      </Seletor>
                    </div>
                    <div className="grid content-start gap-1">
                      <RotuloComInfo
                        htmlFor={idDesconto}
                        pequeno
                        nome="Desconto por unidade"
                        info={
                          comInfo ? EXPLICACOES.descontoDoAtacado : undefined
                        }
                      >
                        Desconto por unidade{" "}
                        {tipo === "PERCENTUAL" ? "(%)" : "(R$)"}
                      </RotuloComInfo>
                      <input
                        id={idDesconto}
                        className="sc-campo__controle w-full"
                        inputMode={
                          tipo === "PERCENTUAL" ? "numeric" : "decimal"
                        }
                        aria-label={`Desconto, ${nome}`}
                        aria-invalid={comErro || undefined}
                        aria-describedby={descritos(
                          idDesconto,
                          EXPLICACOES.descontoDoAtacado,
                        )}
                        placeholder={
                          tipo === "PERCENTUAL" ? "Ex.: 10" : "Ex.: 2,50"
                        }
                        value={linha.desconto}
                        onChange={(evento) =>
                          mudarLinha(linha.chave, {
                            desconto: evento.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                  <p className="mt-3 text-sm" data-preco-da-faixa={linha.chave}>
                    {preco.caso === "ok" ? (
                      <>
                        <span className="font-semibold">
                          {escreverDinheiro(preco.unitarioCentavos)} por unidade
                        </span>{" "}
                        <span className="text-[var(--cor-tinta-suave)]">
                          ({escreverDinheiro(preco.descontoPorUnidadeCentavos)}{" "}
                          a menos que no varejo)
                        </span>
                      </>
                    ) : (
                      <span className="text-[var(--cor-tinta-suave)]">
                        {preco.caso === "sem-varejo"
                          ? "Informe o preço do produto para ver o preço no atacado."
                          : preco.caso === "nao-cabe"
                            ? "Esse desconto zera o preço: use um desconto menor."
                            : "Preencha a quantidade e o desconto para ver o preço por unidade."}
                      </span>
                    )}
                  </p>
                  {comErro ? (
                    <ul
                      id={idDoErro}
                      className="sc-campo__erro mt-2 grid gap-1 text-sm"
                    >
                      {erros.map((erro) => (
                        <li key={erro.mensagem}>{erro.mensagem}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {crescente ? (
            <p className="text-xs text-[var(--cor-tinta-suave)]">
              O tipo de desconto é o mesmo em todas as faixas, e quem leva mais
              precisa ganhar um desconto maior.
            </p>
          ) : null}

          {daSecao.length > 0 ? (
            <div tabIndex={-1} data-erro-secao="">
              <Aviso tom="erro">
                {daSecao.map((problema) => (
                  <p key={problema.mensagem}>{problema.mensagem}</p>
                ))}
              </Aviso>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            {podeAdicionar ? (
              <button
                className="sc-botao sc-botao--secundaria"
                type="button"
                onClick={() =>
                  aoMudar({ ...valor, linhas: [...linhas, linhaNova()] })
                }
              >
                Adicionar faixa
              </button>
            ) : null}
            {preenchidas > 0 ? (
              <button
                className="sc-botao sc-botao--discreta"
                type="button"
                onClick={() =>
                  aoMudar({ modalidade: "UNICA", tipo, linhas: [linhaNova()] })
                }
              >
                Vender só no varejo
              </button>
            ) : null}
          </div>

          <Aviso tom="info" aoVivo={false}>
            {pedidoMinimo === null
              ? "Sem faixa preenchida, o produto vende só no varejo."
              : `Pedido mínimo do atacado: ${unidades(pedidoMinimo)}. Abaixo disso, o cliente paga o preço de varejo.`}
          </Aviso>
        </div>
      </Sanfona>
    </div>
  );
}
