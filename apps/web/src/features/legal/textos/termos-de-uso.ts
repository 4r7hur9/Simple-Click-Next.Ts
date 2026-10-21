/**
 * MODELO PARA REVISÃO JURÍDICA ANTES DE PUBLICAR.
 * Rascunho dos Termos de Uso do SimpleClick. O dono deve validar com advogado
 * (razão social, CNPJ, foro, prazos e limites de responsabilidade) antes de
 * publicar. Os trechos entre colchetes [ ] são campos a preencher.
 */
import type { SecaoLegal } from "../PaginaLegal.tsx";

export function secoesDosTermos(email: string): readonly SecaoLegal[] {
  return [
    {
      id: "quem-somos",
      titulo: "Quem somos e o que é o SimpleClick",
      blocos: [
        "O SimpleClick é uma plataforma de pedidos online. Ela permite que pequenos negócios (as “lojas”) montem uma vitrine, recebam pedidos e acompanhem a operação, e que pessoas (os “clientes”) encontrem lojas, façam pedidos e acompanhem a entrega ou a retirada.",
        "O SimpleClick é operado por [RAZÃO SOCIAL DO SIMPLECLICK], inscrita no CNPJ sob o nº [CNPJ], com sede em [ENDEREÇO]. Neste texto, “SimpleClick”, “nós” e “plataforma” se referem a ela.",
        "O SimpleClick fornece a tecnologia. A venda é feita entre a loja e o cliente: o SimpleClick não vende, não produz, não estoca, não entrega e não é parte do contrato de compra e venda feito entre eles.",
      ],
    },
    {
      id: "aceite",
      titulo: "Aceite destes termos",
      blocos: [
        "Ao criar uma conta, entrar, abrir uma loja ou fazer um pedido, você declara que leu e concorda com estes Termos de Uso e com a Política de Privacidade. Se não concordar, não use a plataforma.",
        "Para navegar pelas vitrines sem conta, basta que você não use a plataforma de forma contrária a estes termos.",
      ],
    },
    {
      id: "cadastro",
      titulo: "Cadastro e conta",
      blocos: [
        "Para pedir, é preciso ter conta. Para vender, é preciso ter conta de dono e cadastrar uma loja. Você se compromete a dar informações verdadeiras, completas e atualizadas.",
        {
          lista: [
            "Você é responsável por tudo o que acontece na sua conta e por guardar a senha. Não a compartilhe.",
            "Avise-nos imediatamente se suspeitar de uso indevido da sua conta.",
            "Cada pessoa deve ter uma conta própria. A conta é pessoal e não pode ser vendida ou cedida.",
            "Podemos pedir confirmação de dados e de documentos para proteger a plataforma e as pessoas que a usam.",
          ],
        },
      ],
    },
    {
      id: "menores",
      titulo: "Menores de idade",
      blocos: [
        "Contas só podem ser criadas por maiores de 18 anos ou por menores com assistência ou representação de um responsável legal. Quem tem menos de 12 anos não deve usar a plataforma por conta própria.",
        "Lojas que vendem produtos de venda proibida a menores (como bebidas alcoólicas, tabaco e similares) devem conferir a idade de quem compra. Essa obrigação é da loja.",
      ],
    },
    {
      id: "clientes",
      titulo: "Regras para clientes",
      blocos: [
        {
          lista: [
            "Os preços, as condições, os prazos, a disponibilidade e a qualidade dos produtos são de responsabilidade da loja.",
            "Ao fazer um pedido, você se compromete a pagar o valor combinado e a estar disponível no endereço ou no horário da entrega ou da retirada.",
            "Trocas, devoluções e cancelamentos seguem a lei (inclusive o Código de Defesa do Consumidor) e as regras informadas pela loja. Em caso de problema, procure primeiro a loja.",
            "Não faça pedidos falsos, não use dados de terceiros sem autorização e não tente fraudar pagamentos ou promoções.",
            "Avaliações e comentários devem ser verdadeiros e respeitosos, e podem ser moderados pela loja e pelo SimpleClick.",
          ],
        },
      ],
    },
    {
      id: "lojistas",
      titulo: "Regras específicas para lojistas (donos de loja)",
      blocos: [
        "Quem abre uma loja é o responsável pela loja, por todo o conteúdo que publica e pelas vendas que realiza. Além das demais regras, o lojista se compromete a:",
        {
          lista: [
            "ter capacidade legal para vender e, quando exigido, estar regularmente inscrito (CNPJ, MEI ou equivalente) e com as licenças necessárias para a sua atividade (alvará, vigilância sanitária e outras);",
            "informar preços finais, taxas de entrega, prazos, formas de pagamento e horários de forma clara e cumprir o que anunciou;",
            "publicar somente fotos, textos, marcas e vídeos que tenha o direito de usar, sem violar direitos autorais, de imagem ou de marca de terceiros;",
            "cumprir a legislação de defesa do consumidor, fiscal, sanitária e trabalhista aplicável, inclusive emitir os documentos fiscais devidos;",
            "atender os pedidos e as reclamações dos clientes com agilidade e boa-fé;",
            "tratar os dados pessoais dos clientes conforme a LGPD, como descrito na Política de Privacidade (a loja é a controladora desses dados);",
            "manter a equipe cadastrada (funcionários com acesso ao painel) sob sua responsabilidade e remover quem sair da loja.",
          ],
        },
        "O SimpleClick não é responsável por vendas não entregues, produtos com defeito, preços divergentes, cobranças ou qualquer relação entre a loja e o cliente, mas poderá intervir para proteger a plataforma e seus usuários, nos termos abaixo.",
      ],
    },
    {
      id: "aprovacao",
      titulo: "Aprovação, limites e suspensão de lojas",
      blocos: [
        {
          lista: [
            "Toda loja nova passa por análise antes de ser publicada. Podemos aprovar, pedir informações adicionais ou recusar o cadastro, sem a obrigação de justificar além do necessário.",
            "A loja pode ter limites, como número de produtos, de integrantes da equipe e de lojas por conta. Os limites podem variar conforme o plano ou a liberação feita pelo SimpleClick.",
            "Podemos suspender ou remover, total ou parcialmente, lojas, produtos, publicações ou contas que violem estes termos ou a lei, que gerem risco a pessoas ou à plataforma, ou por ordem de autoridade. Sempre que possível, avisaremos o motivo e permitiremos que o lojista se explique ou corrija o problema.",
            "A suspensão de uma loja não cancela pedidos já feitos: o lojista deve cumpri-los ou combinar o cancelamento com o cliente.",
          ],
        },
      ],
    },
    {
      id: "conteudo-proibido",
      titulo: "Conteúdo e produtos proibidos; moderação",
      blocos: [
        "É proibido publicar, vender ou divulgar pela plataforma:",
        {
          lista: [
            "produtos ou serviços ilegais, falsificados, roubados ou de origem duvidosa;",
            "drogas ilícitas, armas, munições e explosivos;",
            "medicamentos controlados ou que exijam receita, sem a autorização legal;",
            "animais silvestres ou produtos de caça e pesca proibidas;",
            "conteúdo adulto explícito, pornografia, e qualquer conteúdo que sexualize menores;",
            "discurso de ódio, discriminação, ameaça, assédio, difamação ou incitação à violência;",
            "golpes, esquemas de pirâmide, ofertas enganosas e propaganda falsa;",
            "dados pessoais de terceiros sem autorização e software malicioso;",
            "qualquer conteúdo que viole direitos de terceiros ou a legislação brasileira.",
          ],
        },
        "Fotos, vídeos, publicações e comentários podem ser revisados por nós e pelas lojas (no caso de comentários na sua vitrine). Podemos remover conteúdo que viole estas regras. Você pode denunciar um conteúdo pelo e-mail " +
          email +
          ".",
      ],
    },
    {
      id: "pagamentos",
      titulo: "Pagamentos, preços e taxas",
      blocos: [
        "O pagamento do pedido é combinado entre cliente e loja (por exemplo, Pix, dinheiro ou cartão na entrega) ou feito por meio de provedores de pagamento parceiros, quando disponíveis. O SimpleClick não guarda dados completos de cartão.",
        "O uso da plataforma pelas lojas pode ser gratuito ou pago, conforme o plano contratado. Eventuais mensalidades, taxas e condições serão informadas antes da contratação e não serão alteradas sem aviso prévio.",
      ],
    },
    {
      id: "uso-adequado",
      titulo: "Uso adequado da plataforma",
      blocos: [
        {
          lista: [
            "Não tente acessar áreas, contas ou dados que não sejam seus.",
            "Não use robôs, raspagem automática ou testes de carga sem autorização.",
            "Não tente burlar mecanismos de segurança, limites ou a aprovação de lojas.",
            "Não use a plataforma para enviar mensagens indesejadas (spam).",
          ],
        },
        "O SimpleClick pode limitar ou encerrar o acesso de quem fizer isso.",
      ],
    },
    {
      id: "propriedade",
      titulo: "Propriedade intelectual",
      blocos: [
        "A marca SimpleClick, o software, o desenho das telas e os textos da plataforma pertencem ao SimpleClick ou a quem nos licenciou. Você recebe apenas o direito de usar a plataforma, de forma limitada, pessoal e revogável.",
        "O conteúdo que a loja ou o cliente publica continua sendo de quem o criou. Ao publicá-lo, você nos autoriza a hospedá-lo, exibi-lo, redimensioná-lo e distribuí-lo dentro da plataforma (vitrine, explorar, divulgação da própria loja) pelo tempo em que ele estiver publicado.",
      ],
    },
    {
      id: "disponibilidade",
      titulo: "Disponibilidade e responsabilidade",
      blocos: [
        "Trabalhamos para manter a plataforma disponível, mas ela pode ficar fora do ar por manutenção, falhas de terceiros ou eventos fora do nosso controle. Não garantimos funcionamento ininterrupto.",
        "Na máxima extensão permitida em lei, o SimpleClick não responde por: (i) atos e omissões de lojas e clientes; (ii) qualidade, entrega ou legalidade dos produtos anunciados; (iii) perdas decorrentes de uso indevido da conta por culpa do titular; (iv) lucros cessantes ou danos indiretos. Nada disto limita direitos que a lei assegura ao consumidor nem responsabilidades que a lei não permite afastar.",
      ],
    },
    {
      id: "privacidade",
      titulo: "Privacidade e cookies",
      blocos: [
        "O tratamento de dados pessoais está descrito na Política de Privacidade, na página de Cookies e na página de direitos do titular (LGPD). Elas fazem parte destes termos.",
      ],
    },
    {
      id: "encerramento",
      titulo: "Encerramento",
      blocos: [
        "Você pode parar de usar a plataforma e pedir a exclusão da conta a qualquer momento. Podemos encerrar contas que violem estes termos. Alguns dados serão mantidos pelo prazo exigido em lei, como explicado na Política de Privacidade.",
      ],
    },
    {
      id: "alteracoes",
      titulo: "Alterações destes termos",
      blocos: [
        "Podemos atualizar estes termos. A data e a versão aparecem no topo da página. Mudanças relevantes serão avisadas na plataforma ou por e-mail com antecedência razoável. Se continuar usando depois da data de vigência, você concorda com a nova versão; se não concordar, deve parar de usar e pode encerrar a conta.",
      ],
    },
    {
      id: "lei-e-foro",
      titulo: "Lei aplicável, foro e contato",
      blocos: [
        "Estes termos são regidos pelas leis do Brasil. Fica eleito o foro da comarca de [CIDADE/UF], salvo quando a lei garantir ao consumidor o direito de ser demandado em seu domicílio.",
        "Dúvidas sobre estes termos: " + email + ".",
      ],
    },
  ];
}
