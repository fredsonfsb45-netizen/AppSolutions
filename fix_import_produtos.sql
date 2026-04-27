-- Correção para o Erro na Importação de Excel (ON CONFLICT)
-- Execute este comando no SQL Editor do Supabase para corrigir o erro atual sem perder os dados existentes.

ALTER TABLE public.produtos 
ADD CONSTRAINT produtos_user_id_nome_key UNIQUE (user_id, nome);
