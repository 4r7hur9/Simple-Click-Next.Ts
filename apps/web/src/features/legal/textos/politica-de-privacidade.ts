/**
 * MODELO PARA REVISÃO JURÍDICA ANTES DE PUBLICAR.
 * Rascunho da Política de Privacidade (LGPD, Lei 13.709/2018). Papéis:
 * - SimpleClick = CONTROLADOR dos dados das contas e do uso da plataforma;
 * - Loja = CONTROLADORA dos dados dos clientes dela (pedidos, entrega);
 *   o SimpleClick atua como OPERADOR desses dados.
 * Revise com advogado: bases legais, prazos de retenção, operadores
 * (hospedagem, pagamento, mensagens) e transferência internacional.
 */
import type { SecaoLegal } from "../PaginaLegal.tsx";

export function secoesDaPrivacidade(email: string): readonly SecaoLegal[] {
  return [
    {
      id: "quem-somos",
      titulo: "Quem somos e quem decide sobre seus dados",
      blocos: [
        "Esta política explica como tratamos dados pessoais no SimpleClick, uma plataforma de pedidos que reúne lojas e clientes. O SimpleClick é operado por [RAZÃO SOCIAL], CNPJ [CNPJ], [ENDEREÇO].",
        "Dependendo do dado, o papel do SimpleClick muda:",
        {
          lista: [
            "SimpleClick como controlador: dados da sua conta (nome, e-mail, senha, telefone), de segurança, de uso da plataforma e do cadastro das lojas e de seus donos. Nós decidimos como e por que esses dados são tratados.",
            "Loja como controladora e SimpleClick como operador: dados dos clientes que a loja recebe ao vender (pedidos, endereços de entrega, histórico de compras e contato). É a loja quem decide o que fazer com eles; o SimpleClick só os trata em nome da loja, para entregar a plataforma. Para exercer direitos sobre esses dados, você pode falar com a loja ou conosco, e encaminharemos o pedido.",
          ],
        },
      ],
    },
    {
      id: "dados-e-finalidades",
      titulo: "Dados que coletamos e para que usamos",
      blocos: [
        {
          lista: [
            "Cadastro: nome, e-mail, telefone, senha (guardada de forma protegida, nunca em texto aberto), tipo de conta (cliente, dono, equipe). Finalidade: criar e proteger sua conta e permitir o acesso.",
            "Endereços: rua, número, bairro, cidade, CEP, complemento e referências. Finalidade: calcular a entrega e entregar o pedido.",
            "Pedidos: itens, valores, forma de pagamento, observações, situação e histórico. Finalidade: processar e acompanhar compras e vendas, emitir comprovantes e cupons.",
            "Lojas e lojistas: dados da loja (nome, endereço, contato, horário, logotipo, fotos, produtos, preços), do responsável e, quando exigido, documentos. Finalidade: analisar e aprovar lojas, publicar a vitrine e prevenir fraude.",
            "Conteúdo que você publica: fotos, vídeos, stories, comentários, curtidas e favoritos. Finalidade: exibir na plataforma e permitir moderação.",
            "Dados técnicos: endereço IP, tipo de aparelho e navegador, datas e horários de acesso, registros de segurança (logs) e identificadores de sessão. Finalidade: segurança, prevenção de fraude, diagnóstico de erros e cumprimento de obrigação legal de guardar registros de acesso.",
            "Comunicação: mensagens que você nos envia (suporte, denúncias, pedidos de direitos). Finalidade: responder e registrar.",
            "Cookies: veja a página de Cookies. Os não essenciais só são usados com seu consentimento.",
          ],
        },
        "Não coletamos dados pessoais sensíveis de propósito. Evite informá-los em campos livres (por exemplo, observações do pedido). Não usamos seus dados para tomar decisões automatizadas que produzam efeito jurídico sobre você.",
      ],
    },
    {
      id: "bases-legais",
      titulo: "Bases legais",
      blocos: [
        "Tratamos dados apenas quando há uma base legal da LGPD (art. 7º):",
        {
          lista: [
            "Execução de contrato ou procedimentos preliminares: para criar sua conta, processar pedidos, entregar e dar suporte.",
            "Cumprimento de obrigação legal ou regulatória: por exemplo, guardar registros de acesso por seis meses (Marco Civil da Internet) e documentos fiscais.",
            "Legítimo interesse: segurança, prevenção de fraude e abuso, melhoria da plataforma e comunicações essenciais do serviço, sempre respeitando seus direitos e expectativas.",
            "Consentimento: cookies não essenciais e outros usos que dependam da sua autorização. Você pode revogá-lo a qualquer momento.",
            "Exercício regular de direitos: para nos defender em processos judiciais, administrativos ou arbitrais.",
          ],
        },
      ],
    },
    {
      id: "compartilhamento",
      titulo: "Com quem compartilhamos",
      blocos: [
        "Não vendemos seus dados. Compartilhamos apenas o necessário, com:",
        {
          lista: [
            "A loja em que você faz o pedido: nome, telefone, endereço de entrega, itens e observações, para ela atender. A partir daí, a loja trata esses dados como controladora, sob a política dela e a lei.",
            "Provedores de pagamento, quando o pagamento for feito por meio deles (por exemplo, Pix ou cartão): dados necessários para processar a cobrança.",
            "WhatsApp e serviços de mensagem: quando você ou a loja usam o botão de contato ou a mensagem do pedido, o conteúdo segue pelo WhatsApp, que tem política própria. O SimpleClick não lê suas conversas.",
            "Provedores de hospedagem, banco de dados, armazenamento de imagens, envio de e-mail e monitoramento, que tratam os dados em nosso nome e sob contrato.",
            "Autoridades públicas, quando houver ordem legal ou para proteger direitos e a segurança.",
            "Possíveis sucessores, em caso de fusão, aquisição ou reorganização, com os mesmos compromissos desta política.",
          ],
        },
        "Alguns provedores podem estar fora do Brasil. Nesses casos, adotamos as garantias previstas na LGPD (arts. 33 e seguintes), como cláusulas contratuais adequadas.",
      ],
    },
    {
      id: "cookies",
      titulo: "Cookies",
      blocos: [
        "Usamos cookies essenciais (sessão, segurança, sacola) e, somente com sua autorização, cookies de desempenho e de preferências. Você pode mudar sua escolha a qualquer momento em “Preferências de cookies”, no rodapé. Detalhes na página de Cookies.",
      ],
    },
    {
      id: "armazenamento-e-seguranca",
      titulo: "Armazenamento e segurança",
      blocos: [
        "Adotamos medidas técnicas e organizacionais para proteger os dados, como conexão criptografada (HTTPS), senhas protegidas por algoritmos de hash, controle de acesso por papel (cliente, dono, equipe, administração), separação dos dados de cada loja, registros de auditoria e verificação em duas etapas opcional.",
        "Nenhum sistema é totalmente invulnerável. Se ocorrer um incidente de segurança que possa causar risco ou dano relevante, comunicaremos a Autoridade Nacional de Proteção de Dados (ANPD) e os titulares afetados, conforme a lei.",
        "Você também ajuda a proteger seus dados: use senha forte e exclusiva, não a compartilhe e saia da conta em aparelhos de terceiros.",
      ],
    },
    {
      id: "retencao",
      titulo: "Por quanto tempo guardamos",
      blocos: [
        "Guardamos os dados pelo tempo necessário para cumprir as finalidades acima e as obrigações legais:",
        {
          lista: [
            "Conta: enquanto ela estiver ativa. Após o pedido de exclusão, apagamos ou anonimizamos os dados em prazo razoável, salvo o que a lei nos obrigue a manter.",
            "Pedidos e dados fiscais: pelo prazo exigido em lei (em regra, de cinco anos) e para defesa em eventual disputa.",
            "Registros de acesso à aplicação: seis meses, no mínimo (Marco Civil da Internet, art. 15).",
            "Stories: ficam no ar por 24 horas; os arquivos são removidos depois.",
            "Cookies: conforme a tabela da página de Cookies (a escolha de consentimento vale por 12 meses).",
            "Dados dos clientes de uma loja: pelo tempo definido pela loja, enquanto ela mantiver a conta na plataforma, e removidos ou devolvidos ao encerrar o contrato, conforme a lei.",
          ],
        },
      ],
    },
    {
      id: "direitos",
      titulo: "Seus direitos",
      blocos: [
        "Pela LGPD (art. 18), você pode pedir: confirmação de que tratamos seus dados; acesso; correção; anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade; portabilidade; eliminação dos dados tratados com consentimento; informação sobre com quem compartilhamos; informação sobre a possibilidade de não consentir e suas consequências; e revogação do consentimento.",
        "Veja como pedir na página “Seus direitos (LGPD)” ou escreva para " +
          email +
          ". Também é possível reclamar à ANPD (gov.br/anpd).",
      ],
    },
    {
      id: "menores",
      titulo: "Crianças e adolescentes",
      blocos: [
        "O SimpleClick não é voltado a crianças. Dados de crianças e adolescentes só são tratados no melhor interesse deles e, no caso de crianças, com consentimento específico de ao menos um dos pais ou do responsável legal (LGPD, art. 14). Se perceber que um menor se cadastrou sem autorização, avise-nos para que possamos excluir a conta.",
      ],
    },
    {
      id: "lojas",
      titulo: "Responsabilidades das lojas sobre os dados dos clientes",
      blocos: [
        "Cada loja é controladora dos dados dos seus clientes e se compromete a: usar os dados só para atender pedidos e relacionamento compatível; não vender ou repassar a terceiros sem base legal; manter a equipe com acesso mínimo necessário; atender os pedidos de direitos dos titulares; e comunicar incidentes ao SimpleClick e a quem for afetado.",
        "O SimpleClick, como operador, trata esses dados segundo as instruções da loja e estes termos, mantém a segurança da plataforma e ajuda a loja a atender os titulares.",
      ],
    },
    {
      id: "links",
      titulo: "Links e serviços de terceiros",
      blocos: [
        "A plataforma pode levar a sites e serviços de terceiros (como WhatsApp e mapas). Eles têm políticas próprias, pelas quais não respondemos.",
      ],
    },
    {
      id: "alteracoes",
      titulo: "Alterações desta política",
      blocos: [
        "Podemos atualizar esta política. A data e a versão ficam no topo. Quando a mudança for relevante, avisaremos na plataforma ou por e-mail e, se necessário, pediremos novo consentimento.",
      ],
    },
    {
      id: "contato",
      titulo: "Contato e encarregado (DPO)",
      blocos: [
        "Encarregado pelo tratamento de dados pessoais: [NOME DO ENCARREGADO]. E-mail: " +
          email +
          ".",
      ],
    },
  ];
}
