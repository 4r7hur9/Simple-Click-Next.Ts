"use client";

import { useState, type ChangeEvent } from "react";
import { Campo, type CampoProps } from "./campo";
import { descritoresDoCampo } from "./campo-descritores";
import { IconeMostrar, IconeOcultar } from "./icones";

/**
 * Campo de senha: o campo base com o botão de mostrar e, quando a senha é
 * nova, o medidor de força.
 *
 * O botão de mostrar tem nome fixo ("Mostrar senha") e diz se está ligado por
 * `aria-pressed` — trocar o nome a cada clique faz o leitor de tela anunciar um
 * botão diferente do que a pessoa acabou de apertar.
 *
 * O medidor tem dois sinais: as barras, para quem olha, e uma frase em
 * `aria-live`, para quem ouve. A cor das barras nunca é o único sinal.
 */

/** 0 é senha vazia; de 1 (fraca) a 4 (forte). */
export type NivelDeForca = 0 | 1 | 2 | 3 | 4;

export type ForcaDaSenha = {
  nivel: NivelDeForca;
  /** "fraca", "média", "boa" ou "forte"; vazio quando não há senha. */
  rotulo: string;
};

const ROTULOS_DA_FORCA = ["", "fraca", "média", "boa", "forte"] as const;

/** Nível mais alto do medidor: é também quantas barras ele desenha. */
export const NIVEL_MAXIMO_DE_FORCA = 4;

/**
 * Mede a senha por tamanho e variedade de caracteres.
 *
 * Os pontos podem passar do teto (tamanho longo E todas as variedades), e por
 * isso o nível é limitado a 4. Sem o limite, a senha MAIS forte caía fora da
 * lista de rótulos e o medidor esvaziava justamente nela.
 */
export function avaliarForcaDaSenha(senha: string): ForcaDaSenha {
  if (senha.length === 0) return { nivel: 0, rotulo: "" };

  let pontos = 0;
  if (senha.length >= 8) pontos++;
  if (/[a-z]/.test(senha) && /[A-Z]/.test(senha)) pontos++;
  if (/\d/.test(senha)) pontos++;
  if (/[^A-Za-z0-9]/.test(senha)) pontos++;
  if (senha.length >= 12) pontos++;

  // Senha curta não passa de média, por mais variada que seja.
  const teto = senha.length < 8 ? 2 : NIVEL_MAXIMO_DE_FORCA;
  const nivel = Math.min(Math.max(pontos, 1), teto) as NivelDeForca;
  return { nivel, rotulo: ROTULOS_DA_FORCA[nivel] };
}

export type CampoDeSenhaProps = Omit<CampoProps, "type" | "controle"> & {
  /** Desenha o medidor de força. Use em senha nova, nunca no login. */
  mostrarForca?: boolean | undefined;
  /** Nome do botão de mostrar a senha. */
  rotuloDoOlho?: string | undefined;
  /** Nome do medidor, lido antes do nível: "Força da senha: boa". */
  rotuloDaForca?: string | undefined;
};

/** Campo de senha com botão de mostrar e medidor de força opcional. */
export function CampoDeSenha({
  id,
  mostrarForca = false,
  rotuloDoOlho = "Mostrar senha",
  rotuloDaForca = "Força da senha",
  value,
  defaultValue,
  onChange,
  autoComplete,
  rotulo,
  dica,
  erro,
  sucesso,
  carregando,
  rotuloDeEspera,
  obrigatorio,
  desabilitado,
  className,
  ...entrada
}: CampoDeSenhaProps) {
  const campo = {
    rotulo,
    dica,
    erro,
    sucesso,
    carregando,
    rotuloDeEspera,
    obrigatorio,
    desabilitado,
    className,
  };
  const [visivel, setVisivel] = useState(false);
  const [valorInterno, setValorInterno] = useState(
    typeof defaultValue === "string" ? defaultValue : "",
  );
  const valor = value !== undefined ? String(value) : valorInterno;
  const forca = avaliarForcaDaSenha(valor);

  const idForca = `${id}-forca`;
  const idNomeDaForca = `${id}-forca-nome`;
  const descritores = descritoresDoCampo(id, campo);
  const Olho = visivel ? IconeOcultar : IconeMostrar;

  function aoMudar(evento: ChangeEvent<HTMLInputElement>) {
    if (value === undefined) setValorInterno(evento.target.value);
    onChange?.(evento);
  }

  const controle = (
    <>
      <div className="sc-senha">
        <input
          {...entrada}
          id={id}
          type={visivel ? "text" : "password"}
          className="sc-campo__controle sc-senha__controle"
          value={value}
          defaultValue={value === undefined ? defaultValue : undefined}
          onChange={aoMudar}
          autoComplete={
            autoComplete ?? (mostrarForca ? "new-password" : "current-password")
          }
          spellCheck={false}
          autoCapitalize="none"
          disabled={desabilitado}
          required={obrigatorio || undefined}
          aria-invalid={erro !== undefined || undefined}
          aria-describedby={
            descritores.length > 0 ? descritores.join(" ") : undefined
          }
        />
        <button
          type="button"
          className="sc-senha__olho"
          aria-pressed={visivel}
          aria-controls={id}
          disabled={desabilitado}
          onClick={() => setVisivel((atual) => !atual)}
        >
          <Olho />
          <span className="sc-so-leitor">{rotuloDoOlho}</span>
        </button>
      </div>

      {mostrarForca && (
        <div className="sc-senha__forca">
          <span className="sc-so-leitor" id={idNomeDaForca}>
            {rotuloDaForca}
          </span>
          <div
            role="meter"
            className="sc-senha__medidor"
            data-nivel={forca.nivel}
            aria-labelledby={idNomeDaForca}
            aria-valuemin={0}
            aria-valuemax={NIVEL_MAXIMO_DE_FORCA}
            aria-valuenow={forca.nivel}
            aria-valuetext={forca.rotulo || "sem senha"}
          >
            {Array.from({ length: NIVEL_MAXIMO_DE_FORCA }, (_, indice) => (
              <span
                key={indice}
                className="sc-senha__barra"
                data-cheia={indice < forca.nivel || undefined}
              />
            ))}
          </div>
          <p className="sc-senha__nivel" id={idForca} aria-live="polite">
            {forca.nivel > 0 && `${rotuloDaForca}: ${forca.rotulo}`}
          </p>
        </div>
      )}
    </>
  );

  return <Campo {...campo} id={id} controle={controle} />;
}
