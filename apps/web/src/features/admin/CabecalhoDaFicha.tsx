"use client";

/**
 * O cabeçalho da ficha da loja (card #29): nome, situação, dono e a ação da
 * hora — aprovar e recusar quando a loja espera, ativar ou desativar nas
 * outras. Fica acima das abas e vale para todas elas.
 */

import {
  Aviso,
  Botao,
  Carregando,
  Erro,
  IconeAbrirFora,
  IconeVoltar,
  Selo,
  Vazio,
} from "@simpleclick/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  NOME_DA_SITUACAO,
  TOM_DA_SITUACAO,
  dataEHora,
} from "./apresentacao.ts";
import { AtosDeAprovacao } from "./AtosDeAprovacao.tsx";
import { useFichaDaLoja } from "./ProvedorDaFicha.tsx";

export function CabecalhoDaFicha() {
  const { estado, atualizar, recarregar } = useFichaDaLoja();
  const roteador = useRouter();

  const voltar = (
    <Link
      className="inline-flex items-center gap-2 text-sm font-medium text-[var(--cor-primaria-texto)]"
      href="/admin/lojas"
    >
      <IconeVoltar aria-hidden="true" />
      Voltar para as lojas
    </Link>
  );

  if (estado.fase === "carregando") {
    return (
      <header>
        {voltar}
        <Carregando rotulo="Carregando a ficha da loja…" className="mt-6" />
      </header>
    );
  }
  if (estado.fase === "nao-encontrada") {
    return (
      <header>
        {voltar}
        <Vazio
          titulo="Loja não encontrada"
          descricao="O endereço não corresponde a nenhuma loja cadastrada."
          className="mt-6"
          acao={
            <Link className="sc-botao sc-botao--primaria" href="/admin/lojas">
              Voltar para as lojas
            </Link>
          }
        />
      </header>
    );
  }
  if (estado.fase === "erro") {
    return (
      <header>
        {voltar}
        <Erro
          titulo="A ficha não carregou"
          mensagem={estado.mensagem}
          className="mt-6"
          acao={
            <Botao variante="secundaria" onClick={recarregar}>
              Tentar de novo
            </Botao>
          }
        />
      </header>
    );
  }

  const { ficha } = estado;
  const dono = ficha.donos?.[0];
  return (
    <header>
      {voltar}
      <div className="mt-5 flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <p className="font-mono text-sm text-[var(--cor-tinta-suave)]">
            Código {ficha.codigo} · /loja/{ficha.apelido}
          </p>
          <h1
            id="ficha-titulo"
            className="mt-2 text-4xl font-semibold tracking-[-0.04em]"
          >
            {ficha.nome}
          </h1>
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-base">
            <Selo tom={TOM_DA_SITUACAO[ficha.status]}>
              {NOME_DA_SITUACAO[ficha.status]}
            </Selo>
            <span>{ficha.tipoDeNegocio.nome}</span>
            {dono !== undefined && (
              <span className="text-[var(--cor-tinta-suave)]">
                Dono:{" "}
                <Link
                  className="text-[var(--cor-tinta)] underline-offset-2 hover:underline"
                  href={`/admin/contas/${dono.identidadeId}`}
                >
                  {dono.nome ?? dono.email}
                </Link>
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {ficha.status === "ACTIVE" && (
            <Link
              className="sc-botao sc-botao--discreta"
              href={`/loja/${encodeURIComponent(ficha.apelido)}`}
              target="_blank"
              rel="noreferrer"
            >
              <IconeAbrirFora aria-hidden="true" />
              Ver vitrine
            </Link>
          )}
          <AtosDeAprovacao
            loja={ficha}
            aoMudar={(nova) => {
              atualizar(nova);
              // O contador de pendentes do menu vem do servidor.
              roteador.refresh();
            }}
          />
        </div>
      </div>

      {ficha.status === "PENDING_APPROVAL" && (
        <Aviso
          tom="atencao"
          aoVivo={false}
          titulo="Esta loja espera a sua aprovação"
          className="mt-5"
        >
          <p>
            Ela não aparece na vitrine nem no feed. O painel do dono já
            funciona, para ele poder preparar o cardápio.
          </p>
        </Aviso>
      )}
      {ficha.status === "REJECTED" && (
        <Aviso
          tom="erro"
          aoVivo={false}
          titulo={
            ficha.recusa === null || ficha.recusa === undefined
              ? "Loja recusada"
              : `Loja recusada em ${dataEHora(ficha.recusa.desde)}`
          }
          className="mt-5"
        >
          <p>
            {ficha.recusa?.motivo !== undefined && ficha.recusa.motivo !== ""
              ? `Motivo: ${ficha.recusa.motivo}`
              : "O dono vê o aviso de recusa no painel."}
          </p>
        </Aviso>
      )}
      {ficha.status === "INACTIVE" && (
        <Aviso
          tom="atencao"
          aoVivo={false}
          titulo={
            ficha.suspensao === null
              ? "Loja inativa"
              : `Loja inativa desde ${dataEHora(ficha.suspensao.desde)}`
          }
          className="mt-5"
        >
          <p>
            A vitrine e o feed estão fora do ar.
            {ficha.suspensao !== null && ficha.suspensao.motivo !== ""
              ? ` Motivo: ${ficha.suspensao.motivo}`
              : ""}
          </p>
        </Aviso>
      )}
    </header>
  );
}
