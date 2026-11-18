"use client";

// As peças da base visual do redesign Stitch (card #104) num painel, em cada
// estado. É componente de navegador porque as peças recebem funções (alternar,
// trocar de aba, fechar), que não atravessam do servidor. Os exemplos são de
// lojas de ramos variados e não trazem dado nenhum do Stitch.
import Link from "next/link";
import { useState } from "react";

import {
  Abas,
  AvisoFlutuante,
  BarraInferior,
  Botao,
  BotaoMarcavel,
  Campo,
  Cartao,
  Chip,
  FaixaDeChips,
  Gaveta,
  IconeAnterior,
  IconeBrilho,
  IconeBuscar,
  IconeCompartilhar,
  IconeEmail,
  IconeEstrela,
  IconeExplorar,
  IconeFechar,
  IconeLoja,
  IconePedido,
  IconeProximo,
  IconeSemSom,
  IconeSom,
  IconeUsuario,
  Selo,
} from "@simpleclick/ui";

export type RamoDeExemplo = "lanchonete" | "mercado" | "moda";

const EXEMPLOS = {
  lanchonete: {
    loja: "Lanchonete do Zé",
    categorias: ["Lanches", "Pizzas", "Bebidas", "Sobremesas"],
    produto: "X-Salada artesanal",
    preco: "R$ 24,90",
    filtros: ["Aberto agora", "Entrega", "Retirada"],
  },
  mercado: {
    loja: "Mercadinho Boa Vista",
    categorias: ["Hortifruti", "Padaria", "Limpeza", "Bebidas"],
    produto: "Pão francês (kg)",
    preco: "R$ 16,50",
    filtros: ["Aberto agora", "Em estoque", "Atacado"],
  },
  moda: {
    loja: "Ateliê Maré",
    categorias: ["Camisetas", "Vestidos", "Calçados", "Acessórios"],
    produto: "Camiseta de algodão",
    preco: "R$ 59,00",
    filtros: ["Aberto agora", "Promoção", "Novidades"],
  },
} as const;

/** Rótulo curto de cada ícone mostrado na grade de ícones. */
const ICONES = [
  { id: "brilho", rotulo: "Curtir", desenho: <IconeBrilho /> },
  {
    id: "brilho-cheio",
    rotulo: "Curtido",
    desenho: <IconeBrilho preenchido />,
  },
  { id: "estrela", rotulo: "Favoritar", desenho: <IconeEstrela /> },
  {
    id: "estrela-cheia",
    rotulo: "Favorito",
    desenho: <IconeEstrela preenchido />,
  },
  {
    id: "compartilhar",
    rotulo: "Compartilhar",
    desenho: <IconeCompartilhar />,
  },
  { id: "buscar", rotulo: "Buscar", desenho: <IconeBuscar /> },
  { id: "fechar", rotulo: "Fechar", desenho: <IconeFechar /> },
  { id: "anterior", rotulo: "Anterior", desenho: <IconeAnterior /> },
  { id: "proximo", rotulo: "Próximo", desenho: <IconeProximo /> },
  { id: "som", rotulo: "Som", desenho: <IconeSom /> },
  { id: "sem-som", rotulo: "Sem som", desenho: <IconeSemSom /> },
  { id: "email", rotulo: "E-mail", desenho: <IconeEmail /> },
] as const;

/** Curtir e favoritar de verdade: alternam ao toque, e o curtir pulsa. */
function AcoesDeExemplo({ prefixo }: { prefixo: string }) {
  const [curtido, setCurtido] = useState(false);
  const [favorito, setFavorito] = useState(false);
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-exemplo={`${prefixo}-acoes`}
    >
      <BotaoMarcavel
        icone={<IconeBrilho preenchido={curtido} />}
        marcado={curtido}
        onClick={() => setCurtido((atual) => !atual)}
        soIcone
        variante="secundaria"
      >
        Curtir
      </BotaoMarcavel>
      <BotaoMarcavel
        icone={<IconeEstrela preenchido={favorito} />}
        marcado={favorito}
        onClick={() => setFavorito((atual) => !atual)}
        soIcone
        variante="secundaria"
      >
        Favoritar
      </BotaoMarcavel>
      {/* Os dois já marcados, para ver o estado sem tocar. */}
      <BotaoMarcavel
        icone={<IconeBrilho preenchido />}
        marcado
        soIcone
        variante="secundaria"
      >
        Curtir (marcado)
      </BotaoMarcavel>
      <BotaoMarcavel
        icone={<IconeEstrela preenchido />}
        marcado
        soIcone
        variante="secundaria"
      >
        Favoritar (marcado)
      </BotaoMarcavel>
      <Botao icone={<IconeCompartilhar />} soIcone variante="secundaria">
        Compartilhar
      </Botao>
    </div>
  );
}

/** Filtros que ligam e desligam. */
function FiltrosDeExemplo({
  prefixo,
  filtros,
}: {
  prefixo: string;
  filtros: readonly string[];
}) {
  const [ligados, setLigados] = useState<ReadonlySet<string>>(
    () => new Set([filtros[0] ?? ""]),
  );
  return (
    <FaixaDeChips rotulo={`Filtros (${prefixo})`}>
      {filtros.map((filtro) => (
        <Chip
          ativo={ligados.has(filtro)}
          aoAlternar={() =>
            setLigados((atual) => {
              const proximo = new Set(atual);
              if (!proximo.delete(filtro)) proximo.add(filtro);
              return proximo;
            })
          }
          key={filtro}
        >
          {filtro}
        </Chip>
      ))}
      <Chip desabilitado aoAlternar={() => {}}>
        Esgotado
      </Chip>
    </FaixaDeChips>
  );
}

/** Tudo que a base visual oferece, num painel; `prefixo` mantém os ids únicos. */
export function DemosDaBaseVisual({
  prefixo,
  nome,
  ramo,
  tom,
}: {
  prefixo: string;
  nome: string;
  ramo: RamoDeExemplo;
  /** Tom do aviso flutuante deste painel (um por painel). */
  tom: "sucesso" | "erro";
}) {
  const exemplo = EXEMPLOS[ramo];
  const [gavetaAberta, setGavetaAberta] = useState(true);
  const [modalAberta, setModalAberta] = useState(false);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <section aria-label={`Botões (${nome})`} className="flex flex-col gap-3">
        <h4 className="text-base font-semibold">Botões</h4>
        <div className="flex flex-wrap gap-2">
          <Botao cta icone={<IconeLoja />}>
            Adicionar à sacola
          </Botao>
          <Botao cta carregando>
            Enviando
          </Botao>
          <Botao cta desabilitado>
            Indisponível
          </Botao>
          <Botao variante="secundaria">Cancelar</Botao>
          <Botao variante="discreta">Detalhes</Botao>
          <Botao variante="perigo">Recusar</Botao>
        </div>
        <AcoesDeExemplo prefixo={prefixo} />
      </section>

      <section
        aria-label={`Campo e busca (${nome})`}
        className="flex flex-col gap-3"
      >
        <h4 className="text-base font-semibold">Campo e busca</h4>
        <Campo
          busca
          id={`${prefixo}-busca`}
          rotulo={`Buscar produto em ${exemplo.loja}`}
          rotuloOculto
          placeholder="O que procura hoje?"
        />
        <Campo
          busca
          erro="Digite pelo menos 2 letras."
          id={`${prefixo}-busca-erro`}
          rotulo="Buscar produto"
          rotuloOculto
          defaultValue="a"
        />
        <Campo
          busca
          desabilitado
          id={`${prefixo}-busca-desabilitada`}
          rotulo="Buscar produto (indisponível)"
          rotuloOculto
        />
      </section>

      <section aria-label={`Chips (${nome})`} className="flex flex-col gap-3">
        <h4 className="text-base font-semibold">
          Chips de filtro e de categoria
        </h4>
        <FiltrosDeExemplo filtros={exemplo.filtros} prefixo={prefixo} />
        <FaixaDeChips navegacao rotulo={`Categorias (${prefixo})`}>
          {exemplo.categorias.map((categoria, indice) => (
            <Chip
              ativo={indice === 0}
              componenteDeLink={Link}
              contagem={indice === 0 ? 12 : undefined}
              href={`#${prefixo}-categoria-${indice}`}
              key={categoria}
            >
              {categoria}
            </Chip>
          ))}
        </FaixaDeChips>
      </section>

      <section aria-label={`Abas (${nome})`} className="flex flex-col gap-3">
        <h4 className="text-base font-semibold">Abas</h4>
        <Abas
          abas={[
            {
              id: "publicacoes",
              painel: <p>Novidades e promoções de {exemplo.loja}.</p>,
              rotulo: "Publicações",
            },
            {
              id: "sobre",
              painel: <p>Horários, endereço e formas de pagamento.</p>,
              rotulo: "Sobre",
            },
          ]}
          id={`${prefixo}-abas`}
          rotulo={`Conteúdo da loja (${prefixo})`}
        />
      </section>

      <section
        aria-label={`Cartão de vitrine (${nome})`}
        className="flex flex-col gap-3"
      >
        <h4 className="text-base font-semibold">Cartão de vitrine</h4>
        <Cartao
          nivelDoTitulo={5}
          rodape={
            <>
              <Selo tom="sucesso">Aberta agora</Selo>
              <Botao cta>Adicionar</Botao>
            </>
          }
          superficie="vitrine"
          titulo={exemplo.produto}
        >
          <p className="text-preco">{exemplo.preco}</p>
          <p className="text-corpo-md">{exemplo.loja}</p>
        </Cartao>
      </section>

      <section aria-label={`Gaveta (${nome})`} className="flex flex-col gap-3">
        <h4 className="text-base font-semibold">Gaveta</h4>
        <Botao
          aria-expanded={gavetaAberta}
          onClick={() => setGavetaAberta((atual) => !atual)}
          variante="secundaria"
        >
          {gavetaAberta ? "Fechar a gaveta" : "Abrir a gaveta"}
        </Botao>
        <Gaveta
          aberta={gavetaAberta}
          aoFechar={() => setGavetaAberta(false)}
          embutida
          id={`${prefixo}-gaveta`}
          nivelDoTitulo={5}
          rodape={<Botao cta>Ver resultados</Botao>}
          titulo="Filtros"
        >
          <FiltrosDeExemplo
            filtros={exemplo.filtros}
            prefixo={`${prefixo}-gaveta`}
          />
        </Gaveta>
        {/* A mesma peça como janela modal de verdade: fechada, não aparece. */}
        <Botao
          id={`${prefixo}-abrir-gaveta`}
          onClick={() => setModalAberta(true)}
          variante="secundaria"
        >
          Abrir como janela modal
        </Botao>
        <Gaveta
          aberta={modalAberta}
          aoFechar={() => setModalAberta(false)}
          id={`${prefixo}-gaveta-modal`}
          nivelDoTitulo={5}
          rodape={<Botao cta>Ver resultados</Botao>}
          titulo="Filtros (janela modal)"
        >
          <p>O foco fica aqui dentro até fechar.</p>
        </Gaveta>
      </section>

      <section
        aria-label={`Aviso flutuante (${nome})`}
        className="flex flex-col gap-3"
      >
        <h4 className="text-base font-semibold">Aviso flutuante</h4>
        <AvisoFlutuante
          acao={
            tom === "sucesso"
              ? { aoAcionar: () => {}, rotulo: "Ver sacola" }
              : undefined
          }
          aoFechar={() => {}}
          embutido
          mensagem={
            tom === "sucesso"
              ? `${exemplo.produto} foi para a sacola`
              : "Não deu para adicionar: item esgotado"
          }
          tom={tom}
        />
      </section>

      <section
        aria-label={`Barra inferior (${nome})`}
        className="flex flex-col gap-3"
      >
        <h4 className="text-base font-semibold">Barra inferior</h4>
        <BarraInferior
          componenteDeLink={Link}
          embutida
          itens={[
            {
              ativo: true,
              href: `#${prefixo}-explorar`,
              icone: <IconeExplorar />,
              id: "explorar",
              rotulo: "Explorar",
            },
            {
              href: `#${prefixo}-lojas`,
              icone: <IconeLoja />,
              id: "lojas",
              rotulo: "Lojas",
            },
            {
              href: `#${prefixo}-favoritos`,
              icone: <IconeEstrela />,
              id: "favoritos",
              rotulo: "Favoritos",
            },
            {
              href: `#${prefixo}-pedidos`,
              icone: <IconePedido />,
              id: "pedidos",
              rotulo: "Pedidos",
            },
            {
              aoAcionar: () => {},
              icone: <IconeUsuario />,
              id: "perfil",
              rotulo: "Perfil",
            },
          ]}
          rotulo={`Barra inferior (${prefixo})`}
        />
      </section>

      <section aria-label={`Ícones (${nome})`} className="flex flex-col gap-3">
        <h4 className="text-base font-semibold">Ícones</h4>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ICONES.map((icone) => (
            <li className="flex items-center gap-2" key={icone.id}>
              {icone.desenho}
              <span className="text-corpo-md">{icone.rotulo}</span>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-label={`Escala de letras (${nome})`}
        className="flex flex-col gap-2"
      >
        <h4 className="text-base font-semibold">Escala de letras</h4>
        <p className="text-titulo-lg">Título de seção</p>
        <p className="text-titulo-md">Nome do produto</p>
        <p className="text-corpo-lg">Texto corrido de apoio.</p>
        <p className="text-corpo-sm">Metadado de 12px</p>
        <p className="text-preco">{exemplo.preco}</p>
      </section>
    </div>
  );
}
