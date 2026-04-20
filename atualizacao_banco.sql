-- ====================================================================
-- SCRIPT DE ATUALIZAÇÃO B10 - COLE ISSO NO SQL EDITOR DO SUPABASE E RODE!
-- ====================================================================

-- 1. ADICIONA COLUNA "ARQUIVADO" ÀS TABELAS PARA MANTER O HISTÓRICO EM VEZ DE DELETAR
ALTER TABLE comandas ADD COLUMN IF NOT EXISTS arquivado boolean DEFAULT false;
ALTER TABLE itens_pedido ADD COLUMN IF NOT EXISTS arquivado boolean DEFAULT false;
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS arquivado boolean DEFAULT false;

-- Atualizar registros antigos, caso existam, para arquivado false
UPDATE comandas SET arquivado = false WHERE arquivado IS NULL;
UPDATE itens_pedido SET arquivado = false WHERE arquivado IS NULL;
UPDATE despesas SET arquivado = false WHERE arquivado IS NULL;

-- 2. FUNÇÃO SEGURA DE CHECAGEM DE SENHA (Sem deixar vazar no Front-end)
CREATE OR REPLACE FUNCTION verificar_senha(senha_tentada text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Se precisar trocar a senha depois, basta mudar essa string 'b10' aqui no Supabase.
    IF senha_tentada = 'b10' THEN
        RETURN true;
    ELSE
        RETURN false;
    END IF;
END;
$$;

-- 3. FUNÇÃO SEGURA PARA LANÇAMENTO E DESCONTO DE ESTOQUE (Evita Problemas de Concorrência/Race Conditions)
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
BEGIN
  -- 3.1 Bloqueia a linha da tabela (FOR UPDATE) para que ninguém mais mude ao mesmo tempo
  SELECT estoque_atual INTO estoque_atual_prod FROM produtos WHERE id = p_produto_id FOR UPDATE;

  -- 3.2 Checa se tem o suficiente
  IF estoque_atual_prod < p_quantidade THEN
    RAISE EXCEPTION 'Estoque insuficiente!';
  END IF;

  -- 3.3 Debita o estoque
  UPDATE produtos SET estoque_atual = estoque_atual_prod - p_quantidade WHERE id = p_produto_id;

  -- 3.4 Insere na tabela do pedido
  INSERT INTO itens_pedido (comanda_id, produto_id, quantidade, status_producao) 
  VALUES (p_comanda_id, p_produto_id, p_quantidade, 'Recebido');

  RETURN true;
END;
$$;
