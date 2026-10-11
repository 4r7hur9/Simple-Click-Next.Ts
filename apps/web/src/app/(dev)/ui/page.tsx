import Image from "next/image";

import { SecoesDaMarca } from "./_secoes/SecoesDaMarca.tsx";
import { SecoesDeControles } from "./_secoes/SecoesDeControles.tsx";
import { SecoesDeDados } from "./_secoes/SecoesDeDados.tsx";
import { SecoesDeRetorno } from "./_secoes/SecoesDeRetorno.tsx";

/**
 * Vitrine do design system: todos os componentes base, em todos os estados que
 * cada um oferece (AC-013).
 *
 * Não é documentação enfeitada — é o alvo da verificação automática de
 * acessibilidade (AC-016). Componente que só aparece aqui em um estado é
 * componente cujos outros estados ninguém nunca olhou, e é assim que "carregando"
 * vira tela branca em produção.
 *
 * A página é renderizada no servidor e não recebe nenhum manipulador de evento:
 * a interação de verdade mora nas telas do produto. Aqui o que importa é a
 * aparência e a árvore de acessibilidade de cada estado. As seções moram em
 * `_secoes/`, pasta privada que o Next não transforma em rota.
 */

/** Página `/ui`: cabeçalho da marca e as seções, na ordem que o axe percorre. */
export default function VitrineDoDesignSystem() {
  return (
    <main
      className="sc-raiz mx-auto flex max-w-4xl min-w-0 flex-col gap-10 overflow-x-clip p-6"
      data-largura-minima="344px"
      data-temas="claro escuro"
    >
      <header className="flex flex-col gap-2">
        <Image
          alt="SimpleClick"
          height={72}
          priority
          src="/brand/logo-primary.svg"
          width={72}
        />
        <h1 className="font-display text-2xl font-semibold">
          Design system do SimpleClick
        </h1>
        <p>
          Marca, tokens e componentes base nos temas claro e escuro, inclusive
          na largura mínima de 344px.
        </p>
      </header>

      <SecoesDaMarca />
      <SecoesDeControles />
      <SecoesDeDados />
      <SecoesDeRetorno />
    </main>
  );
}
