"use client";

/**
 * As funcionalidades liberadas de uma loja, na administração (US-204 —
 * AC-212, AC-213).
 *
 * `FuncionalidadesDaLoja` busca e guarda o estado; `FuncionalidadesNaTela` só
 * desenha os quatro estados (P-011). Cada funcionalidade que algum ponto do
 * sistema consulta tem o seu ato — desligar ou religar —, em DOIS PASSOS e
 * com motivo obrigatório, que vai para o histórico. As outras aparecem como
 * "sempre ligada nesta versão".
 *
 * Na versão 1 tudo é gratuito e sem limite (AC-213): a tela diz isso e não
 * fala de preço, plano nem pagamento em lugar nenhum.
 *
 * Painel da administração: nada anima. A resposta de cada ato é a lista nova
 * — quem decide é a API.
 */

import {
  esquemaDaAlteracaoDeFuncionalidade,
  esquemaDasFuncionalidadesDaLoja,
  type FuncionalidadeNaAdministracaoNoContrato,
  type FuncionalidadesDaLojaNoContrato,
} from "@simpleclick/contracts";
import {
  Botao,
  Campo,
  Carregando,
  Cartao,
  Erro,
  Selo,
  Sucesso,
  Vazio,
} from "@simpleclick/ui";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { momentoNaTela } from "./trilha-na-tela.ts";

export type EstadoDasFuncionalidades =
  | { readonly fase: "carregando" }
  | { readonly fase: "nao-encontrada" }
  | { readonly fase: "erro"; readonly mensagem: string }
  | {
      readonly fase: "pronta";
      readonly dados: FuncionalidadesDaLojaNoContrato;
    };

export const MENSAGEM_DE_SESSAO_DAS_FUNCIONALIDADES =
  "Sua sessão não tem acesso à administração. Entre de novo.";
export const MENSAGEM_DE_FALHA_DAS_FUNCIONALIDADES =
  "Não foi possível carregar as funcionalidades agora. Tente de novo em instantes.";

/** Onde a lista e cada ato moram no próprio site. */
export function enderecoDasFuncionalidades(
  lojaId: string,
  chave?: string,
): string {
  const base = `/api/admin/lojas/${encodeURIComponent(lojaId)}/funcionalidades`;
  return chave === undefined ? base : `${base}/${encodeURIComponent(chave)}`;
}

/** A mensagem que a API mandou, quando ela mandou uma para a pessoa ler. */
function mensagemDaRecusa(corpo: unknown): string | null {
  if (typeof corpo !== "object" || corpo === null) return null;
  const { mensagem } = corpo as { mensagem?: unknown };
  return typeof mensagem === "string" ? mensagem : null;
}

// ---------------------------------------------------------------------------
// Uma funcionalidade
// ---------------------------------------------------------------------------

type Passo =
  | { readonly fase: "parado" }
  | { readonly fase: "confirmando" }
  | { readonly fase: "enviando" }
  | { readonly fase: "falhou"; readonly mensagem: string };

export function CartaoDaFuncionalidade({
  lojaId,
  funcionalidade,
  aoAlterar,
}: {
  readonly lojaId: string;
  readonly funcionalidade: FuncionalidadeNaAdministracaoNoContrato;
  readonly aoAlterar: (dados: FuncionalidadesDaLojaNoContrato) => void;
}) {
  const [passo, setPasso] = useState<Passo>({ fase: "parado" });
  const [motivo, setMotivo] = useState("");
  const [erroDoMotivo, setErroDoMotivo] = useState<string | undefined>();
  const { chave, rotulo, ligada, excecao } = funcionalidade;
  const ato = ligada ? "Desligar" : "Religar";

  async function aoConfirmar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const entrada = esquemaDaAlteracaoDeFuncionalidade.safeParse({
      ligada: !ligada,
      motivo,
    });
    if (!entrada.success) {
      setErroDoMotivo(
        entrada.error.issues[0]?.message ?? "Informe o motivo da alteração.",
      );
      return;
    }
    setErroDoMotivo(undefined);
    setPasso({ fase: "enviando" });
    try {
      const resposta = await fetch(enderecoDasFuncionalidades(lojaId, chave), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(entrada.data),
      });
      const corpo: unknown = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        setPasso({
          fase: "falhou",
          mensagem:
            mensagemDaRecusa(corpo) ??
            "Nada mudou. A funcionalidade continua como estava; tente de novo.",
        });
        return;
      }
      setPasso({ fase: "parado" });
      setMotivo("");
      aoAlterar(esquemaDasFuncionalidadesDaLoja.parse(corpo));
    } catch {
      setPasso({
        fase: "falhou",
        mensagem:
          "Nada mudou. A funcionalidade continua como estava; tente de novo.",
      });
    }
  }

  return (
    <li>
      <Cartao
        titulo={rotulo}
        nivelDoTitulo={3}
        acoes={
          <Selo tom={ligada ? "sucesso" : "erro"}>
            {ligada ? "Ligada" : "Desligada para esta loja"}
          </Selo>
        }
      >
        <p className="mt-1 text-sm">{funcionalidade.descricao}</p>
        <p className="mt-1 text-sm">Sem custo e sem limite de uso.</p>
        {excecao !== null && (
          <p className="mt-2 text-sm">
            Desligada em {momentoNaTela(excecao.definidaEm)}
            {excecao.definidaPor !== null && ` por ${excecao.definidaPor.nome}`}
            . Motivo: {excecao.motivo}
          </p>
        )}

        {!funcionalidade.temEfeito ? (
          <p className="mt-3 text-sm italic">Sempre ligada nesta versão.</p>
        ) : passo.fase === "parado" ? (
          <div className="mt-3">
            <Botao
              variante="secundaria"
              onClick={() => setPasso({ fase: "confirmando" })}
            >
              {`${ato} ${rotulo.toLowerCase()}`}
            </Botao>
          </div>
        ) : (
          <form className="mt-4 grid gap-3" onSubmit={aoConfirmar} noValidate>
            <p className="text-sm">
              {ligada
                ? "A área some do menu do dono e as rotas dela passam a responder indisponível, mesmo acessadas direto. Nada é apagado: religar devolve tudo como estava."
                : "A área volta ao menu do dono e as rotas dela voltam a responder."}
            </p>
            <Campo
              id={`motivo-${chave}`}
              rotulo="Motivo"
              dica="Fica no histórico da loja, com o seu nome."
              obrigatorio
              value={motivo}
              erro={erroDoMotivo}
              onChange={(evento) => setMotivo(evento.target.value)}
            />
            {passo.fase === "falhou" && (
              <Erro
                titulo="A alteração não foi feita"
                mensagem={passo.mensagem}
              />
            )}
            <div className="flex flex-wrap gap-2">
              <Botao type="submit" carregando={passo.fase === "enviando"}>
                {`Confirmar: ${ato.toLowerCase()}`}
              </Botao>
              <Botao
                variante="discreta"
                onClick={() => {
                  setPasso({ fase: "parado" });
                  setErroDoMotivo(undefined);
                }}
              >
                Cancelar
              </Botao>
            </div>
          </form>
        )}
      </Cartao>
    </li>
  );
}

// ---------------------------------------------------------------------------
// A tela
// ---------------------------------------------------------------------------

export interface FuncionalidadesNaTelaProps {
  readonly lojaId: string;
  readonly estado: EstadoDasFuncionalidades;
  readonly aoTentarDeNovo: () => void;
  readonly aoAlterar: (dados: FuncionalidadesDaLojaNoContrato) => void;
  /** A última alteração aceita, para o aviso de sucesso. */
  readonly ultimaAlteracao?: string | undefined;
}

/** Só desenha. As chamadas de rede moram no cartão e no componente de cima. */
export function FuncionalidadesNaTela(props: FuncionalidadesNaTelaProps) {
  const { estado, lojaId } = props;

  if (estado.fase === "carregando") {
    return (
      <Carregando rotulo="Carregando as funcionalidades…" className="mt-8" />
    );
  }
  if (estado.fase === "nao-encontrada") {
    return (
      <Vazio
        titulo="Loja não encontrada"
        descricao="O endereço não corresponde a nenhuma loja cadastrada."
        className="mt-8"
        acao={
          <Link className="sc-botao sc-botao--primaria" href="/admin/lojas">
            Voltar para as lojas
          </Link>
        }
      />
    );
  }
  if (estado.fase === "erro") {
    return (
      <Erro
        titulo="As funcionalidades não carregaram"
        mensagem={estado.mensagem}
        className="mt-8"
        acao={
          <Botao variante="secundaria" onClick={props.aoTentarDeNovo}>
            Tentar de novo
          </Botao>
        }
      />
    );
  }

  const { dados } = estado;
  return (
    <section aria-labelledby="funcionalidades-lista" className="mt-8">
      <h2
        id="funcionalidades-lista"
        className="text-2xl font-semibold tracking-[-0.02em]"
      >
        {dados.loja.nome}
      </h2>
      <p className="mt-2 max-w-prose">
        Nesta versão, toda loja nasce com todas as funcionalidades ligadas, sem
        custo e sem limite de uso. Desligar uma é exceção desta loja.
      </p>
      {props.ultimaAlteracao !== undefined && (
        <Sucesso
          titulo="Alteração registrada"
          descricao={props.ultimaAlteracao}
          className="mt-4"
        />
      )}
      {dados.funcionalidades.length === 0 ? (
        <Vazio
          titulo="Nenhuma funcionalidade no catálogo"
          descricao="Quando houver funcionalidades para liberar por loja, elas aparecem aqui."
          className="mt-6"
        />
      ) : (
        <ul className="mt-6 grid gap-4">
          {dados.funcionalidades.map((funcionalidade) => (
            <CartaoDaFuncionalidade
              key={funcionalidade.chave}
              lojaId={lojaId}
              funcionalidade={funcionalidade}
              aoAlterar={props.aoAlterar}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Estado e rede da lista. O desenho é todo de `FuncionalidadesNaTela`. */
export function FuncionalidadesDaLoja({ lojaId }: { readonly lojaId: string }) {
  const [estado, setEstado] = useState<EstadoDasFuncionalidades>({
    fase: "carregando",
  });
  const [tentativa, setTentativa] = useState(0);
  const [ultimaAlteracao, setUltimaAlteracao] = useState<string | undefined>();

  const carregar = useCallback(async () => {
    setEstado({ fase: "carregando" });
    try {
      const resposta = await fetch(enderecoDasFuncionalidades(lojaId), {
        cache: "no-store",
      });
      if (resposta.status === 404) {
        setEstado({ fase: "nao-encontrada" });
        return;
      }
      if (resposta.status === 401 || resposta.status === 403) {
        setEstado({
          fase: "erro",
          mensagem: MENSAGEM_DE_SESSAO_DAS_FUNCIONALIDADES,
        });
        return;
      }
      if (!resposta.ok) {
        setEstado({
          fase: "erro",
          mensagem: MENSAGEM_DE_FALHA_DAS_FUNCIONALIDADES,
        });
        return;
      }
      setEstado({
        fase: "pronta",
        dados: esquemaDasFuncionalidadesDaLoja.parse(await resposta.json()),
      });
    } catch {
      setEstado({
        fase: "erro",
        mensagem: MENSAGEM_DE_FALHA_DAS_FUNCIONALIDADES,
      });
    }
  }, [lojaId]);

  useEffect(() => {
    void carregar();
  }, [carregar, tentativa]);

  return (
    <FuncionalidadesNaTela
      lojaId={lojaId}
      estado={estado}
      ultimaAlteracao={ultimaAlteracao}
      aoTentarDeNovo={() => setTentativa((anterior) => anterior + 1)}
      aoAlterar={(dados) => {
        setEstado({ fase: "pronta", dados });
        setUltimaAlteracao(
          "A loja já vê a mudança na próxima vez que abrir o painel. O ato ficou no histórico.",
        );
      }}
    />
  );
}
