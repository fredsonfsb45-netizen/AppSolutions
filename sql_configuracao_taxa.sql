-- ====================================================================
-- SCRIPT DE MÓDULO: TAXA DO GARÇOM (COLE NO SUPABASE SQL EDITOR E DE UM RUN)
-- ====================================================================

CREATE TABLE IF NOT EXISTS configuracoes (
    id bigint PRIMARY KEY,
    taxa_garcom_ativa boolean DEFAULT false
);

-- Insere o valor padrão "desativado" inicialmente. 
-- O ON CONFLICT garante que se a tabela já existir por algum motivo, não vai duplicar e quebrar.
INSERT INTO configuracoes (id, taxa_garcom_ativa) 
VALUES (1, false) 
ON CONFLICT (id) DO NOTHING;
