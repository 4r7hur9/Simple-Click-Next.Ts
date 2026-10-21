"use client";

/**
 * Dono e equipe de uma loja, vistos pela administração (card #29). Cada pessoa
 * leva à conta dela; acessos retirados continuam na lista, marcados, porque a
 * administração precisa saber quem já teve acesso.
 */

import {
  esquemaDaEquipeDaLojaNaAdministracao,
  type EquipeDaLojaNaAdministracaoNoContrato,
  type MembroNaAdministracaoNoContrato,
} from "@simpleclick/contracts";
import { Botao, Cartao, Selo } from "@simpleclick/ui";
import Link from "next/link";
import { useEffect, useState } from "react";

import { dataCurta, lerDaApi, type LeituraDaApi } from "./apresentacao.ts";

/** Só desenha a lista de pessoas. */
export function ListaDaEquipe({
  membros,
}: {
  readonly membros: readonly MembroNaAdministracaoNoContrato[];
}) {
  return (
    <ul className="divide-y divide-[var(--cor-borda)] pt-4">
      {membros.map((membro) => (
        <li
          key={membro.id}
          className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
        >
          <div className="min-w-0">
            <Link
              className="font-medium underline-offset-2 hover:underline"
              href={`/admin/contas/${membro.identidadeId}`}
            >
              {membro.nome ?? membro.email}
            </Link>
            <p className="truncate text-xs text-[var(--cor-tinta-suave)]">
              {membro.nome !== null ? `${membro.email} · ` : ""}
              desde {dataCurta(membro.desde)}
            </p>
          </div>
          <span className="flex flex-wrap items-center gap-2">
            <Selo tom={membro.papel === "OWNER" ? "info" : "neutro"} semBolinha>
              {membro.papel === "OWNER" ? "Dono" : "Equipe"}
            </Selo>
            {!membro.ativo && <Selo tom="erro">Acesso retirado</Selo>}
            {membro.ativo && !membro.conviteAceito && (
              <Selo tom="atencao">Convite pendente</Selo>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function EquipeDaLoja({ lojaId }: { readonly lojaId: string }) {
  const [leitura, setLeitura] = useState<
    | LeituraDaApi<EquipeDaLojaNaAdministracaoNoContrato>
    | { readonly fase: "carregando" }
  >({ fase: "carregando" });
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let vivo = true;
    setLeitura({ fase: "carregando" });
    void lerDaApi(
      `/api/admin/lojas/${encodeURIComponent(lojaId)}/equipe`,
      (corpo) => esquemaDaEquipeDaLojaNaAdministracao.parse(corpo),
      "Não foi possível carregar o dono e a equipe.",
    ).then((lida) => {
      if (vivo) setLeitura(lida);
    });
    return () => {
      vivo = false;
    };
  }, [lojaId, tentativa]);

  const membros = leitura.fase === "pronta" ? leitura.dados.membros : [];
  return (
    <Cartao
      titulo="Dono e equipe"
      nivelDoTitulo={2}
      descricao="Quem tem acesso ao painel desta loja."
      estado={
        leitura.fase === "carregando"
          ? "carregando"
          : leitura.fase !== "pronta"
            ? "erro"
            : membros.length === 0
              ? "vazio"
              : "pronto"
      }
      rotuloDeEspera="Carregando o dono e a equipe…"
      esperaComEsqueleto
      mensagemDeErro={
        leitura.fase === "erro"
          ? leitura.mensagem
          : "Não foi possível carregar o dono e a equipe."
      }
      tituloVazio="Ninguém com acesso"
      descricaoVazio="Esta loja ficou sem dono nem equipe."
      rodape={
        leitura.fase === "erro" ? (
          <Botao
            variante="secundaria"
            onClick={() => setTentativa((n) => n + 1)}
          >
            Tentar de novo
          </Botao>
        ) : undefined
      }
    >
      <ListaDaEquipe membros={membros} />
    </Cartao>
  );
}
