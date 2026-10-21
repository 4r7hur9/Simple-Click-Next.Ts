"use client";

/**
 * A ficha de uma conta na administração (card #29): quem é, o limite de lojas
 * (quando é dono), e as lojas dela — com Aprovar e Recusar nas que esperam.
 * Trocar o limite de lojas do dono grava na auditoria da plataforma.
 */

import {
  esquemaDaContaNaAdministracao,
  esquemaDoLimiteDoDono,
  esquemaDosPadroesDeLimite,
  LIMITES_PADRAO,
  type ContaNaAdministracaoNoContrato,
  type LimiteDoDonoNoContrato,
} from "@simpleclick/contracts";
import {
  Aviso,
  Botao,
  Campo,
  Cartao,
  Carregando,
  Erro,
  IconeVoltar,
  Selo,
  Sucesso,
  Vazio,
} from "@simpleclick/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import {
  dataCurta,
  inteiro,
  lerDaApi,
  mensagemDaApi,
  NOME_DA_SITUACAO,
  TOM_DA_SITUACAO,
} from "./apresentacao.ts";
import { AtosDeAprovacao } from "./AtosDeAprovacao.tsx";
import { BarraDeUso } from "./BarraDeUso.tsx";
import { INFO_DO_LIMITE_DE_LOJAS } from "./explicacoes.ts";

/** O que foi digitado no campo, no corpo que a API pede: vazio é o padrão. */
export function lojasDoCampo(
  texto: string,
): { readonly lojas: number | null } | { readonly erro: string } {
  const limpo = texto.trim();
  if (limpo === "") return { lojas: null };
  if (!/^\d+$/.test(limpo)) return { erro: "Informe um número inteiro." };
  const lojas = Number(limpo);
  return lojas > 1_000_000 ? { erro: "No máximo 1.000.000." } : { lojas };
}

function LimiteDeLojasDoDono({
  identidadeId,
  padrao,
  aoSalvar,
}: {
  readonly identidadeId: string;
  readonly padrao: number;
  readonly aoSalvar: () => void;
}) {
  const base = `/api/admin/donos/${encodeURIComponent(identidadeId)}/limites`;
  const [limite, setLimite] = useState<LimiteDoDonoNoContrato | null>(null);
  const [falhaAoLer, setFalhaAoLer] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [campo, setCampo] = useState("");
  const [erro, setErro] = useState<string | undefined>();
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    let vivo = true;
    setFalhaAoLer(null);
    void lerDaApi(base, (corpo) => esquemaDoLimiteDoDono.parse(corpo)).then(
      (lida) => {
        if (!vivo) return;
        if (lida.fase === "pronta") {
          setLimite(lida.dados);
          setCampo(lida.dados.ajuste === null ? "" : String(lida.dados.ajuste));
        } else {
          setFalhaAoLer(
            lida.fase === "erro" ? lida.mensagem : "Conta não encontrada.",
          );
        }
      },
    );
    return () => {
      vivo = false;
    };
  }, [base, tentativa]);

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const montado = lojasDoCampo(campo);
    if ("erro" in montado) {
      setErro(montado.erro);
      return;
    }
    setErro(undefined);
    setSalvando(true);
    setSalvo(false);
    try {
      const resposta = await fetch(base, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lojas: montado.lojas }),
      });
      const lido: unknown = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        setErro(
          resposta.status === 401 || resposta.status === 403
            ? "Sua sessão não tem acesso à administração. Entre de novo."
            : mensagemDaApi(lido, "O limite não foi salvo; tente de novo."),
        );
        return;
      }
      const novo = esquemaDoLimiteDoDono.parse(lido);
      setLimite(novo);
      setCampo(novo.ajuste === null ? "" : String(novo.ajuste));
      setSalvo(true);
      aoSalvar();
    } catch {
      setErro("O limite não foi salvo; tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Cartao
      titulo="Limite de lojas"
      nivelDoTitulo={2}
      descricao="Quantas lojas esta conta pode ter ao mesmo tempo. Loja recusada ou excluída não ocupa vaga."
      estado={
        falhaAoLer !== null ? "erro" : limite === null ? "carregando" : "pronto"
      }
      esperaComEsqueleto
      rotuloDeEspera="Carregando o limite…"
      mensagemDeErro={falhaAoLer ?? undefined}
      rodape={
        falhaAoLer !== null ? (
          <Botao
            variante="secundaria"
            onClick={() => setTentativa((n) => n + 1)}
          >
            Tentar de novo
          </Botao>
        ) : undefined
      }
    >
      {limite !== null && (
        <div className="grid gap-5 pt-4">
          <div className="grid gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">Lojas em uso</span>
              <span className="flex items-center gap-2 text-sm tabular-nums">
                {inteiro(limite.limite.uso)} de {inteiro(limite.limite.limite)}
                <Selo
                  tom={limite.ajuste === null ? "neutro" : "info"}
                  semBolinha
                >
                  {limite.ajuste === null ? "Padrão" : "Ajustado"}
                </Selo>
              </span>
            </div>
            <BarraDeUso
              uso={limite.limite.uso}
              limite={limite.limite.limite}
              rotulo="Lojas"
            />
          </div>
          <form noValidate onSubmit={salvar} className="grid gap-4">
            <Campo
              id="limite-de-lojas-do-dono"
              rotulo="Máximo de lojas desta conta"
              info={INFO_DO_LIMITE_DE_LOJAS}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              dica={`Número inteiro de lojas. Vazio usa o padrão da plataforma: ${inteiro(padrao)}.`}
              erro={erro}
              value={campo}
              onChange={(evento) => {
                setCampo(evento.target.value);
                setErro(undefined);
                setSalvo(false);
              }}
            />
            {salvo && (
              <Sucesso titulo="Limite salvo e registrado na auditoria." />
            )}
            <div>
              <Botao
                type="submit"
                carregando={salvando}
                rotuloDeEspera="Salvando…"
              >
                Salvar limite
              </Botao>
            </div>
          </form>
        </div>
      )}
    </Cartao>
  );
}

/** Só desenha as lojas da conta. */
export function LojasDaConta({
  conta,
  aoMudar,
}: {
  readonly conta: ContaNaAdministracaoNoContrato;
  readonly aoMudar: () => void;
}) {
  return (
    <Cartao
      titulo="Lojas"
      nivelDoTitulo={2}
      descricao={
        conta.pendentes > 0
          ? `${conta.pendentes} esperando aprovação.`
          : "Lojas em que esta conta tem acesso."
      }
    >
      <ul className="divide-y divide-[var(--cor-borda)] pt-4">
        {conta.lojas.map((loja) => (
          <li
            key={loja.id}
            className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
          >
            <div className="min-w-0">
              <Link
                className="font-medium underline-offset-2 hover:underline"
                href={`/admin/lojas/${loja.id}`}
              >
                {loja.nome}
              </Link>
              <p className="text-xs text-[var(--cor-tinta-suave)]">
                /loja/{loja.apelido} ·{" "}
                {loja.papel === "OWNER" ? "Dono" : "Equipe"}
              </p>
            </div>
            <span className="flex flex-wrap items-center gap-2">
              <Selo tom={TOM_DA_SITUACAO[loja.status]}>
                {NOME_DA_SITUACAO[loja.status]}
              </Selo>
              {loja.papel === "OWNER" && loja.status === "PENDING_APPROVAL" && (
                <AtosDeAprovacao
                  loja={loja}
                  tamanho="pequeno"
                  aoMudar={aoMudar}
                />
              )}
            </span>
          </li>
        ))}
      </ul>
    </Cartao>
  );
}

export function FichaDaConta({
  identidadeId,
}: {
  readonly identidadeId: string;
}) {
  const roteador = useRouter();
  const [conta, setConta] = useState<
    | { readonly fase: "carregando" }
    | { readonly fase: "nao-encontrada" }
    | { readonly fase: "erro"; readonly mensagem: string }
    | {
        readonly fase: "pronta";
        readonly conta: ContaNaAdministracaoNoContrato;
      }
  >({ fase: "carregando" });
  const [padrao, setPadrao] = useState<number>(LIMITES_PADRAO.lojasPorDono);
  const [tentativa, setTentativa] = useState(0);

  const carregar = useCallback(async () => {
    const lida = await lerDaApi(
      `/api/admin/contas/${encodeURIComponent(identidadeId)}`,
      (corpo) => esquemaDaContaNaAdministracao.parse(corpo),
    );
    setConta(
      lida.fase === "pronta" ? { fase: "pronta", conta: lida.dados } : lida,
    );
  }, [identidadeId]);

  useEffect(() => {
    void carregar();
  }, [carregar, tentativa]);

  useEffect(() => {
    let vivo = true;
    void lerDaApi("/api/admin/limites", (corpo) =>
      esquemaDosPadroesDeLimite.parse(corpo),
    ).then((lida) => {
      if (vivo && lida.fase === "pronta") setPadrao(lida.dados.lojasPorDono);
    });
    return () => {
      vivo = false;
    };
  }, []);

  const voltar = (
    <Link
      className="inline-flex items-center gap-2 text-sm font-medium text-[var(--cor-primaria-texto)]"
      href="/admin/contas"
    >
      <IconeVoltar aria-hidden="true" />
      Voltar para as contas
    </Link>
  );

  if (conta.fase === "carregando") {
    return (
      <>
        {voltar}
        <Carregando rotulo="Carregando a conta…" className="mt-6" />
      </>
    );
  }
  if (conta.fase === "nao-encontrada") {
    return (
      <>
        {voltar}
        <Vazio
          titulo="Conta não encontrada"
          descricao="Esta conta não existe ou não tem acesso a nenhuma loja."
          className="mt-6"
        />
      </>
    );
  }
  if (conta.fase === "erro") {
    return (
      <>
        {voltar}
        <Erro
          titulo="A conta não carregou"
          mensagem={conta.mensagem}
          className="mt-6"
          acao={
            <Botao
              variante="secundaria"
              onClick={() => setTentativa((n) => n + 1)}
            >
              Tentar de novo
            </Botao>
          }
        />
      </>
    );
  }

  const dados = conta.conta;
  return (
    <article aria-labelledby="conta-titulo">
      {voltar}
      <header className="mt-5">
        <h1
          id="conta-titulo"
          className="text-4xl font-semibold tracking-[-0.04em]"
        >
          {dados.nome ?? dados.email}
        </h1>
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <Selo tom={dados.tipo === "DONO" ? "info" : "neutro"} semBolinha>
            {dados.tipo === "DONO" ? "Dono de loja" : "Equipe"}
          </Selo>
          <span>{dados.email}</span>
          {dados.telefone !== null && <span>{dados.telefone}</span>}
          <span className="text-sm text-[var(--cor-tinta-suave)]">
            Conta criada em {dataCurta(dados.criadaEm)}
          </span>
        </p>
      </header>

      {dados.pendentes > 0 && (
        <Aviso
          tom="atencao"
          aoVivo={false}
          titulo={
            dados.pendentes === 1
              ? "1 loja desta conta espera aprovação"
              : `${dados.pendentes} lojas desta conta esperam aprovação`
          }
          className="mt-5"
        >
          <p>Aprove ou recuse na lista de lojas abaixo.</p>
        </Aviso>
      )}

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-2">
        <LojasDaConta
          conta={dados}
          aoMudar={() => {
            setTentativa((n) => n + 1);
            roteador.refresh();
          }}
        />
        {dados.tipo === "DONO" ? (
          <LimiteDeLojasDoDono
            identidadeId={dados.identidadeId}
            padrao={padrao}
            aoSalvar={() => setTentativa((n) => n + 1)}
          />
        ) : (
          <Cartao
            titulo="Acesso da equipe"
            nivelDoTitulo={2}
            descricao="Quem entra pela equipe não abre lojas: o limite de pessoas é da loja, e quem o ajusta é a ficha da loja."
          />
        )}
      </div>
    </article>
  );
}
