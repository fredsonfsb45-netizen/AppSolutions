-- ========================================================
-- APPSOLUTIONS SAAS - SETUP COMPLETO V7 (VERSÃO FINAL)
-- Este script RECRIA todo o banco para sincronizar com o código.
-- ========================================================

-- 1. LIMPEZA TOTAL (Remove tudo para evitar erros de nomes antigos)
DROP VIEW IF EXISTS public.lista_clientes_master CASCADE;
DROP TABLE IF EXISTS public.itens_pedido CASCADE;
DROP TABLE IF EXISTS public.comandas CASCADE;
DROP TABLE IF EXISTS public.despesas CASCADE;
DROP TABLE IF EXISTS public.produtos CASCADE;
DROP TABLE IF EXISTS public.configuracoes CASCADE;

-- 2. TABELA DE CONFIGURAÇÕES (SaaS Core)
CREATE TABLE public.configuracoes (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id UUID DEFAULT auth.uid() NOT NULL REFERENCES auth.users(id),
    nome_estabelecimento TEXT,
    taxa_garcom_ativa BOOLEAN DEFAULT TRUE,
    manager_password TEXT DEFAULT 'b10',
    pin_garcom TEXT DEFAULT '0000',
    plano_status TEXT DEFAULT 'trial' CHECK (plano_status IN ('trial', 'ativo', 'suspenso', 'bloqueado', 'cancelado')),
    data_vencimento TIMESTAMPTZ DEFAULT (now() + interval '7 days'),
    is_admin BOOLEAN DEFAULT FALSE,
    valor_mensalidade DECIMAL(10,2) DEFAULT 29.90,
    saas_receita_acumulada DECIMAL(10,2) DEFAULT 0.00,
    setup_concluido BOOLEAN DEFAULT FALSE,
    cor_header TEXT DEFAULT '#dc2626',
    cor_fundo TEXT DEFAULT '#f8fafc',
    cor_texto TEXT DEFAULT '#1e293b',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. TABELA DE PRODUTOS
CREATE TABLE public.produtos (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id UUID DEFAULT auth.uid() NOT NULL REFERENCES auth.users(id),
    nome TEXT NOT NULL,
    preco DECIMAL(10,2) NOT NULL,
    categoria TEXT,
    estoque_atual INTEGER DEFAULT 0,
    estoque_minimo INTEGER DEFAULT 5,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT produtos_user_id_nome_key UNIQUE (user_id, nome)
);

-- 4. TABELA DE COMANDAS (Usando mesa_cliente para bater com o código)
CREATE TABLE public.comandas (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id UUID DEFAULT auth.uid() NOT NULL REFERENCES auth.users(id),
    mesa_cliente TEXT NOT NULL, -- Alterado para TEXT para aceitar nomes ou números
    status TEXT DEFAULT 'Aberta',
    total_valor DECIMAL(10,2) DEFAULT 0.00,
    garçom_nome TEXT,
    arquivado BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now(),
    fechada_em TIMESTAMPTZ
);

-- 5. TABELA DE ITENS (Com todas as colunas necessárias para a cozinha)
CREATE TABLE public.itens_pedido (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id UUID DEFAULT auth.uid() NOT NULL REFERENCES auth.users(id),
    comanda_id BIGINT REFERENCES public.comandas(id) ON DELETE CASCADE,
    produto_id BIGINT REFERENCES public.produtos(id),
    quantidade INTEGER NOT NULL,
    preco_unitario DECIMAL(10,2),
    status_producao TEXT DEFAULT 'Pendente', -- Pendente, Pronto, Entregue
    observacao TEXT DEFAULT '',
    arquivado BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. TABELA DE DESPESAS
CREATE TABLE public.despesas (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id UUID DEFAULT auth.uid() NOT NULL REFERENCES auth.users(id),
    descricao TEXT NOT NULL,
    valor DECIMAL(10,2) NOT NULL,
    categoria TEXT,
    data_vencimento DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. SEGURANÇA (RLS e Políticas Customizadas)
ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comandas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_pedido ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.despesas ENABLE ROW LEVEL SECURITY;

-- FUNÇÃO DE VERIFICAÇÃO MASTER
CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.configuracoes WHERE user_id = auth.uid() AND is_admin = true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- POLÍTICAS
CREATE POLICY "Indiv_Conf" ON configuracoes FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Indiv_Prod" ON produtos FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Indiv_Com" ON comandas FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Indiv_Itens" ON itens_pedido FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Indiv_Desp" ON despesas FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Master_Full" ON configuracoes FOR ALL USING (auth.uid() = '7a037349-c10b-4ce5-8e5b-5a34f8cc42e2');
CREATE POLICY "Master_Prod" ON produtos FOR ALL USING (public.check_is_admin());
CREATE POLICY "Master_Com" ON comandas FOR ALL USING (public.check_is_admin());
CREATE POLICY "Master_Itens" ON itens_pedido FOR ALL USING (public.check_is_admin());

-- 8. GATILHO DE NOVO USUÁRIO
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.configuracoes (user_id, nome_estabelecimento, plano_status, data_vencimento)
  VALUES (new.id, COALESCE(new.raw_user_meta_data->>'estabelecimento', 'Meu Restaurante'), 'trial', (now() + interval '7 days'));
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 9. FUNÇÃO RPC DE LANÇAMENTO (Lógica de Estoque e Cozinha)
DROP FUNCTION IF EXISTS public.lancar_item_seguro_v2(bigint, bigint, integer, text);
CREATE OR REPLACE FUNCTION public.lancar_item_seguro_v2(
    p_comanda_id BIGINT,
    p_produto_id BIGINT,
    p_quantidade INTEGER,
    p_obs TEXT DEFAULT ''
)
RETURNS void AS $$
DECLARE
    v_preco DECIMAL(10,2);
    v_estoque INTEGER;
BEGIN
    SELECT preco, estoque_atual INTO v_preco, v_estoque FROM public.produtos WHERE id = p_produto_id;
    IF v_estoque < p_quantidade THEN RAISE EXCEPTION 'Estoque insuficiente!'; END IF;
    UPDATE public.produtos SET estoque_atual = estoque_atual - p_quantidade WHERE id = p_produto_id;
    INSERT INTO public.itens_pedido (comanda_id, produto_id, quantidade, preco_unitario, observacao, status_producao, user_id)
    VALUES (p_comanda_id, p_produto_id, p_quantidade, v_preco, p_obs, 'Pendente', auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. VISÃO MASTER CENTRAL
CREATE OR REPLACE VIEW public.lista_clientes_master AS
SELECT c.*, u.email as email_cliente FROM public.configuracoes c JOIN auth.users u ON c.user_id = u.id;
GRANT SELECT ON public.lista_clientes_master TO authenticated;
