/**
 * MODELO PARA REVISÃO JURÍDICA ANTES DE PUBLICAR.
 * Rascunho da página de direitos do titular (LGPD, art. 18). Confirme com
 * advogado o prazo de resposta e o canal do encarregado antes de publicar.
 */
import type { SecaoLegal } from "../PaginaLegal.tsx";

export function secoesDaLgpd(email: string): readonly SecaoLegal[] {
  return [
    {
      id: "seus-direitos",
      titulo: "Seus direitos como titular de dados",
      blocos: [
        "A Lei Geral de Proteção de Dados (Lei 13.709/2018) garante que você controle seus dados pessoais. Os direitos são gratuitos e podem ser exercidos a qualquer momento:",
        {
          lista: [
            "Acesso: saber quais dados seus tratamos e receber uma cópia.",
            "Correção: corrigir dados incompletos, inexatos ou desatualizados.",
            "Exclusão: pedir a eliminação dos dados tratados com seu consentimento e de dados desnecessários ou excessivos, ressalvadas as hipóteses em que a lei exige a guarda.",
            "Anonimização ou bloqueio: de dados desnecessários, excessivos ou tratados em desconformidade com a lei.",
            "Portabilidade: receber seus dados em formato estruturado para levar a outro serviço.",
            "Informação sobre compartilhamento: saber com quem compartilhamos seus dados.",
            "Revogação do consentimento: retirar a autorização dada, a qualquer momento. Isso não afeta o que foi feito antes, e você pode mudar os cookies pelo link “Preferências de cookies”, no rodapé.",
            "Oposição: se opor a um tratamento feito sem seu consentimento, quando houver descumprimento da lei.",
            "Revisão: pedir revisão de decisões tomadas apenas de forma automatizada que afetem seus interesses.",
          ],
        },
      ],
    },
    {
      id: "quem-responde",
      titulo: "A quem pedir: SimpleClick ou a loja",
      blocos: [
        "Se o dado é da sua conta ou do uso da plataforma (cadastro, acesso, segurança), o SimpleClick é o controlador e responde ao seu pedido.",
        "Se o dado é do seu pedido numa loja (itens, endereço de entrega, histórico), a loja é a controladora. Você pode pedir diretamente a ela. Se preferir, envie o pedido para nós: encaminhamos à loja e ajudamos a atendê-lo.",
      ],
    },
    {
      id: "como-pedir",
      titulo: "Como fazer um pedido",
      blocos: [
        "Escreva para " + email + " com o assunto “Direitos LGPD” e informe:",
        {
          lista: [
            "seu nome completo e o e-mail da conta;",
            "qual direito deseja exercer (acesso, correção, exclusão, portabilidade, revogação etc.);",
            "se o pedido é sobre uma loja específica, o nome dela;",
            "quaisquer detalhes que ajudem a localizar os dados.",
          ],
        },
        "Para sua segurança, podemos pedir uma confirmação de identidade antes de atender, para que ninguém acesse ou apague os dados de outra pessoa. Se você estiver logado, nos escreva a partir do e-mail cadastrado.",
        "Respondemos o quanto antes e, em regra, em até 15 dias, prazo previsto na lei para o fornecimento da declaração completa de dados. Se o pedido for complexo ou precisarmos de mais informações, avisaremos o novo prazo. Se não pudermos atender (por exemplo, quando a lei exige que guardemos o dado), explicaremos o motivo.",
        "Algumas ações você mesmo faz na sua conta: corrigir nome, telefone e endereços em “Meus dados” e “Endereços” na área Conta.",
      ],
    },
    {
      id: "exclusao",
      titulo: "Exclusão da conta",
      blocos: [
        "Ao pedir a exclusão, apagamos ou anonimizamos os dados da conta. Podemos manter o que for necessário para cumprir obrigação legal (como registros fiscais e de acesso), prevenir fraude ou nos defender em disputas, pelo prazo que a lei determinar. Pedidos já feitos às lojas podem permanecer no histórico da loja, que é a responsável por esses dados.",
      ],
    },
    {
      id: "encarregado",
      titulo: "Encarregado pelo tratamento de dados (DPO)",
      blocos: [
        "O encarregado é o canal entre você, o SimpleClick e a Autoridade Nacional de Proteção de Dados (ANPD).",
        "Encarregado: [NOME DO ENCARREGADO] — e-mail: " + email + ".",
      ],
    },
    {
      id: "anpd",
      titulo: "Reclamação à autoridade",
      blocos: [
        "Se você acha que o seu pedido não foi atendido de forma adequada, pode apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD), pelo site gov.br/anpd, além de recorrer aos órgãos de defesa do consumidor e ao Judiciário.",
      ],
    },
    {
      id: "saiba-mais",
      titulo: "Leia também",
      blocos: [
        "Veja como tratamos os dados na Política de Privacidade, as regras de uso nos Termos de Uso e a lista de cookies na Política de Cookies.",
      ],
    },
  ];
}
