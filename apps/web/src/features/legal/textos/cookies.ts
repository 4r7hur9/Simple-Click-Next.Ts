/**
 * MODELO PARA REVISÃO JURÍDICA ANTES DE PUBLICAR.
 * Rascunho da Política de Cookies. A tabela precisa refletir os cookies que o
 * site realmente grava; revise quando entrar qualquer análise ou pixel novo.
 */
import type { SecaoLegal } from "../PaginaLegal.tsx";

export function secoesDosCookies(email: string): readonly SecaoLegal[] {
  return [
    {
      id: "o-que-sao",
      titulo: "O que são cookies",
      blocos: [
        "Cookies são pequenos arquivos que o site grava no seu navegador. Eles ajudam a lembrar quem você é, o que está na sua sacola e como você prefere usar o site. Tecnologias parecidas (como o armazenamento local do navegador) seguem as mesmas regras desta página.",
      ],
    },
    {
      id: "categorias",
      titulo: "Categorias que usamos",
      blocos: [
        {
          lista: [
            "Essenciais (sempre ligados): necessários para o site funcionar. Mantêm sua sessão de login, protegem contra fraude e ataques, guardam a sacola e lembram sua escolha de cookies. Sem eles, o site não funciona e, por isso, não dependem de consentimento.",
            "Desempenho e análise (só com seu consentimento): medem como o site é usado — páginas visitadas, erros e tempos de carregamento — para melhorarmos. Hoje o SimpleClick não carrega ferramentas de análise de terceiros; se isso mudar, elas só serão ativadas depois da sua autorização.",
            "Funcionais e preferências (só com seu consentimento): lembram escolhas que não são indispensáveis, como tema, filtros e a última loja visitada.",
          ],
        },
        "Não usamos cookies de publicidade ou de marketing. Se passarmos a usar, criaremos uma categoria própria e pediremos nova autorização.",
      ],
    },
    {
      id: "tabela",
      titulo: "Principais cookies",
      blocos: [
        {
          lista: [
            "sc_consentimento — essencial — guarda a sua escolha de cookies e a versão desta política — 12 meses.",
            "Cookies de sessão (acesso e renovação do login) — essenciais — mantêm você conectado de forma segura — duram a sessão ou o prazo de renovação do login.",
            "Sacola e checkout — essenciais — lembram os itens do pedido em andamento — até finalizar ou limpar.",
            "Preferências de exibição — funcionais — lembram opções de tela — até 12 meses, só se você autorizar.",
          ],
        },
        "Esta lista pode mudar; a versão vigente é sempre a desta página.",
      ],
    },
    {
      id: "como-gerenciar",
      titulo: "Como mudar sua escolha",
      blocos: [
        "Clique em “Preferências de cookies” no rodapé de qualquer página para aceitar, recusar ou personalizar. Ao recusar, apagamos o que não é essencial e deixamos de carregá-lo. Também é possível bloquear ou apagar cookies pelas configurações do navegador, mas o bloqueio dos essenciais pode impedir o login e o uso da sacola.",
        "Pedimos sua escolha de novo a cada 12 meses ou quando esta política mudar de versão.",
      ],
    },
    {
      id: "terceiros",
      titulo: "Cookies de terceiros",
      blocos: [
        "Alguns recursos (por exemplo, mapas ou vídeos incorporados, quando existirem) podem gravar cookies do terceiro que os fornece. Eles só carregam depois do seu consentimento para a categoria correspondente.",
      ],
    },
    {
      id: "contato",
      titulo: "Dúvidas",
      blocos: [
        "Fale com a gente em " +
          email +
          ". Veja também a Política de Privacidade e a página de direitos (LGPD).",
      ],
    },
  ];
}
