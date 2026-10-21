/**
 * As imagens da demonstração — desenhadas aqui, nunca baixadas.
 *
 * Cada imagem nasce de um SVG montado em código (fundo em degradê e uma
 * ilustração simples do tipo de produto; o logo leva as iniciais e o nome) e
 * é convertida em WebP pelo `sharp`, o mesmo que o Next já instala. Nada de foto de terceiro: o que o
 * dono vê na vitrine é nosso.
 *
 * ONDE FICAM. Em produção a foto vai para o Cloudinary (decisão D2) e o banco
 * guarda o endereço público. Em desenvolvimento não há credencial de mídia, e o
 * carregador de imagens do site devolve intacto qualquer endereço que não seja
 * do Cloudinary — então o arquivo vai para `apps/web/public/demo/` e o banco
 * guarda `/demo/...`, que o próprio Next serve.
 *
 * O `sharp` não é dependência deste pacote: ele é resolvido a partir do `next`
 * de `apps/web`, para não mexer no lockfile só por causa da demonstração.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
export const PASTA_PUBLICA = resolve(RAIZ, "apps/web/public");
export const PREFIXO_PUBLICO = "/demo";

type Sharp = (entrada: Buffer) => {
  webp(opcoes: { quality: number }): { toBuffer(): Promise<Buffer> };
};

let sharpCarregado: Sharp | null = null;

function carregarSharp(): Sharp {
  if (sharpCarregado !== null) return sharpCarregado;
  const doSite = createRequire(resolve(RAIZ, "apps/web/package.json"));
  const doNext = createRequire(doSite.resolve("next/package.json"));
  sharpCarregado = doNext("sharp") as Sharp;
  return sharpCarregado;
}

// ---------------------------------------------------------------------------
// Ilustrações (caixa de 1200 × 1200, centro em 600 × 520)
// ---------------------------------------------------------------------------

export type Ilustracao =
  | "pastel"
  | "pastel-doce"
  | "coxinha"
  | "esfiha"
  | "kibe"
  | "porcao"
  | "lata"
  | "copo"
  | "garrafa"
  | "tigela"
  | "brigadeiro"
  | "combo"
  | "camiseta"
  | "polo"
  | "calca"
  | "bermuda"
  | "moletom"
  | "jaqueta"
  | "vestido"
  | "bone"
  | "cinto"
  | "bolsa"
  | "oculos"
  | "tenis"
  | "meia"
  // Card #50: os tipos de negócio novos.
  // comida
  | "pizza"
  | "hamburguer"
  | "batata-frita"
  | "marmita"
  | "salada"
  | "prato"
  | "pao"
  | "bolo"
  | "croissant"
  | "xicara"
  | "sorvete"
  | "picole"
  | "vinho"
  | "cerveja"
  | "gelo"
  // mercado e farmácia
  | "fruta"
  | "folhas"
  | "cesta"
  | "pacote"
  | "ovos"
  | "frasco"
  | "caixa"
  | "bisnaga"
  | "curativo"
  // pet e flores
  | "racao"
  | "osso"
  | "coleira"
  | "buque"
  | "vaso-planta"
  // cosméticos
  | "perfume"
  | "batom"
  // calçados
  | "sandalia"
  | "bota"
  | "sapato"
  | "chinelo"
  // tabacaria (só acessórios, sem gente e sem apelo a menor)
  | "isqueiro"
  | "narguile"
  | "charuto"
  | "seda"
  | "carvao"
  // papelaria e livros
  | "caderno"
  | "lapis"
  | "mochila"
  | "livro"
  | "livros"
  // eletrônicos
  | "celular"
  | "fone"
  | "carregador"
  | "caixa-som"
  // brinquedos
  | "urso"
  | "blocos"
  | "carrinho"
  | "bola"
  // construção, casa e autopeças
  | "martelo"
  | "furadeira"
  | "lata-tinta"
  | "parafuso"
  | "lampada"
  | "caneca"
  | "pote"
  | "pneu"
  | "galao-oleo"
  | "capacete"
  | "bateria";

const SOMBRA = `<ellipse cx="600" cy="840" rx="330" ry="38" fill="#000" opacity=".12"/>`;

function desenhar(tipo: Ilustracao, cor: string, detalhe: string): string {
  switch (tipo) {
    case "pastel":
      return `${SOMBRA}
        <path d="M250 720 Q600 220 950 720 Z" fill="${cor}" stroke="${detalhe}" stroke-width="14" stroke-linejoin="round"/>
        <path d="M262 712 L938 712" stroke="${detalhe}" stroke-width="22" stroke-dasharray="6 34" stroke-linecap="round"/>
        <circle cx="470" cy="560" r="16" fill="${detalhe}" opacity=".35"/>
        <circle cx="640" cy="500" r="12" fill="${detalhe}" opacity=".35"/>
        <circle cx="730" cy="610" r="14" fill="${detalhe}" opacity=".35"/>`;
    case "pastel-doce":
      return `${desenhar("pastel", cor, detalhe)}
        <path d="M380 600 Q600 420 820 600" stroke="#fff" stroke-width="16" fill="none" stroke-linecap="round" opacity=".85"/>
        <circle cx="520" cy="560" r="10" fill="#fff"/><circle cx="680" cy="540" r="10" fill="#fff"/>`;
    case "coxinha":
      return `${SOMBRA}
        <path d="M600 260 C700 400 840 560 800 700 C770 800 430 800 400 700 C360 560 500 400 600 260 Z" fill="${cor}" stroke="${detalhe}" stroke-width="14"/>
        <circle cx="520" cy="560" r="12" fill="${detalhe}" opacity=".4"/>
        <circle cx="660" cy="620" r="10" fill="${detalhe}" opacity=".4"/>
        <circle cx="600" cy="460" r="9" fill="${detalhe}" opacity=".4"/>`;
    case "esfiha":
      return `${SOMBRA}
        <path d="M600 300 L860 740 L340 740 Z" fill="${cor}" stroke="${detalhe}" stroke-width="16" stroke-linejoin="round"/>
        <path d="M600 420 L760 690 L440 690 Z" fill="${detalhe}" opacity=".55"/>`;
    case "kibe":
      return `${SOMBRA}
        <path d="M300 560 Q600 300 900 560 Q600 820 300 560 Z" fill="${cor}" stroke="${detalhe}" stroke-width="14"/>
        <path d="M420 520 L780 600 M420 600 L780 520" stroke="${detalhe}" stroke-width="8" opacity=".35"/>`;
    case "porcao":
      return `${SOMBRA}
        <ellipse cx="600" cy="680" rx="380" ry="110" fill="#fff" stroke="${detalhe}" stroke-width="10"/>
        <circle cx="470" cy="610" r="80" fill="${cor}" stroke="${detalhe}" stroke-width="10"/>
        <circle cx="620" cy="580" r="80" fill="${cor}" stroke="${detalhe}" stroke-width="10"/>
        <circle cx="760" cy="620" r="80" fill="${cor}" stroke="${detalhe}" stroke-width="10"/>
        <circle cx="560" cy="680" r="70" fill="${cor}" stroke="${detalhe}" stroke-width="10"/>
        <circle cx="700" cy="690" r="70" fill="${cor}" stroke="${detalhe}" stroke-width="10"/>`;
    case "lata":
      return `${SOMBRA}
        <rect x="430" y="270" width="340" height="560" rx="46" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
        <rect x="455" y="250" width="290" height="50" rx="20" fill="#d9d9d9" stroke="${detalhe}" stroke-width="10"/>
        <rect x="430" y="440" width="340" height="170" fill="#fff" opacity=".9"/>
        <path d="M480 525 Q600 470 720 525" stroke="${cor}" stroke-width="22" fill="none" stroke-linecap="round"/>`;
    case "copo":
      return `${SOMBRA}
        <path d="M420 330 L780 330 L730 830 L470 830 Z" fill="#fff" opacity=".55" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <path d="M436 440 L764 440 L728 820 L472 820 Z" fill="${cor}"/>
        <rect x="640" y="190" width="26" height="320" rx="12" fill="${detalhe}" transform="rotate(14 653 350)"/>
        <circle cx="530" cy="560" r="16" fill="#fff" opacity=".6"/><circle cx="640" cy="660" r="12" fill="#fff" opacity=".6"/>`;
    case "garrafa":
      return `${SOMBRA}
        <path d="M545 230 L655 230 L655 330 Q760 390 760 480 L760 800 Q760 830 730 830 L470 830 Q440 830 440 800 L440 480 Q440 390 545 330 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" opacity=".95"/>
        <rect x="535" y="195" width="130" height="55" rx="12" fill="${detalhe}"/>
        <rect x="440" y="520" width="320" height="160" fill="#fff" opacity=".85"/>`;
    case "tigela":
      return `${SOMBRA}
        <path d="M290 540 L910 540 Q890 820 600 830 Q310 820 290 540 Z" fill="${detalhe}"/>
        <ellipse cx="600" cy="540" rx="310" ry="70" fill="${cor}"/>
        <circle cx="480" cy="520" r="34" fill="#f3d36b"/><circle cx="600" cy="500" r="30" fill="#fff"/>
        <circle cx="720" cy="525" r="34" fill="#c98b4a"/><circle cx="560" cy="555" r="22" fill="#fff"/>`;
    case "brigadeiro":
      return `${SOMBRA}
        <circle cx="450" cy="620" r="120" fill="${cor}"/><circle cx="750" cy="620" r="120" fill="${cor}"/>
        <circle cx="600" cy="470" r="120" fill="${cor}"/>
        <g fill="${detalhe}">
          <rect x="420" y="560" width="20" height="8" rx="4"/><rect x="480" y="640" width="20" height="8" rx="4"/>
          <rect x="720" y="580" width="20" height="8" rx="4"/><rect x="780" y="650" width="20" height="8" rx="4"/>
          <rect x="580" y="430" width="20" height="8" rx="4"/><rect x="630" y="500" width="20" height="8" rx="4"/>
        </g>`;
    case "combo":
      return `${SOMBRA}
        <path d="M200 760 Q430 380 660 760 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <path d="M330 790 Q560 420 790 790 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <rect x="790" y="430" width="200" height="370" rx="34" fill="#c0392b" stroke="${detalhe}" stroke-width="10"/>
        <rect x="790" y="550" width="200" height="110" fill="#fff" opacity=".9"/>`;
    case "camiseta":
      return `${SOMBRA}
        <path d="M470 250 Q600 320 730 250 L920 340 L860 500 L780 470 L780 830 L420 830 L420 470 L340 500 L280 340 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <path d="M470 250 Q600 360 730 250" fill="none" stroke="${detalhe}" stroke-width="12"/>`;
    case "polo":
      return `${desenhar("camiseta", cor, detalhe)}
        <path d="M540 280 L600 380 L660 280" fill="#fff" stroke="${detalhe}" stroke-width="10"/>
        <circle cx="600" cy="420" r="9" fill="${detalhe}"/><circle cx="600" cy="460" r="9" fill="${detalhe}"/>`;
    case "calca":
      return `${SOMBRA}
        <path d="M420 230 L780 230 L830 830 L640 830 L600 430 L560 830 L370 830 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <path d="M420 290 L780 290" stroke="${detalhe}" stroke-width="10"/>
        <path d="M480 300 Q500 380 450 400 M720 300 Q700 380 750 400" stroke="${detalhe}" stroke-width="8" fill="none" opacity=".6"/>`;
    case "bermuda":
      return `${SOMBRA}
        <path d="M400 300 L800 300 L850 640 L640 660 L600 470 L560 660 L350 640 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <path d="M400 360 L800 360" stroke="${detalhe}" stroke-width="10"/>`;
    case "moletom":
      return `${SOMBRA}
        <path d="M490 260 Q600 160 710 260 L900 360 L960 760 L850 770 L790 480 L790 830 L410 830 L410 480 L350 770 L240 760 L300 360 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <path d="M500 270 Q600 380 700 270" fill="none" stroke="${detalhe}" stroke-width="12"/>
        <path d="M480 640 L720 640 L700 760 L500 760 Z" fill="none" stroke="${detalhe}" stroke-width="10"/>`;
    case "jaqueta":
      return `${desenhar("moletom", cor, detalhe)}
        <path d="M600 300 L600 830" stroke="${detalhe}" stroke-width="10"/>
        <circle cx="560" cy="420" r="9" fill="#e0c068"/><circle cx="560" cy="540" r="9" fill="#e0c068"/><circle cx="560" cy="660" r="9" fill="#e0c068"/>`;
    case "vestido":
      return `${SOMBRA}
        <path d="M520 230 L680 230 L700 420 Q860 640 900 830 L300 830 Q340 640 500 420 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <path d="M500 420 L700 420" stroke="${detalhe}" stroke-width="10"/>
        <g fill="#fff" opacity=".8"><circle cx="480" cy="640" r="20"/><circle cx="620" cy="560" r="16"/><circle cx="720" cy="720" r="20"/><circle cx="560" cy="760" r="14"/></g>`;
    case "bone":
      return `${SOMBRA}
        <path d="M340 640 Q340 330 600 320 Q860 330 860 640 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
        <path d="M600 320 L600 640 M470 350 Q450 500 470 640 M730 350 Q750 500 730 640" stroke="${detalhe}" stroke-width="8" fill="none" opacity=".6"/>
        <path d="M330 640 Q600 600 980 700 Q930 760 600 730 Q420 720 330 640 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
        <circle cx="600" cy="320" r="18" fill="${detalhe}"/>`;
    case "cinto":
      return `${SOMBRA}
        <rect x="220" y="500" width="760" height="110" rx="20" fill="${cor}" stroke="${detalhe}" stroke-width="10"/>
        <rect x="770" y="470" width="150" height="170" rx="22" fill="none" stroke="#d8b25a" stroke-width="22"/>
        <circle cx="400" cy="555" r="12" fill="${detalhe}"/><circle cx="480" cy="555" r="12" fill="${detalhe}"/><circle cx="560" cy="555" r="12" fill="${detalhe}"/>`;
    case "bolsa":
      return `${SOMBRA}
        <path d="M430 450 Q600 120 770 450" fill="none" stroke="${detalhe}" stroke-width="22"/>
        <rect x="330" y="440" width="540" height="390" rx="50" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
        <path d="M330 560 L870 560" stroke="${detalhe}" stroke-width="10"/>
        <rect x="560" y="540" width="80" height="60" rx="10" fill="#d8b25a"/>`;
    case "oculos":
      return `${SOMBRA}
        <rect x="240" y="430" width="300" height="220" rx="90" fill="${cor}" stroke="${detalhe}" stroke-width="16"/>
        <rect x="660" y="430" width="300" height="220" rx="90" fill="${cor}" stroke="${detalhe}" stroke-width="16"/>
        <path d="M540 500 Q600 450 660 500" stroke="${detalhe}" stroke-width="16" fill="none"/>
        <path d="M300 480 L380 470" stroke="#fff" stroke-width="16" stroke-linecap="round" opacity=".6"/>
        <path d="M720 480 L800 470" stroke="#fff" stroke-width="16" stroke-linecap="round" opacity=".6"/>`;
    case "tenis":
      return `${SOMBRA}
        <path d="M250 720 L270 520 Q330 470 420 500 L560 560 Q680 470 780 560 L930 640 Q980 690 950 740 L270 760 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <path d="M250 740 L960 720 L960 790 L250 800 Z" fill="#fff" stroke="${detalhe}" stroke-width="10"/>
        <path d="M470 540 L520 600 M520 520 L570 580 M570 500 L620 560" stroke="${detalhe}" stroke-width="10"/>`;
    case "meia":
      return `${SOMBRA}
        <path d="M480 220 L700 220 L700 600 Q700 680 760 720 L860 780 Q900 830 840 850 L560 850 Q470 850 470 760 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <path d="M480 290 L700 290 M480 330 L700 330" stroke="${detalhe}" stroke-width="10"/>`;
    // Card #50 ------------------------------------------------------------
    case "pizza":
      return `${SOMBRA}
        <circle cx="600" cy="560" r="310" fill="#E3A857" stroke="${detalhe}" stroke-width="14"/>
        <circle cx="600" cy="560" r="262" fill="${cor}"/>
        <g fill="#fff" opacity=".35"><circle cx="560" cy="470" r="30"/><circle cx="700" cy="560" r="26"/><circle cx="520" cy="650" r="28"/></g>
        <g fill="#B83A2E" stroke="#7A2119" stroke-width="8">
          <circle cx="757" cy="625" r="46"/><circle cx="665" cy="717" r="46"/><circle cx="535" cy="717" r="46"/><circle cx="443" cy="625" r="46"/>
          <circle cx="443" cy="495" r="46"/><circle cx="535" cy="403" r="46"/><circle cx="665" cy="403" r="46"/><circle cx="757" cy="495" r="46"/>
        </g>
        <g fill="#3C8D2F"><circle cx="620" cy="500" r="9"/><circle cx="560" cy="600" r="8"/><circle cx="680" cy="640" r="9"/><circle cx="500" cy="540" r="8"/></g>
        <path d="M600 250 L600 870 M290 560 L910 560 M381 341 L819 779 M819 341 L381 779" stroke="${detalhe}" stroke-width="10" opacity=".5"/>`;
    case "hamburguer":
      return `${SOMBRA}
        <path d="M330 700 L870 700 Q870 800 770 805 L430 805 Q330 800 330 700 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <rect x="305" y="612" width="590" height="96" rx="46" fill="#6B3A22" stroke="${detalhe}" stroke-width="12"/>
        <path d="M300 590 L900 590 L900 625 L830 625 L790 690 L750 625 L520 625 L480 690 L440 625 L300 625 Z" fill="#F6C445" stroke="#D99A1E" stroke-width="8" stroke-linejoin="round"/>
        <path d="M290 585 Q320 545 350 585 Q380 625 410 585 Q440 545 470 585 Q500 625 530 585 Q560 545 590 585 Q620 625 650 585 Q680 545 710 585 Q740 625 770 585 Q800 545 830 585 Q860 625 890 585 Q910 560 915 580 L905 600 L290 600 Z" fill="#6CBF3A" stroke="#3C8D2F" stroke-width="8" stroke-linejoin="round"/>
        <path d="M310 575 Q310 320 600 310 Q890 320 890 575 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <path d="M400 430 Q470 360 560 345" stroke="#fff" stroke-width="18" fill="none" stroke-linecap="round" opacity=".35"/>
        <g fill="#FFF3D6"><ellipse cx="480" cy="420" rx="16" ry="9" transform="rotate(-20 480 420)"/><ellipse cx="600" cy="380" rx="16" ry="9"/><ellipse cx="720" cy="420" rx="16" ry="9" transform="rotate(20 720 420)"/><ellipse cx="540" cy="480" rx="16" ry="9" transform="rotate(10 540 480)"/><ellipse cx="660" cy="470" rx="16" ry="9" transform="rotate(-10 660 470)"/><ellipse cx="780" cy="500" rx="16" ry="9" transform="rotate(25 780 500)"/><ellipse cx="420" cy="510" rx="16" ry="9" transform="rotate(-25 420 510)"/></g>`;
    case "batata-frita":
      return `${SOMBRA}
        <g fill="#F6C445" stroke="#D99A1E" stroke-width="8">
          <rect x="430" y="300" width="50" height="300" rx="8" transform="rotate(-14 455 450)"/>
          <rect x="500" y="250" width="50" height="340" rx="8" transform="rotate(-5 525 420)"/>
          <rect x="570" y="230" width="50" height="360" rx="8" transform="rotate(3 595 410)"/>
          <rect x="640" y="260" width="50" height="330" rx="8" transform="rotate(9 665 425)"/>
          <rect x="710" y="300" width="50" height="300" rx="8" transform="rotate(16 735 450)"/>
          <rect x="535" y="290" width="50" height="300" rx="8" transform="rotate(-12 560 440)"/>
          <rect x="610" y="300" width="50" height="290" rx="8" transform="rotate(12 635 445)"/>
        </g>
        <path d="M390 470 Q600 540 810 470 L760 830 L440 830 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <circle cx="600" cy="660" r="72" fill="#fff" opacity=".9"/>
        <path d="M560 660 Q600 620 640 660 Q600 700 560 660 Z" fill="${cor}"/>`;
    case "marmita":
      return `${SOMBRA}
        <path d="M300 545 L900 545 L860 815 Q855 830 840 830 L360 830 Q345 830 340 815 Z" fill="#d9d9d9" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <path d="M330 600 L870 600 M345 680 L855 680 M355 760 L845 760" stroke="#fff" stroke-width="8" opacity=".6"/>
        <rect x="400" y="640" width="400" height="110" rx="16" fill="${cor}" stroke="${detalhe}" stroke-width="8"/>
        <path d="M450 695 L750 695" stroke="#fff" stroke-width="14" stroke-linecap="round" opacity=".8"/>
        <path d="M340 545 Q350 470 470 465 Q560 470 570 545 Z" fill="#fff" stroke="#d6cfb8" stroke-width="6"/>
        <path d="M560 545 Q570 480 660 478 Q740 482 745 545 Z" fill="#5A3221"/>
        <ellipse cx="800" cy="520" rx="80" ry="40" fill="#8B4A2B" stroke="#5A3221" stroke-width="6"/>
        <g fill="#3C8D2F"><circle cx="720" cy="530" r="14"/><circle cx="745" cy="510" r="12"/></g>
        <rect x="280" y="530" width="640" height="34" rx="12" fill="#ececec" stroke="${detalhe}" stroke-width="10"/>
        <g transform="rotate(-16 285 535)">
          <path d="M290 470 L910 470 L895 525 L305 525 Z" fill="#e6e6e6" stroke="${detalhe}" stroke-width="10" stroke-linejoin="round"/>
          <path d="M340 495 L860 495" stroke="#fff" stroke-width="8" opacity=".7"/>
        </g>`;
    case "salada":
      return `${SOMBRA}
        <g stroke="#2F6E24" stroke-width="8">
          <ellipse cx="420" cy="500" rx="120" ry="70" fill="#5DAE3B" transform="rotate(-25 420 500)"/>
          <ellipse cx="780" cy="500" rx="120" ry="70" fill="#5DAE3B" transform="rotate(25 780 500)"/>
          <ellipse cx="560" cy="440" rx="120" ry="75" fill="#3C8D2F" transform="rotate(-10 560 440)"/>
          <ellipse cx="660" cy="450" rx="120" ry="75" fill="#6CBF3A" transform="rotate(15 660 450)"/>
          <ellipse cx="500" cy="520" rx="110" ry="60" fill="#6CBF3A"/>
          <ellipse cx="720" cy="525" rx="110" ry="60" fill="#3C8D2F"/>
        </g>
        <g fill="#E04A3A" stroke="#A3291D" stroke-width="8"><circle cx="610" cy="510" r="52"/><circle cx="450" cy="470" r="40"/><circle cx="770" cy="455" r="40"/></g>
        <g fill="#fff" opacity=".7"><circle cx="595" cy="492" r="12"/><circle cx="440" cy="458" r="9"/><circle cx="760" cy="443" r="9"/></g>
        <path d="M270 555 L930 555 Q910 830 600 840 Q290 830 270 555 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <path d="M330 640 Q600 690 870 640" stroke="#fff" stroke-width="16" fill="none" stroke-linecap="round" opacity=".45"/>`;
    case "prato":
      return `${SOMBRA}
        <ellipse cx="600" cy="600" rx="400" ry="240" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
        <ellipse cx="600" cy="595" rx="310" ry="180" fill="#fff" stroke="${detalhe}" stroke-width="6" opacity=".95"/>
        <path d="M330 600 Q340 480 470 470 Q600 480 600 590 Q560 680 450 680 Q350 670 330 600 Z" fill="#FBF8EE" stroke="#D6CFB8" stroke-width="6"/>
        <g fill="#D6CFB8"><ellipse cx="420" cy="560" rx="10" ry="5"/><ellipse cx="480" cy="530" rx="10" ry="5"/><ellipse cx="520" cy="600" rx="10" ry="5"/><ellipse cx="440" cy="630" rx="10" ry="5"/></g>
        <path d="M600 500 Q700 450 800 500 Q870 560 800 610 Q700 640 610 590 Z" fill="#5A3221" stroke="#3B1F14" stroke-width="6"/>
        <g fill="#7A4A35"><circle cx="680" cy="520" r="10"/><circle cx="740" cy="560" r="10"/><circle cx="660" cy="575" r="10"/></g>
        <path d="M560 650 Q620 600 760 620 Q820 650 790 710 Q700 760 590 730 Q530 700 560 650 Z" fill="#8B4A2B" stroke="#5A3221" stroke-width="8"/>
        <path d="M610 670 L700 650 M600 705 L740 680" stroke="#5A3221" stroke-width="8" stroke-linecap="round"/>
        <g fill="#3C8D2F"><circle cx="820" cy="640" r="18"/><circle cx="845" cy="615" r="14"/></g>`;
    case "pao":
      return `${SOMBRA}
        <g transform="rotate(-8 600 590)">
          <path d="M240 640 Q240 430 600 420 Q960 430 960 640 Q960 740 600 745 Q240 740 240 640 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
          <path d="M320 600 Q600 440 880 600 Q600 530 320 600 Z" fill="#FFF3D6" opacity=".8"/>
          <path d="M330 680 Q600 720 870 680" stroke="${detalhe}" stroke-width="8" fill="none" opacity=".3"/>
          <path d="M380 520 Q440 480 500 470" stroke="#fff" stroke-width="16" fill="none" stroke-linecap="round" opacity=".35"/>
        </g>`;
    case "bolo":
      return `${SOMBRA}
        <rect x="290" y="450" width="460" height="370" rx="20" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
        <path d="M290 600 L750 600 M290 700 L750 700" stroke="#fff" stroke-width="18" opacity=".7"/>
        <path d="M290 450 L750 450 L750 520 Q725 560 700 520 Q675 580 640 520 Q610 555 580 520 Q545 590 510 520 Q480 555 450 520 Q420 575 390 520 Q360 555 330 520 Q310 560 290 520 Z" fill="#fff" stroke="${detalhe}" stroke-width="10" stroke-linejoin="round"/>
        <circle cx="520" cy="410" r="42" fill="#C0392B" stroke="#7A2119" stroke-width="8"/>
        <path d="M520 370 Q530 320 570 300" stroke="#3C8D2F" stroke-width="8" fill="none" stroke-linecap="round"/>
        <path d="M790 640 L940 590 L940 820 L790 820 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <path d="M790 700 L940 680 M790 760 L940 750" stroke="#fff" stroke-width="14" opacity=".7"/>
        <path d="M780 640 L940 585 L950 620 Q900 640 870 625 Q830 655 790 650 Z" fill="#fff" stroke="${detalhe}" stroke-width="8" stroke-linejoin="round"/>`;
    case "croissant":
      return `${SOMBRA}
        <g fill="${cor}" stroke="${detalhe}" stroke-width="12">
          <ellipse cx="270" cy="700" rx="50" ry="70" transform="rotate(-55 270 700)"/>
          <ellipse cx="930" cy="700" rx="50" ry="70" transform="rotate(55 930 700)"/>
          <ellipse cx="350" cy="640" rx="75" ry="105" transform="rotate(-45 350 640)"/>
          <ellipse cx="850" cy="640" rx="75" ry="105" transform="rotate(45 850 640)"/>
          <ellipse cx="460" cy="580" rx="100" ry="140" transform="rotate(-25 460 580)"/>
          <ellipse cx="740" cy="580" rx="100" ry="140" transform="rotate(25 740 580)"/>
          <ellipse cx="600" cy="555" rx="120" ry="170"/>
        </g>
        <path d="M560 440 Q590 410 630 420 M540 520 Q600 490 660 510" stroke="#fff" stroke-width="14" fill="none" stroke-linecap="round" opacity=".4"/>`;
    case "xicara":
      return `${SOMBRA}
        <path d="M520 400 Q480 350 520 300 Q560 250 520 200 M610 400 Q570 350 610 300 Q650 250 610 200 M700 400 Q660 350 700 300 Q740 250 700 200" stroke="${detalhe}" stroke-width="14" fill="none" stroke-linecap="round" opacity=".4"/>
        <ellipse cx="600" cy="790" rx="320" ry="56" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
        <ellipse cx="600" cy="780" rx="190" ry="26" fill="${detalhe}" opacity=".25"/>
        <path d="M800 520 Q900 520 900 610 Q900 700 780 710" stroke="${detalhe}" stroke-width="50" fill="none" stroke-linecap="round"/>
        <path d="M800 520 Q900 520 900 610 Q900 700 780 710" stroke="${cor}" stroke-width="28" fill="none" stroke-linecap="round"/>
        <path d="M380 460 L820 460 L790 700 Q780 775 700 775 L500 775 Q420 775 410 700 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <ellipse cx="600" cy="462" rx="214" ry="40" fill="#5A3221" stroke="${detalhe}" stroke-width="10"/>
        <path d="M450 540 Q460 640 500 720" stroke="#fff" stroke-width="18" fill="none" stroke-linecap="round" opacity=".4"/>`;
    case "sorvete":
      return `${SOMBRA}
        <path d="M470 560 L730 560 L600 840 Z" fill="#E3A857" stroke="#9C6A2A" stroke-width="12" stroke-linejoin="round"/>
        <path d="M520 600 L650 760 M580 580 L690 680 M500 640 L620 800 M680 600 L560 760 M620 580 L520 690 M700 640 L590 800" stroke="#B97A2F" stroke-width="8"/>
        <circle cx="600" cy="320" r="115" fill="#fff" stroke="${detalhe}" stroke-width="12"/>
        <path d="M455 520 A150 150 0 1 1 745 520 Q745 580 715 575 Q690 610 665 575 Q630 600 600 572 Q570 610 535 575 Q505 600 485 575 Q455 585 455 520 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <circle cx="625" cy="200" r="34" fill="#C0392B" stroke="#7A2119" stroke-width="8"/>
        <path d="M630 168 Q640 130 670 115" stroke="#3C8D2F" stroke-width="8" fill="none" stroke-linecap="round"/>
        <path d="M520 420 Q540 380 580 370" stroke="#fff" stroke-width="16" fill="none" stroke-linecap="round" opacity=".45"/>
        <path d="M540 280 Q555 255 585 248" stroke="${detalhe}" stroke-width="12" fill="none" stroke-linecap="round" opacity=".3"/>`;
    case "picole":
      return `${SOMBRA}
        <rect x="565" y="640" width="70" height="200" rx="32" fill="#E3C08D" stroke="#9C6A2A" stroke-width="10"/>
        <rect x="440" y="230" width="320" height="470" rx="150" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
        <path d="M440 400 L440 380 Q440 230 600 230 Q760 230 760 380 L760 420 Q735 470 710 420 Q690 490 660 425 Q630 465 600 425 Q570 480 540 420 Q510 460 485 415 Q460 450 440 400 Z" fill="${detalhe}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <rect x="490" y="470" width="30" height="180" rx="15" fill="#fff" opacity=".4"/>
        <g fill="#fff" opacity=".8"><rect x="530" y="300" width="22" height="8" rx="4" transform="rotate(30 541 304)"/><rect x="620" y="280" width="22" height="8" rx="4"/><rect x="680" y="340" width="22" height="8" rx="4" transform="rotate(-40 691 344)"/><rect x="580" y="360" width="22" height="8" rx="4" transform="rotate(60 591 364)"/></g>`;
    case "vinho":
      return `${SOMBRA}
        <path d="M465 190 L535 190 L535 350 Q620 390 620 470 L620 820 Q620 840 600 840 L400 840 Q380 840 380 820 L380 470 Q380 390 465 350 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <rect x="455" y="175" width="90" height="130" rx="12" fill="${detalhe}"/>
        <rect x="380" y="560" width="240" height="170" fill="#fff" opacity=".9"/>
        <path d="M430 620 L570 620 M450 665 L550 665" stroke="${detalhe}" stroke-width="12" stroke-linecap="round"/>
        <rect x="408" y="440" width="22" height="100" rx="11" fill="#fff" opacity=".3"/>
        <path d="M672 520 L868 520 Q862 620 770 636 Q678 620 672 520 Z" fill="#8E1B3A"/>
        <path d="M670 420 L870 420 Q880 620 770 640 Q660 620 670 420 Z" fill="#fff" fill-opacity=".3" stroke="${detalhe}" stroke-width="10" stroke-linejoin="round"/>
        <rect x="761" y="640" width="18" height="160" fill="#fff" fill-opacity=".6" stroke="${detalhe}" stroke-width="8"/>
        <ellipse cx="770" cy="808" rx="90" ry="20" fill="#fff" fill-opacity=".6" stroke="${detalhe}" stroke-width="8"/>`;
    case "cerveja":
      return `${SOMBRA}
        <path d="M465 170 L535 170 L535 330 Q610 400 610 480 L610 820 Q610 840 590 840 L410 840 Q390 840 390 820 L390 480 Q390 400 465 330 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <path d="M455 150 L545 150 L545 190 L455 190 Z" fill="#d9d9d9" stroke="${detalhe}" stroke-width="8"/>
        <rect x="465" y="250" width="70" height="60" rx="6" fill="#fff" opacity=".85"/>
        <ellipse cx="500" cy="630" rx="95" ry="110" fill="#fff" opacity=".9"/>
        <path d="M450 630 L550 630" stroke="${cor}" stroke-width="16" stroke-linecap="round"/>
        <rect x="415" y="440" width="20" height="340" rx="10" fill="#fff" opacity=".3"/>
        <path d="M670 470 L890 470 L865 830 L695 830 Z" fill="#F2B233" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <g fill="#fff" opacity=".5"><circle cx="740" cy="620" r="9"/><circle cx="800" cy="700" r="7"/><circle cx="760" cy="760" r="8"/><circle cx="820" cy="580" r="6"/></g>
        <g fill="#fff" stroke="${detalhe}" stroke-width="8"><circle cx="700" cy="460" r="42"/><circle cx="760" cy="440" r="48"/><circle cx="830" cy="445" r="44"/><circle cx="870" cy="475" r="32"/></g>
        <rect x="672" y="455" width="215" height="40" fill="#fff"/>`;
    case "gelo":
      return `${SOMBRA}
        <path d="M530 300 Q600 330 670 300 L680 230 Q600 250 520 230 Z" fill="${cor}" stroke="${detalhe}" stroke-width="10" stroke-linejoin="round"/>
        <path d="M530 300 Q400 320 370 380 L340 800 Q340 840 380 840 L820 840 Q860 840 860 800 L830 380 Q800 320 670 300 Z" fill="#EAF6FC" fill-opacity=".85" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <g fill="#fff" stroke="#8CC4DE" stroke-width="8">
          <rect x="420" y="420" width="120" height="110" rx="20" transform="rotate(-12 480 475)"/>
          <rect x="580" y="400" width="120" height="110" rx="20" transform="rotate(10 640 455)"/>
          <rect x="700" y="450" width="110" height="105" rx="20" transform="rotate(-6 755 502)"/>
          <rect x="400" y="700" width="120" height="100" rx="20" transform="rotate(8 460 750)"/>
          <rect x="690" y="700" width="120" height="100" rx="20" transform="rotate(-10 750 750)"/>
        </g>
        <rect x="380" y="560" width="440" height="140" rx="16" fill="${cor}" stroke="${detalhe}" stroke-width="8"/>
        <path d="M600 585 L600 675 M561 607 L639 653 M561 653 L639 607" stroke="#fff" stroke-width="12" stroke-linecap="round"/>`;
    case "fruta":
      return `${SOMBRA}
        <path d="M600 400 C520 330 320 340 320 560 C320 760 470 860 600 800 C730 860 880 760 880 560 C880 340 680 330 600 400 Z" fill="${cor}" stroke="${detalhe}" stroke-width="14"/>
        <path d="M600 400 Q590 320 620 250" stroke="#6B3A22" stroke-width="18" fill="none" stroke-linecap="round"/>
        <path d="M620 320 Q700 230 800 270 Q740 360 620 320 Z" fill="#3C8D2F" stroke="#2F6E24" stroke-width="8"/>
        <path d="M640 312 Q710 290 770 280" stroke="#2F6E24" stroke-width="6" fill="none"/>
        <ellipse cx="440" cy="520" rx="40" ry="80" fill="#fff" opacity=".35" transform="rotate(20 440 520)"/>`;
    case "folhas":
      return `${SOMBRA}
        <g>
          <g transform="translate(600 820) rotate(-48) scale(1.3)"><path d="M0 0 C-90 -60 -135 -200 -105 -300 Q-85 -345 -55 -330 Q-35 -385 0 -390 Q35 -385 55 -330 Q85 -345 105 -300 C135 -200 90 -60 0 0 Z" fill="${cor}" stroke="${detalhe}" stroke-width="9" stroke-linejoin="round"/><path d="M0 -20 L0 -330 M0 -120 L-55 -190 M0 -120 L55 -190 M0 -220 L-45 -280 M0 -220 L45 -280" stroke="${detalhe}" stroke-width="6" fill="none" stroke-linecap="round" opacity=".4"/></g>
          <g transform="translate(600 820) rotate(48) scale(1.3)"><path d="M0 0 C-90 -60 -135 -200 -105 -300 Q-85 -345 -55 -330 Q-35 -385 0 -390 Q35 -385 55 -330 Q85 -345 105 -300 C135 -200 90 -60 0 0 Z" fill="${cor}" stroke="${detalhe}" stroke-width="9" stroke-linejoin="round"/><path d="M0 -20 L0 -330 M0 -120 L-55 -190 M0 -120 L55 -190 M0 -220 L-45 -280 M0 -220 L45 -280" stroke="${detalhe}" stroke-width="6" fill="none" stroke-linecap="round" opacity=".4"/></g>
          <g transform="translate(600 820) rotate(-24) scale(1.3)"><path d="M0 0 C-90 -60 -135 -200 -105 -300 Q-85 -345 -55 -330 Q-35 -385 0 -390 Q35 -385 55 -330 Q85 -345 105 -300 C135 -200 90 -60 0 0 Z" fill="${cor}" stroke="${detalhe}" stroke-width="9" stroke-linejoin="round"/><path d="M0 0 C-90 -60 -135 -200 -105 -300 Q-85 -345 -55 -330 Q-35 -385 0 -390 Q35 -385 55 -330 Q85 -345 105 -300 C135 -200 90 -60 0 0 Z" fill="#fff" opacity=".25"/><path d="M0 -20 L0 -330 M0 -120 L-55 -190 M0 -120 L55 -190 M0 -220 L-45 -280 M0 -220 L45 -280" stroke="${detalhe}" stroke-width="6" fill="none" stroke-linecap="round" opacity=".4"/></g>
          <g transform="translate(600 820) rotate(24) scale(1.3)"><path d="M0 0 C-90 -60 -135 -200 -105 -300 Q-85 -345 -55 -330 Q-35 -385 0 -390 Q35 -385 55 -330 Q85 -345 105 -300 C135 -200 90 -60 0 0 Z" fill="${cor}" stroke="${detalhe}" stroke-width="9" stroke-linejoin="round"/><path d="M0 0 C-90 -60 -135 -200 -105 -300 Q-85 -345 -55 -330 Q-35 -385 0 -390 Q35 -385 55 -330 Q85 -345 105 -300 C135 -200 90 -60 0 0 Z" fill="#fff" opacity=".25"/><path d="M0 -20 L0 -330 M0 -120 L-55 -190 M0 -120 L55 -190 M0 -220 L-45 -280 M0 -220 L45 -280" stroke="${detalhe}" stroke-width="6" fill="none" stroke-linecap="round" opacity=".4"/></g>
          <g transform="translate(600 820) rotate(-6) scale(1.3)"><path d="M0 0 C-90 -60 -135 -200 -105 -300 Q-85 -345 -55 -330 Q-35 -385 0 -390 Q35 -385 55 -330 Q85 -345 105 -300 C135 -200 90 -60 0 0 Z" fill="${cor}" stroke="${detalhe}" stroke-width="9" stroke-linejoin="round"/><path d="M0 -20 L0 -330 M0 -120 L-55 -190 M0 -120 L55 -190 M0 -220 L-45 -280 M0 -220 L45 -280" stroke="${detalhe}" stroke-width="6" fill="none" stroke-linecap="round" opacity=".4"/></g>
          <g transform="translate(600 820) rotate(8) scale(1.3)"><path d="M0 0 C-90 -60 -135 -200 -105 -300 Q-85 -345 -55 -330 Q-35 -385 0 -390 Q35 -385 55 -330 Q85 -345 105 -300 C135 -200 90 -60 0 0 Z" fill="${cor}" stroke="${detalhe}" stroke-width="9" stroke-linejoin="round"/><path d="M0 0 C-90 -60 -135 -200 -105 -300 Q-85 -345 -55 -330 Q-35 -385 0 -390 Q35 -385 55 -330 Q85 -345 105 -300 C135 -200 90 -60 0 0 Z" fill="#fff" opacity=".25"/><path d="M0 -20 L0 -330 M0 -120 L-55 -190 M0 -120 L55 -190 M0 -220 L-45 -280 M0 -220 L45 -280" stroke="${detalhe}" stroke-width="6" fill="none" stroke-linecap="round" opacity=".4"/></g>
        </g>`;
    case "cesta":
      return `${SOMBRA}
        <path d="M370 570 Q600 170 830 570" stroke="${detalhe}" stroke-width="40" fill="none" stroke-linecap="round"/>
        <path d="M370 570 Q600 170 830 570" stroke="${cor}" stroke-width="22" fill="none" stroke-linecap="round"/>
        <rect x="380" y="370" width="70" height="300" rx="34" fill="#E3A857" stroke="#9C6A2A" stroke-width="10" transform="rotate(-20 415 520)"/>
        <rect x="690" y="380" width="80" height="220" rx="16" fill="#3C8D2F" stroke="#2F6E24" stroke-width="10"/>
        <rect x="705" y="340" width="50" height="50" rx="6" fill="#2F6E24"/>
        <circle cx="560" cy="530" r="70" fill="#E04A3A" stroke="#A3291D" stroke-width="10"/>
        <circle cx="650" cy="550" r="60" fill="#F39C34" stroke="#B86A14" stroke-width="10"/>
        <path d="M290 570 L910 570 L850 820 Q845 840 820 840 L380 840 Q355 840 350 820 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <path d="M310 640 L890 640 M325 710 L875 710 M340 780 L860 780" stroke="${detalhe}" stroke-width="8" opacity=".5"/>
        <path d="M420 575 L440 835 M520 575 L530 835 M600 575 L600 835 M680 575 L670 835 M780 575 L760 835" stroke="${detalhe}" stroke-width="8" opacity=".35"/>
        <rect x="270" y="550" width="660" height="44" rx="20" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>`;
    case "pacote":
      return `${SOMBRA}
        <path d="M410 300 L790 300 L830 800 Q830 835 795 835 L405 835 Q370 835 370 800 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <path d="M400 240 L800 240 L790 310 L410 310 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <path d="M410 255 L790 255" stroke="${detalhe}" stroke-width="10" stroke-dasharray="14 12" opacity=".5"/>
        <rect x="430" y="430" width="340" height="270" rx="30" fill="#fff" opacity=".92"/>
        <g fill="${cor}"><ellipse cx="540" cy="520" rx="26" ry="12" transform="rotate(-30 540 520)"/><ellipse cx="600" cy="500" rx="26" ry="12"/><ellipse cx="660" cy="520" rx="26" ry="12" transform="rotate(30 660 520)"/><ellipse cx="570" cy="560" rx="26" ry="12" transform="rotate(20 570 560)"/><ellipse cx="630" cy="560" rx="26" ry="12" transform="rotate(-20 630 560)"/></g>
        <path d="M490 630 L710 630 M520 665 L680 665" stroke="${detalhe}" stroke-width="12" stroke-linecap="round" opacity=".7"/>
        <rect x="400" y="340" width="22" height="440" rx="11" fill="#fff" opacity=".25"/>`;
    case "ovos":
      return `${SOMBRA}
        <path d="M280 620 L920 620 L860 400 L340 400 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <path d="M280 620 L920 620 L860 400 L340 400 Z" fill="#fff" opacity=".3"/>
        <path d="M370 460 L830 460 M355 520 L845 520" stroke="${detalhe}" stroke-width="8" opacity=".3"/>
        <g fill="#FFF3E0" stroke="#C9A97C" stroke-width="8">
          <ellipse cx="335" cy="610" rx="50" ry="66"/><ellipse cx="441" cy="600" rx="50" ry="66"/><ellipse cx="547" cy="610" rx="50" ry="66"/>
          <ellipse cx="653" cy="600" rx="50" ry="66"/><ellipse cx="759" cy="610" rx="50" ry="66"/><ellipse cx="865" cy="600" rx="50" ry="66"/>
        </g>
        <g fill="#fff" opacity=".8"><ellipse cx="320" cy="585" rx="10" ry="18"/><ellipse cx="426" cy="575" rx="10" ry="18"/><ellipse cx="532" cy="585" rx="10" ry="18"/><ellipse cx="638" cy="575" rx="10" ry="18"/><ellipse cx="744" cy="585" rx="10" ry="18"/><ellipse cx="850" cy="575" rx="10" ry="18"/></g>
        <path d="M270 640 Q323 690 376 640 Q429 690 482 640 Q535 690 588 640 Q641 690 694 640 Q747 690 800 640 Q853 690 930 640 L880 820 L320 820 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <path d="M370 700 L360 800 M480 700 L475 800 M600 700 L600 800 M720 700 L725 800 M830 700 L840 800" stroke="${detalhe}" stroke-width="8" opacity=".3"/>`;
    case "frasco":
      return `${SOMBRA}
        <rect x="420" y="370" width="360" height="465" rx="44" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
        <rect x="400" y="250" width="400" height="140" rx="26" fill="#fff" stroke="${detalhe}" stroke-width="12"/>
        <path d="M450 270 L450 370 M500 270 L500 370 M550 270 L550 370 M600 270 L600 370 M650 270 L650 370 M700 270 L700 370 M750 270 L750 370" stroke="${detalhe}" stroke-width="8" opacity=".35"/>
        <rect x="420" y="480" width="360" height="240" fill="#fff" opacity=".92"/>
        <path d="M600 525 L600 615 M555 570 L645 570" stroke="${cor}" stroke-width="26" stroke-linecap="round"/>
        <path d="M500 665 L700 665" stroke="${detalhe}" stroke-width="12" stroke-linecap="round" opacity=".6"/>
        <rect x="445" y="400" width="22" height="60" rx="11" fill="#fff" opacity=".35"/><rect x="445" y="740" width="22" height="60" rx="11" fill="#fff" opacity=".35"/>`;
    case "caixa":
      return `${SOMBRA}
        <path d="M740 340 L880 270 L880 770 L740 840 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <path d="M740 340 L880 270 L880 770 L740 840 Z" fill="#000" opacity=".15"/>
        <path d="M340 340 L480 270 L880 270 L740 340 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <path d="M340 340 L480 270 L880 270 L740 340 Z" fill="#fff" opacity=".3"/>
        <rect x="340" y="340" width="400" height="500" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <rect x="340" y="500" width="400" height="130" fill="#fff" opacity=".9"/>
        <path d="M740 500 L880 430 L880 560 L740 630 Z" fill="#fff" opacity=".7"/>
        <path d="M400 565 L560 565" stroke="${detalhe}" stroke-width="18" stroke-linecap="round"/>
        <circle cx="660" cy="565" r="34" fill="${cor}"/>
        <path d="M390 700 L520 700 M390 740 L470 740" stroke="#fff" stroke-width="12" stroke-linecap="round" opacity=".6"/>`;
    case "bisnaga":
      return `${SOMBRA}
        <rect x="510" y="690" width="180" height="145" rx="22" fill="#fff" stroke="${detalhe}" stroke-width="12"/>
        <path d="M540 720 L540 810 M580 720 L580 810 M620 720 L620 810 M660 720 L660 810" stroke="${detalhe}" stroke-width="8" opacity=".3"/>
        <path d="M420 270 L780 270 L700 700 L500 700 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <rect x="405" y="225" width="390" height="60" rx="10" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
        <path d="M440 240 L440 270 M480 240 L480 270 M520 240 L520 270 M560 240 L560 270 M600 240 L600 270 M640 240 L640 270 M680 240 L680 270 M720 240 L720 270 M760 240 L760 270" stroke="${detalhe}" stroke-width="6" opacity=".45"/>
        <path d="M455 420 L745 420 L720 560 L480 560 Z" fill="#fff" opacity=".9"/>
        <path d="M530 470 L670 470 M550 510 L650 510" stroke="${detalhe}" stroke-width="12" stroke-linecap="round" opacity=".7"/>
        <path d="M470 320 L505 640" stroke="#fff" stroke-width="18" stroke-linecap="round" opacity=".35"/>`;
    case "curativo":
      return `${SOMBRA}
        <g transform="rotate(35 600 560)">
          <rect x="230" y="460" width="740" height="200" rx="100" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
          <rect x="490" y="485" width="220" height="150" rx="22" fill="#fff" opacity=".85"/>
          <g fill="${detalhe}" opacity=".35"><circle cx="330" cy="530" r="9"/><circle cx="330" cy="590" r="9"/><circle cx="400" cy="560" r="9"/><circle cx="800" cy="560" r="9"/><circle cx="870" cy="530" r="9"/><circle cx="870" cy="590" r="9"/></g>
        </g>
        <g transform="rotate(-35 600 560)">
          <rect x="230" y="460" width="740" height="200" rx="100" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
          <rect x="490" y="485" width="220" height="150" rx="22" fill="#fff" opacity=".85"/>
          <g fill="${detalhe}" opacity=".35"><circle cx="330" cy="530" r="9"/><circle cx="330" cy="590" r="9"/><circle cx="400" cy="560" r="9"/><circle cx="800" cy="560" r="9"/><circle cx="870" cy="530" r="9"/><circle cx="870" cy="590" r="9"/></g>
          <g fill="${detalhe}" opacity=".25"><circle cx="550" cy="530" r="7"/><circle cx="600" cy="560" r="7"/><circle cx="650" cy="530" r="7"/><circle cx="550" cy="590" r="7"/><circle cx="650" cy="590" r="7"/></g>
        </g>`;
    case "racao":
      return `${SOMBRA}
        <path d="M400 300 L800 300 L850 800 Q850 835 815 835 L385 835 Q350 835 350 800 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <path d="M390 230 L810 230 L800 310 L400 310 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <path d="M390 230 L810 230 L800 310 L400 310 Z" fill="#000" opacity=".15"/>
        <circle cx="600" cy="560" r="170" fill="#fff" opacity=".92"/>
        <g fill="${detalhe}">
          <path d="M600 560 Q680 560 690 630 Q690 680 640 670 Q600 660 560 670 Q510 680 510 630 Q520 560 600 560 Z"/>
          <ellipse cx="510" cy="540" rx="30" ry="40" transform="rotate(-25 510 540)"/>
          <ellipse cx="565" cy="480" rx="30" ry="42" transform="rotate(-8 565 480)"/>
          <ellipse cx="635" cy="480" rx="30" ry="42" transform="rotate(8 635 480)"/>
          <ellipse cx="690" cy="540" rx="30" ry="40" transform="rotate(25 690 540)"/>
        </g>
        <path d="M470 770 L730 770" stroke="#fff" stroke-width="14" stroke-linecap="round" opacity=".6"/>
        <g fill="#8B4A2B" stroke="#5A3221" stroke-width="6"><circle cx="890" cy="820" r="20"/><circle cx="935" cy="810" r="18"/><circle cx="270" cy="820" r="18"/></g>`;
    case "osso":
      return `${SOMBRA}
        <g transform="rotate(-20 600 560)">
          <g fill="${cor}" stroke="${detalhe}" stroke-width="28">
            <rect x="370" y="505" width="460" height="110" rx="20"/>
            <circle cx="365" cy="500" r="82"/><circle cx="365" cy="620" r="82"/><circle cx="835" cy="500" r="82"/><circle cx="835" cy="620" r="82"/>
          </g>
          <g fill="${cor}">
            <rect x="370" y="505" width="460" height="110" rx="20"/>
            <circle cx="365" cy="500" r="82"/><circle cx="365" cy="620" r="82"/><circle cx="835" cy="500" r="82"/><circle cx="835" cy="620" r="82"/>
          </g>
          <path d="M440 535 L760 535" stroke="#fff" stroke-width="18" stroke-linecap="round" opacity=".45"/>
          <circle cx="340" cy="470" r="22" fill="#fff" opacity=".4"/><circle cx="810" cy="470" r="22" fill="#fff" opacity=".4"/>
        </g>`;
    case "coleira":
      return `${SOMBRA}
        <ellipse cx="600" cy="540" rx="300" ry="190" fill="none" stroke="${detalhe}" stroke-width="96"/>
        <ellipse cx="600" cy="540" rx="300" ry="190" fill="none" stroke="${cor}" stroke-width="70"/>
        <ellipse cx="600" cy="540" rx="300" ry="190" fill="none" stroke="#fff" stroke-width="10" stroke-dasharray="20 40" opacity=".55"/>
        <rect x="830" y="480" width="110" height="130" rx="20" fill="none" stroke="#d8b25a" stroke-width="24"/>
        <rect x="868" y="480" width="16" height="130" rx="8" fill="#d8b25a"/>
        <circle cx="600" cy="740" r="26" fill="none" stroke="#d8b25a" stroke-width="12"/>
        <circle cx="600" cy="810" r="60" fill="#d8b25a" stroke="${detalhe}" stroke-width="10"/>
        <path d="M575 800 L625 800 M560 788 A12 12 0 1 1 572 812 M640 788 A12 12 0 1 0 628 812" stroke="${detalhe}" stroke-width="10" fill="none" stroke-linecap="round" opacity=".6"/>`;
    case "buque":
      return `${SOMBRA}
        <g fill="#3C8D2F" stroke="#2F6E24" stroke-width="8">
          <ellipse cx="380" cy="400" rx="40" ry="110" transform="rotate(-50 380 400)"/>
          <ellipse cx="820" cy="400" rx="40" ry="110" transform="rotate(50 820 400)"/>
          <ellipse cx="600" cy="200" rx="36" ry="90"/>
        </g>
        <g stroke="${detalhe}" stroke-width="10">
          <circle cx="480" cy="330" r="80" fill="#E04A5F"/><circle cx="720" cy="330" r="80" fill="#F6C445"/>
          <circle cx="600" cy="280" r="85" fill="#F7A8C4"/><circle cx="420" cy="440" r="70" fill="#F6C445"/>
          <circle cx="780" cy="440" r="70" fill="#E04A5F"/><circle cx="600" cy="420" r="85" fill="#fff"/>
        </g>
        <g fill="none" stroke="${detalhe}" stroke-width="8" opacity=".5">
          <path d="M480 330 m-30 0 a30 30 0 1 1 30 30 a18 18 0 1 1 -12 -18"/>
          <path d="M780 440 m-26 0 a26 26 0 1 1 26 26 a15 15 0 1 1 -10 -15"/>
        </g>
        <g fill="${detalhe}" opacity=".6"><circle cx="720" cy="330" r="22"/><circle cx="420" cy="440" r="20"/><circle cx="600" cy="420" r="24"/><circle cx="600" cy="280" r="22"/></g>
        <path d="M320 470 L880 470 L650 850 L550 850 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <path d="M320 470 L600 560 L880 470" fill="none" stroke="${detalhe}" stroke-width="10" stroke-linejoin="round"/>
        <path d="M430 520 L575 820 M770 520 L625 820" stroke="#fff" stroke-width="12" opacity=".35"/>
        <path d="M560 700 Q470 640 470 720 Q480 770 560 720 M640 700 Q730 640 730 720 Q720 770 640 720" fill="${detalhe}" stroke="${detalhe}" stroke-width="8"/>
        <rect x="560" y="685" width="80" height="50" rx="14" fill="${detalhe}"/>`;
    case "vaso-planta":
      return `${SOMBRA}
        <g stroke="#2F6E24" stroke-width="8">
          <ellipse cx="600" cy="400" rx="60" ry="170" fill="#3C8D2F" transform="rotate(-60 600 600)"/>
          <ellipse cx="600" cy="400" rx="60" ry="170" fill="#5DAE3B" transform="rotate(-30 600 600)"/>
          <ellipse cx="600" cy="400" rx="60" ry="170" fill="#3C8D2F" transform="rotate(60 600 600)"/>
          <ellipse cx="600" cy="400" rx="60" ry="170" fill="#5DAE3B" transform="rotate(30 600 600)"/>
          <ellipse cx="600" cy="380" rx="66" ry="190" fill="#6CBF3A"/>
        </g>
        <g stroke="#2F6E24" stroke-width="6" opacity=".6">
          <path d="M600 590 L600 220"/><path d="M600 600 L600 260" transform="rotate(-30 600 600)"/><path d="M600 600 L600 260" transform="rotate(30 600 600)"/>
          <path d="M600 600 L600 260" transform="rotate(-60 600 600)"/><path d="M600 600 L600 260" transform="rotate(60 600 600)"/>
        </g>
        <path d="M440 640 L760 640 L720 830 Q715 840 700 840 L500 840 Q485 840 480 830 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <rect x="410" y="590" width="380" height="72" rx="16" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
        <path d="M475 700 L500 810" stroke="#fff" stroke-width="16" stroke-linecap="round" opacity=".35"/>`;
    case "perfume":
      return `${SOMBRA}
        <path d="M545 330 Q480 330 440 300 Q400 270 360 290" stroke="${detalhe}" stroke-width="10" fill="none"/>
        <ellipse cx="320" cy="320" rx="56" ry="70" fill="${detalhe}"/>
        <rect x="560" y="370" width="80" height="80" fill="#d8b25a" stroke="${detalhe}" stroke-width="10"/>
        <rect x="535" y="280" width="130" height="100" rx="18" fill="#d8b25a" stroke="${detalhe}" stroke-width="10"/>
        <rect x="400" y="440" width="400" height="395" rx="70" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
        <rect x="400" y="440" width="400" height="395" rx="70" fill="#fff" opacity=".18"/>
        <rect x="425" y="560" width="350" height="250" rx="50" fill="${cor}"/>
        <rect x="480" y="600" width="240" height="120" rx="12" fill="#fff" opacity=".9"/>
        <path d="M530 645 L670 645 M555 680 L645 680" stroke="${detalhe}" stroke-width="10" stroke-linecap="round" opacity=".7"/>
        <rect x="430" y="470" width="24" height="120" rx="12" fill="#fff" opacity=".5"/>`;
    case "batom":
      return `${SOMBRA}
        <path d="M410 570 L410 360 Q410 320 450 300 L590 230 L590 570 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <rect x="435" y="330" width="22" height="200" rx="11" fill="#fff" opacity=".35"/>
        <rect x="395" y="530" width="210" height="80" rx="10" fill="#d8b25a" stroke="${detalhe}" stroke-width="10"/>
        <rect x="380" y="600" width="240" height="235" rx="18" fill="${detalhe}"/>
        <rect x="380" y="650" width="240" height="16" fill="#d8b25a"/>
        <rect x="690" y="470" width="230" height="365" rx="18" fill="${detalhe}"/>
        <rect x="690" y="780" width="230" height="16" fill="#d8b25a"/>
        <rect x="715" y="500" width="22" height="250" rx="11" fill="#fff" opacity=".2"/>`;
    case "sandalia":
      return `${SOMBRA}
        <path d="M230 760 Q230 700 300 700 L900 690 Q970 695 970 745 Q970 795 900 800 L300 800 Q230 800 230 760 Z" fill="#E3C08D" stroke="${detalhe}" stroke-width="12"/>
        <path d="M240 740 L960 735" stroke="${detalhe}" stroke-width="8" opacity=".35"/>
        <g fill="none" stroke-linecap="round">
          <path d="M640 700 Q700 540 860 690" stroke="${detalhe}" stroke-width="64"/>
          <path d="M640 700 Q700 540 860 690" stroke="${cor}" stroke-width="42"/>
          <path d="M460 705 Q520 520 650 600" stroke="${detalhe}" stroke-width="58"/>
          <path d="M460 705 Q520 520 650 600" stroke="${cor}" stroke-width="38"/>
          <path d="M300 700 Q290 450 420 430 Q520 440 500 560" stroke="${detalhe}" stroke-width="58"/>
          <path d="M300 700 Q290 450 420 430 Q520 440 500 560" stroke="${cor}" stroke-width="38"/>
        </g>
        <circle cx="470" cy="470" r="22" fill="#d8b25a" stroke="${detalhe}" stroke-width="8"/>`;
    case "bota":
      return `${SOMBRA}
        <path d="M430 220 L680 220 L690 560 Q720 610 820 640 Q940 670 945 760 L945 800 L400 800 L410 560 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <rect x="390" y="790" width="565" height="50" rx="14" fill="${detalhe}"/>
        <rect x="400" y="760" width="170" height="50" fill="${detalhe}" opacity=".6"/>
        <path d="M430 280 L680 280" stroke="${detalhe}" stroke-width="10"/>
        <path d="M620 300 L690 300 M622 360 L692 360 M624 420 L694 420 M626 480 L696 480 M640 540 L720 560" stroke="#fff" stroke-width="12" stroke-linecap="round" opacity=".8"/>
        <path d="M620 290 L620 560 Q650 600 700 610" stroke="${detalhe}" stroke-width="10" fill="none" opacity=".5"/>
        <path d="M720 690 Q800 680 870 720" stroke="#fff" stroke-width="16" fill="none" stroke-linecap="round" opacity=".35"/>
        <rect x="480" y="200" width="60" height="70" rx="16" fill="none" stroke="${detalhe}" stroke-width="12"/>`;
    case "sapato":
      return `${SOMBRA}
        <path d="M240 760 L250 600 Q260 560 320 560 L470 585 Q560 530 680 560 Q900 610 950 700 Q965 760 900 760 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <path d="M270 600 Q370 620 470 590" stroke="${detalhe}" stroke-width="14" fill="none" stroke-linecap="round"/>
        <path d="M470 590 Q560 545 660 570" stroke="${detalhe}" stroke-width="8" fill="none" opacity=".6"/>
        <path d="M520 580 L560 620 M560 565 L600 605 M600 560 L640 600" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity=".8"/>
        <path d="M700 620 Q820 640 900 700" stroke="#fff" stroke-width="18" fill="none" stroke-linecap="round" opacity=".35"/>
        <path d="M230 760 L960 755 L955 790 L640 795 Q600 800 560 790 L230 790 Z" fill="${detalhe}"/>
        <rect x="245" y="760" width="150" height="70" rx="8" fill="${detalhe}"/>`;
    case "chinelo":
      return `${SOMBRA}
        <g transform="translate(460 560) rotate(-12)">
          <path d="M0 -260 C120 -260 125 -110 105 -10 C90 90 115 250 0 255 C-115 250 -90 90 -105 -10 C-125 -110 -120 -260 0 -260 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
          <path d="M0 -240 C100 -240 105 -110 88 -10 C75 90 95 230 0 235 C-95 230 -75 90 -88 -10 C-105 -110 -100 -240 0 -240 Z" fill="#fff" opacity=".25"/>
          <path d="M0 -175 L-100 0 M0 -175 L100 0" stroke="${detalhe}" stroke-width="46" stroke-linecap="round" fill="none"/>
          <path d="M0 -175 L-100 0 M0 -175 L100 0" stroke="#fff" stroke-width="28" stroke-linecap="round" fill="none"/>
          <circle cx="0" cy="-175" r="20" fill="${detalhe}"/>
        </g>
        <g transform="translate(740 580) rotate(12)">
          <path d="M0 -260 C120 -260 125 -110 105 -10 C90 90 115 250 0 255 C-115 250 -90 90 -105 -10 C-125 -110 -120 -260 0 -260 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
          <path d="M0 -240 C100 -240 105 -110 88 -10 C75 90 95 230 0 235 C-95 230 -75 90 -88 -10 C-105 -110 -100 -240 0 -240 Z" fill="#fff" opacity=".25"/>
          <path d="M0 -175 L-100 0 M0 -175 L100 0" stroke="${detalhe}" stroke-width="46" stroke-linecap="round" fill="none"/>
          <path d="M0 -175 L-100 0 M0 -175 L100 0" stroke="#fff" stroke-width="28" stroke-linecap="round" fill="none"/>
          <circle cx="0" cy="-175" r="20" fill="${detalhe}"/>
        </g>`;
    case "isqueiro":
      return `${SOMBRA}
        <path d="M600 140 Q680 230 650 290 Q600 320 560 290 Q520 230 600 140 Z" fill="#F4A261"/>
        <path d="M600 210 Q630 250 615 285 Q600 300 585 285 Q575 250 600 210 Z" fill="#F6C445"/>
        <rect x="470" y="300" width="260" height="120" rx="14" fill="#d9d9d9" stroke="${detalhe}" stroke-width="12"/>
        <g fill="${detalhe}" opacity=".5"><circle cx="520" cy="340" r="10"/><circle cx="560" cy="340" r="10"/><circle cx="520" cy="380" r="10"/><circle cx="560" cy="380" r="10"/></g>
        <circle cx="680" cy="320" r="44" fill="#9aa3ad" stroke="${detalhe}" stroke-width="10"/>
        <path d="M650 300 L710 300 M645 320 L715 320 M650 340 L710 340" stroke="${detalhe}" stroke-width="6" opacity=".5"/>
        <rect x="450" y="410" width="300" height="425" rx="50" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
        <rect x="485" y="450" width="30" height="340" rx="15" fill="#fff" opacity=".35"/>
        <rect x="560" y="560" width="140" height="160" rx="20" fill="#fff" opacity=".25"/>`;
    case "narguile":
      return `${SOMBRA}
        <path d="M640 470 Q800 430 860 560 Q910 680 850 760" stroke="${detalhe}" stroke-width="34" fill="none" stroke-linecap="round"/>
        <path d="M640 470 Q800 430 860 560 Q910 680 850 760" stroke="${cor}" stroke-width="18" fill="none" stroke-linecap="round"/>
        <rect x="822" y="740" width="56" height="90" rx="14" fill="#d9d9d9" stroke="${detalhe}" stroke-width="10" transform="rotate(-20 850 785)"/>
        <rect x="578" y="270" width="44" height="330" fill="#d9d9d9" stroke="${detalhe}" stroke-width="10"/>
        <ellipse cx="600" cy="400" rx="40" ry="16" fill="#d9d9d9" stroke="${detalhe}" stroke-width="8"/>
        <ellipse cx="600" cy="470" rx="46" ry="18" fill="#d9d9d9" stroke="${detalhe}" stroke-width="8"/>
        <rect x="620" y="455" width="40" height="30" rx="8" fill="#d9d9d9" stroke="${detalhe}" stroke-width="8"/>
        <ellipse cx="600" cy="275" rx="110" ry="22" fill="#d9d9d9" stroke="${detalhe}" stroke-width="10"/>
        <path d="M545 180 L655 180 L630 262 L570 262 Z" fill="${detalhe}" stroke="${detalhe}" stroke-width="10" stroke-linejoin="round"/>
        <rect x="560" y="160" width="80" height="26" rx="8" fill="#9aa3ad" stroke="${detalhe}" stroke-width="8"/>
        <path d="M600 560 C760 560 830 700 770 790 Q750 830 690 830 L510 830 Q450 830 430 790 C370 700 440 560 600 560 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
        <path d="M425 720 Q600 690 775 720 L770 790 Q750 825 690 825 L510 825 Q450 825 430 790 Z" fill="#fff" opacity=".3"/>
        <path d="M470 640 Q490 610 530 595" stroke="#fff" stroke-width="16" fill="none" stroke-linecap="round" opacity=".45"/>
        <rect x="585" y="560" width="30" height="190" fill="#d9d9d9" opacity=".7"/>`;
    case "charuto":
      return `${SOMBRA}
        <g transform="rotate(-14 600 520)">
          <rect x="240" y="460" width="700" height="100" rx="50" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
          <path d="M320 470 L360 550 M420 470 L460 550 M520 470 L560 550 M620 470 L660 550" stroke="${detalhe}" stroke-width="6" opacity=".3"/>
          <rect x="740" y="458" width="70" height="104" fill="#d8b25a" stroke="${detalhe}" stroke-width="8"/>
          <rect x="740" y="495" width="70" height="30" fill="#C0392B"/>
          <rect x="290" y="478" width="380" height="16" rx="8" fill="#fff" opacity=".3"/>
        </g>
        <g transform="rotate(6 600 680)">
          <rect x="260" y="630" width="700" height="100" rx="50" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
          <path d="M340 640 L380 720 M440 640 L480 720 M540 640 L580 720 M640 640 L680 720" stroke="${detalhe}" stroke-width="6" opacity=".3"/>
          <rect x="400" y="628" width="70" height="104" fill="#d8b25a" stroke="${detalhe}" stroke-width="8"/>
          <rect x="400" y="665" width="70" height="30" fill="#C0392B"/>
          <rect x="520" y="648" width="360" height="16" rx="8" fill="#fff" opacity=".3"/>
        </g>`;
    case "seda":
      return `${SOMBRA}
        <g transform="rotate(-6 600 560)">
          <path d="M440 290 L760 290 L770 450 L430 450 Z" fill="#fff" stroke="${detalhe}" stroke-width="10" stroke-linejoin="round"/>
          <path d="M440 330 L760 330" stroke="${detalhe}" stroke-width="6" opacity=".25"/>
          <path d="M470 270 L790 310 L760 440 L440 410 Z" fill="#fff" stroke="${detalhe}" stroke-width="8" stroke-linejoin="round" opacity=".9"/>
          <rect x="330" y="430" width="540" height="340" rx="22" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
          <path d="M330 470 L870 470" stroke="${detalhe}" stroke-width="10"/>
          <rect x="400" y="540" width="400" height="140" rx="16" fill="#fff" opacity=".9"/>
          <path d="M450 590 L750 590 M490 630 L710 630" stroke="${cor}" stroke-width="16" stroke-linecap="round"/>
        </g>`;
    case "carvao":
      return `${SOMBRA}
        <path d="M330 520 L440 440 L880 440 L770 520 Z" fill="${detalhe}"/>
        <g stroke="#111" stroke-width="8">
          <rect x="400" y="400" width="120" height="110" rx="18" fill="#2b2b2b" transform="rotate(-12 460 455)"/>
          <rect x="520" y="380" width="120" height="110" rx="18" fill="#3a3a3a" transform="rotate(8 580 435)"/>
          <rect x="640" y="400" width="120" height="110" rx="18" fill="#2b2b2b" transform="rotate(-6 700 455)"/>
          <rect x="580" y="330" width="110" height="100" rx="18" fill="#333" transform="rotate(14 635 380)"/>
        </g>
        <g fill="#fff" opacity=".18"><rect x="420" y="420" width="40" height="14" rx="7"/><rect x="545" y="395" width="40" height="14" rx="7"/><rect x="660" y="420" width="40" height="14" rx="7"/></g>
        <path d="M640 330 Q620 290 650 260 Q660 300 680 310 Q690 280 700 270 Q730 320 700 350 Z" fill="#F4A261"/>
        <path d="M770 520 L880 440 L880 750 L770 830 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <path d="M770 520 L880 440 L880 750 L770 830 Z" fill="#000" opacity=".18"/>
        <rect x="330" y="520" width="440" height="310" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <rect x="330" y="600" width="440" height="140" fill="#fff" opacity=".9"/>
        <path d="M550 625 Q600 660 580 715 Q520 720 515 680 Q515 650 550 625 Z" fill="#F4A261"/>
        <path d="M610 660 L720 660 M610 700 L690 700" stroke="${detalhe}" stroke-width="14" stroke-linecap="round"/>`;
    case "caderno":
      return `${SOMBRA}
        <rect x="400" y="260" width="440" height="580" rx="22" fill="#fff" stroke="${detalhe}" stroke-width="10" transform="translate(16 -10)"/>
        <rect x="380" y="260" width="440" height="580" rx="22" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
        <rect x="470" y="340" width="280" height="110" rx="14" fill="#fff" opacity=".92"/>
        <path d="M510 380 L710 380 M530 415 L690 415" stroke="${detalhe}" stroke-width="10" stroke-linecap="round" opacity=".6"/>
        <rect x="770" y="260" width="22" height="580" fill="${detalhe}" opacity=".35"/>
        <g fill="none" stroke="#9aa3ad" stroke-width="12" stroke-linecap="round">
          ${Array.from({ length: 11 }, (_, i) => `<path d="M410 ${300 + i * 50} Q350 ${300 + i * 50} 352 ${318 + i * 50} Q356 ${336 + i * 50} 410 ${330 + i * 50}"/>`).join("")}
        </g>
        <g fill="${detalhe}">${Array.from({ length: 11 }, (_, i) => `<circle cx="412" cy="${315 + i * 50}" r="9"/>`).join("")}</g>`;
    case "lapis":
      return `${SOMBRA}
        <g transform="rotate(-35 600 560)">
          <rect x="320" y="420" width="520" height="90" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
          <path d="M320 450 L840 450 M320 480 L840 480" stroke="${detalhe}" stroke-width="6" opacity=".35"/>
          <rect x="840" y="415" width="70" height="100" fill="#d9d9d9" stroke="${detalhe}" stroke-width="10"/>
          <rect x="905" y="415" width="70" height="100" rx="24" fill="#F7A8C4" stroke="${detalhe}" stroke-width="10"/>
          <path d="M320 420 L190 465 L320 510 Z" fill="#E3C08D" stroke="${detalhe}" stroke-width="10" stroke-linejoin="round"/>
          <path d="M240 448 L190 465 L240 482 Z" fill="${detalhe}"/>
        </g>
        <g transform="rotate(-35 600 560) translate(40 170)">
          <rect x="300" y="420" width="560" height="80" rx="30" fill="${detalhe}"/>
          <rect x="560" y="410" width="320" height="100" rx="34" fill="${detalhe}" stroke="#fff" stroke-width="6" stroke-opacity=".3"/>
          <rect x="620" y="390" width="220" height="24" rx="12" fill="#d9d9d9"/>
          <path d="M300 430 L210 460 L300 490 Z" fill="#d9d9d9" stroke="${detalhe}" stroke-width="8" stroke-linejoin="round"/>
          <rect x="340" y="438" width="200" height="12" rx="6" fill="#fff" opacity=".3"/>
        </g>`;
    case "mochila":
      return `${SOMBRA}
        <path d="M520 300 Q520 220 600 220 Q680 220 680 300" stroke="${detalhe}" stroke-width="40" fill="none"/>
        <path d="M520 300 Q520 220 600 220 Q680 220 680 300" stroke="${cor}" stroke-width="22" fill="none"/>
        <rect x="320" y="480" width="70" height="260" rx="30" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
        <rect x="810" y="480" width="70" height="260" rx="30" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
        <path d="M370 420 Q370 280 600 280 Q830 280 830 420 L830 790 Q830 835 785 835 L415 835 Q370 835 370 790 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
        <path d="M410 420 Q420 330 600 325 Q780 330 790 420" stroke="${detalhe}" stroke-width="8" fill="none" stroke-dasharray="18 12"/>
        <rect x="430" y="560" width="340" height="230" rx="40" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
        <rect x="430" y="560" width="340" height="230" rx="40" fill="#fff" opacity=".2"/>
        <path d="M460 610 L740 610" stroke="${detalhe}" stroke-width="8"/>
        <rect x="690" y="598" width="20" height="50" rx="6" fill="#d9d9d9" stroke="${detalhe}" stroke-width="6"/>
        <path d="M410 460 Q420 380 480 350" stroke="#fff" stroke-width="16" fill="none" stroke-linecap="round" opacity=".35"/>`;
    case "livro":
      return `${SOMBRA}
        <path d="M420 250 L820 250 L840 270 L840 840 L440 840 Z" fill="#FBF8EE" stroke="${detalhe}" stroke-width="10" stroke-linejoin="round"/>
        <path d="M830 300 L830 820 M815 290 L815 830" stroke="${detalhe}" stroke-width="4" opacity=".3"/>
        <rect x="380" y="240" width="430" height="580" rx="16" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
        <rect x="380" y="240" width="60" height="580" rx="16" fill="#000" opacity=".2"/>
        <rect x="500" y="350" width="250" height="150" rx="10" fill="#fff" opacity=".92"/>
        <path d="M540 400 L710 400 M560 445 L690 445" stroke="${detalhe}" stroke-width="12" stroke-linecap="round" opacity=".7"/>
        <path d="M560 600 L700 600 M580 640 L680 640" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity=".5"/>
        <path d="M720 820 L720 890 L745 870 L770 890 L770 820 Z" fill="#C0392B"/>`;
    case "livros":
      return `${SOMBRA}
        <rect x="300" y="700" width="600" height="130" rx="14" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
        <rect x="780" y="715" width="105" height="100" rx="6" fill="#FBF8EE"/>
        <path d="M790 740 L880 740 M790 765 L880 765 M790 790 L880 790" stroke="${detalhe}" stroke-width="4" opacity=".3"/>
        <rect x="360" y="745" width="300" height="20" rx="10" fill="#fff" opacity=".6"/>
        <g transform="rotate(-4 600 640)">
          <rect x="340" y="580" width="540" height="120" rx="14" fill="${detalhe}" stroke="${detalhe}" stroke-width="12"/>
          <rect x="350" y="595" width="105" height="90" rx="6" fill="#FBF8EE"/>
          <path d="M360 620 L450 620 M360 645 L450 645 M360 670 L450 670" stroke="${detalhe}" stroke-width="4" opacity=".3"/>
          <rect x="520" y="625" width="260" height="30" rx="8" fill="#d8b25a"/>
        </g>
        <g transform="rotate(5 600 520)">
          <rect x="360" y="460" width="500" height="120" rx="14" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
          <rect x="360" y="460" width="500" height="120" rx="14" fill="#fff" opacity=".35"/>
          <rect x="745" y="475" width="100" height="90" rx="6" fill="#FBF8EE"/>
          <path d="M755 500 L840 500 M755 525 L840 525 M755 550 L840 550" stroke="${detalhe}" stroke-width="4" opacity=".3"/>
          <path d="M410 520 L680 520" stroke="${detalhe}" stroke-width="14" stroke-linecap="round" opacity=".5"/>
        </g>`;
    case "celular":
      return `${SOMBRA}
        <rect x="420" y="210" width="360" height="630" rx="56" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
        <rect x="448" y="245" width="304" height="560" rx="32" fill="#1D2433"/>
        <rect x="560" y="262" width="80" height="22" rx="11" fill="#000"/>
        <g fill="${cor}">
          <rect x="480" y="320" width="60" height="60" rx="16"/><rect x="570" y="320" width="60" height="60" rx="16" opacity=".7"/><rect x="660" y="320" width="60" height="60" rx="16" fill="#F6C445"/>
          <rect x="480" y="410" width="60" height="60" rx="16" fill="#5DAE3B"/><rect x="570" y="410" width="60" height="60" rx="16"/><rect x="660" y="410" width="60" height="60" rx="16" fill="#4A90D9"/>
          <rect x="480" y="500" width="60" height="60" rx="16" fill="#E04A5F"/><rect x="570" y="500" width="60" height="60" rx="16" fill="#fff" opacity=".8"/><rect x="660" y="500" width="60" height="60" rx="16" opacity=".7"/>
        </g>
        <rect x="470" y="700" width="260" height="76" rx="26" fill="#fff" opacity=".15"/>
        <path d="M480 620 L720 620" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity=".2"/>`;
    case "fone":
      return `${SOMBRA}
        <path d="M370 600 Q360 250 600 250 Q840 250 830 600" stroke="${detalhe}" stroke-width="64" fill="none" stroke-linecap="round"/>
        <path d="M370 600 Q360 250 600 250 Q840 250 830 600" stroke="${cor}" stroke-width="40" fill="none" stroke-linecap="round"/>
        <path d="M430 330 Q500 290 580 285" stroke="#fff" stroke-width="10" fill="none" stroke-linecap="round" opacity=".4"/>
        <rect x="300" y="510" width="140" height="250" rx="60" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
        <rect x="420" y="530" width="56" height="210" rx="26" fill="${detalhe}"/>
        <rect x="760" y="510" width="140" height="250" rx="60" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
        <rect x="724" y="530" width="56" height="210" rx="26" fill="${detalhe}"/>
        <rect x="325" y="560" width="22" height="140" rx="11" fill="#fff" opacity=".35"/><rect x="853" y="560" width="22" height="140" rx="11" fill="#fff" opacity=".35"/>`;
    case "carregador":
      return `${SOMBRA}
        <path d="M600 600 Q600 790 760 790 Q880 790 870 680 Q860 600 800 590" stroke="${detalhe}" stroke-width="30" fill="none" stroke-linecap="round"/>
        <path d="M600 600 Q600 790 760 790 Q880 790 870 680 Q860 600 800 590" stroke="#fff" stroke-width="14" fill="none" stroke-linecap="round" opacity=".7"/>
        <rect x="740" y="545" width="70" height="90" rx="14" fill="${cor}" stroke="${detalhe}" stroke-width="10" transform="rotate(-80 775 590)"/>
        <rect x="680" y="574" width="40" height="30" rx="6" fill="#9aa3ad" stroke="${detalhe}" stroke-width="6"/>
        <rect x="510" y="210" width="28" height="110" rx="8" fill="#d9d9d9" stroke="${detalhe}" stroke-width="10"/>
        <rect x="662" y="210" width="28" height="110" rx="8" fill="#d9d9d9" stroke="${detalhe}" stroke-width="10"/>
        <rect x="440" y="300" width="320" height="320" rx="50" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
        <rect x="440" y="300" width="320" height="70" rx="30" fill="#fff" opacity=".25"/>
        <path d="M610 420 L560 500 L610 500 L585 570 L650 480 L600 480 L625 420 Z" fill="#fff" opacity=".85"/>`;
    case "caixa-som":
      return `${SOMBRA}
        <rect x="380" y="240" width="440" height="595" rx="50" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
        <circle cx="600" cy="380" r="70" fill="${detalhe}"/>
        <circle cx="600" cy="380" r="40" fill="#fff" opacity=".2"/>
        <circle cx="600" cy="380" r="16" fill="#fff" opacity=".4"/>
        <circle cx="600" cy="640" r="155" fill="${detalhe}"/>
        <circle cx="600" cy="640" r="120" fill="#fff" opacity=".12"/>
        <circle cx="600" cy="640" r="80" fill="#fff" opacity=".12"/>
        <circle cx="600" cy="640" r="40" fill="#fff" opacity=".35"/>
        <rect x="410" y="280" width="20" height="200" rx="10" fill="#fff" opacity=".3"/>`;
    case "urso":
      return `${SOMBRA}
        <g fill="${cor}" stroke="${detalhe}" stroke-width="12">
          <circle cx="470" cy="290" r="64"/><circle cx="730" cy="290" r="64"/>
          <ellipse cx="380" cy="600" rx="60" ry="100" transform="rotate(30 380 600)"/>
          <ellipse cx="820" cy="600" rx="60" ry="100" transform="rotate(-30 820 600)"/>
          <ellipse cx="600" cy="660" rx="200" ry="180"/>
          <ellipse cx="450" cy="790" rx="85" ry="60"/><ellipse cx="750" cy="790" rx="85" ry="60"/>
          <circle cx="600" cy="410" r="165"/>
        </g>
        <g fill="#fff" opacity=".45"><circle cx="470" cy="290" r="32"/><circle cx="730" cy="290" r="32"/><ellipse cx="600" cy="690" rx="110" ry="100"/><ellipse cx="450" cy="795" rx="44" ry="32"/><ellipse cx="750" cy="795" rx="44" ry="32"/></g>
        <ellipse cx="600" cy="470" rx="80" ry="62" fill="#fff" opacity=".6"/>
        <circle cx="535" cy="390" r="18" fill="${detalhe}"/><circle cx="665" cy="390" r="18" fill="${detalhe}"/>
        <ellipse cx="600" cy="445" rx="28" ry="20" fill="${detalhe}"/>
        <path d="M600 465 L600 490 M570 500 Q600 520 630 500" stroke="${detalhe}" stroke-width="8" fill="none" stroke-linecap="round"/>
        <path d="M520 575 L600 600 L680 575 L680 635 L600 610 L520 635 Z" fill="#E04A5F" stroke="${detalhe}" stroke-width="8" stroke-linejoin="round"/>`;
    case "blocos":
      return `${SOMBRA}
        <g stroke="${detalhe}" stroke-width="10">
          <rect x="330" y="664" width="60" height="36" rx="6" fill="#E04A3A"/><rect x="450" y="664" width="60" height="36" rx="6" fill="#E04A3A"/>
          <rect x="300" y="690" width="300" height="145" rx="12" fill="#E04A3A"/>
          <rect x="690" y="664" width="60" height="36" rx="6" fill="#4A90D9"/><rect x="810" y="664" width="60" height="36" rx="6" fill="#4A90D9"/>
          <rect x="600" y="690" width="300" height="145" rx="12" fill="#4A90D9"/>
          <rect x="480" y="510" width="60" height="36" rx="6" fill="${cor}"/><rect x="600" y="510" width="60" height="36" rx="6" fill="${cor}"/><rect x="720" y="510" width="60" height="36" rx="6" fill="${cor}"/>
          <rect x="450" y="540" width="360" height="150" rx="12" fill="${cor}"/>
          <rect x="560" y="360" width="60" height="36" rx="6" fill="#F6C445"/><rect x="680" y="360" width="60" height="36" rx="6" fill="#F6C445"/>
          <rect x="530" y="390" width="240" height="150" rx="12" fill="#F6C445"/>
        </g>
        <g fill="#fff" opacity=".3"><rect x="320" y="710" width="20" height="100" rx="10"/><rect x="620" y="710" width="20" height="100" rx="10"/><rect x="470" y="560" width="20" height="100" rx="10"/><rect x="550" y="410" width="20" height="100" rx="10"/></g>`;
    case "carrinho":
      return `${SOMBRA}
        <path d="M250 720 L250 610 Q250 570 300 560 L430 545 L510 440 Q530 420 570 420 L760 420 Q790 420 810 450 L870 545 L920 560 Q960 575 960 620 L960 720 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <path d="M465 545 L530 460 Q540 450 560 450 L640 450 L640 545 Z" fill="#CFEAF7" stroke="${detalhe}" stroke-width="8" stroke-linejoin="round"/>
        <path d="M670 545 L670 450 L750 450 Q770 450 780 465 L830 545 Z" fill="#CFEAF7" stroke="${detalhe}" stroke-width="8" stroke-linejoin="round"/>
        <path d="M640 560 L640 700" stroke="${detalhe}" stroke-width="6" opacity=".5"/>
        <rect x="910" y="590" width="40" height="30" rx="8" fill="#F6C445"/>
        <rect x="255" y="590" width="34" height="30" rx="8" fill="#E04A3A"/>
        <path d="M300 640 L900 640" stroke="#fff" stroke-width="14" opacity=".35"/>
        <g stroke="${detalhe}" stroke-width="10"><circle cx="410" cy="725" r="85" fill="#2b2b2b"/><circle cx="800" cy="725" r="85" fill="#2b2b2b"/></g>
        <circle cx="410" cy="725" r="38" fill="#d9d9d9"/><circle cx="800" cy="725" r="38" fill="#d9d9d9"/>`;
    case "bola":
      return `${SOMBRA}
        <circle cx="600" cy="570" r="260" fill="#fff" stroke="${detalhe}" stroke-width="12"/>
        <path d="M600 310 C300 400 300 740 600 830 C450 740 450 400 600 310 Z" fill="${cor}"/>
        <path d="M600 310 C900 400 900 740 600 830 C750 740 750 400 600 310 Z" fill="#F6C445"/>
        <path d="M600 310 C300 400 300 740 600 830 M600 310 C450 400 450 740 600 830 M600 310 C900 400 900 740 600 830 M600 310 C750 400 750 740 600 830" stroke="${detalhe}" stroke-width="8" fill="none" opacity=".5"/>
        <circle cx="600" cy="570" r="260" fill="none" stroke="${detalhe}" stroke-width="12"/>
        <ellipse cx="480" cy="430" rx="50" ry="30" fill="#fff" opacity=".6" transform="rotate(-35 480 430)"/>`;
    case "martelo":
      return `${SOMBRA}
        <g transform="rotate(30 600 560)">
          <rect x="565" y="380" width="70" height="470" rx="28" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
          <rect x="565" y="640" width="70" height="210" rx="28" fill="${detalhe}"/>
          <path d="M580 660 L620 660 M580 700 L620 700 M580 740 L620 740 M580 780 L620 780" stroke="#fff" stroke-width="6" opacity=".25"/>
          <path d="M420 300 L680 300 L680 410 L420 410 Z" fill="#9aa3ad" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
          <rect x="380" y="285" width="60" height="140" rx="12" fill="#9aa3ad" stroke="${detalhe}" stroke-width="12"/>
          <path d="M680 300 Q790 300 850 230 L880 260 Q820 340 740 355 Q820 370 880 450 L850 480 Q790 410 680 410 Z" fill="#9aa3ad" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
          <path d="M440 325 L660 325" stroke="#fff" stroke-width="12" opacity=".45" stroke-linecap="round"/>
        </g>`;
    case "furadeira":
      return `${SOMBRA}
        <rect x="140" y="390" width="140" height="22" rx="6" fill="#9aa3ad" stroke="${detalhe}" stroke-width="6"/>
        <path d="M150 395 L270 395" stroke="${detalhe}" stroke-width="4" stroke-dasharray="10 10" opacity=".5"/>
        <path d="M260 360 L340 350 L340 450 L260 440 Z" fill="#9aa3ad" stroke="${detalhe}" stroke-width="10" stroke-linejoin="round"/>
        <rect x="455" y="730" width="320" height="105" rx="20" fill="${detalhe}"/>
        <path d="M340 330 L780 330 Q850 330 850 400 Q850 480 780 480 L720 480 L700 735 L540 735 L590 480 L340 480 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <path d="M580 500 Q560 500 555 540 L560 600" stroke="${detalhe}" stroke-width="22" fill="none" stroke-linecap="round"/>
        <path d="M700 365 L700 445 M735 365 L735 445 M770 365 L770 445" stroke="${detalhe}" stroke-width="10" stroke-linecap="round" opacity=".6"/>
        <path d="M380 360 L640 360" stroke="#fff" stroke-width="14" stroke-linecap="round" opacity=".35"/>
        <rect x="610" y="550" width="60" height="140" rx="20" fill="#fff" opacity=".2"/>`;
    case "lata-tinta":
      return `${SOMBRA}
        <path d="M370 420 Q540 200 710 420" stroke="${detalhe}" stroke-width="10" fill="none"/>
        <path d="M370 420 L370 790 Q370 835 540 835 Q710 835 710 790 L710 420 Z" fill="#d9d9d9" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <path d="M370 520 L710 520 L710 720 Q540 750 370 720 Z" fill="${cor}"/>
        <path d="M370 520 L710 520 M370 720 Q540 750 710 720" stroke="${detalhe}" stroke-width="8" fill="none"/>
        <rect x="470" y="580" width="140" height="80" rx="12" fill="#fff" opacity=".9"/>
        <ellipse cx="540" cy="420" rx="170" ry="44" fill="#bdbdbd" stroke="${detalhe}" stroke-width="12"/>
        <ellipse cx="540" cy="422" rx="140" ry="30" fill="${cor}"/>
        <path d="M600 450 Q600 500 620 500 Q640 500 640 450 M450 450 Q450 480 465 480 Q480 480 480 450" fill="${cor}"/>
        <g transform="rotate(25 800 540)">
          <rect x="770" y="230" width="60" height="230" rx="24" fill="#E3C08D" stroke="${detalhe}" stroke-width="10"/>
          <rect x="755" y="450" width="90" height="70" rx="8" fill="#9aa3ad" stroke="${detalhe}" stroke-width="10"/>
          <path d="M755 515 L845 515 L845 620 Q800 650 755 620 Z" fill="${cor}" stroke="${detalhe}" stroke-width="10" stroke-linejoin="round"/>
        </g>`;
    case "parafuso":
      return `${SOMBRA}
        <rect x="430" y="360" width="100" height="460" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
        <path d="M430 400 L530 430 M430 440 L530 470 M430 480 L530 510 M430 520 L530 550 M430 560 L530 590 M430 600 L530 630 M430 640 L530 670 M430 680 L530 710 M430 720 L530 750 M430 760 L530 790" stroke="${detalhe}" stroke-width="8"/>
        <path d="M430 820 L480 860 L530 820 Z" fill="${cor}" stroke="${detalhe}" stroke-width="10" stroke-linejoin="round"/>
        <path d="M340 260 L620 260 L620 370 L340 370 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <path d="M410 260 L410 370 M550 260 L550 370" stroke="${detalhe}" stroke-width="8"/>
        <rect x="420" y="275" width="120" height="20" rx="10" fill="#fff" opacity=".4"/>
        <path d="M800 520 L890 572 L890 676 L800 728 L710 676 L710 572 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <circle cx="800" cy="624" r="48" fill="none" stroke="${detalhe}" stroke-width="12"/>
        <circle cx="800" cy="624" r="36" fill="${detalhe}" opacity=".35"/>
        <path d="M735 585 L800 548" stroke="#fff" stroke-width="12" stroke-linecap="round" opacity=".4"/>`;
    case "lampada":
      return `${SOMBRA}
        <path d="M600 140 L600 190 M380 230 L415 265 M820 230 L785 265 M300 440 L350 440 M900 440 L850 440" stroke="${detalhe}" stroke-width="16" stroke-linecap="round" opacity=".4"/>
        <path d="M600 230 C780 230 860 360 820 480 C790 560 720 600 705 660 L495 660 C480 600 410 560 380 480 C340 360 420 230 600 230 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <path d="M545 660 L545 520 Q545 470 575 490 Q600 520 625 490 Q655 470 655 520 L655 660" stroke="${detalhe}" stroke-width="8" fill="none" opacity=".6"/>
        <path d="M450 380 Q480 300 560 285" stroke="#fff" stroke-width="20" fill="none" stroke-linecap="round" opacity=".5"/>
        <rect x="490" y="660" width="220" height="130" rx="16" fill="#9aa3ad" stroke="${detalhe}" stroke-width="12"/>
        <path d="M495 700 L705 690 M495 740 L705 730" stroke="${detalhe}" stroke-width="8"/>
        <path d="M540 790 L660 790 L630 830 L570 830 Z" fill="${detalhe}"/>`;
    case "caneca":
      return `${SOMBRA}
        <path d="M740 470 Q890 470 890 600 Q890 730 740 730" stroke="${detalhe}" stroke-width="72" fill="none"/>
        <path d="M740 470 Q890 470 890 600 Q890 730 740 730" stroke="${cor}" stroke-width="48" fill="none"/>
        <path d="M360 380 L760 380 L760 780 Q760 835 705 835 L415 835 Q360 835 360 780 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <ellipse cx="560" cy="380" rx="200" ry="40" fill="${detalhe}" stroke="${detalhe}" stroke-width="12"/>
        <ellipse cx="560" cy="386" rx="180" ry="28" fill="#5A3221"/>
        <path d="M560 680 C470 620 470 560 520 555 Q550 555 560 590 Q570 555 600 555 C650 560 650 620 560 680 Z" fill="#fff" opacity=".9"/>
        <rect x="395" y="440" width="26" height="340" rx="13" fill="#fff" opacity=".35"/>`;
    case "pote":
      return `${SOMBRA}
        <rect x="340" y="460" width="520" height="375" rx="44" fill="#fff" fill-opacity=".5" stroke="${detalhe}" stroke-width="12"/>
        <path d="M352 600 Q470 570 600 600 Q730 630 848 600 L848 790 Q848 823 815 823 L385 823 Q352 823 352 790 Z" fill="#E3C08D"/>
        <g fill="#C99A5B"><circle cx="420" cy="660" r="10"/><circle cx="500" cy="720" r="10"/><circle cx="600" cy="660" r="10"/><circle cx="700" cy="740" r="10"/><circle cx="780" cy="670" r="10"/><circle cx="460" cy="780" r="10"/><circle cx="640" cy="780" r="10"/></g>
        <rect x="370" y="490" width="24" height="300" rx="12" fill="#fff" opacity=".6"/>
        <rect x="320" y="390" width="560" height="100" rx="28" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
        <rect x="520" y="470" width="160" height="70" rx="14" fill="${cor}" stroke="${detalhe}" stroke-width="10"/>
        <rect x="300" y="440" width="50" height="90" rx="14" fill="${cor}" stroke="${detalhe}" stroke-width="10"/>
        <rect x="850" y="440" width="50" height="90" rx="14" fill="${cor}" stroke="${detalhe}" stroke-width="10"/>
        <path d="M360 415 L840 415" stroke="#fff" stroke-width="12" stroke-linecap="round" opacity=".35"/>`;
    case "pneu":
      return `${SOMBRA}
        <circle cx="600" cy="560" r="290" fill="#2b2b2b" stroke="${detalhe}" stroke-width="12"/>
        <circle cx="600" cy="560" r="272" fill="none" stroke="#444" stroke-width="26" stroke-dasharray="34 22"/>
        <circle cx="600" cy="560" r="225" fill="none" stroke="#3a3a3a" stroke-width="8"/>
        <circle cx="600" cy="560" r="175" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
        <g fill="${detalhe}" opacity=".55">
          <ellipse cx="600" cy="460" rx="30" ry="50"/>
          <ellipse cx="600" cy="460" rx="30" ry="50" transform="rotate(72 600 560)"/>
          <ellipse cx="600" cy="460" rx="30" ry="50" transform="rotate(144 600 560)"/>
          <ellipse cx="600" cy="460" rx="30" ry="50" transform="rotate(216 600 560)"/>
          <ellipse cx="600" cy="460" rx="30" ry="50" transform="rotate(288 600 560)"/>
        </g>
        <circle cx="600" cy="560" r="42" fill="#d9d9d9" stroke="${detalhe}" stroke-width="10"/>
        <path d="M470 440 Q520 400 580 395" stroke="#fff" stroke-width="14" fill="none" stroke-linecap="round" opacity=".4"/>`;
    case "galao-oleo":
      return `${SOMBRA}
        <path d="M640 380 L640 270 Q640 230 680 230 L780 230 Q820 230 820 270 L820 400" stroke="${detalhe}" stroke-width="66" fill="none" stroke-linejoin="round"/>
        <path d="M640 380 L640 270 Q640 230 680 230 L780 230 Q820 230 820 270 L820 400" stroke="${cor}" stroke-width="42" fill="none" stroke-linejoin="round"/>
        <rect x="420" y="290" width="110" height="100" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
        <rect x="400" y="245" width="150" height="65" rx="14" fill="${detalhe}"/>
        <rect x="370" y="360" width="480" height="475" rx="44" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
        <rect x="420" y="480" width="380" height="250" rx="22" fill="#fff" opacity=".92"/>
        <path d="M530 600 Q530 560 570 510 Q610 560 610 600 Q610 640 570 640 Q530 640 530 600 Z" fill="${cor}"/>
        <path d="M640 560 L760 560 M640 600 L740 600 M640 640 L720 640" stroke="${detalhe}" stroke-width="12" stroke-linecap="round" opacity=".6"/>
        <rect x="395" y="400" width="24" height="380" rx="12" fill="#fff" opacity=".3"/>`;
    case "capacete":
      return `${SOMBRA}
        <path d="M290 640 Q270 320 580 280 Q870 260 910 520 Q925 620 880 700 L840 770 L430 770 Q300 750 290 640 Z" fill="${cor}" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <path d="M500 450 Q720 390 890 460 Q915 560 875 630 L560 630 Q490 560 500 450 Z" fill="#2B3A4A" stroke="${detalhe}" stroke-width="12" stroke-linejoin="round"/>
        <path d="M560 470 Q700 430 820 460" stroke="#fff" stroke-width="16" fill="none" stroke-linecap="round" opacity=".45"/>
        <path d="M330 520 Q400 380 560 340" stroke="#fff" stroke-width="30" fill="none" stroke-linecap="round" opacity=".35"/>
        <path d="M600 690 L820 690 M620 725 L800 725" stroke="${detalhe}" stroke-width="10" stroke-linecap="round" opacity=".5"/>
        <circle cx="520" cy="540" r="22" fill="${detalhe}"/>
        <path d="M300 690 Q450 760 860 760" stroke="${detalhe}" stroke-width="10" fill="none" opacity=".4"/>`;
    case "bateria":
      return `${SOMBRA}
        <rect x="390" y="290" width="80" height="90" rx="10" fill="#9aa3ad" stroke="${detalhe}" stroke-width="10"/>
        <rect x="730" y="290" width="80" height="90" rx="10" fill="#9aa3ad" stroke="${detalhe}" stroke-width="10"/>
        <rect x="320" y="400" width="560" height="435" rx="24" fill="${cor}" stroke="${detalhe}" stroke-width="12"/>
        <rect x="300" y="360" width="600" height="80" rx="16" fill="${detalhe}"/>
        <path d="M410 400 L450 400 M430 380 L430 420" stroke="#fff" stroke-width="12" stroke-linecap="round"/>
        <path d="M750 400 L790 400" stroke="#fff" stroke-width="12" stroke-linecap="round"/>
        <rect x="380" y="520" width="440" height="200" rx="18" fill="#fff" opacity=".92"/>
        <path d="M610 545 L540 630 L595 630 L570 700 L660 600 L605 600 L630 545 Z" fill="#F6C445" stroke="${detalhe}" stroke-width="8" stroke-linejoin="round"/>
        <rect x="345" y="470" width="22" height="330" rx="11" fill="#fff" opacity=".25"/>`;
  }
}

// ---------------------------------------------------------------------------
// Peças
// ---------------------------------------------------------------------------

function escapar(texto: string): string {
  return texto
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Clareia (+) ou escurece (−) uma cor "#rrggbb". */
export function tom(cor: string, quanto: number): string {
  const valor = Number.parseInt(cor.slice(1), 16);
  const canal = (deslocamento: number): number => {
    const atual = (valor >> deslocamento) & 0xff;
    const alvo = quanto >= 0 ? 255 : 0;
    return Math.round(atual + (alvo - atual) * Math.abs(quanto));
  };
  return `#${[16, 8, 0]
    .map((d) => canal(d).toString(16).padStart(2, "0"))
    .join("")}`;
}

const FONTE = "Helvetica Neue, Helvetica, Arial, sans-serif";

export interface PedidoDeFotoDeProduto {
  readonly ilustracao: Ilustracao;
  /** Fundo da imagem. */
  readonly fundo: string;
  /** Cor da peça desenhada. */
  readonly cor: string;
  /** Variação de enquadramento entre as fotos do mesmo produto. */
  readonly angulo?: number;
}

/**
 * A foto do produto não leva texto: a vitrine escreve o nome por cima do
 * cartão e recorta a imagem conforme a tela, então nome desenhado aqui sairia
 * duplicado ou cortado. O nome fica no texto alternativo.
 */
export function svgDoProduto(pedido: PedidoDeFotoDeProduto): string {
  const detalhe = tom(pedido.cor, -0.45);
  const angulo = pedido.angulo ?? 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
  <defs>
    <linearGradient id="f" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${tom(pedido.fundo, 0.25)}"/>
      <stop offset="1" stop-color="${tom(pedido.fundo, -0.12)}"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="1200" fill="url(#f)"/>
  <circle cx="${1040 - angulo * 60}" cy="${170 + angulo * 40}" r="230" fill="#fff" opacity=".12"/>
  <circle cx="${140 + angulo * 50}" cy="${1080 - angulo * 30}" r="180" fill="#fff" opacity=".1"/>
  <circle cx="600" cy="600" r="${400 - angulo * 20}" fill="#fff" opacity=".1"/>
  <g transform="translate(600 640) scale(${1.08 + angulo * 0.06}) rotate(${angulo * 8}) translate(-600 -560)">
    ${desenhar(pedido.ilustracao, pedido.cor, detalhe)}
  </g>
</svg>`;
}

export interface PedidoDeMarca {
  readonly nome: string;
  readonly iniciais: string;
  readonly chamada: string;
  readonly primaria: string;
  readonly secundaria: string;
  readonly ilustracoes: readonly Ilustracao[];
}

export function svgDoLogo(marca: PedidoDeMarca): string {
  // O nome cabe na largura do logo: nome longo ganha letra menor.
  const fonte = Math.min(44, Math.floor(460 / (marca.nome.length * 0.6)));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="${marca.primaria}"/>
  <circle cx="256" cy="230" r="150" fill="${marca.secundaria}"/>
  <text x="256" y="282" font-family="${FONTE}" font-size="150" font-weight="800" fill="${marca.primaria}" text-anchor="middle">${escapar(marca.iniciais)}</text>
  <text x="256" y="452" font-family="${FONTE}" font-size="${fonte}" font-weight="700" fill="#fff" text-anchor="middle">${escapar(marca.nome)}</text>
</svg>`;
}

/**
 * A capa é um padrão de ilustrações, sem texto: o site a recorta conforme a
 * tela (cartão alto no computador, faixa larga no celular), e texto recortado
 * pela metade fica pior do que nenhum. O nome da loja a página já mostra.
 */
export function svgDaCapa(marca: PedidoDeMarca): string {
  const detalhe = tom(marca.primaria, -0.45);
  const cores = [marca.secundaria, "#ffffff", tom(marca.secundaria, -0.15)];
  const pecas: string[] = [];
  for (let linha = 0; linha < 5; linha++) {
    for (let coluna = 0; coluna < 7; coluna++) {
      const i = linha * 7 + coluna;
      const tipo = marca.ilustracoes[i % marca.ilustracoes.length]!;
      const x = coluna * 250 - 60 + (linha % 2) * 125;
      const y = linha * 230 - 70;
      const giro = ((i * 37) % 30) - 15;
      pecas.push(
        `<g transform="translate(${x} ${y}) scale(.24) rotate(${giro} 600 560)" opacity="${i % 4 === 0 ? 1 : 0.92}">${desenhar(tipo, cores[i % cores.length]!, detalhe)}</g>`,
      );
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000">
  <defs>
    <linearGradient id="c" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${tom(marca.primaria, 0.12)}"/>
      <stop offset="1" stop-color="${tom(marca.primaria, -0.3)}"/>
    </linearGradient>
    <radialGradient id="v" cx=".5" cy=".5" r=".7">
      <stop offset=".55" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity=".35"/>
    </radialGradient>
  </defs>
  <rect width="1600" height="1000" fill="url(#c)"/>
  ${pecas.join("\n  ")}
  <rect width="1600" height="1000" fill="url(#v)"/>
</svg>`;
}

// ---------------------------------------------------------------------------
// Gravação
// ---------------------------------------------------------------------------

export interface ImagemGravada {
  /** Endereço público, servido pelo Next: "/demo/<loja>/<arquivo>.webp". */
  readonly url: string;
  /** Chave no acervo (`assets.storage_key`): "demo/<loja>/<arquivo>.webp". */
  readonly chave: string;
  readonly bytes: number;
  readonly largura: number;
  readonly altura: number;
}

export interface ImagemParaGravar {
  /** Subpasta da loja dentro de `public/demo/`. */
  readonly pasta: string;
  /** Nome do arquivo, sem extensão. */
  readonly arquivo: string;
  readonly svg: string;
  readonly largura: number;
  readonly altura: number;
}

/** Converte o SVG em WebP e grava na pasta pública do site. */
export async function gravarImagem({
  pasta,
  arquivo,
  svg,
  largura,
  altura,
}: ImagemParaGravar): Promise<ImagemGravada> {
  const sharp = carregarSharp();
  const conteudo = await sharp(Buffer.from(svg))
    .webp({ quality: 86 })
    .toBuffer();
  const destino = resolve(PASTA_PUBLICA, PREFIXO_PUBLICO.slice(1), pasta);
  await mkdir(destino, { recursive: true });
  // As imagens nascem desta carga em cada máquina: não vão para o git.
  await writeFile(
    resolve(PASTA_PUBLICA, PREFIXO_PUBLICO.slice(1), ".gitignore"),
    "# Gerado por `pnpm --filter @simpleclick/database demo`: não versionar.\n*\n!.gitignore\n",
  );
  await writeFile(resolve(destino, `${arquivo}.webp`), conteudo);
  const chave = `${PREFIXO_PUBLICO.slice(1)}/${pasta}/${arquivo}.webp`;
  return {
    url: `/${chave}`,
    chave,
    bytes: conteudo.byteLength,
    largura,
    altura,
  };
}
