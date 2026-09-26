"use client";
/**
 * Carregar e salvar uma seção da configuração da loja (AC-923).
 *
 * TODA TELA DE CONFIGURAÇÃO PASSA POR AQUI, e é isso que faz a recusa ser a
 * mesma em todas: quando a API recusa, a tela recebe um problema por campo e
 * diz, com todas as letras, que NADA foi salvo e que a configuração anterior
 * continua valendo. "Não foi possível salvar" sem dizer o que ficou valendo
 * deixa o dono sem saber se a loja está com o valor novo, o velho ou metade
 * de cada um.
 *
 * Depois de salvar, a seção é LIDA DE NOVO. O que aparece na tela passa a ser
 * o que o servidor guardou — o WhatsApp já normalizado, a chave PIX sem os
 * pontos —, e não o que a pessoa digitou.
 */
import { useCallback, useEffect, useState } from "react";
import {
  esquemaDaRecusaDeConfiguracao,
  problemasPorCampo,
  type SecaoDoDono,
} from "@simpleclick/contracts";

/** Os quatro estados da tela (P-011), mais o de quem está salvando. */
export type FaseDaSecao = "carregando" | "pronta" | "falhou";

/** O que a tela precisa para desenhar e salvar uma seção. */
export interface SecaoNaTela<T> {
  readonly dados: T;
  readonly mudar: (atualizar: (anterior: T) => T) => void;
  readonly fase: FaseDaSecao;
  readonly salvando: boolean;
  /** Frase do estado atual, para a região de status da tela. */
  readonly mensagem: string;
  /** Um problema por campo, pelo caminho que a API usa ("pix.chave"). */
  readonly erros: Readonly<Record<string, string>>;
  /** Marca problemas encontrados na própria tela, antes de ir à rede. */
  readonly apontar: (erros: Readonly<Record<string, string>>) => void;
  /**
   * Envia o corpo; verdadeiro quando a API aceitou. A frase de sucesso pode
   * ser trocada por uma que diga o que mudou para o cliente.
   */
  readonly salvar: (
    corpo: unknown,
    mensagemDeSucesso?: string,
  ) => Promise<boolean>;
}

/** As frases que mudam de uma seção para outra. */
export interface TextosDaSecao {
  readonly carregando: string;
  readonly carregada: string;
  readonly salva: string;
}

/** A frase de quando a API recusa: o que fazer, e o que ficou valendo. */
export const MENSAGEM_DE_RECUSA =
  "Nada foi salvo. Corrija os campos marcados — a configuração anterior continua valendo.";

/** A frase de quando a gravação falha por outro motivo. */
export const MENSAGEM_DE_FALHA =
  "Não foi possível salvar agora. A configuração anterior continua valendo.";

/** O endereço que o site usa para falar da seção com a API. */
export function enderecoDaSecao(secao: SecaoDoDono): string {
  return `/api/loja/${secao}`;
}

export function useSecao<T>(
  secao: SecaoDoDono,
  inicial: T,
  interpretar: (bruto: unknown) => T,
  textos: TextosDaSecao,
): SecaoNaTela<T> {
  const [dados, setDados] = useState<T>(inicial);
  const [fase, setFase] = useState<FaseDaSecao>("carregando");
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState(textos.carregando);
  const [erros, setErros] = useState<Readonly<Record<string, string>>>({});

  const carregar = useCallback(async (): Promise<boolean> => {
    try {
      const resposta = await fetch(enderecoDaSecao(secao), {
        cache: "no-store",
      });
      if (!resposta.ok) throw new Error(String(resposta.status));
      setDados(interpretar(await resposta.json()));
      setFase("pronta");
      return true;
    } catch {
      setFase("falhou");
      setMensagem(
        "Não foi possível carregar esta configuração. Entre novamente para editá-la.",
      );
      return false;
    }
  }, [secao, interpretar]);

  useEffect(() => {
    void carregar().then((ok) => {
      if (ok) setMensagem(textos.carregada);
    });
  }, [carregar, textos.carregada]);

  const salvar = useCallback(
    async (corpo: unknown, mensagemDeSucesso?: string): Promise<boolean> => {
      setSalvando(true);
      setMensagem("Salvando…");
      try {
        const resposta = await fetch(enderecoDaSecao(secao), {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(corpo),
        });

        if (resposta.ok) {
          setErros({});
          await carregar();
          setMensagem(mensagemDeSucesso ?? textos.salva);
          return true;
        }

        const recusa = esquemaDaRecusaDeConfiguracao.safeParse(
          await resposta.json().catch(() => null),
        );
        if (resposta.status === 400 && recusa.success) {
          setErros(problemasPorCampo(recusa.data.campos));
          setMensagem(MENSAGEM_DE_RECUSA);
          return false;
        }
        setMensagem(MENSAGEM_DE_FALHA);
        return false;
      } catch {
        setMensagem(MENSAGEM_DE_FALHA);
        return false;
      } finally {
        setSalvando(false);
      }
    },
    [secao, carregar, textos.salva],
  );

  const mudar = useCallback((atualizar: (anterior: T) => T) => {
    setDados((anterior) => atualizar(anterior));
  }, []);

  const apontar = useCallback(
    (encontrados: Readonly<Record<string, string>>) => {
      setErros(encontrados);
      setMensagem(MENSAGEM_DE_RECUSA);
    },
    [],
  );

  return {
    dados,
    mudar,
    fase,
    salvando,
    mensagem,
    erros,
    apontar,
    salvar,
  };
}
