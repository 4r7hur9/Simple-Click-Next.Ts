/**
 * O cardápio da loja (AC-404, AC-405, AC-406, AC-407).
 *
 * COMPONENTE DE SERVIDOR, e é isso que a página é. O conteúdo chega pronto ao
 * navegador, sem depender de script para mostrar produto — o que o AC-415 exige
 * e o que faz o cardápio abrir na fila do ônibus com uma barra de sinal. Não há
 * nenhum `"use client"` nesta árvore, e é de propósito: a vitrine é a
 * superfície de quem está com fome, e a régua do projeto não permite peso aqui.
 *
 * AS DUAS BUSCAS SAEM JUNTAS. A apresentação e o catálogo são rotas separadas
 * na API de propósito (quem só quer saber se a loja está aberta não baixa o
 * cardápio inteiro), então esta página pede as duas EM PARALELO. Em série, o
 * tempo até o primeiro produto seria a soma das duas idas — e é justamente esse
 * tempo que o AC-415 mede.
 */
import "@simpleclick/ui/styles/vitrine.css";

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PALETA_CLARA, TemaDaLoja, Vazio } from "@simpleclick/ui";

import { AbasDeCategoria } from "../../../../../features/vitrine/AbasDeCategoria.tsx";
import { Destaques } from "../../../../../features/vitrine/Destaques.tsx";
import { GradeDeProdutos } from "../../../../../features/vitrine/GradeDeProdutos.tsx";
import { PARAMETRO_DA_CATEGORIA } from "../../../../../lib/catalogo.ts";
import { prepararCatalogo } from "../../../../../server/catalogo-na-tela.ts";
import {
  buscarCatalogo,
  buscarVitrine,
} from "../../../../../server/vitrine.ts";

/** A cor de reserva quando a loja não escolheu nenhuma (AC-014). */
const COR_DE_RESERVA = PALETA_CLARA.primaria;

interface ParametrosDaPagina {
  readonly params: Promise<{ readonly slug: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** O primeiro valor do parâmetro, quando alguém repete `?categoria=` no endereço. */
function primeiro(valor: string | string[] | undefined): string | null {
  if (Array.isArray(valor)) return valor[0] ?? null;
  return valor ?? null;
}

export async function generateMetadata({
  params,
}: ParametrosDaPagina): Promise<Metadata> {
  const { slug } = await params;
  const resultado = await buscarVitrine(slug);

  if (resultado.estado !== "encontrada") {
    return { title: "Loja não disponível" };
  }

  const { loja } = resultado.vitrine;
  return {
    title: `${loja.rotulos.catalogo} · ${loja.nome}`,
    description:
      loja.boasVindas ??
      `Veja o ${loja.rotulos.catalogo.toLowerCase()} de ${loja.nome} e peça pelo WhatsApp.`,
  };
}

export default async function PaginaDoCatalogo({
  params,
  searchParams,
}: ParametrosDaPagina) {
  const { slug } = await params;
  const [vitrine, catalogo, consulta] = await Promise.all([
    buscarVitrine(slug),
    buscarCatalogo(slug),
    searchParams,
  ]);

  // Inexistente e suspensa caem no MESMO lugar, porque a API já as respondeu
  // igual (AC-402). Distinguir aqui desfaria o cuidado tomado lá.
  if (
    vitrine.estado === "nao-encontrada" ||
    catalogo.estado === "nao-encontrada"
  ) {
    notFound();
  }

  if (vitrine.estado === "indisponivel") {
    throw new Error(`vitrine indisponível: ${vitrine.motivo}`);
  }

  if (catalogo.estado === "indisponivel") {
    // API fora do ar não é loja sem produto. Cair no estado vazio faria o dono
    // achar que o cardápio dele sumiu quando o problema é nosso.
    throw new Error(`catálogo indisponível: ${catalogo.motivo}`);
  }

  const { loja } = vitrine.vitrine;
  const naTela = prepararCatalogo(catalogo.catalogo, {
    apelidoDaLoja: loja.apelido,
    categoriaEscolhida: primeiro(consulta[PARAMETRO_DA_CATEGORIA]),
  });

  return (
    <TemaDaLoja
      corPrincipal={loja.cores?.["primaria"] ?? COR_DE_RESERVA}
      className="sc-pagina-da-loja"
    >
      <main className="sc-vitrine">
        <header className="sc-vitrine__cabecalho">
          {/*
            O caminho de volta é um link de verdade para a apresentação, e não
            um `history.back()`: quem chegou aqui por um endereço compartilhado
            não tem para onde voltar, e o botão do navegador o tiraria da loja.
          */}
          <a className="sc-vitrine__voltar" href={`/l/${loja.apelido}`}>
            ← {loja.nome}
          </a>
        </header>

        <h1 className="sc-vitrine__titulo">{loja.rotulos.catalogo}</h1>

        {naTela.lojaSemCatalogo ? (
          // AC-407: loja recém-criada explica que está montando o catálogo, em
          // vez de mostrar uma tela vazia que lê como erro de carregamento.
          <Vazio
            titulo={`O ${loja.rotulos.catalogo.toLowerCase()} está sendo montado`}
            descricao={`${loja.nome} ainda não publicou produtos. Volte em breve.`}
          />
        ) : (
          <>
            <AbasDeCategoria
              abas={naTela.abas}
              filtroEmVigor={naTela.filtroEmVigor}
            />

            <Destaques destaques={naTela.destaques} />

            {naTela.filtroSemAcerto ? (
              // Categoria que não existe mais não derruba a página: ela explica
              // e oferece a saída, porque vazio sem caminho é beco sem saída.
              <Vazio
                titulo="Essa categoria não existe mais"
                descricao={`Ela pode ter sido renomeada ou retirada do ${loja.rotulos.catalogo.toLowerCase()}.`}
                acao={
                  <a className="sc-vitrine__aba" href={naTela.linkDeTodas}>
                    Ver o {loja.rotulos.catalogo.toLowerCase()} inteiro
                  </a>
                }
              />
            ) : (
              <div className="sc-vitrine__secoes">
                {naTela.secoes.map((secao, indice) => (
                  <GradeDeProdutos
                    key={secao.id}
                    secao={secao}
                    primeira={indice === 0}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </TemaDaLoja>
  );
}
