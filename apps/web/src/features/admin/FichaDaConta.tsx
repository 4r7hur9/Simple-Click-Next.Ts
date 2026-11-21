"use client";

/**
 * A ficha de uma pessoa na administração (cards #29 e #170): quem é, a situação
 * da conta, os vínculos com lojas (com Aprovar e Recusar nas que esperam), os
 * pedidos em números, o limite de lojas (quando é dono), as ações e o histórico.
 *
 * Só números agregados de pedidos e o telefone: nunca CPF, endereço nem itens
 * (D-9). A leitura da ficha fica na auditoria da plataforma, na API. Os links
 * não fazem prefetch, para o carregamento adiantado não abrir ficha nenhuma.
 */

import {
  esquemaDaFichaDaPessoa,
  esquemaDoLimiteDoDono,
  esquemaDosPadroesDeLimite,
  LIMITES_PADRAO,
  type FichaDaPessoaNoContrato,
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
  plural,
  TOM_DA_SITUACAO,
} from "./apresentacao.ts";
import { AcoesDaPessoa } from "./AcoesDaPessoa.tsx";
import { AtosDeAprovacao } from "./AtosDeAprovacao.tsx";
import { BarraDeUso } from "./BarraDeUso.tsx";
import { INFO_DO_LIMITE_DE_LOJAS } from "./explicacoes.ts";
import { ListaDaTrilha } from "./ListaDaTrilha.tsx";
import {
  SeloDaSituacaoDaPessoa,
  SelosDoTipoDaPessoa,
} from "./ListaDeContas.tsx";

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

/** Só desenha os vínculos da pessoa com as lojas. */
export function VinculosDaPessoa({
  ficha,
  aoMudar,
}: {
  readonly ficha: FichaDaPessoaNoContrato;
  readonly aoMudar: () => void;
}) {
  const pendentes = ficha.vinculos.filter(
    (v) => v.papel === "OWNER" && v.status === "PENDING_APPROVAL",
  ).length;
  return (
    <Cartao
      titulo="Vínculos com lojas"
      nivelDoTitulo={2}
      descricao={
        pendentes > 0
          ? `${pendentes} esperando aprovação.`
          : "Lojas em que esta pessoa tem acesso."
      }
      estado={ficha.vinculos.length === 0 ? "vazio" : "pronto"}
      tituloVazio="Sem vínculo com loja"
      descricaoVazio="Esta pessoa é só cliente: não é dona nem da equipe de nenhuma loja."
      rodape={
        <Link
          className="sc-botao sc-botao--secundaria"
          href={`/admin/donos-e-equipes?pessoa=${encodeURIComponent(ficha.identidadeId)}`}
          prefetch={false}
        >
          Gerenciar donos e equipe
        </Link>
      }
    >
      <ul className="divide-y divide-[var(--cor-borda)] pt-4">
        {ficha.vinculos.map((loja) => (
          <li
            key={`${loja.lojaId}-${loja.papel}`}
            className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
          >
            <div className="min-w-0">
              <Link
                className="font-medium underline-offset-2 hover:underline"
                href={`/admin/lojas/${loja.lojaId}`}
                prefetch={false}
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
                  loja={{
                    id: loja.lojaId,
                    nome: loja.nome,
                    status: loja.status,
                  }}
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

/** Os pedidos da pessoa como cliente: números, sem itens nem endereço. */
export function PedidosDaPessoa({
  pedidos,
}: {
  readonly pedidos: FichaDaPessoaNoContrato["pedidos"];
}) {
  return (
    <Cartao
      titulo="Pedidos"
      nivelDoTitulo={2}
      descricao="Só os números: a administração não vê itens, endereço nem documento."
      estado={pedidos.total === 0 ? "vazio" : "pronto"}
      tituloVazio="Nenhum pedido ainda"
    >
      <dl className="grid gap-3 pt-4 text-sm">
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="font-medium">Pedidos feitos</dt>
          <dd className="tabular-nums">{inteiro(pedidos.total)}</dd>
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="font-medium">Último pedido</dt>
          <dd>
            {pedidos.ultimoEm === null ? (
              "—"
            ) : (
              <time dateTime={pedidos.ultimoEm}>
                {dataCurta(pedidos.ultimoEm)}
              </time>
            )}
          </dd>
        </div>
      </dl>
      {pedidos.porLoja.length > 0 && (
        <ul className="mt-4 divide-y divide-[var(--cor-borda)] text-sm">
          {pedidos.porLoja.map((loja) => (
            <li
              key={loja.lojaId}
              className="flex flex-wrap items-center justify-between gap-2 py-2"
            >
              <span>{loja.nome}</span>
              <span className="tabular-nums">
                {plural(loja.total, "pedido", "pedidos")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  );
}

type EstadoDaFicha =
  | { readonly fase: "carregando" }
  | { readonly fase: "nao-encontrada" }
  | { readonly fase: "erro"; readonly mensagem: string }
  | { readonly fase: "pronta"; readonly ficha: FichaDaPessoaNoContrato };

export function FichaDaConta({
  identidadeId,
}: {
  readonly identidadeId: string;
}) {
  const roteador = useRouter();
  const [estado, setEstado] = useState<EstadoDaFicha>({ fase: "carregando" });
  const [padrao, setPadrao] = useState<number>(LIMITES_PADRAO.lojasPorDono);
  const [tentativa, setTentativa] = useState(0);

  const carregar = useCallback(async () => {
    const lida = await lerDaApi(
      `/api/admin/pessoas/${encodeURIComponent(identidadeId)}`,
      (corpo) => esquemaDaFichaDaPessoa.parse(corpo),
    );
    setEstado((atual) => {
      if (lida.fase === "pronta") return { fase: "pronta", ficha: lida.dados };
      // Recarga depois de um ato: se falhar, a ficha que já está na tela fica.
      return atual.fase === "pronta" ? atual : lida;
    });
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
      prefetch={false}
    >
      <IconeVoltar aria-hidden="true" />
      Voltar para as pessoas
    </Link>
  );

  if (estado.fase === "carregando") {
    return (
      <>
        {voltar}
        <Carregando rotulo="Carregando a ficha…" className="mt-6" />
      </>
    );
  }
  if (estado.fase === "nao-encontrada") {
    return (
      <>
        {voltar}
        <Vazio
          titulo="Pessoa não encontrada"
          descricao="Esta conta não existe."
          className="mt-6"
        />
      </>
    );
  }
  if (estado.fase === "erro") {
    return (
      <>
        {voltar}
        <Erro
          titulo="A ficha não carregou"
          mensagem={estado.mensagem}
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

  const ficha = estado.ficha;
  const pendentes = ficha.vinculos.filter(
    (v) => v.papel === "OWNER" && v.status === "PENDING_APPROVAL",
  ).length;
  return (
    <article aria-labelledby="conta-titulo">
      {voltar}
      <header className="mt-5">
        <h1
          id="conta-titulo"
          className="text-4xl font-semibold tracking-[-0.04em]"
        >
          {ficha.nome ?? ficha.email}
        </h1>
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <SelosDoTipoDaPessoa pessoa={ficha} />
          <SeloDaSituacaoDaPessoa pessoa={ficha} />
          <span>{ficha.email}</span>
          {ficha.telefone !== null && <span>{ficha.telefone}</span>}
          <span className="text-sm text-[var(--cor-tinta-suave)]">
            Conta criada em {dataCurta(ficha.criadaEm)}
          </span>
        </p>
        <div className="mt-5">
          <AcoesDaPessoa
            ficha={ficha}
            aoMudar={(nova) => {
              setEstado({ fase: "pronta", ficha: nova });
              roteador.refresh();
            }}
            aoRecarregar={() => void carregar()}
          />
        </div>
      </header>

      {ficha.desativada && (
        <Aviso
          tom="atencao"
          aoVivo={false}
          titulo="Conta desativada"
          className="mt-5"
        >
          <p>
            {ficha.desativadaEm !== null
              ? `Desativada em ${dataCurta(ficha.desativadaEm)}. `
              : ""}
            A pessoa não entra até a conta ser reativada.
          </p>
        </Aviso>
      )}

      {pendentes > 0 && (
        <Aviso
          tom="atencao"
          aoVivo={false}
          titulo={
            pendentes === 1
              ? "1 loja desta pessoa espera aprovação"
              : `${pendentes} lojas desta pessoa esperam aprovação`
          }
          className="mt-5"
        >
          <p>Aprove ou recuse na lista de vínculos abaixo.</p>
        </Aviso>
      )}

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-2">
        <VinculosDaPessoa
          ficha={ficha}
          aoMudar={() => {
            setTentativa((n) => n + 1);
            roteador.refresh();
          }}
        />
        <PedidosDaPessoa pedidos={ficha.pedidos} />
        {ficha.donoDeLojas > 0 && (
          <LimiteDeLojasDoDono
            identidadeId={ficha.identidadeId}
            padrao={padrao}
            aoSalvar={() => setTentativa((n) => n + 1)}
          />
        )}
      </div>

      <div className="mt-8">
        <Cartao
          titulo="Histórico da conta"
          nivelDoTitulo={2}
          descricao="Os atos da administração sobre esta pessoa, do mais novo para o mais antigo."
          estado={ficha.historico.length === 0 ? "vazio" : "pronto"}
          tituloVazio="Nenhum ato registrado ainda"
        >
          <div className="pt-4">
            <ListaDaTrilha registros={ficha.historico} />
          </div>
        </Cartao>
      </div>
    </article>
  );
}
