"use client";

/**
 * O cadastro de dono pronto para a página: busca a lista de tipos de negócio
 * (pública, a mesma do cadastro da administração) e liga o formulário à
 * ponte do site. Sem a lista, o formulário não abre: o tipo é obrigatório.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Aviso, Botao } from "@simpleclick/ui";

import {
  CadastroDeDonoForm,
  type TipoDeNegocioNaTela,
} from "./CadastroDeDonoForm.tsx";
import { enviarCadastro, enviarLoja } from "./acesso-na-ponte.ts";

type Tipos =
  | { readonly estado: "carregando" }
  | { readonly estado: "erro" }
  | { readonly estado: "pronto"; readonly lista: TipoDeNegocioNaTela[] };

export function CadastroDeDono({
  aoConcluir,
  linkParaEntrar,
}: {
  readonly aoConcluir: (destino: string) => void;
  readonly linkParaEntrar?: ReactNode;
}) {
  const [tipos, setTipos] = useState<Tipos>({ estado: "carregando" });
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let cancelado = false;
    setTipos({ estado: "carregando" });
    fetch("/api/painel/lojas/tipos")
      .then(async (resposta) => {
        if (!resposta.ok) throw new Error("falhou");
        const corpo = (await resposta.json()) as {
          tipos?: { codigo: string; nome: string }[];
        };
        return corpo.tipos ?? [];
      })
      .then((lista) => {
        if (!cancelado) setTipos({ estado: "pronto", lista });
      })
      .catch(() => {
        if (!cancelado) setTipos({ estado: "erro" });
      });
    return () => {
      cancelado = true;
    };
  }, [tentativa]);

  if (tipos.estado === "erro") {
    return (
      <div className="sc-conta__form">
        <Aviso tom="erro">
          Não foi possível carregar os tipos de negócio agora.
        </Aviso>
        <Botao
          variante="secundaria"
          type="button"
          onClick={() => setTentativa((n) => n + 1)}
        >
          Tentar de novo
        </Botao>
      </div>
    );
  }
  if (tipos.estado === "carregando") {
    return (
      <p className="sc-cadastro__nota" role="status">
        Carregando…
      </p>
    );
  }
  return (
    <CadastroDeDonoForm
      tipos={tipos.lista}
      aoCadastrar={enviarCadastro}
      aoAbrirLoja={enviarLoja}
      aoConcluir={aoConcluir}
      {...(linkParaEntrar === undefined ? {} : { linkParaEntrar })}
    />
  );
}
