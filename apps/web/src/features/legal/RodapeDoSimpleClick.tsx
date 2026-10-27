/**
 * O rodapé do SimpleClick: o fim da landing e das páginas da marca (Termos,
 * Privacidade, Cookies, LGPD). É o único `contentinfo` dessas páginas.
 *
 * Componente de SERVIDOR (lê o e-mail do suporte e as redes do ambiente); só
 * "Preferências de cookies" e "Voltar ao topo" são ilhas do navegador. Os
 * estilos moram em `landing-rodape.css`: colunas no computador, duas no tablet
 * e duas compactas no celular, links sem sublinhado (o retorno do passar e do
 * foco é cor, deslocamento e uma seta).
 *
 * A loja, o explorar e a conta continuam com o RodapeLegal enxuto: lá a marca
 * da página é a da loja ou o próprio app, não o SimpleClick.
 */
import "@simpleclick/ui/styles/landing-rodape.css";

import { ArrowRight, ArrowUpRight, Mail, MessageCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { emailDeSuporte } from "../../lib/email-de-suporte.ts";
import { LINK_PARA_COMECAR, LINK_PARA_ENTRAR } from "../landing/conteudo.ts";
import { BotaoPreferenciasDeCookies } from "./BotaoPreferenciasDeCookies.tsx";
import { BotaoVoltarAoTopo } from "./BotaoVoltarAoTopo.tsx";
import { ROTAS_LEGAIS, emailDoEncarregado } from "./contato.ts";

interface ItemDoRodape {
  readonly rotulo: string;
  readonly href: string;
}

interface ColunaDoRodape {
  readonly id: string;
  readonly titulo: string;
  readonly itens: readonly ItemDoRodape[];
}

export interface RedeDoSimpleClick {
  readonly rede: "instagram" | "whatsapp";
  readonly rotulo: string;
  readonly href: string;
}

const COLUNA_DO_PRODUTO: ColunaDoRodape = {
  id: "produto",
  titulo: "Produto",
  itens: [
    { rotulo: "Como funciona", href: "/#como-funciona" },
    { rotulo: "Taxas dos apps", href: "/#taxas" },
    { rotulo: "Preços", href: "/#preco" },
    { rotulo: "Explorar lojas", href: "/explorar" },
  ],
};

const COLUNA_DOS_LOJISTAS: ColunaDoRodape = {
  id: "lojistas",
  titulo: "Para lojistas",
  itens: [
    { rotulo: "Criar loja", href: LINK_PARA_COMECAR },
    { rotulo: "Entrar", href: LINK_PARA_ENTRAR },
    { rotulo: "Painel", href: "/painel" },
    { rotulo: "Dúvidas frequentes", href: "/#duvidas" },
  ],
};

/**
 * As redes do SimpleClick só aparecem quando o endereço existe de verdade
 * (variáveis de ambiente); sem elas o rodapé mostra só o contato por e-mail.
 */
export function redesDoSimpleClick(
  ambiente: Readonly<Record<string, string | undefined>> = process.env,
): RedeDoSimpleClick[] {
  const redes: RedeDoSimpleClick[] = [];
  const instagram = ambiente["INSTAGRAM_DO_SIMPLECLICK"]?.trim();
  if (instagram) redes.push({ rede: "instagram", rotulo: "Instagram", href: instagram });
  const whatsapp = ambiente["WHATSAPP_DO_SIMPLECLICK"]?.trim();
  if (whatsapp) redes.push({ rede: "whatsapp", rotulo: "WhatsApp", href: whatsapp });
  return redes;
}

/** Interno sem âncora vai pelo Link (pré-carrega); âncora e e-mail são <a>. */
function LinkDoRodape({ href, children }: { readonly href: string; readonly children: ReactNode }) {
  const conteudo = (
    <>
      <span>{children}</span>
      <ArrowRight className="sc-rodape__seta" aria-hidden="true" size={14} strokeWidth={2.2} />
    </>
  );
  return href.startsWith("/") && !href.includes("#") ? (
    <Link className="sc-rodape__link" href={href}>
      {conteudo}
    </Link>
  ) : (
    <a className="sc-rodape__link" href={href}>
      {conteudo}
    </a>
  );
}

function Coluna({ coluna, extra }: { readonly coluna: ColunaDoRodape; readonly extra?: ReactNode }) {
  const tituloId = `sc-rodape-${coluna.id}`;
  return (
    <nav className={`sc-rodape__coluna sc-rodape__coluna--${coluna.id}`} aria-labelledby={tituloId}>
      <h2 className="sc-rodape__titulo" id={tituloId}>
        {coluna.titulo}
      </h2>
      <ul className="sc-rodape__lista">
        {coluna.itens.map((item) => (
          <li key={item.href}>
            <LinkDoRodape href={item.href}>{item.rotulo}</LinkDoRodape>
          </li>
        ))}
        {extra}
      </ul>
    </nav>
  );
}

/** Instagram em traço, no mesmo peso dos ícones do sistema (lucide). */
function IconeInstagram() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
    </svg>
  );
}

export interface RodapeDoSimpleClickProps {
  /** Para testes: as redes e o e-mail (padrão: o ambiente). */
  readonly redes?: readonly RedeDoSimpleClick[];
  readonly emailDoSuporte?: string;
}

export function RodapeDoSimpleClick({
  redes = redesDoSimpleClick(),
  emailDoSuporte = emailDeSuporte(),
}: RodapeDoSimpleClickProps = {}) {
  const contato = `mailto:${emailDoSuporte}`;
  const colunaDaEmpresa: ColunaDoRodape = {
    id: "empresa",
    titulo: "Empresa e legal",
    itens: [...ROTAS_LEGAIS.map((r) => ({ rotulo: r.rotulo, href: r.rota })), { rotulo: "Contato", href: contato }],
  };

  return (
    <footer className="sc-rodape" data-tema="escuro">
      <div className="sc-rodape__dentro">
        <div className="sc-rodape__grade">
          <section className="sc-rodape__marca" aria-label="SimpleClick">
            <a className="sc-rodape__logo" href="/" aria-label="SimpleClick, início">
              <span className="sc-rodape__simbolo" aria-hidden="true">
                ✦
              </span>
              <span>simpleclick</span>
            </a>
            <p className="sc-rodape__frase">
              Sua loja no link, <strong>sem comissão</strong> e sem mensalidade. Cardápio ou catálogo no
              WhatsApp e cada pedido num painel feito para o balcão.
            </p>
            <a className="sc-rodape__chamada" href={LINK_PARA_COMECAR}>
              <span>Criar minha loja grátis</span>
              <ArrowRight aria-hidden="true" size={18} strokeWidth={2.2} />
            </a>
            <ul className="sc-rodape__contatos" aria-label="Contato e redes">
              <li>
                <a className="sc-rodape__contato" href={contato}>
                  <span className="sc-rodape__contato-icone" aria-hidden="true">
                    <Mail size={18} strokeWidth={2} />
                  </span>
                  <span>{emailDoSuporte}</span>
                </a>
              </li>
              <li>
                <a className="sc-rodape__contato" href={`mailto:${emailDoEncarregado()}`}>
                  <span className="sc-rodape__contato-icone" aria-hidden="true">
                    <ShieldCheck size={18} strokeWidth={2} />
                  </span>
                  <span>Privacidade e dados</span>
                </a>
              </li>
              {redes.map((rede) => (
                <li key={rede.rede}>
                  <a className="sc-rodape__contato" href={rede.href} target="_blank" rel="noopener noreferrer">
                    <span className="sc-rodape__contato-icone" aria-hidden="true">
                      {rede.rede === "instagram" ? <IconeInstagram /> : <MessageCircle size={18} strokeWidth={2} />}
                    </span>
                    <span>{rede.rotulo}</span>
                    <ArrowUpRight className="sc-rodape__fora" aria-hidden="true" size={14} strokeWidth={2.2} />
                    <span className="sc-rodape__so-leitor"> (abre em outra aba)</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>

          <Coluna coluna={COLUNA_DO_PRODUTO} />
          <Coluna coluna={COLUNA_DOS_LOJISTAS} />
          <Coluna
            coluna={colunaDaEmpresa}
            extra={
              <li>
                <BotaoPreferenciasDeCookies className="sc-rodape__link">
                  <span>Preferências de cookies</span>
                  <ArrowRight className="sc-rodape__seta" aria-hidden="true" size={14} strokeWidth={2.2} />
                </BotaoPreferenciasDeCookies>
              </li>
            }
          />
        </div>

        <div className="sc-rodape__base">
          <p className="sc-rodape__direitos">
            © {new Date().getFullYear()} SimpleClick. Marcas citadas pertencem aos seus donos.
          </p>
          <p className="sc-rodape__selo">
            <span className="sc-rodape__selo-cores" aria-hidden="true" />
            Feito no Brasil
          </p>
          <BotaoVoltarAoTopo />
        </div>
      </div>
    </footer>
  );
}
