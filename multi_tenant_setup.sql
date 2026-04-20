-- ====================================================================
-- SCRIPT MULTI-TENANT B10 (SaaS) - LIMPO E SEGURO
-- Execute no SQL Editor do Supabase para resetar e configurar o SaaS.
-- ====================================================================

-- 1. LIMPEZA (OPCIONAL: CUIDADO!)
DROP TABLE IF EXISTS itens_pedido;
DROP TABLE IF EXISTS comandas;
DROP TABLE IF EXISTS despesas;
DROP TABLE IF EXISTS produtos;
DROP TABLE IF EXISTS configuracoes;

-- 2. CRIAÇÃO DAS TABELAS COM USER_ID

-- CONFIGURAÇÕES (Preferências por Restaurante)
CREATE TABLE configuracoes (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id UUID DEFAULT auth.uid() NOT NULL REFERENCES auth.users(id),
    taxa_garcom_ativa BOOLEAN DEFAULT TRUE,
    manager_password TEXT DEFAULT 'b10', -- Senha extra solicitada pelo usuário
    UNIQUE(user_id) -- Apenas uma config por usuário
);

-- PRODUTOS
CREATE TABLE produtos (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id UUID DEFAULT auth.uid() NOT NULL REFERENCES auth.users(id),
    nome TEXT NOT NULL,
    preco DECIMAL(10,2) NOT NULL,
    estoque_atual INT DEFAULT 0,
    estoque_minimo INT DEFAULT 5,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- COMANDAS
CREATE TABLE comandas (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id UUID DEFAULT auth.uid() NOT NULL REFERENCES auth.users(id),
    mesa_cliente TEXT NOT NULL,
    status TEXT DEFAULT 'Aberta' CHECK (status IN ('Aberta', 'Fechada')),
    arquivado BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ITENS DE PEDIDO
CREATE TABLE itens_pedido (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id UUID DEFAULT auth.uid() NOT NULL REFERENCES auth.users(id),
    comanda_id BIGINT REFERENCES comandas(id) ON DELETE CASCADE,
    produto_id BIGINT REFERENCES produtos(id),
    quantidade INT NOT NULL,
    status_producao TEXT DEFAULT 'Recebido' CHECK (status_producao IN ('Recebido', 'Pronto', 'Entregue')),
    arquivado BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- DESPESAS
CREATE TABLE despesas (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id UUID DEFAULT auth.uid() NOT NULL REFERENCES auth.users(id),
    descricao TEXT NOT NULL,
    valor DECIMAL(10,2) NOT NULL,
    arquivado BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. HABILITAR ROW LEVEL SECURITY (RLS)
ALTER TABLE configuracoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE comandas ENABLE ROW LEVEL SECURITY;
ALTER TABLE itens_pedido ENABLE ROW LEVEL SECURITY;
ALTER TABLE despesas ENABLE ROW LEVEL SECURITY;

-- 4. CRIAR POLÍTICAS DE ISOLAMENTO (MULTI-TENANCY)

CREATE POLICY "Acesso Total Usuario" ON configuracoes FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Acesso Total Usuario" ON produtos FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Acesso Total Usuario" ON comandas FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Acesso Total Usuario" ON itens_pedido FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Acesso Total Usuario" ON despesas FOR ALL USING (user_id = auth.uid());

-- 5. FUNÇÃO SEGURA DE CHECAGEM DE SENHA EXTRA (MANAGER PASSWORD)
CREATE OR REPLACE FUNCTION verificar_senha_manager(senha_tentada TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    senha_correta TEXT;
BEGIN
    SELECT manager_password INTO senha_correta FROM configuracoes WHERE user_id = auth.uid();
    RETURN senha_tentada = COALESCE(senha_correta, 'b10');
END;
$$;

-- 6. FUNÇÃO SEGURA PARA LANÇAMENTO E DESCONTO DE ESTOQUE (MULTI-USER)
CREATE OR REPLACE FUNCTION lancar_item_seguro(
  p_comanda_id bigint,
  p_produto_id bigint,
  p_quantidade int
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  estoque_atual_prod int;
  user_owner_id uuid;
BEGIN
  -- 6.1 Verifica se o usuário autenticado é dono da comanda e do produto
  SELECT user_id INTO user_owner_id FROM comandas WHERE id = p_comanda_id;
  IF user_owner_id <> auth.uid() THEN
    RAISE EXCEPTION 'Acesso Negado à Comanda';
  END IF;

  -- 6.2 Bloqueia e lê estoque do produto (garantindo que pertence ao usuário)
  SELECT estoque_atual INTO estoque_atual_prod FROM produtos 
  WHERE id = p_produto_id AND user_id = auth.uid() FOR UPDATE;

  -- 6.3 Checa se tem o suficiente
  IF estoque_atual_prod < p_quantidade THEN
    RAISE EXCEPTION 'Estoque insuficiente!';
  END IF;

  -- 6.4 Debita o estoque
  UPDATE produtos SET estoque_atual = estoque_atual_prod - p_quantidade 
  WHERE id = p_produto_id AND user_id = auth.uid();

  -- 6.5 Insere na tabela do pedido
  INSERT INTO itens_pedido (comanda_id, produto_id, quantidade, status_producao, user_id) 
  VALUES (p_comanda_id, p_produto_id, p_quantidade, 'Recebido', auth.uid());

  RETURN true;
END;
$$;
