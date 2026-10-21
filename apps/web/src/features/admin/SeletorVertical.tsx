"use client";

/**
 * A troca do tipo de negócio na ficha da loja (AC-214).
 *
 * É a única tela que troca o ramo de uma loja — o painel do dono nem oferece
 * o campo (AC-323). A troca muda o vocabulário e a disposição de TODAS as
 * telas da loja, então ela é feita em dois passos: escolher e confirmar. A
 * confirmação diz o que muda e o que NÃO muda, com as palavras que a pessoa
 * vai precisar para explicar a troca ao lojista.
 *
 * Sem `window.confirm`: a confirmação é parte da tela, lida por leitor de
 * tela e testável sem navegador.
 */

import {
  esquemaDaFichaDaLoja,
  esquemaDosTiposDeNegocio,
  type FichaDaLojaNoContrato,
  type TipoDeNegocioNoContrato,
} from "@simpleclick/contracts";
import {
  Aviso,
  Botao,
  Campo,
  Carregando,
  descritoresDoCampo,
  Erro,
  Seletor,
  Sucesso,
} from "@simpleclick/ui";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { INFO_DO_NOVO_TIPO } from "./explicacoes.ts";

type EstadoDosTipos =
  | { readonly estado: "carregando" }
  | { readonly estado: "erro" }
  | {
      readonly estado: "pronto";
      readonly tipos: readonly TipoDeNegocioNoContrato[];
    };

type EstadoDaTroca =
  | { readonly estado: "escolhendo" }
  | { readonly estado: "confirmando"; readonly para: TipoDeNegocioNoContrato }
  | { readonly estado: "trocando"; readonly para: TipoDeNegocioNoContrato }
  | { readonly estado: "trocado"; readonly para: TipoDeNegocioNoContrato }
  | { readonly estado: "falhou"; readonly mensagem: string };

/** O endereço da troca no próprio site. */
export function enderecoDaTroca(lojaId: string): string {
  return `/api/admin/lojas/${encodeURIComponent(lojaId)}/tipo-de-negocio`;
}

/** O que a troca faz, na língua de quem vai explicar ao lojista. */
export function consequenciasDaTroca(
  de: TipoDeNegocioNoContrato,
  para: TipoDeNegocioNoContrato,
): string[] {
  const consequencias = [
    `Todas as telas da loja passam a usar o vocabulário e a disposição de ${para.nome}.`,
    "Nenhum produto, categoria, grupo de escolha ou preço é apagado ou alterado.",
  ];
  if (para.controlaEstoque && !de.controlaEstoque) {
    consequencias.push(
      "O controle de estoque passa a valer: o dono informa o saldo de cada variação no painel.",
    );
  }
  if (!para.controlaEstoque && de.controlaEstoque) {
    consequencias.push(
      "O controle de estoque deixa de ser pedido: a venda passa a ser por disponível ou esgotado. Os saldos já informados ficam guardados.",
    );
  }
  consequencias.push("A troca fica registrada no histórico com o seu nome.");
  return consequencias;
}

export function SeletorVertical({
  ficha,
  aoTrocar,
}: {
  readonly ficha: FichaDaLojaNoContrato;
  readonly aoTrocar: (ficha: FichaDaLojaNoContrato) => void;
}) {
  const [tipos, setTipos] = useState<EstadoDosTipos>({ estado: "carregando" });
  const [escolhido, setEscolhido] = useState(ficha.tipoDeNegocio.codigo);
  const [troca, setTroca] = useState<EstadoDaTroca>({ estado: "escolhendo" });

  const carregarTipos = useCallback(async () => {
    setTipos({ estado: "carregando" });
    try {
      const resposta = await fetch("/api/admin/tipos-de-negocio", {
        cache: "no-store",
      });
      if (!resposta.ok) throw new Error(String(resposta.status));
      const lidos = esquemaDosTiposDeNegocio.parse(await resposta.json());
      setTipos({ estado: "pronto", tipos: lidos.tipos });
    } catch {
      setTipos({ estado: "erro" });
    }
  }, []);

  useEffect(() => {
    void carregarTipos();
  }, [carregarTipos]);

  function aoEscolher(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (tipos.estado !== "pronto") return;
    const para = tipos.tipos.find((tipo) => tipo.codigo === escolhido);
    if (para === undefined || para.codigo === ficha.tipoDeNegocio.codigo) {
      return;
    }
    setTroca({ estado: "confirmando", para });
  }

  async function aoConfirmar(para: TipoDeNegocioNoContrato) {
    setTroca({ estado: "trocando", para });
    try {
      const resposta = await fetch(enderecoDaTroca(ficha.id), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tipoDeNegocio: para.codigo }),
      });
      if (!resposta.ok) {
        setTroca({
          estado: "falhou",
          mensagem:
            resposta.status === 401 || resposta.status === 403
              ? "Sua sessão não tem acesso à administração. Entre de novo."
              : "A troca não foi feita. A loja continua com o tipo de antes; tente de novo.",
        });
        return;
      }
      const nova = esquemaDaFichaDaLoja.parse(await resposta.json());
      setTroca({ estado: "trocado", para });
      aoTrocar(nova);
    } catch {
      setTroca({
        estado: "falhou",
        mensagem:
          "A troca não foi feita. A loja continua com o tipo de antes; tente de novo.",
      });
    }
  }

  if (tipos.estado === "carregando") {
    return <Carregando rotulo="Carregando os tipos de negócio…" />;
  }
  if (tipos.estado === "erro") {
    return (
      <Erro
        titulo="Os tipos de negócio não carregaram"
        mensagem="Sem eles não dá para trocar o ramo da loja."
        acao={
          <Botao variante="secundaria" onClick={() => void carregarTipos()}>
            Tentar de novo
          </Botao>
        }
      />
    );
  }

  return (
    <div className="grid gap-4">
      <p>
        Tipo atual: <strong>{ficha.tipoDeNegocio.nome}</strong>
        {ficha.tipoDeNegocio.controlaEstoque
          ? " · controla estoque"
          : " · vende por disponível ou esgotado"}
      </p>

      {troca.estado === "trocado" && (
        <Sucesso
          titulo={`Tipo de negócio trocado para ${troca.para.nome}`}
          descricao="As telas da loja já usam o vocabulário do ramo novo."
        />
      )}
      {troca.estado === "falhou" && (
        <Erro titulo="O tipo de negócio não mudou" mensagem={troca.mensagem} />
      )}

      {(troca.estado === "confirmando" || troca.estado === "trocando") && (
        <Aviso
          tom="atencao"
          titulo={`Trocar ${ficha.nome} para ${troca.para.nome}?`}
        >
          <ul className="list-disc space-y-1 pl-5">
            {consequenciasDaTroca(ficha.tipoDeNegocio, troca.para).map(
              (consequencia) => (
                <li key={consequencia}>{consequencia}</li>
              ),
            )}
          </ul>
          <div className="mt-4 flex flex-wrap gap-3">
            <Botao
              carregando={troca.estado === "trocando"}
              rotuloDeEspera="Trocando…"
              onClick={() => void aoConfirmar(troca.para)}
            >
              Confirmar a troca
            </Botao>
            <Botao
              variante="secundaria"
              desabilitado={troca.estado === "trocando"}
              onClick={() => setTroca({ estado: "escolhendo" })}
            >
              Cancelar
            </Botao>
          </div>
        </Aviso>
      )}

      <form
        onSubmit={aoEscolher}
        aria-label="Troca do tipo de negócio"
        className="flex flex-wrap items-end gap-4"
      >
        <Campo
          id="ficha-tipo-de-negocio"
          rotulo="Novo tipo de negócio"
          info={INFO_DO_NOVO_TIPO}
          className="min-w-64 flex-1"
          controle={
            <Seletor
              id="ficha-tipo-de-negocio"
              name="tipoDeNegocio"
              value={escolhido}
              aria-describedby={descritoresDoCampo("ficha-tipo-de-negocio", {
                info: true,
              }).join(" ")}
              onChange={(valor) => {
                setEscolhido(valor);
                setTroca({ estado: "escolhendo" });
              }}
            >
              {tipos.tipos.map((tipo) => (
                <option key={tipo.codigo} value={tipo.codigo}>
                  {tipo.nome}
                </option>
              ))}
            </Seletor>
          }
        />
        <Botao
          type="submit"
          variante="secundaria"
          desabilitado={escolhido === ficha.tipoDeNegocio.codigo}
        >
          Trocar tipo de negócio
        </Botao>
      </form>
    </div>
  );
}
