// Seções das peças da reforma visual: senha, selo, sanfona, menu suspenso e
// tabela, cada uma nos estados que oferece.
import {
  CampoDeSenha,
  IconeConfiguracoes,
  IconeSair,
  IconeUsuario,
  MenuSuspenso,
  Sanfona,
  Selo,
} from "@simpleclick/ui";

import { Secao } from "./SecaoDaVitrine.tsx";
import { TabelaDeExemplo } from "./TabelaDeExemplo.tsx";

/** Senha, selo, sanfona, menu e tabela, nessa ordem. */
export function SecoesDasPecasNovas() {
  return (
    <>
      <Secao
        descricao="O olho mostra a senha e diz se está ligado. O medidor só aparece em senha nova: as barras para quem olha, a frase para quem ouve."
        id="secao-senha"
        titulo="Campo de senha"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoDeSenha id="senha-entrar" rotulo="Senha" />
          <CampoDeSenha
            defaultValue="abc"
            dica="Use 8 ou mais caracteres."
            id="senha-fraca"
            mostrarForca
            rotulo="Senha nova"
          />
          <CampoDeSenha
            defaultValue="Abcdefg1"
            id="senha-boa"
            mostrarForca
            rotulo="Senha nova"
          />
          <CampoDeSenha
            defaultValue="Uma-senha-longa-123"
            id="senha-forte"
            mostrarForca
            rotulo="Senha nova"
          />
          <CampoDeSenha
            erro="A senha está errada. Confira e tente de novo."
            id="senha-erro"
            rotulo="Senha"
          />
        </div>
      </Secao>

      <Secao
        descricao="Status curto com bolinha. A cor ajuda quem bate o olho; o sentido está no texto."
        id="secao-selo"
        titulo="Selo"
      >
        <div className="flex flex-wrap gap-2">
          <Selo tom="sucesso">Pago</Selo>
          <Selo tom="atencao">Em preparo</Selo>
          <Selo tom="erro">Recusado</Selo>
          <Selo tom="info">Novo</Selo>
          <Selo>Rascunho</Selo>
          <Selo semBolinha tom="info">
            12 itens
          </Selo>
        </div>
      </Secao>

      <Secao
        descricao="details e summary nativos: teclado, leitor de tela e busca da página de graça. As do mesmo grupo abrem uma de cada vez."
        id="secao-sanfona"
        titulo="Sanfona"
      >
        <div>
          <Sanfona
            abertaInicialmente
            grupo="ajuda"
            titulo="Como recebo o pagamento?"
          >
            Pelo PIX da loja, direto na sua conta, ou em dinheiro na entrega.
          </Sanfona>
          <Sanfona grupo="ajuda" titulo="Posso pausar a loja?">
            Sim. Na configuração, troque o horário para fechado.
          </Sanfona>
          <Sanfona grupo="ajuda" titulo="O cliente precisa de cadastro?">
            Não. Ele pede só com nome e telefone.
          </Sanfona>
        </div>
      </Secao>

      <Secao
        descricao="Painel popover nativo: fecha com Esc e clique fora, nunca passa da largura da tela. Lista de links e botões, sem prometer setas."
        id="secao-menu"
        titulo="Menu suspenso"
      >
        <div className="flex flex-wrap gap-3">
          <MenuSuspenso
            icone={<IconeUsuario />}
            id="menu-conta"
            itens={[
              {
                href: "/minha-conta",
                icone: <IconeUsuario />,
                id: "perfil",
                rotulo: "Meu perfil",
              },
              {
                href: "/painel/config",
                icone: <IconeConfiguracoes />,
                id: "config",
                rotulo: "Configurações",
              },
              {
                desabilitado: true,
                id: "planos",
                rotulo: "Planos (em breve)",
              },
              {
                href: "/sair",
                icone: <IconeSair />,
                id: "sair",
                perigo: true,
                rotulo: "Sair",
              },
            ]}
            rotulo="Minha conta"
            titulo="Conta"
          />
          <MenuSuspenso
            alinhamento="fim"
            icone={<IconeConfiguracoes />}
            id="menu-icone"
            itens={[
              { href: "/painel", id: "painel", rotulo: "Ir para o painel" },
              { href: "/painel/pedidos", id: "pedidos", rotulo: "Pedidos" },
            ]}
            rotulo="Atalhos"
            soIcone
            variante="discreta"
          />
        </div>
      </Secao>

      <Secao
        descricao="Ordena sem mexer nos dados, diz a coluna ordenada por aria-sort e tem foco visível. No celular, a primeira rola de lado com o cabeçalho fixo; a segunda vira cartões."
        id="secao-tabela"
        titulo="Tabela"
      >
        <TabelaDeExemplo
          alturaMaxima="16rem"
          legenda="Pedidos de hoje (rola de lado no celular)"
          noCelular="rolar"
        />
        <TabelaDeExemplo
          legenda="Pedidos de hoje (vira cartões no celular)"
          noCelular="cartoes"
        />
      </Secao>
    </>
  );
}
