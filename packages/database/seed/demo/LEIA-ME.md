# Demonstração (seed grande)

Deixa o SimpleClick populado para teste à mão: 24 lojas abertas em Fortaleza/CE,
uma por tipo de negócio, com catálogo, fotos, vídeos, stories, clientes, pedidos,
curtidas, comentários, favoritos, recentes e as 4 contas de teste.

## Como rodar

```bash
pnpm --filter @simpleclick/database migrar   # inclui a 0063 (tipos de negócio novos)
pnpm --filter @simpleclick/database demo     # ~1–3 min na primeira vez (grava os vídeos)
pnpm --filter @simpleclick/database demo -- --sem-videos   # mais rápido: não grava vídeo novo (reaproveita os que já existem)
```

- Precisa do seed original no banco (`pastelaria-da-vila` e `lojaboavista`).
  Num banco vazio, rode antes `pnpm --filter @simpleclick/database seed`.
- **Idempotente.** Rodar de novo atualiza e não duplica. Pedidos e comentários
  não se reescrevem. Os pedidos de hoje levam a data na chave, então um dia
  novo ganha um quadro novo. Os stories são postados de novo a cada carga,
  porque vencem em 24 h.
- As imagens e os vídeos vão para `apps/web/public/demo/`, que fica fora do git.
  Os vídeos (WebM) são gravados pelo Chromium do Playwright (`e2e/`). Se ele não
  abrir, a carga segue sem vídeos e avisa.
- Nunca roda em produção.

## Contas de teste

| Papel | E-mail | Senha | O que vê |
|---|---|---|---|
| Admin da plataforma | maria.card6@exemplo.test | ArthurBruno2k@ | /admin; dona da Pastelaria da Vila e da Marmitaria Sabor de Casa |
| Dono | dono.demo@simpleclick.test | DemoSimpleClick2026 | Pastelaria da Vila e Moda Boa Vista (seletor de loja; no limite de 2 lojas) |
| Equipe | staff.demo@simpleclick.test | DemoSimpleClick2026 | Equipe da Pastelaria da Vila |
| Cliente | ana.ribeiro@cliente.test | SenhaTeste!2026x | Pedidos em várias lojas (um a caminho hoje), favoritos, recentes, curtidas e comentários (aprovados e aguardando) |

Os donos das lojas novas (`<nome>@<apelido>.test`) usam a senha `DemoSimpleClick2026`.

## Lojas por tipo de negócio

| Tipo | Loja | Endereço da loja | Recebe |
|---|---|---|---|
| Lanchonete (FOOD_SNACK) | Pastelaria da Vila | /loja/pastelaria-da-vila | entrega e retirada |
| Lanchonete (FOOD_SNACK) | Brasa Burger Benfica | /loja/brasa-burger | entrega e retirada |
| Restaurante (FOOD_RESTAURANT) | Restaurante Sertão Arretado | /loja/sertao-arretado | entrega e retirada |
| Açaiteria (FOOD_ACAI) | Gelato do Mucuripe Açaí e Sorvetes | /loja/gelato-do-mucuripe | entrega e retirada |
| Pizzaria (FOOD_PIZZA) | Forno da Praia Pizzaria | /loja/forno-da-praia | entrega e retirada |
| Marmitaria (FOOD_MARMITA) | Marmitaria Sabor de Casa | /loja/marmitaria-sabor-de-casa | entrega e retirada |
| Padaria e confeitaria (FOOD_BAKERY) | Padaria Pão de Cada Dia | /loja/padaria-pao-de-cada-dia | só retirada |
| Bebidas (BEVERAGES) | Adega Canto da Varjota | /loja/adega-canto-da-varjota | entrega e retirada |
| Mercadinho e hortifrúti (GROCERY) | Mercadinho Bom Preço | /loja/mercadinho-bom-preco | entrega e retirada |
| Roupas (APPAREL) | Moda Boa Vista | /loja/lojaboavista | entrega e retirada |
| Roupas (APPAREL) | Ateliê Mandacaru Moda | /loja/atelie-mandacaru | entrega e retirada |
| Calçados (SHOES) | Passo Certo Calçados | /loja/passo-certo-calcados | entrega e retirada |
| Tabacaria (TOBACCO) | Tabacaria Cais do Porto | /loja/tabacaria-cais-do-porto | só retirada (maiores de 18) |
| Papelaria (STATIONERY) | Papelaria Ponto e Vírgula | /loja/papelaria-ponto-e-virgula | entrega e retirada |
| Farmácia e drogaria (PHARMACY) | Drogaria Vida Leve | /loja/drogaria-vida-leve | entrega e retirada |
| Pet shop (PET_SHOP) | Pet Patas do Cocó | /loja/pet-patas-do-coco | entrega e retirada |
| Floricultura (FLORIST) | Floricultura Jardim de Iracema | /loja/jardim-de-iracema | só entrega |
| Cosméticos e perfumaria (COSMETICS) | Cheiro Bom Perfumaria | /loja/cheiro-bom-perfumaria | entrega e retirada |
| Eletrônicos (ELECTRONICS) | Conecta Cell Acessórios | /loja/conecta-cell | entrega e retirada |
| Livraria (BOOKSTORE) | Livraria Sebo do Dragão | /loja/sebo-do-dragao | entrega e retirada |
| Brinquedos (TOYS) | Brinca Mais Brinquedos | /loja/brinca-mais | entrega e retirada |
| Material de construção (HARDWARE) | Constrular Material de Construção (Caucaia) | /loja/constrular | entrega e retirada |
| Loja (RETAIL_GENERIC) | Bazar Casa & Cia | /loja/bazar-casa-e-cia | entrega e retirada |
| Autopeças (AUTO_PARTS) | Moto Peças Fortal | /loja/moto-pecas-fortal | entrega e retirada |

## Onde mexer

- `dados.ts`: as duas lojas do seed original, com o roteiro de pedidos escrito à mão.
- `lojas/*.ts`: as lojas novas, uma constante por loja.
- `roteiro.ts`: os clientes e os pedidos gerados (do mês e de hoje).
- `contas.ts`: as contas de teste.
- `social.ts`: curtidas, comentários, favoritos e recentes.
- `midia.ts` e `videos.ts`: os stories e os vídeos.
- `imagens.ts`: as ilustrações, desenhadas em SVG e convertidas em WebP.
