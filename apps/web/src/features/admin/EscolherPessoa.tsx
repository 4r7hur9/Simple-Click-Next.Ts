"use client";

/**
 * Escolher a pessoa de um vínculo pela busca de pessoas (card #170, T-10).
 *
 * Busca por nome ou e-mail em `/api/admin/pessoas` (a mesma lista da tela
 * Pessoas) e mostra o mínimo. Só quem pode receber vínculo é escolhível:
 * pessoa com senha, ativa e que não é conta protegida. As outras aparecem
 * desabilitadas, com o motivo, para a administração entender por quê.
 *
 * O termo digitado fica só neste estado: não vai para endereço nem para
 * armazenamento.
 */

import {
  esquemaDaListaDePessoas,
  type ItemDePessoaNoContrato,
} from "@simpleclick/contracts";
import { Botao, IconeBuscar } from "@simpleclick/ui";
import { useId, useState } from "react";

import { lerDaApi } from "./apresentacao.ts";

/** `marina@exemplo.com` vira `m****@exemplo.com`: confirma sem expor tudo. */
export function mascararEmail(email: string): string {
  const arroba = email.indexOf("@");
  if (arroba <= 0) return "****";
  return `${email.slice(0, 1)}****${email.slice(arroba)}`;
}

/** Por que esta pessoa não pode receber vínculo; `null` se pode. */
export function motivoDeNaoPoderReceber(
  pessoa: Pick<ItemDePessoaNoContrato, "desativada" | "protegida" | "temSenha">,
): string | null {
  if (pessoa.protegida) return "Conta protegida da plataforma";
  if (pessoa.desativada) return "Conta desativada";
  if (!pessoa.temSenha) return "Ainda sem senha: gere o link de acesso antes";
  return null;
}

export function EscolherPessoa({
  rotulo,
  escolhida,
  excluirIds = [],
  aoEscolher,
}: {
  readonly rotulo: string;
  readonly escolhida: ItemDePessoaNoContrato | null;
  /** Pessoas que não fazem sentido aqui (a que já é dona, por exemplo). */
  readonly excluirIds?: readonly string[];
  readonly aoEscolher: (pessoa: ItemDePessoaNoContrato | null) => void;
}) {
  const id = useId();
  const [termo, setTermo] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<
    readonly ItemDePessoaNoContrato[] | null
  >(null);
  const [falha, setFalha] = useState<string | null>(null);

  async function buscar() {
    const busca = termo.trim();
    if (busca.length < 2) {
      setFalha("Digite ao menos 2 letras do nome ou do e-mail.");
      return;
    }
    setBuscando(true);
    setFalha(null);
    const parametros = new URLSearchParams({
      tipo: "todas",
      situacao: "todas",
      busca,
      pagina: "1",
    });
    const leitura = await lerDaApi(
      `/api/admin/pessoas?${parametros.toString()}`,
      (corpo) => esquemaDaListaDePessoas.parse(corpo),
      "Não foi possível buscar agora. Tente de novo.",
    );
    setBuscando(false);
    if (leitura.fase === "pronta") {
      setResultados(
        leitura.dados.pessoas.filter(
          (pessoa) => !excluirIds.includes(pessoa.identidadeId),
        ),
      );
    } else {
      setResultados(null);
      setFalha(
        leitura.fase === "erro"
          ? leitura.mensagem
          : "Não foi possível buscar agora. Tente de novo.",
      );
    }
  }

  if (escolhida !== null) {
    return (
      <div className="grid gap-1 text-sm">
        <span className="font-medium">{rotulo}</span>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--raio-medio,8px)] border border-[var(--cor-borda)] p-3">
          <span>
            <strong>{escolhida.nome ?? escolhida.email}</strong>
            <span className="block text-xs text-[var(--cor-tinta-suave)]">
              {escolhida.email}
            </span>
          </span>
          <Botao
            variante="discreta"
            tamanho="pequeno"
            onClick={() => aoEscolher(null)}
          >
            Trocar a escolha
          </Botao>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-2 text-sm">
      <label className="grid gap-1 font-medium" htmlFor={`${id}-busca`}>
        {rotulo}
        <span className="flex flex-wrap items-end gap-2">
          <input
            id={`${id}-busca`}
            type="search"
            className="sc-campo__controle min-w-[14rem] flex-1"
            placeholder="Nome ou e-mail da pessoa"
            autoComplete="off"
            value={termo}
            onChange={(evento) => setTermo(evento.target.value)}
            onKeyDown={(evento) => {
              if (evento.key === "Enter") {
                evento.preventDefault();
                void buscar();
              }
            }}
          />
          <Botao
            variante="secundaria"
            icone={<IconeBuscar />}
            carregando={buscando}
            rotuloDeEspera="Buscando…"
            onClick={() => void buscar()}
          >
            Buscar
          </Botao>
        </span>
      </label>
      {falha !== null && (
        <p role="alert" className="text-[var(--cor-erro)]">
          {falha}
        </p>
      )}
      {resultados !== null && resultados.length === 0 && (
        <p role="status" className="text-[var(--cor-tinta-suave)]">
          Ninguém encontrado. Cadastre a pessoa em Pessoas e volte aqui.
        </p>
      )}
      {resultados !== null && resultados.length > 0 && (
        <ul
          aria-label="Pessoas encontradas"
          className="divide-y divide-[var(--cor-borda)] rounded-[var(--raio-medio,8px)] border border-[var(--cor-borda)]"
        >
          {resultados.map((pessoa) => {
            const motivo = motivoDeNaoPoderReceber(pessoa);
            return (
              <li
                key={pessoa.identidadeId}
                className="flex flex-wrap items-center justify-between gap-2 p-3"
              >
                <span>
                  <span className="font-medium">
                    {pessoa.nome ?? pessoa.email}
                  </span>
                  <span className="block text-xs text-[var(--cor-tinta-suave)]">
                    {pessoa.email}
                    {motivo !== null && ` · ${motivo}`}
                  </span>
                </span>
                <Botao
                  variante="secundaria"
                  tamanho="pequeno"
                  desabilitado={motivo !== null}
                  onClick={() => aoEscolher(pessoa)}
                >
                  Escolher
                </Botao>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
