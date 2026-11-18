"use client";

/**
 * Busca, forma de receber, ordem e localização do feed (card #37).
 *
 * Tudo vira endereço (`enderecoDoFeed`): a página do servidor relê e busca de
 * novo. A localização só é pedida quando a pessoa pede "Mais perto" (no botão
 * ou na ordem) e fica guardada neste navegador, arredondada a ~100 m, para a
 * próxima visita já sair ordenada sem perguntar outra vez. Sem ela, o feed
 * segue por relevância e a tela diz por quê.
 *
 * Card #128 (Stitch): no celular, a busca é o campo largo do alto da página,
 * com o botão "Filtros" ao lado; no computador a busca mora no topo do site e
 * aqui fica só o "Filtros", na linha dos segmentos. Forma de receber, ordem e
 * localização moram atrás dele, que mostra quantos estão ligados.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  IconeBuscar,
  IconeFechar,
  IconeFiltro,
  IconeLocal,
  Seletor,
} from "@simpleclick/ui";

import {
  arredondarLocal,
  enderecoDoFeed,
  NOME_DA_ORDEM,
  ordensDaAba,
  temLocal,
  type ConsultaDoFeed,
  type EntregaDoFeed,
  type OrdemDoFeed,
} from "./consulta.ts";
import { guardarLocalDoAparelho, lerLocalDoAparelho } from "../usuario/local-do-aparelho.ts";

// A localização do aparelho (consentimento, arredondamento e limpeza) mora em
// `features/usuario/local-do-aparelho.ts`, junto do indicador do topo (card #105).
export { CHAVE_DO_LOCAL } from "../usuario/local-do-aparelho.ts";

type EstadoDoLocal = "parado" | "pedindo" | "negado" | "sem-suporte";

const ENTREGAS: readonly { readonly valor: EntregaDoFeed | undefined; readonly rotulo: string }[] = [
  { valor: undefined, rotulo: "Todas" },
  { valor: "entrega", rotulo: "Entrega" },
  { valor: "retirada", rotulo: "Retirada" },
];

export function BarraDoFeed({ consulta }: { readonly consulta: ConsultaDoFeed }) {
  const router = useRouter();
  const [busca, setBusca] = useState(consulta.busca ?? "");
  const [estadoDoLocal, setEstadoDoLocal] = useState<EstadoDoLocal>("parado");
  const [aberta, setAberta] = useState(false);

  const jaTentou = useRef(false);
  const comLocal = temLocal(consulta);

  useEffect(() => setBusca(consulta.busca ?? ""), [consulta.busca]);

  function irPara(mudancas: Parameters<typeof enderecoDoFeed>[1], substituir = false) {
    const destino = enderecoDoFeed(consulta, mudancas);
    if (substituir) router.replace(destino, { scroll: false });
    else router.push(destino, { scroll: false });
  }

  function pedirLocal(ordem: OrdemDoFeed = "distancia", substituir = false) {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setEstadoDoLocal("sem-suporte");
      return;
    }
    setEstadoDoLocal("pedindo");
    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        const local = {
          lat: arredondarLocal(posicao.coords.latitude),
          lng: arredondarLocal(posicao.coords.longitude),
        };
        guardarLocalDoAparelho(local);
        setEstadoDoLocal("parado");
        irPara({ ...local, ordem }, substituir);
      },
      () => setEstadoDoLocal("negado"),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 10 * 60_000 },
    );
  }

  // Ao abrir: localização já guardada (com consentimento) entra sozinha, sem
  // perguntar de novo. O navegador NUNCA pede a localização ao abrir — nem
  // com "Mais perto" no endereço: só quando a pessoa toca no botão.
  useEffect(() => {
    if (comLocal || jaTentou.current) return;
    jaTentou.current = true;
    const guardado = lerLocalDoAparelho();
    if (guardado !== null) {
      irPara({ ...guardado, pagina: consulta.pagina }, true);
    }
    // Só na chegada: depois, quem muda é a própria pessoa.
  }, []);

  function buscar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    irPara({ busca: busca.trim() === "" ? undefined : busca.trim() });
  }

  function mudarOrdem(ordem: OrdemDoFeed) {
    if (ordem === "distancia" && !comLocal) pedirLocal("distancia");
    else irPara({ ordem });
  }

  function esquecerLocal() {
    guardarLocalDoAparelho(null);
    setEstadoDoLocal("parado");
    irPara({
      lat: undefined,
      lng: undefined,
      ordem: consulta.ordem === "distancia" ? "relevancia" : consulta.ordem,
    });
  }

  const textoDoLocal =
    estadoDoLocal === "pedindo"
      ? "Procurando você…"
      : estadoDoLocal === "negado"
        ? "Sem acesso à sua localização: mostramos por relevância. Libere o acesso no navegador para ver o que está perto."
        : estadoDoLocal === "sem-suporte"
          ? "Este navegador não informa a localização: mostramos por relevância."
          : consulta.ordem === "distancia" && !comLocal
            ? "Para ordenar por distância, precisamos da sua localização."
            : null;

  const ligados =
    (consulta.entrega === undefined ? 0 : 1) +
    (consulta.ordem === "relevancia" ? 0 : 1) +
    (comLocal ? 1 : 0) +
    (consulta.busca === undefined ? 0 : 1) +
    (consulta.atacado ? 1 : 0);

  return (
    <div className="sc-feed__barra" data-aberta={aberta || undefined}>
      <button
        type="button"
        className="sc-feed__abrir-filtros"
        aria-expanded={aberta}
        aria-controls="sc-feed-filtros"
        onClick={() => setAberta((a) => !a)}
      >
        <IconeFiltro aria-hidden="true" size={18} />
        <span className="sc-feed__abrir-rotulo">Filtros</span>
        {ligados > 0 ? (
          <span className="sc-feed__contagem" aria-label={`${ligados} ligados`}>
            {ligados}
          </span>
        ) : null}
      </button>

      <form role="search" className="sc-feed__busca" onSubmit={buscar}>
        <label className="sc-feed__oculto" htmlFor="sc-feed-busca">
          {consulta.aba === "produtos" ? "Buscar produtos" : "Buscar lojas"}
        </label>
        <IconeBuscar aria-hidden="true" className="sc-feed__busca-icone" />
        <input
          id="sc-feed-busca"
          type="search"
          name="busca"
          maxLength={80}
          autoComplete="off"
          placeholder={
            consulta.aba === "produtos"
              ? "O que você procura hoje?"
              : "Buscar lojas pelo nome ou bairro"
          }
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        {consulta.busca ? (
          <button
            type="button"
            className="sc-feed__limpar"
            aria-label="Limpar busca"
            onClick={() => {
              setBusca("");
              irPara({ busca: undefined });
            }}
          >
            <IconeFechar aria-hidden="true" />
          </button>
        ) : null}
        <button type="submit" className="sc-feed__buscar">
          Buscar
        </button>
      </form>

      <div className="sc-feed__controles" id="sc-feed-filtros">
        <div className="sc-feed__grupo" role="group" aria-label="Como receber">
          {ENTREGAS.map((opcao) => (
            <button
              key={opcao.rotulo}
              type="button"
              className="sc-feed__pilula"
              aria-pressed={consulta.entrega === opcao.valor}
              onClick={() => irPara({ entrega: opcao.valor })}
            >
              {opcao.rotulo}
            </button>
          ))}
        </div>

        {consulta.aba === "produtos" ? (
          // Card #59: só produtos com preço de atacado; fica no endereço.
          <button
            type="button"
            className="sc-feed__pilula"
            aria-pressed={consulta.atacado === true}
            onClick={() => irPara({ atacado: !consulta.atacado })}
            title="Mostrar só produtos com preço de atacado"
          >
            Atacado
          </button>
        ) : null}

        <label className="sc-feed__ordem">
          <span>Ordenar</span>
          <Seletor
            value={consulta.ordem}
            onChange={(valor) => mudarOrdem(valor as OrdemDoFeed)}
          >
            {ordensDaAba(consulta.aba).map((ordem) => (
              <option key={ordem} value={ordem}>
                {NOME_DA_ORDEM[ordem]}
              </option>
            ))}
          </Seletor>
        </label>

        {comLocal ? (
          <button
            type="button"
            className="sc-feed__pilula sc-feed__pilula--local"
            aria-pressed="true"
            onClick={esquecerLocal}
            title="Parar de usar sua localização"
          >
            <IconeLocal aria-hidden="true" /> Perto de você
            <IconeFechar aria-hidden="true" className="sc-feed__pilula-x" />
          </button>
        ) : (
          <>
            <button
              type="button"
              className="sc-feed__pilula sc-feed__pilula--local"
              aria-describedby="sc-feed-finalidade"
              onClick={() => pedirLocal()}
              disabled={estadoDoLocal === "pedindo"}
            >
              <IconeLocal aria-hidden="true" /> Perto de mim
            </button>
            <p id="sc-feed-finalidade" className="sc-feed__finalidade">
              Usamos sua localização só para mostrar o que está mais perto. Guardamos uma
              posição aproximada (cerca de 100 m) neste aparelho, e você pode apagá-la quando quiser.
            </p>
          </>
        )}
      </div>

      {textoDoLocal === null ? null : (
        <p className="sc-feed__aviso" role="status">
          {textoDoLocal}
        </p>
      )}
    </div>
  );
}
