import { PALETA_CLARA, TemaDaLoja } from "@simpleclick/ui";

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
      className="min-h-screen bg-[var(--cor-papel)] text-[var(--cor-tinta)]"
    >
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 lg:py-14">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <a
            className="font-medium text-[var(--cor-primaria-texto)]"
            href={`/l/${loja.apelido}`}
          >
            ← Voltar para {loja.nome}
          </a>
          <a
            className="sc-botao sc-botao--fantasma"
            href={`/l/${loja.apelido}/catalogo`}
          >
            Ver catálogo
          </a>
        </header>

        {loja.capa ? (
          <img
            className="mt-8 h-56 w-full rounded-[var(--raio-grande)] object-cover sm:h-72"
            src={loja.capa}
            alt=""
            width={1200}
            height={420}
            loading="eager"
          />
        ) : null}

        <section
          className="mt-8 rounded-[var(--raio-grande)] border border-[var(--cor-borda)] bg-[var(--cor-superficie)] p-6 shadow-[var(--sombra-baixa)] sm:p-10"
          aria-labelledby="sobre-titulo"
        >
          <div className="flex flex-wrap items-center gap-5">
            {loja.logo ? (
              <img
                className="h-20 w-20 rounded-2xl object-cover"
                src={loja.logo}
                alt=""
                width={80}
                height={80}
              />
            ) : null}
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--cor-primaria-texto)]">
                Sobre a loja
              </p>
              <h1 id="sobre-titulo" className="mt-2 text-4xl font-semibold">
                {loja.nome}
              </h1>
            </div>
          </div>

          <p className="mt-8 max-w-3xl whitespace-pre-line text-lg leading-8">
            {loja.sobre ?? `Conheça a história da ${loja.nome}.`}
          </p>

          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {loja.enderecoParaRetirada ? (
              <section
                className="rounded-2xl border border-[var(--cor-borda)] p-5"
                aria-labelledby="retirada-titulo"
              >
                <h2 id="retirada-titulo" className="font-semibold">
                  Retirada
                </h2>
                <address className="mt-3 not-italic leading-7">
                  {enderecoEmLinhas(loja.enderecoParaRetirada).map((linha) => (
                    <span className="block" key={linha}>
                      {linha}
                    </span>
                  ))}
                </address>
              </section>
            ) : null}

            {loja.whatsappPublico ? (
              <section
                className="rounded-2xl border border-[var(--cor-borda)] p-5"
                aria-labelledby="whatsapp-titulo"
              >
                <h2 id="whatsapp-titulo" className="font-semibold">
                  Fale com a loja
                </h2>
                <a
                  className="mt-3 inline-flex font-medium text-[var(--cor-primaria-texto)] underline"
                  href={`https://wa.me/${numeroDoWhatsApp(loja.whatsappPublico)}`}
                >
                  WhatsApp público
                </a>
              </section>
            ) : null}
          </div>
        </section>
      </main>
    </TemaDaLoja>
  );
}
