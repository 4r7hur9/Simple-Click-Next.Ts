/**
 * A página do fechamento (AC-503 a AC-512).
 *
 * A DIVISÃO ENTRE SERVIDOR E NAVEGADOR É A DECISÃO QUE MANDA AQUI, e ela não é
 * de gosto. Tudo que descreve a LOJA — nome, cor, formas de pagamento, taxa de
 * entrega, chave PIX — chega pronto do servidor, desenhado antes de qualquer
 * script. Tudo que descreve o CARRINHO é carregado no navegador, porque o
 * carrinho é identificado por um cookie que a API emitiu no domínio dela: se o
 * servidor do Next fizesse a chamada, o cookie seria dele e todos os visitantes
 * dividiriam o mesmo carrinho.
 *
 * A CHAVE PIX VEM DE ROTA PRÓPRIA (T-513), e é a única página do site que a
 * pede. O AC-904 manda ela não aparecer nos dados públicos da vitrine; o AC-510
 * manda ela aparecer quando o cliente escolhe pagar com PIX. São momentos
 * diferentes, e por isso são rotas diferentes.
 */
import "@simpleclick/ui/styles/vitrine.css";
import "@simpleclick/ui/styles/fechamento.css";

import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PALETA_CLARA, TemaDaLoja } from "@simpleclick/ui";

import { FechamentoDaCompra } from "../../../../../features/checkout/FechamentoDaCompra.tsx";
import { buscarFechamento } from "../../../../../server/fechamento.ts";
import { buscarVitrine } from "../../../../../server/vitrine.ts";
import { conhecidosDaConta } from "../../../../../lib/enderecos-da-conta.ts";
import { NOME_DO_COOKIE_DE_ACESSO } from "../../../../../server/session-cookie.ts";

/** A cor de reserva quando a loja não escolheu nenhuma (AC-014). */
const COR_DE_RESERVA = PALETA_CLARA.primaria;

interface ParametrosDaPagina {
  readonly params: Promise<{ readonly slug: string }>;
}

/**
 * O fechamento NÃO É INDEXÁVEL, e isso é de propósito.
 *
 * É uma página de sessão: ela só faz sentido para quem tem carrinho, e um
 * buscador que a indexasse ofereceria a estranhos um endereço que abre vazio.
 * Pior: ela é a única do site que carrega a chave PIX da loja.
 */
export async function generateMetadata({
  params,
}: ParametrosDaPagina): Promise<Metadata> {
  const { slug } = await params;
  const vitrine = await buscarVitrine(slug);

  return {
    title:
      vitrine.estado === "encontrada"
        ? `Fechar pedido · ${vitrine.vitrine.loja.nome}`
        : "Fechar pedido",
    robots: { index: false, follow: false },
  };
}

export default async function PaginaDoFechamento({
  params,
}: ParametrosDaPagina) {
  const { slug } = await params;

  // QUEM ESTÁ LOGADO CHEGA COM O ENDEREÇO PADRÃO PREENCHIDO (AC-509, T-707).
  // O token fica no servidor (P-008): a página pede o endereço daqui, e o
  // navegador recebe só os campos já preenchidos — editáveis.
  const token = (await cookies()).get(NOME_DO_COOKIE_DE_ACESSO)?.value;
  const [vitrine, fechamento, conhecidos] = await Promise.all([
    buscarVitrine(slug),
    buscarFechamento(slug),
    conhecidosDaConta(token),
  ]);

  if (vitrine.estado === "nao-encontrada") notFound();
  if (vitrine.estado === "indisponivel") {
    throw new Error(`vitrine indisponível: ${vitrine.motivo}`);
  }
  if (fechamento.estado === "nao-encontrado") notFound();
  if (fechamento.estado === "indisponivel") {
    throw new Error(`fechamento indisponível: ${fechamento.motivo}`);
  }

  const { loja } = vitrine.vitrine;
  const config = fechamento.fechamento;
  const rotulo = loja.rotulos.catalogo;

  return (
    <TemaDaLoja
      corPrincipal={loja.cores?.["primaria"] ?? COR_DE_RESERVA}
      className="sc-pagina-da-loja"
    >
      <main className="sc-fechamento__pagina">
        <nav className="sc-fechamento__caminho" aria-label="Você está em">
          <a
            className="sc-vitrine__voltar"
            href={`/l/${loja.apelido}/catalogo`}
          >
            ← {rotulo}
          </a>
        </nav>

        <h1 className="sc-fechamento__titulo">Fechar pedido</h1>

        <FechamentoDaCompra
          apelidoDaLoja={loja.apelido}
          formas={{
            aceitaEntrega: config.entrega.aceitaEntrega,
            aceitaRetirada: config.entrega.aceitaRetirada,
            // O endereço da loja aparece na RETIRADA, para a pessoa saber onde
            // buscar — e não aparece na entrega, onde seria ruído.
            enderecoDaLoja: enderecoEmUmaLinha(loja.enderecoParaRetirada),
          }}
          formasDePagamento={config.formasDePagamento}
          pix={config.pix}
          entrega={{
            taxaCentavos: config.entrega.taxaCentavos,
            nomeDaTaxa: config.entrega.nomeDaTaxa,
            gratisAcimaDeCentavos: config.entrega.gratisAcimaDeCentavos,
            minimoParaEntregaCentavos: config.entrega.minimoParaEntregaCentavos,
          }}
          linkDoCatalogo={`/l/${loja.apelido}/catalogo`}
          rotuloDoCatalogo={rotulo}
          conhecidos={conhecidos}
        />
      </main>
    </TemaDaLoja>
  );
}

/** Junta as partes do endereço numa linha, sem vírgula sobrando. */
function enderecoEmUmaLinha(
  endereco: {
    readonly logradouro: string | null;
    readonly numero: string | null;
    readonly bairro: string | null;
    readonly cidade: string | null;
    readonly uf: string | null;
  } | null,
): string | null {
  if (endereco === null) return null;
  const rua = [endereco.logradouro, endereco.numero].filter(Boolean).join(", ");
  const cidade = [endereco.cidade, endereco.uf].filter(Boolean).join("/");
  const linha = [rua, endereco.bairro, cidade].filter(Boolean).join(" · ");
  return linha === "" ? null : linha;
}
