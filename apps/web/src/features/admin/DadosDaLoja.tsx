"use client";

/**
 * A aba "Cadastro" da ficha (card #29): os dados da loja, o endereço na web,
 * o tipo de negócio e a exclusão. Ativar e desativar ficam no cabeçalho.
 */

import { Botao, Cartao, Carregando, Erro } from "@simpleclick/ui";
import type { ReactNode } from "react";

import { AcoesLoja } from "./AcoesLoja.tsx";
import { EnderecoDaLoja } from "./EnderecoDaLoja.tsx";
import { CadastroDaLoja } from "./FichaLoja.tsx";
import { useFichaDaLoja } from "./ProvedorDaFicha.tsx";
import { SeletorVertical } from "./SeletorVertical.tsx";

function Secao({
  id,
  titulo,
  children,
}: {
  readonly id: string;
  readonly titulo: string;
  readonly children: ReactNode;
}) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-2xl font-semibold tracking-[-0.02em]">
        {titulo}
      </h2>
      <div className="mt-4">
        <Cartao>{children}</Cartao>
      </div>
    </section>
  );
}

export function DadosDaLoja() {
  const { estado, atualizar, recarregar } = useFichaDaLoja();
  if (estado.fase === "carregando") {
    return <Carregando rotulo="Carregando o cadastro…" />;
  }
  if (estado.fase !== "pronta") {
    // O cabeçalho já explica o que houve; aqui só se oferece tentar de novo.
    return estado.fase === "erro" ? (
      <Erro
        titulo="O cadastro não carregou"
        mensagem={estado.mensagem}
        acao={
          <Botao variante="secundaria" onClick={recarregar}>
            Tentar de novo
          </Botao>
        }
      />
    ) : null;
  }
  const { ficha } = estado;
  return (
    <div className="grid gap-10">
      <Secao id="ficha-cadastro" titulo="Dados da loja">
        <CadastroDaLoja ficha={ficha} aoSalvar={atualizar} />
      </Secao>
      <Secao id="ficha-endereco" titulo="Endereço na web">
        <EnderecoDaLoja ficha={ficha} aoTrocar={atualizar} />
      </Secao>
      <Secao id="ficha-tipo" titulo="Tipo de negócio">
        <SeletorVertical ficha={ficha} aoTrocar={atualizar} />
      </Secao>
      <Secao id="ficha-exclusao" titulo="Excluir a loja">
        <AcoesLoja ficha={ficha} aoMudar={atualizar} somenteExclusao />
      </Secao>
    </div>
  );
}
