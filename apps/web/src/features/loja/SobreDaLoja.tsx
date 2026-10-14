/**
 * A página Sobre da loja (AC-421, AC-422, AC-423).
 *
 * CONTEÚDO DE SERVIDOR, sem script. As informações práticas — onde retirar e
 * como falar com a loja — ficam em sanfonas (`details`), que abrem e fecham
 * pelo próprio navegador: funcionam com o script desligado, e o texto está no
 * HTML mesmo fechado, para o buscador e para o Ctrl+F.
 */
import {
  IconeInfo,
  IconeLoja,
  PALETA_CLARA,
  Sanfona,
  TemaDaLoja,
} from "@simpleclick/ui";

interface Endereco {
  readonly logradouro: string | null;
  readonly numero: string | null;
  readonly complemento: string | null;
  readonly bairro: string | null;
  readonly cidade: string | null;
  readonly uf: string | null;
}

export interface DadosSobreDaLoja {
  readonly apelido: string;
  readonly nome: string;
  readonly sobre: string | null;
  readonly logo: string | null;
  readonly capa: string | null;
  readonly cores: Readonly<Record<string, string>> | null;
  readonly enderecoParaRetirada: Endereco | null;
  readonly whatsappPublico: string | null;
}

function enderecoEmLinhas(endereco: Endereco): string[] {
  return [
    [endereco.logradouro, endereco.numero].filter(Boolean).join(", "),
    endereco.complemento,
    endereco.bairro,
    [endereco.cidade, endereco.uf].filter(Boolean).join(" / "),
  ].filter((linha): linha is string => Boolean(linha));
}

function numeroDoWhatsApp(numero: string): string {
  return numero.replace(/\D/g, "");
}

export function SobreDaLoja({ loja }: { readonly loja: DadosSobreDaLoja }) {
  return (
    <TemaDaLoja
      corPrincipal={loja.cores?.["primaria"] ?? PALETA_CLARA.primaria}
      className="sc-pagina-da-loja"
    >
      {/* O fundo vai num bloco próprio: o contêiner do tema é `display:
          contents` e não pinta nada. */}
      <div className="min-h-screen bg-[var(--cor-superficie)] text-[var(--cor-tinta)]">
        <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:py-12">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <a
              className="inline-flex min-h-[var(--altura-toque)] items-center font-medium text-[var(--cor-primaria-texto)]"
              href={`/l/${loja.apelido}`}
            >
              ← Voltar para {loja.nome}
            </a>
            <a
              className="sc-botao sc-botao--secundaria sc-botao--pilula"
              href={`/l/${loja.apelido}/catalogo`}
            >
              Ver catálogo
            </a>
          </header>

          <article
            className="mt-6 overflow-hidden rounded-[var(--raio-janela)] bg-[var(--cor-superficie-alta)] shadow-[var(--sombra-larga)]"
            aria-labelledby="sobre-titulo"
          >
            {loja.capa ? (
              <img
                className="h-48 w-full object-cover sm:h-72"
                src={loja.capa}
                alt=""
                width={1200}
                height={420}
                loading="eager"
              />
            ) : null}

            <div className="p-5 sm:p-8">
              <div className="flex flex-wrap items-center gap-4">
                {loja.logo ? (
                  <img
                    className="h-16 w-16 rounded-[var(--raio-cartao)] object-cover shadow-[var(--sombra-larga)]"
                    src={loja.logo}
                    alt=""
                    width={64}
                    height={64}
                  />
                ) : null}
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--cor-primaria-texto)]">
                    Sobre a loja
                  </p>
                  <h1
                    id="sobre-titulo"
                    className="mt-1 font-[family-name:var(--fonte-titulo)] text-3xl font-semibold sm:text-4xl"
                  >
                    {loja.nome}
                  </h1>
                </div>
              </div>

              <p className="mt-6 max-w-[65ch] whitespace-pre-line text-base leading-7 sm:text-lg sm:leading-8">
                {loja.sobre ?? `Conheça a história da ${loja.nome}.`}
              </p>
            </div>
          </article>

          {loja.enderecoParaRetirada || loja.whatsappPublico ? (
            <section className="mt-6" aria-label="Informações da loja">
              {loja.enderecoParaRetirada ? (
                <Sanfona
                  titulo="Retirada"
                  icone={<IconeLoja />}
                  abertaInicialmente
                >
                  <address className="not-italic leading-7">
                    {enderecoEmLinhas(loja.enderecoParaRetirada).map(
                      (linha) => (
                        <span className="block" key={linha}>
                          {linha}
                        </span>
                      ),
                    )}
                  </address>
                </Sanfona>
              ) : null}

              {loja.whatsappPublico ? (
                <Sanfona titulo="Fale com a loja" icone={<IconeInfo />}>
                  <a
                    className="sc-botao sc-botao--primaria sc-botao--pilula"
                    href={`https://wa.me/${numeroDoWhatsApp(loja.whatsappPublico)}`}
                  >
                    WhatsApp público
                  </a>
                </Sanfona>
              ) : null}
            </section>
          ) : null}
        </main>
      </div>
    </TemaDaLoja>
  );
}
