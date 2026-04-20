import streamlit as st
from supabase import create_client, Client
import pandas as pd
import os

# CONFIGURAÇÕES DO SUPABASE
SUPABASE_URL = "https://yvpeadvhisjiuyauprol.supabase.co"
SUPABASE_KEY = "sb_publishable_kDOa3ClK3RaOw9QMHYml1g_47xZe2dJ"

@st.cache_resource
def init_connection():
    return create_client(SUPABASE_URL, SUPABASE_KEY)

# Se as credenciais ainda forem o padrão, a interface avisa para não quebrar
if "SUA_URL_DO_SUPABASE_AQUI" in SUPABASE_URL:
    st.error("⚠️ ERRO DE CONFIGURAÇÃO: Você precisa colocar sua URL e KEY do Supabase no código do `app.py`.")
    st.stop()

supabase: Client = init_connection()

st.set_page_config(page_title="Churrasco B10 - Nuvem", layout="wide")

st.sidebar.title("Navegação")
view = st.sidebar.radio("Selecione o Módulo:", ["Garçom", "Cozinha", "Dono - Painel", "Dono - Produtos"])

def fetch_produtos():
    response = supabase.table("produtos").select("*").execute()
    return response.data

def fetch_comandas():
    response = supabase.table("comandas").select("*").eq("status", "Aberta").execute()
    return response.data

if view == "Garçom":
    st.title("Módulo do Garçom 🍽️")
    
    col1, col2 = st.columns(2)
    with col1:
        st.subheader("Abrir Comanda")
        mesa = st.text_input("Número da Mesa ou Nome do Cliente")
        if st.button("Abrir Mesa"):
            if mesa:
                supabase.table("comandas").insert({"mesa_cliente": mesa}).execute()
                st.success(f"Mesa '{mesa}' aberta com sucesso!")
                st.rerun()
            else:
                st.warning("Preencha a mesa.")

    with col2:
        st.subheader("Lançar Pedido")
        comandas = fetch_comandas()
        if not comandas:
            st.info("Nenhuma comanda aberta.")
        else:
            comanda_selecionada = st.selectbox("Selecione a Comanda", [(c["id"], c["mesa_cliente"]) for c in comandas], format_func=lambda x: f"Mesa: {x[1]} (ID: {x[0]})")
            produtos = fetch_produtos()
            if produtos:
                produto_selecionado = st.selectbox("Selecione o Produto", [(p["id"], p["nome"], p["preco"], p["estoque_atual"]) for p in produtos], format_func=lambda x: f"{x[1]} - R$ {x[2]:.2f} (Estoque: {x[3]})")
                quantidade = st.number_input("Quantidade", min_value=1, value=1)
                
                if st.button("Adicionar ao Pedido"):
                    if produto_selecionado[3] < quantidade:
                        st.error("Estoque Insuficiente!")
                    else:
                        # Baixa no estoque e adiciona item
                        novo_estoque = produto_selecionado[3] - quantidade
                        supabase.table("produtos").update({"estoque_atual": novo_estoque}).eq("id", produto_selecionado[0]).execute()
                        supabase.table("itens_pedido").insert({
                            "comanda_id": comanda_selecionada[0],
                            "produto_id": produto_selecionado[0],
                            "quantidade": quantidade
                        }).execute()
                        st.success("Item adicionado e mandado para cozinha!")
            else:
                st.error("Nenhum produto cadastrado.")

    st.markdown("---")
    st.subheader("Fechar Comanda (Pagar)")
    if comandas:
        comanda_fechar = st.selectbox("Comanda a Receber", [(c["id"], c["mesa_cliente"]) for c in comandas], format_func=lambda x: f"Mesa/Cliente: {x[1]} (ID: {x[0]})", key="fechar")
        
        # Mostra itens da comanda fazendo Join
        itens_res = supabase.table("itens_pedido").select("*, produtos(nome, preco)").eq("comanda_id", comanda_fechar[0]).execute()
        if itens_res.data:
            itens = itens_res.data
            lista_tabela = []
            total_comanda = 0
            for i in itens:
                nome_prod = i['produtos']['nome']
                preco_prod = i['produtos']['preco']
                qtd = i['quantidade']
                total = qtd * preco_prod
                total_comanda += total
                lista_tabela.append({"Produto": nome_prod, "Qtd": qtd, "Preço Unit": preco_prod, "Total": total, "Status": i['status_producao']})
            
            st.dataframe(pd.DataFrame(lista_tabela))
            st.write(f"**Total da Comanda: R$ {total_comanda:.2f}**")
            
            if st.button("Receber Pagamento e Fechar"):
                supabase.table("comandas").update({"status": "Fechada"}).eq("id", comanda_fechar[0]).execute()
                st.success("Comanda finalizada.")
                st.rerun()

elif view == "Cozinha":
    st.title("Monitor da Cozinha 🔥")
    if st.button("Atualizar"):
        st.rerun()
        
    pedidos_res = supabase.table("itens_pedido").select("*, comandas(mesa_cliente, status), produtos(nome)").eq("status_producao", "Recebido").execute()
    
    pendentes = [p for p in pedidos_res.data if p['comandas'] and p['comandas']['status'] == 'Aberta']
    
    if not pendentes:
        st.success("Tudo entregue! Nenhum pedido pendente.")
    for p in pendentes:
        st.warning(f"🔔 Mesa {p['comandas']['mesa_cliente']} - {p['quantidade']}x {p['produtos']['nome']}")
        if st.button(f"Marcar Pronto (Pedido #{p['id']})", key=f"btn_{p['id']}"):
            supabase.table("itens_pedido").update({"status_producao": "Pronto"}).eq("id", p['id']).execute()
            st.rerun()

elif view == "Dono - Painel":
    st.title("Painel Financeiro & Estoque 📈")
    
    st.subheader("Estoque Crítico (Alerta)")
    produtos = fetch_produtos()
    criticos = [p for p in produtos if p['estoque_atual'] <= p['estoque_minimo']]
    if criticos:
        for item in criticos:
            st.error(f"⚠️ **{item['nome']}** está com baixo estoque! Atual: {item['estoque_atual']} (Mínimo: {item['estoque_minimo']})")
    else:
        st.success("Nenhum item com estoque baixo.")
            
    st.markdown("---")
    st.subheader("Balanço Financeiro (DRE)")
    
    # Receitas
    pagos = supabase.table("itens_pedido").select("quantidade, produtos(preco), comandas(status)").execute()
    receitas = 0
    for p in pagos.data:
        if p['comandas'] and p['comandas']['status'] == 'Fechada' and p['produtos']:
            receitas += p['quantidade'] * p['produtos']['preco']
            
    # Despesas
    desp = supabase.table("despesas").select("valor").execute()
    despesas = sum([d['valor'] for d in desp.data]) if desp.data else 0
    
    lucro = receitas - despesas
    
    col1, col2, col3 = st.columns(3)
    col1.metric("Faturamento Bruto (Recibos Pagos)", f"R$ {receitas:.2f}")
    col2.metric("Despesas / Insumos", f"R$ {despesas:.2f}")
    col3.metric("Lucro Líquido", f"R$ {lucro:.2f}")

    st.markdown("---")
    st.subheader("Lançar Saída de Caixa (Despesa)")
    with st.form("despesa_form", clear_on_submit=True):
        desc = st.text_input("Descrição do Insumo (ex: Carvão)")
        valor = st.number_input("Valor Pago (R$)", min_value=0.0)
        submitted = st.form_submit_button("Lançar Despesa")
        if submitted and desc and valor > 0:
            supabase.table("despesas").insert({"descricao": desc, "valor": valor}).execute()
            st.success("Despesa salva!")
            st.rerun()

elif view == "Dono - Produtos":
    st.title("Gestão de Cardápio 📋")
    
    st.subheader("Adicionar Produto")
    with st.form("produto_form", clear_on_submit=True):
        nome = st.text_input("Nome do Produto")
        preco = st.number_input("Preço de Venda (R$)", min_value=0.0)
        estoque = st.number_input("Estoque Atual", min_value=0)
        estoque_minimo = st.number_input("Estoque Mínimo (Alerta)", value=2, min_value=1)
        
        if st.form_submit_button("Cadastrar"):
            if nome and preco > 0:
                supabase.table("produtos").insert({
                    "nome": nome,
                    "preco": preco,
                    "estoque_atual": estoque,
                    "estoque_minimo": estoque_minimo
                }).execute()
                st.success("Produto cadastrado com sucesso!")
                st.rerun()
            else:
                st.error("Preencha nome e preço válido.")

    st.markdown("---")
    st.subheader("Lista de Produtos")
    produtos = fetch_produtos()
    if produtos:
        st.dataframe(pd.DataFrame(produtos))
