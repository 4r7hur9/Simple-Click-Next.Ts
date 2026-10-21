-- ===========================================================================
-- 0063 — Tipos de negócio novos e categorias sugeridas (card #50).
--
-- Os 8 tipos da 0003 cobriam comida, roupa, bebida, eletrônico e autopeça. O
-- lojista de bairro que o SimpleClick quer atender é mais variado: calçados,
-- tabacaria, marmitaria, papelaria, pizzaria, padaria, mercadinho, farmácia,
-- pet shop, floricultura, cosméticos, livraria, brinquedos e material de
-- construção. Cada um vira uma linha de `vertical_presets`, com o mesmo
-- vocabulário (`labels`) e a mesma composição de telas (`blocos`) dos que já
-- existem — o site e a API leem tudo daqui, então não há enum para mudar.
--
-- Comida (`is_food`) não controla estoque e usa ingrediente/adicional; varejo
-- controla estoque e usa variação/especificação, como na 0003.
--
-- CATEGORIAS SUGERIDAS: `labels.categorias_sugeridas` é a lista de categorias
-- que faz sentido propor a quem abre uma loja daquele tipo. Chave nova dentro
-- de um JSON que a vitrine lê campo a campo (as chaves desconhecidas são
-- ignoradas), então nada que já lê `labels` muda. Os 8 tipos antigos também
-- ganham a lista.
--
-- Idempotente: insere o que falta e só acrescenta a chave nova ao JSON.
-- ===========================================================================

SET LOCAL ROLE sc_migrator;

INSERT INTO app.vertical_presets
  (code, label, labels, blocos, default_option_group_kinds, is_food, tracks_stock, sort_order)
VALUES
  ('FOOD_PIZZA', 'Pizzaria',
   '{"catalogo":"Cardápio","grupo_opcao":"Bordas e adicionais","variacao":"Tamanho","busca_placeholder":"Qual pizza vai hoje?","categorias_sugeridas":["Pizzas salgadas","Pizzas doces","Esfihas e calzones","Bebidas","Combos"]}',
   '{"cadastro_produto":["identificacao","preco","ingredientes","tempo_preparo"],"detalhe_produto":["foto","descricao","ingredientes","adicionais"],"vitrine":["destaques","categorias","lista"]}',
   '{VARIATION,INGREDIENT,ADDON}', true, false, 9),
  ('FOOD_MARMITA', 'Marmitaria',
   '{"catalogo":"Cardápio","grupo_opcao":"Acompanhamentos","variacao":"Tamanho","busca_placeholder":"Qual a marmita de hoje?","categorias_sugeridas":["Marmitas do dia","Fitness","Executivos","Saladas","Sucos e bebidas","Sobremesas"]}',
   '{"cadastro_produto":["identificacao","preco","acompanhamentos","tempo_preparo"],"detalhe_produto":["foto","descricao","acompanhamentos"],"vitrine":["destaques","categorias","lista"]}',
   '{VARIATION,INGREDIENT,ADDON}', true, false, 10),
  ('FOOD_BAKERY', 'Padaria e confeitaria',
   '{"catalogo":"Cardápio","grupo_opcao":"Adicionais","variacao":"Tamanho","busca_placeholder":"Pão, bolo ou salgado?","categorias_sugeridas":["Pães","Bolos e tortas","Salgados","Doces","Café da manhã","Bebidas"]}',
   '{"cadastro_produto":["identificacao","preco","ingredientes","tempo_preparo"],"detalhe_produto":["foto","descricao","adicionais"],"vitrine":["destaques","categorias","lista"]}',
   '{VARIATION,ADDON}', true, false, 11),
  ('GROCERY', 'Mercadinho e hortifrúti',
   '{"catalogo":"Catálogo","grupo_opcao":"Opções","variacao":"Embalagem","busca_placeholder":"O que falta na sua casa?","categorias_sugeridas":["Hortifrúti","Mercearia","Frios e laticínios","Bebidas","Limpeza","Higiene"]}',
   '{"cadastro_produto":["identificacao","preco","especificacoes","estoque"],"detalhe_produto":["fotos","descricao","especificacoes","variacoes"],"vitrine":["destaques","categorias","lista"]}',
   '{VARIATION,SPEC}', false, true, 12),
  ('SHOES', 'Calçados',
   '{"catalogo":"Catálogo","grupo_opcao":"Especificações","variacao":"Numeração","busca_placeholder":"Tênis, sandália, bota…","categorias_sugeridas":["Tênis","Sandálias e rasteiras","Sapatos","Botas","Chinelos","Infantil"]}',
   '{"cadastro_produto":["identificacao","preco","grade","estoque"],"detalhe_produto":["fotos","descricao","grade","tabela_medidas"],"vitrine":["categorias","filtros","lista"]}',
   '{VARIATION,SPEC}', false, true, 13),
  ('COSMETICS', 'Cosméticos e perfumaria',
   '{"catalogo":"Catálogo","grupo_opcao":"Especificações","variacao":"Cor ou fragrância","busca_placeholder":"Perfume, maquiagem, cuidado…","categorias_sugeridas":["Perfumes","Maquiagem","Cabelos","Pele","Corpo e banho","Kits"]}',
   '{"cadastro_produto":["identificacao","preco","especificacoes","estoque"],"detalhe_produto":["fotos","descricao","especificacoes","variacoes"],"vitrine":["destaques","categorias","lista"]}',
   '{VARIATION,SPEC}', false, true, 14),
  ('PHARMACY', 'Farmácia e drogaria',
   '{"catalogo":"Catálogo","grupo_opcao":"Especificações","variacao":"Apresentação","busca_placeholder":"Higiene, vitaminas, cuidados…","categorias_sugeridas":["Higiene pessoal","Vitaminas e suplementos","Dermocosméticos","Infantil","Primeiros socorros","Bem-estar"]}',
   '{"cadastro_produto":["identificacao","preco","especificacoes","estoque"],"detalhe_produto":["fotos","descricao","especificacoes","variacoes"],"vitrine":["busca","categorias","lista"]}',
   '{VARIATION,SPEC}', false, true, 15),
  ('PET_SHOP', 'Pet shop',
   '{"catalogo":"Catálogo","grupo_opcao":"Especificações","variacao":"Tamanho","busca_placeholder":"Ração, petisco, brinquedo…","categorias_sugeridas":["Rações","Petiscos","Brinquedos","Higiene","Acessórios","Farmacinha"]}',
   '{"cadastro_produto":["identificacao","preco","especificacoes","estoque"],"detalhe_produto":["fotos","descricao","especificacoes","variacoes"],"vitrine":["destaques","categorias","lista"]}',
   '{VARIATION,SPEC}', false, true, 16),
  ('FLORIST', 'Floricultura',
   '{"catalogo":"Catálogo","grupo_opcao":"Complementos","variacao":"Tamanho","busca_placeholder":"Buquê, arranjo, planta…","categorias_sugeridas":["Buquês","Arranjos","Plantas","Cestas e presentes","Datas especiais"]}',
   '{"cadastro_produto":["identificacao","preco","especificacoes","estoque"],"detalhe_produto":["fotos","descricao","variacoes"],"vitrine":["destaques","categorias","lista"]}',
   '{VARIATION,ADDON}', false, true, 17),
  ('STATIONERY', 'Papelaria',
   '{"catalogo":"Catálogo","grupo_opcao":"Especificações","variacao":"Cor ou modelo","busca_placeholder":"Caderno, caneta, mochila…","categorias_sugeridas":["Cadernos","Escrita","Escolar","Escritório","Arte e desenho","Presentes"]}',
   '{"cadastro_produto":["identificacao","preco","especificacoes","estoque"],"detalhe_produto":["fotos","descricao","especificacoes","variacoes"],"vitrine":["categorias","filtros","lista"]}',
   '{VARIATION,SPEC}', false, true, 18),
  ('BOOKSTORE', 'Livraria',
   '{"catalogo":"Catálogo","grupo_opcao":"Especificações","variacao":"Edição","busca_placeholder":"Título, autor ou assunto","categorias_sugeridas":["Literatura brasileira","Ficção","Infantil","Não ficção","Quadrinhos","Didáticos"]}',
   '{"cadastro_produto":["identificacao","preco","especificacoes","estoque"],"detalhe_produto":["fotos","descricao","especificacoes"],"vitrine":["busca","categorias","lista"]}',
   '{SPEC,VARIATION}', false, true, 19),
  ('TOYS', 'Brinquedos',
   '{"catalogo":"Catálogo","grupo_opcao":"Especificações","variacao":"Modelo","busca_placeholder":"Brinquedo, jogo, pelúcia…","categorias_sugeridas":["Bebês","Pelúcias","Jogos","Montar e construir","Ao ar livre","Bonecos"]}',
   '{"cadastro_produto":["identificacao","preco","especificacoes","estoque"],"detalhe_produto":["fotos","descricao","especificacoes","variacoes"],"vitrine":["destaques","categorias","lista"]}',
   '{VARIATION,SPEC}', false, true, 20),
  ('HARDWARE', 'Material de construção',
   '{"catalogo":"Catálogo","grupo_opcao":"Especificações","variacao":"Medida","busca_placeholder":"Ferramenta, tinta, elétrica…","categorias_sugeridas":["Ferramentas","Elétrica","Hidráulica","Tintas","Fixação","Jardim"]}',
   '{"cadastro_produto":["identificacao","preco","especificacoes","estoque"],"detalhe_produto":["fotos","especificacoes","variacoes"],"vitrine":["busca","filtros","lista"]}',
   '{SPEC,VARIATION}', false, true, 21),
  ('TOBACCO', 'Tabacaria',
   '{"catalogo":"Catálogo","grupo_opcao":"Especificações","variacao":"Modelo","busca_placeholder":"Seda, isqueiro, narguilé…","categorias_sugeridas":["Sedas e piteiras","Isqueiros","Narguilé","Charutos","Acessórios"],"aviso":"Venda proibida para menores de 18 anos."}',
   '{"cadastro_produto":["identificacao","preco","especificacoes","estoque"],"detalhe_produto":["fotos","descricao","especificacoes","variacoes"],"vitrine":["categorias","filtros","lista"]}',
   '{VARIATION,SPEC}', false, true, 22)
ON CONFLICT (code) DO NOTHING;

-- As categorias sugeridas dos 8 tipos de 0003.
UPDATE app.vertical_presets p
   SET labels = p.labels || jsonb_build_object('categorias_sugeridas', s.categorias)
  FROM (VALUES
    ('FOOD_SNACK',      '["Lanches","Porções","Salgados","Combos","Bebidas","Sobremesas"]'::jsonb),
    ('FOOD_RESTAURANT', '["Pratos executivos","Pratos da casa","Porções","Saladas","Bebidas","Sobremesas"]'::jsonb),
    ('FOOD_ACAI',       '["Açaí no copo","Açaí na tigela","Sorvetes","Picolés","Milk-shakes","Complementos"]'::jsonb),
    ('RETAIL_GENERIC',  '["Casa","Cozinha","Utilidades","Presentes","Organização","Festa"]'::jsonb),
    ('APPAREL',         '["Camisetas","Calças e bermudas","Vestidos","Moda praia","Acessórios","Promoções"]'::jsonb),
    ('AUTO_PARTS',      '["Óleos e fluidos","Pneus e câmaras","Freios","Elétrica","Acessórios","Capacetes"]'::jsonb),
    ('ELECTRONICS',     '["Carregadores e cabos","Fones e áudio","Capinhas e películas","Acessórios","Informática","Casa conectada"]'::jsonb),
    ('BEVERAGES',       '["Cervejas","Vinhos","Destilados","Refrigerantes e águas","Gelo e carvão","Kits"]'::jsonb)
  ) AS s (code, categorias)
 WHERE p.code = s.code
   AND NOT (p.labels ? 'categorias_sugeridas');
