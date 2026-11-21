"use client";

/**
 * O indicador de localização do topo (card #105): diz a partir de onde as
 * lojas estão sendo contadas.
 *
 * - Com localização aproximada autorizada: "Perto de você".
 * - Sem ela, com endereço padrão na conta: "Cidade, UF" (lida no servidor; só
 *   cidade e UF chegam aqui).
 * - Sem nenhuma das duas: "Definir localização".
 *
 * O RÓTULO e a ORDEM do feed são duas coisas: um endereço padrão (sem
 * coordenada) mostra a cidade, mas a ordem "Mais perto" continua pedindo a
 * localização aproximada. O navegador SÓ pede a localização quando a pessoa
 * toca em "Usar minha localização", depois de ler para que ela serve. A
 * coordenada é arredondada e só fica no aparelho com consentimento de cookies
 * funcionais (`local-do-aparelho.ts`).
 */
import { IconeLocal, IconeSeta } from "@simpleclick/ui";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { enderecoDoFeed, lerConsulta } from "../feed/consulta.ts";
import {
  apagarAoRecusarOConsentimento,
  guardarLocalDoAparelho,
  lerLocalDoAparelho,
  podeGuardarLocal,
  type LocalDoAparelho,
} from "./local-do-aparelho.ts";

export interface LocalizacaoDoTopoProps {
  /** A cidade do endereço padrão (lida no servidor), se houver. */
  readonly cidade: { readonly cidade: string; readonly uf: string } | null;
}

type Estado = "parado" | "pedindo" | "negado" | "sem-suporte";

export const ROTULO_PERTO_DE_VOCE = "Perto de você";
export const ROTULO_DEFINIR_LOCALIZACAO = "Definir localização";

/** O texto do botão pela situação (função pura, provada nos testes). */
export function rotuloDaLocalizacao(
  coordenada: LocalDoAparelho | null,
  cidade: LocalizacaoDoTopoProps["cidade"],
): string {
  if (coordenada !== null) return ROTULO_PERTO_DE_VOCE;
  if (cidade !== null) return `${cidade.cidade}, ${cidade.uf}`;
  return ROTULO_DEFINIR_LOCALIZACAO;
}

export function LocalizacaoDoTopo({ cidade }: LocalizacaoDoTopoProps) {
  const caminho = usePathname();
  const roteador = useRouter();
  const idDoPainel = useId();
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const [coordenada, setCoordenada] = useState<LocalDoAparelho | null>(null);
  const [aberto, setAberto] = useState(false);
  const [estado, setEstado] = useState<Estado>("parado");

  // Só no navegador: o HTML do servidor sempre sai com a cidade (ou o convite).
  useEffect(() => {
    setCoordenada(lerLocalDoAparelho());
    return apagarAoRecusarOConsentimento(() => setCoordenada(null));
  }, []);

  useEffect(() => {
    if (!aberto) return;
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key !== "Escape") return;
      setAberto(false);
      botao.current?.focus();
    }
    function aoClicar(evento: PointerEvent) {
      const alvo = evento.target;
      if (alvo instanceof Node && raiz.current?.contains(alvo)) return;
      setAberto(false);
    }
    document.addEventListener("keydown", aoTeclar);
    document.addEventListener("pointerdown", aoClicar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.removeEventListener("pointerdown", aoClicar);
    };
  }, [aberto]);

  /** Em /explorar, a lista passa a usar (ou deixa de usar) a nova coordenada. */
  function atualizarOFeed(local: LocalDoAparelho | null) {
    if (caminho === null || !caminho.startsWith("/explorar")) return;
    const aba = caminho.startsWith("/explorar/lojas") ? "lojas" : "produtos";
    const consulta = lerConsulta(
      aba,
      Object.fromEntries(new URLSearchParams(window.location.search)),
    );
    roteador.replace(
      enderecoDoFeed(consulta, {
        lat: local?.lat,
        lng: local?.lng,
        pagina: 1,
        // Na vitrine mista (/explorar) a região fica nela (card #152).
        ...(caminho === "/explorar" ? { inicio: true } : {}),
      }),
      { scroll: false },
    );
  }

  function pedir() {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setEstado("sem-suporte");
      return;
    }
    setEstado("pedindo");
    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        const local = {
          lat: posicao.coords.latitude,
          lng: posicao.coords.longitude,
        };
        guardarLocalDoAparelho(local);
        const guardada = lerLocalDoAparelho();
        setCoordenada(guardada);
        setEstado("parado");
        setAberto(false);
        atualizarOFeed(guardada);
      },
      () => setEstado("negado"),
      { maximumAge: 10 * 60 * 1000, timeout: 10_000 },
    );
  }

  function remover() {
    guardarLocalDoAparelho(null);
    setCoordenada(null);
    setAberto(false);
    atualizarOFeed(null);
  }

  const rotulo = rotuloDaLocalizacao(coordenada, cidade);
  const guardaNoAparelho = podeGuardarLocal();

  return (
    <div ref={raiz} className="sc-local-topo">
      <button
        ref={botao}
        type="button"
        className="sc-local-topo__botao"
        data-navegacao="localizacao"
        aria-expanded={aberto}
        aria-controls={idDoPainel}
        // O nome começa pelo texto que se vê ("Sua região" e o rótulo), para
        // quem comanda pela voz dizer o que lê (WCAG 2.5.3, card #132). Abaixo
        // de 1024px só o rótulo aparece, e ele continua dentro do nome.
        aria-label={`Sua região: ${rotulo}`}
        onClick={() => setAberto((antes) => !antes)}
      >
        <IconeLocal aria-hidden="true" className="sc-local-topo__icone" />
        <span className="sc-local-topo__textos">
          <span className="sc-local-topo__chamada" aria-hidden="true">
            Sua região
          </span>
          {/* Um espaço de verdade entre a chamada e o rótulo: são linhas
              separadas na tela, e sem ele o texto do botão vira "regiãoSão
              Paulo" para quem o lê de máquina (o axe, a voz). */}{" "}
          <span className="sc-local-topo__rotulo">{rotulo}</span>
        </span>
        <IconeSeta aria-hidden="true" className="sc-local-topo__seta" />
      </button>

      <div
        id={idDoPainel}
        className="sc-local-topo__painel"
        hidden={!aberto}
        role="group"
        aria-label="Localização"
      >
        <p className="sc-local-topo__texto">
          Usamos a sua localização aproximada (cerca de 100 metros) só para
          mostrar primeiro as lojas mais perto de você. O navegador só pede a
          permissão quando você toca no botão abaixo.{" "}
          {guardaNoAparelho
            ? "Ela fica guardada neste aparelho, e você pode apagá-la aqui ou ao sair da conta."
            : "Ela vale só até você fechar a página; para lembrar neste aparelho, aceite os cookies funcionais."}
        </p>
        {cidade !== null && coordenada === null && (
          <p className="sc-local-topo__texto">
            Endereço padrão da conta: {cidade.cidade}, {cidade.uf}.
          </p>
        )}
        <div className="sc-local-topo__acoes">
          <button
            type="button"
            className="sc-local-topo__acao sc-local-topo__acao--principal"
            disabled={estado === "pedindo"}
            onClick={pedir}
          >
            {estado === "pedindo" ? "Buscando…" : "Usar minha localização"}
          </button>
          {coordenada !== null && (
            <button
              type="button"
              className="sc-local-topo__acao"
              onClick={remover}
            >
              Remover localização
            </button>
          )}
        </div>
        {estado === "negado" && (
          <p role="status" className="sc-local-topo__aviso">
            Não foi possível usar a localização. Confira a permissão do
            navegador e tente de novo.
          </p>
        )}
        {estado === "sem-suporte" && (
          <p role="status" className="sc-local-topo__aviso">
            Este navegador não oferece localização.
          </p>
        )}
      </div>
    </div>
  );
}
