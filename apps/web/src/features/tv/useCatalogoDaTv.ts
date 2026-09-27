"use client";

/**
 * O catálogo que a televisão mostra, atualizado sozinho (AC-928, AC-929).
 *
 * A TELEVISÃO FICA LIGADA O DIA INTEIRO. Recarregar a página não é opção —
 * ninguém vai até a parede apertar F5 —, então o gancho pergunta à API de
 * tempos em tempos e troca o catálogo quando a resposta chega.
 *
 * QUEDA DE REDE NÃO APAGA O CARDÁPIO. Uma busca que falha mantém o último
 * catálogo recebido no ar e marca `semRede`; a próxima tentativa acontece no
 * intervalo seguinte, e também na hora em que o navegador avisa que a conexão
 * voltou (`online`). Só quando NUNCA houve catálogo é que a tela mostra erro —
 * e continua tentando, porque a rede pode voltar antes de alguém notar.
 *
 * QUEM BUSCA CHEGA POR PARÂMETRO. A prova responde sem rede, e o componente
 * continua sem saber se por trás há HTTP ou memória.
 */
import { useEffect, useRef, useState } from "react";

import type { CatalogoDaVitrineNoContrato } from "@simpleclick/contracts";

import {
  buscarCatalogoDaLoja,
  type ResultadoDoCatalogoNoNavegador,
} from "../../lib/catalogo-do-navegador.ts";

/**
 * Quantos segundos entre uma atualização e a próxima.
 *
 * Um minuto: é o prazo que o AC-928 chama de "definido". Menos que isso é
 * pedir o catálogo inteiro de sessenta televisões a cada poucos segundos por
 * uma mudança que acontece algumas vezes por dia.
 */
export const SEGUNDOS_ENTRE_ATUALIZACOES = 60;

/** Quem sabe buscar o catálogo. */
export type BuscadorDeCatalogo = (
  apelido: string,
) => Promise<ResultadoDoCatalogoNoNavegador>;

export interface OpcoesDoCatalogoDaTv {
  readonly apelido: string;
  /** O que o servidor já entregou com a página. Nulo quando ele não conseguiu. */
  readonly catalogoInicial: CatalogoDaVitrineNoContrato | null;
  readonly intervaloEmMs?: number | undefined;
  readonly buscar?: BuscadorDeCatalogo | undefined;
  /** O relógio, para a prova fixar o instante. */
  readonly agora?: (() => number) | undefined;
}

/** O que a tela recebe. */
export interface CatalogoDaTv {
  readonly catalogo: CatalogoDaVitrineNoContrato | null;
  /** Os estados do P-011 que dependem da rede. "vazio" é decisão da tela. */
  readonly situacao: "carregando" | "pronto" | "erro";
  /** O instante da última resposta boa, em milissegundos. */
  readonly atualizadoEm: number | null;
  /** A última tentativa falhou, e a tela mostra o último catálogo recebido. */
  readonly semRede: boolean;
}

export function useCatalogoDaTv({
  apelido,
  catalogoInicial,
  intervaloEmMs = SEGUNDOS_ENTRE_ATUALIZACOES * 1000,
  buscar = buscarCatalogoDaLoja,
  agora = Date.now,
}: OpcoesDoCatalogoDaTv): CatalogoDaTv {
  const [catalogo, setCatalogo] = useState(catalogoInicial);
  const [atualizadoEm, setAtualizadoEm] = useState<number | null>(
    catalogoInicial === null ? null : agora(),
  );
  const [semRede, setSemRede] = useState(false);
  // Falhou pelo menos uma vez sem nunca ter tido catálogo: é o estado de erro.
  const [falhouSemCatalogo, setFalhouSemCatalogo] = useState(false);
  const buscando = useRef(false);

  useEffect(() => {
    let montado = true;

    const atualizar = async (): Promise<void> => {
      // Uma busca por vez: a resposta atrasada de uma não pode passar por
      // cima da resposta nova da outra.
      if (buscando.current) return;
      buscando.current = true;
      try {
        const resultado = await buscar(apelido);
        if (!montado) return;
        if (resultado.estado === "encontrado") {
          setCatalogo(resultado.catalogo);
          setAtualizadoEm(agora());
          setSemRede(false);
          setFalhouSemCatalogo(false);
        } else {
          setSemRede(true);
          setFalhouSemCatalogo((tinha) => tinha || catalogoInicial === null);
        }
      } finally {
        buscando.current = false;
      }
    };

    // Sem catálogo do servidor, a primeira busca é imediata: a tela não pode
    // ficar um intervalo inteiro em "carregando" só porque a página abriu num
    // instante ruim da rede.
    if (catalogoInicial === null) void atualizar();

    const relogio = setInterval(() => {
      void atualizar();
    }, intervaloEmMs);

    const aoVoltarARede = (): void => {
      void atualizar();
    };
    window.addEventListener("online", aoVoltarARede);

    return () => {
      montado = false;
      clearInterval(relogio);
      window.removeEventListener("online", aoVoltarARede);
    };
  }, [apelido, catalogoInicial, intervaloEmMs, buscar, agora]);

  const situacao: CatalogoDaTv["situacao"] =
    catalogo !== null ? "pronto" : falhouSemCatalogo ? "erro" : "carregando";

  return { catalogo, situacao, atualizadoEm, semRede };
}
