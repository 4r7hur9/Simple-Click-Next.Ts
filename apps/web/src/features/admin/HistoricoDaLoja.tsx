"use client";

/**
 * A aba "Histórico" da ficha (card #29): as últimas alterações da loja, com a
 * trilha como a API a guarda. O histórico completo mora na auditoria.
 */

import { Botao, Cartao, Carregando, Erro } from "@simpleclick/ui";
import Link from "next/link";

import { ListaDaTrilha } from "./ListaDaTrilha.tsx";
import { useFichaDaLoja } from "./ProvedorDaFicha.tsx";

export function HistoricoDaLoja() {
  const { estado, recarregar } = useFichaDaLoja();
  if (estado.fase === "carregando") {
    return <Carregando rotulo="Carregando o histórico…" />;
  }
  if (estado.fase === "erro") {
    return (
      <Erro
        titulo="O histórico não carregou"
        mensagem={estado.mensagem}
        acao={
          <Botao variante="secundaria" onClick={recarregar}>
            Tentar de novo
          </Botao>
        }
      />
    );
  }
  if (estado.fase !== "pronta") return null;
  const { ficha } = estado;
  return (
    <Cartao
      titulo="Histórico de alterações"
      nivelDoTitulo={2}
      descricao="As alterações mais recentes desta loja, da mais nova para a mais antiga."
      estado={ficha.historico.length === 0 ? "vazio" : "pronto"}
      tituloVazio="Nenhuma alteração registrada ainda"
      rodape={
        <Link
          className="text-sm font-medium text-[var(--cor-primaria-texto)] underline-offset-2 hover:underline"
          href={`/admin/auditoria?loja=${ficha.id}`}
        >
          Ver o histórico completo desta loja
        </Link>
      }
    >
      <ListaDaTrilha registros={ficha.historico} />
    </Cartao>
  );
}
