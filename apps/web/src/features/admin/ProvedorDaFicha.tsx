"use client";

/**
 * A ficha da loja, buscada UMA vez e repartida entre o cabeçalho e as abas
 * (card #29). Cada abertura da ficha entra na trilha de auditoria (AC-118);
 * cada aba que buscasse a ficha por conta própria encheria a trilha de
 * consultas repetidas. Quem muda a ficha (aprovar, desativar, salvar o
 * cadastro) devolve a ficha nova por `atualizar`, e todo mundo a enxerga.
 */

import {
  esquemaDaFichaDaLoja,
  type FichaDaLojaNoContrato,
} from "@simpleclick/contracts";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  lerDaApi,
  MENSAGEM_DE_FALHA_DA_ADMINISTRACAO,
} from "./apresentacao.ts";
import type { EstadoDaFicha } from "./FichaLoja.tsx";

interface ContextoDaFicha {
  readonly estado: EstadoDaFicha;
  readonly atualizar: (ficha: FichaDaLojaNoContrato) => void;
  readonly recarregar: () => void;
}

const Contexto = createContext<ContextoDaFicha | null>(null);

/** A ficha atual e o jeito de trocá-la. Só vale dentro do provedor. */
export function useFichaDaLoja(): ContextoDaFicha {
  const contexto = useContext(Contexto);
  if (contexto === null) {
    throw new Error("useFichaDaLoja precisa de ProvedorDaFicha.");
  }
  return contexto;
}

export function ProvedorDaFicha({
  lojaId,
  children,
}: {
  readonly lojaId: string;
  readonly children: ReactNode;
}) {
  const [estado, setEstado] = useState<EstadoDaFicha>({ fase: "carregando" });
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let vivo = true;
    setEstado({ fase: "carregando" });
    void lerDaApi(
      `/api/admin/lojas/${encodeURIComponent(lojaId)}`,
      (corpo) => esquemaDaFichaDaLoja.parse(corpo),
      "Não foi possível carregar a ficha agora. Tente de novo em instantes.",
    ).then((leitura) => {
      if (!vivo) return;
      if (leitura.fase === "pronta") {
        setEstado({ fase: "pronta", ficha: leitura.dados });
      } else if (leitura.fase === "nao-encontrada") {
        setEstado({ fase: "nao-encontrada" });
      } else {
        setEstado({
          fase: "erro",
          mensagem: leitura.mensagem || MENSAGEM_DE_FALHA_DA_ADMINISTRACAO,
        });
      }
    });
    return () => {
      vivo = false;
    };
  }, [lojaId, tentativa]);

  const atualizar = useCallback(
    (ficha: FichaDaLojaNoContrato) => setEstado({ fase: "pronta", ficha }),
    [],
  );
  const recarregar = useCallback(() => setTentativa((n) => n + 1), []);
  const valor = useMemo(
    () => ({ estado, atualizar, recarregar }),
    [estado, atualizar, recarregar],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}
