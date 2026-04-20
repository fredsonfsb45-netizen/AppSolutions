// !!! COLOQUE SUAS CREDENCIAIS DO SUPABASE AQUI !!!
const SUPABASE_URL = "https://yvpeadvhisjiuyauprol.supabase.co";
const SUPABASE_KEY = "sb_publishable_kDOa3ClK3RaOw9QMHYml1g_47xZe2dJ";

let db;

// Validação simples
if (SUPABASE_URL === "SUA_URL_AQUI") {
    document.getElementById('main-content').innerHTML = `
        <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative text-center">
            <strong class="font-bold">ERRO DE CONFIGURAÇÃO!</strong>
            <span class="block sm:inline">Você precisa colocar sua URL e a Chave Anon do Supabase no arquivo <b>app.js</b>.</span>
        </div>`;
} else {
    try {
        if (!window.supabase) {
            throw new Error("A biblioteca do Supabase não carregou do CDN. Verifique a internet ou o AdBlock.");
        }
        // Inicializa o Cliente Oficial do Supabase
        db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        // Inicia no modo Garçom por Padrão
        setMode('garcom');
    } catch (e) {
        document.getElementById('main-content').innerHTML = `
            <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative text-center">
                <strong class="font-bold">ERRO FATAL (F12 para detalhes):</strong>
                <span class="block sm:inline">${e.message}</span>
            </div>`;
        console.error("Erro na inicialização:", e);
    }
}

function showAlert(message, isError=false) {
    const container = document.getElementById('alert-container');
    const alertId = 'alert_' + Math.random().toString(36).substr(2, 9);
    const colorClass = isError ? 'bg-red-500' : 'bg-green-500';
    
    container.innerHTML += `
        <div id="${alertId}" class="${colorClass} text-white px-6 py-3 rounded shadow-lg mb-2 transition-opacity duration-500 opacity-100">
            ${message}
        </div>
    `;
    
    setTimeout(() => {
        const el = document.getElementById(alertId);
        if (el) {
            el.classList.remove('opacity-100');
            el.classList.add('opacity-0');
            setTimeout(() => el.remove(), 500);
        }
    }, 3000);
}

async function setMode(mode) {
    const content = document.getElementById('main-content');
    content.innerHTML = '<div class="text-center text-gray-500 mt-10">Carregando dados...</div>';
    
    try {
        if (mode === 'garcom') {
            await renderGarcom(content);
        } else if (mode === 'cozinha') {
            await renderCozinha(content);
        } else if (mode === 'dono') {
            await renderDono(content);
        }
    } catch (error) {
        console.error(error);
        showAlert("Erro de conexão com o Banco", true);
        content.innerHTML = '<div class="text-center text-red-500 mt-10">Erro ao carregar dados. Verifique a URL do Supabase.</div>';
    }
}

window.acessarDono = () => {
    const content = document.getElementById('main-content');
    content.innerHTML = `
        <div class="max-w-md mx-auto bg-white p-8 rounded-lg shadow border-t-4 border-gray-800 mt-10">
            <h2 class="text-2xl font-bold mb-4 text-center text-gray-800">🔒 Área Administrativa</h2>
            <p class="text-gray-600 text-center mb-6">Digite a senha para acessar as finanças e estoque da B10.</p>
            <input type="password" id="dono_senha" placeholder="Senha..." class="w-full p-4 border border-gray-300 rounded mb-6 text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-gray-800">
            <div class="flex gap-4">
                <button onclick="setMode('garcom')" class="flex-1 bg-gray-200 text-gray-800 font-bold py-3 rounded hover:bg-gray-300 shadow-sm transition">Voltar</button>
                <button onclick="verificarSenhaDono()" class="flex-1 bg-gray-800 text-white font-bold py-3 rounded hover:bg-black shadow-sm transition">Entrar</button>
            </div>
        </div>
    `;
}

window.verificarSenhaDono = async () => {
    const senha = document.getElementById('dono_senha').value;
    const { data: valida, error } = await db.rpc('verificar_senha', { senha_tentada: senha });
    
    if (error) {
        console.error(error);
        return showAlert('ERRO BANCO: Você já rodou o novo script SQL no Supabase?', true);
    }

    if (valida) {
        setMode('dono');
    } else {
        showAlert('Senha Incorreta!', true);
    }
}

// ==========================================
// VISÃO DO GARÇOM
// ==========================================
async function renderGarcom(container) {
    // Busca produtos
    const { data: produtos, error: errProd } = await db.from('produtos').select('*').order('nome');
    if (errProd) showAlert("Erro ao ler produtos", true);
    
    // Busca comandas abertas e ativas
    const { data: comandas, error: errCom } = await db.from('comandas').select('*').eq('status', 'Aberta').eq('arquivado', false);
    if (errCom) showAlert("Erro ao ler comandas", true);
    
    // Busca pedidos prontos da cozinha para entregar
    const { data: prontos } = await db.from('itens_pedido').select('id, quantidade, produtos(nome), comandas!inner(mesa_cliente, status, arquivado)').eq('status_producao', 'Pronto').eq('arquivado', false);
    const ativosProntos = prontos ? prontos.filter(p => p.comandas && p.comandas.status === 'Aberta' && p.comandas.arquivado === false) : [];
    
    let prontosCards = '';
    if (ativosProntos.length > 0) {
        ativosProntos.forEach(p => {
            prontosCards += `
                <div class="bg-white border-b-2 border-green-500 p-3 rounded shadow flex justify-between items-center">
                    <div>
                        <div class="text-xs text-gray-500 font-bold uppercase">Mesa <span class="text-black text-sm">${p.comandas.mesa_cliente}</span></div>
                        <div class="font-bold text-green-700 text-base">${p.quantidade}x ${p.produtos.nome}</div>
                    </div>
                    <button onclick="marcarEntregue(${p.id})" class="bg-green-100 text-green-700 p-2 rounded hover:bg-green-200 transition-colors" title="Marcar como levado para a mesa">✔️ Entregue</button>
                </div>
            `;
        });
    } else {
        prontosCards = '<div class="text-gray-500 text-sm italic col-span-full">Aguardando pratos da cozinha...</div>';
    }
    
    let comandasOptions = "<option value=''>Selecione uma comanda...</option>";
    if (comandas) {
        comandas.forEach(c => { comandasOptions += `<option value='${c.id}'>Mesa ${c.mesa_cliente}</option>` });
    }
    
    let produtosOptions = "<option value=''>Selecione o produto...</option>";
    if (produtos) {
        produtos.forEach(p => { produtosOptions += `<option value='${p.id}'>${p.nome} - R$ ${p.preco} (Estoque: ${p.estoque_atual})</option>` });
    } else {
        showAlert("Tabelas SQL não encontradas. Você rodou o supabase_setup.sql?", true);
    }

    container.innerHTML = `
        <h1 class="text-3xl font-bold mb-6">Módulo do Garçom 🍽️</h1>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
            <!-- ABRIR MESA -->
            <div class="bg-white p-6 rounded-lg shadow border-t-4 border-b10">
                <h2 class="text-xl font-bold mb-4">Abertura de Mesa</h2>
                <input type="text" id="g_mesa" autocomplete="off" placeholder="Nome do Cliente ou N° Mesa" class="w-full p-3 md:p-2 border rounded mb-4 text-lg md:text-base focus:outline-none focus:ring-2 focus:ring-red-500">
                <button onclick="abrirMesa()" class="w-full bg-red-600 text-white font-bold py-3 md:py-2 px-4 rounded hover:bg-red-700">Abrir Nova Comanda</button>
            </div>
            
            <!-- LANÇAR PEDIDO -->
            <div class="bg-white p-6 rounded-lg shadow border-t-4 border-b10">
                <h2 class="text-xl font-bold mb-4">Lançar no Pedido</h2>
                <select id="g_comanda" class="w-full p-3 md:p-2 border rounded mb-4 text-lg md:text-base bg-white">${comandasOptions}</select>
                <select id="g_produto" class="w-full p-3 md:p-2 border rounded mb-4 text-lg md:text-base bg-white">${produtosOptions}</select>
                <input type="number" id="g_qtd" autocomplete="off" value="1" min="1" class="w-full p-3 md:p-2 border rounded mb-4 text-lg md:text-base">
                <button onclick="lancarPedido()" class="w-full bg-green-600 text-white font-bold py-3 md:py-2 px-4 rounded hover:bg-green-700">Enviar para Cozinha</button>
            </div>
        </div>
        
        <!-- PAINEL DE AVISOS DA COZINHA -->
        <div class="mt-8 bg-green-50 p-6 rounded-lg shadow border-t-4 border-green-500">
            <div class="flex justify-between items-center mb-4">
                <h2 class="text-xl font-bold text-green-700">Campainha 🔔 (Prontos p/ Mesa)</h2>
                <button onclick="setMode('garcom')" class="text-sm bg-green-200 text-green-800 px-3 py-1 rounded hover:bg-green-300">↻ Atualizar</button>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4" id="g_prontos">
                ${prontosCards}
            </div>
        </div>
        
        <!-- PAGAR MESA -->
        <div class="mt-8 bg-white p-6 rounded-lg shadow border-t-4 border-b10">
            <h2 class="text-xl font-bold mb-4">Fechar Conta Paga</h2>
            <div class="flex flex-col sm:flex-row gap-4 mb-4">
                <select id="f_comanda" onchange="verConta()" class="flex-1 p-3 md:p-2 border rounded text-lg md:text-base bg-white">${comandasOptions}</select>
                <button onclick="fecharMesa()" class="bg-blue-600 text-white font-bold py-3 sm:py-2 px-6 rounded hover:bg-blue-700">MARCAR PAGO</button>
            </div>
            <div id="conta_detalhes" class="bg-gray-50 border rounded p-4 h-32 overflow-auto text-sm text-gray-600">
                Selecione uma mesa para ver os itens da conta...
            </div>
        </div>
    `;
}

window.abrirMesa = async () => {
    const mesa = document.getElementById('g_mesa').value.trim();
    if (!mesa) return showAlert("Preencha o campo de mesa", true);
    
    document.getElementById('g_mesa').disabled = true;
    
    // Evitar mesas duplicadas!
    const { data: existe } = await db.from('comandas').select('id').ilike('mesa_cliente', mesa).eq('status', 'Aberta').eq('arquivado', false);
    if (existe && existe.length > 0) {
        showAlert("Já existe uma comanda aberta para essa mesa/cliente!", true);
        document.getElementById('g_mesa').disabled = false;
        return;
    }
    
    const { error } = await db.from('comandas').insert({ mesa_cliente: mesa, arquivado: false });
    if (!error) {
        showAlert("Mesa aberta com sucesso!");
        setMode('garcom');
    } else {
        showAlert("Erro no Banco: " + error.message, true);
        document.getElementById('g_mesa').disabled = false;
    }
}

window.lancarPedido = async () => {
    const cid = document.getElementById('g_comanda').value;
    const pid = document.getElementById('g_produto').value;
    const qtd = parseInt(document.getElementById('g_qtd').value);
    
    if (!cid || !pid) return showAlert("Selecione a comanda e o produto", true);
    if (isNaN(qtd) || qtd <= 0) return showAlert("Coloque uma quantidade válida", true);
    
    // Chamada à RPC Segura (resolve Race Conditions de estoque) 
    const { error } = await db.rpc('lancar_item_seguro', { p_comanda_id: cid, p_produto_id: pid, p_quantidade: qtd });
    
    if (!error) {
        showAlert("Lançado e enviado à Cozinha!");
        setMode('garcom');
    } else {
        showAlert("Erro ao lançar: Estoque insuficiente?", true);
    }
}

window.marcarEntregue = async (itemId) => {
    // Altera o status para entregue, tirando da visão da campainha!
    await db.from('itens_pedido').update({ status_producao: 'Entregue' }).eq('id', itemId);
    showAlert("Item entregue com sucesso!", false);
    setMode('garcom');
}

window.verConta = async () => {
    const cid = document.getElementById('f_comanda').value;
    if (!cid) return document.getElementById('conta_detalhes').innerHTML = '';
    
    // Busca dados e as configurações de taxa em paralelo
    const [ {data}, {data: cfg} ] = await Promise.all([
        db.from('itens_pedido').select('id, quantidade, status_producao, produto_id, produtos(nome, preco)').eq('comanda_id', cid).eq('arquivado', false),
        db.from('configuracoes').select('taxa_garcom_ativa').eq('id', 1).single()
    ]);
    
    if (!data || data.length === 0) return document.getElementById('conta_detalhes').innerHTML = 'Nenhum item consumido ainda.';
    
    let html = '<div class="overflow-x-auto"><table class="w-full text-left min-w-[400px]"><tr><th class="pb-2">Qtd</th><th>Produto</th><th>R$ Unit.</th><th>Total</th><th class="text-center">Corrigir</th></tr>';
    let total = 0;
    data.forEach(i => {
        let val = i.quantidade * i.produtos.preco;
        total += val;
        html += `<tr class="border-t">
            <td class="py-2">${i.quantidade}x</td>
            <td class="font-medium">${i.produtos.nome}</td>
            <td class="text-gray-600">R$ ${i.produtos.preco.toFixed(2)}</td>
            <td class="font-bold">R$ ${val.toFixed(2)}</td>
            <td class="text-center"><button onclick="deletarItemPedido(${i.id}, ${i.produto_id}, ${i.quantidade})" class="text-sm bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1 rounded shadow-sm" title="Cancelar item lançado errado">🗑️</button></td>
        </tr>`;
    });
    
    // Adição visual e matemática da Gorjeta
    let usaTaxa = cfg && cfg.taxa_garcom_ativa;
    let taxa = usaTaxa ? (total * 0.10) : 0;
    let totalFinal = total + taxa;

    if (usaTaxa) {
        html += `<tr><td colspan="3" class="text-right py-2 text-gray-400 border-t">Subtotal s/ Taxa:</td><td colspan="2" class="font-bold text-gray-500 border-t">R$ ${total.toFixed(2)}</td></tr>`;
        html += `<tr><td colspan="3" class="text-right py-1 text-sky-600">Serviço (10%):</td><td colspan="2" class="font-bold text-sky-600">+ R$ ${taxa.toFixed(2)}</td></tr>`;
    }

    html += `</table></div><div class="mt-6 text-right text-xl font-bold text-red-600">TOTAL A RECEBER: R$ ${totalFinal.toFixed(2)}</div>`;
    document.getElementById('conta_detalhes').innerHTML = html;
}

window.deletarItemPedido = (itemId, produtoId, qtdDevolvida) => {
    const content = document.getElementById('main-content');
    content.innerHTML = `
        <div class="max-w-md mx-auto bg-red-50 p-6 rounded-lg shadow border-2 border-red-500 mt-10 text-center">
            <h2 class="text-xl font-bold text-red-700 mb-4">Confirmar Exclusão</h2>
            <p class="text-gray-700 mb-6">Você deseja cancelar esse lançamento e devolver <b>${qtdDevolvida} unidade(s)</b> de volta ao estoque?</p>
            <div class="flex flex-col sm:flex-row gap-4">
                <button onclick="setMode('garcom')" class="flex-1 bg-gray-300 text-gray-800 font-bold py-3 rounded">Não, Voltar</button>
                <button onclick="confirmarExclusaoItem(${itemId}, ${produtoId}, ${qtdDevolvida})" class="flex-1 bg-red-600 text-white font-bold py-3 rounded text-sm sm:text-base">Sim, Cancelar e Devolver</button>
            </div>
        </div>
    `;
}

window.confirmarExclusaoItem = async (itemId, produtoId, qtdDevolvida) => {
    // 1 - Devolve a quantidade para o estoque
    const { data: p } = await db.from('produtos').select('estoque_atual').eq('id', produtoId).single();
    if (p) {
        await db.from('produtos').update({ estoque_atual: p.estoque_atual + qtdDevolvida }).eq('id', produtoId);
    }
    // 2 - Exclui o item da comanda
    await db.from('itens_pedido').delete().eq('id', itemId);
    
    showAlert("Item cancelado com sucesso!", false);
    setMode('garcom'); // Garçom perde view da conta na transição, recarrega limpo
}

window.fecharMesa = () => {
    const cid = document.getElementById('f_comanda').value;
    if (!cid) return;
    
    const content = document.getElementById('main-content');
    content.innerHTML = `
        <div class="max-w-md mx-auto bg-blue-50 p-6 rounded-lg shadow border-2 border-blue-500 mt-10 text-center">
            <h2 class="text-xl font-bold text-blue-700 mb-4">Fechar Conta da Mesa</h2>
            <p class="text-gray-700 mb-6">Confirma que você já conferiu os itens, cobrou e <b>recebeu o valor do cliente</b>?</p>
            <div class="flex flex-col sm:flex-row gap-4">
                <button onclick="setMode('garcom')" class="flex-1 bg-gray-300 text-gray-800 font-bold py-3 rounded">Ainda não</button>
                <button onclick="confirmarFechamentoMesa(${cid})" class="flex-1 bg-blue-600 text-white font-bold py-3 rounded text-sm sm:text-base">Sim, Dinheiro na Mão!</button>
            </div>
        </div>
    `;
}

window.confirmarFechamentoMesa = async (cid) => {
    await db.from('comandas').update({ status: 'Fechada' }).eq('id', cid);
    showAlert("Mesa fechada e valor computado no caixa!");
    setMode('garcom');
}

// ==========================================
// VISÃO DA COZINHA
// ==========================================
async function renderCozinha(container) {
    const { data: pendentes, error } = await db.from('itens_pedido').select('id, quantidade, produtos(nome), comandas!inner(mesa_cliente, status, arquivado)').eq('status_producao', 'Recebido').eq('arquivado', false);
    if (error) showAlert("Cozinha: " + error.message, true);
    
    // Filtramos apenas itens de mesas abertas do dia
    const ativos = pendentes ? pendentes.filter(p => p.comandas && p.comandas.status === 'Aberta' && p.comandas.arquivado === false) : [];
    
    let cards = ativos.length ? '' : '<div class="col-span-full text-center text-gray-500">Tudo limpo! Nenhum pedido pendente.</div>';
    
    if (ativos) ativos.forEach(p => {
        cards += `
            <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded shadow flex justify-between items-center">
                <div>
                    <div class="text-xs text-gray-500 font-bold uppercase mb-1">Mesa/Cliente</div>
                    <div class="text-xl font-bold">${p.comandas.mesa_cliente}</div>
                    <div class="text-lg mt-2">${p.quantidade}x ${p.produtos.nome}</div>
                </div>
                <button onclick="marcarPronto(${p.id})" class="bg-yellow-500 text-white font-bold h-full px-6 py-2 rounded hover:bg-yellow-600 shadow transition-colors">
                    PRONTO
                </button>
            </div>
        `;
    });

    container.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h1 class="text-3xl font-bold">Monitor Cozinha 🔥</h1>
            <button onclick="setMode('cozinha')" class="bg-gray-200 text-gray-800 px-4 py-2 rounded hover:bg-gray-300">↻ Atualizar</button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            ${cards}
        </div>
    `;
}

window.marcarPronto = async (itemId) => {
    await db.from('itens_pedido').update({ status_producao: 'Pronto' }).eq('id', itemId);
    showAlert("Marcado como Pronto!");
    setMode('cozinha');
}

// ==========================================
// VISÃO DO DONO
// ==========================================
async function renderDono(container) {
    // Buscas para estatísticas do dia atual (arquivado = false) e configs
    const [ {data: produtos}, {data: pagos}, {data: desp}, {data: cfg} ] = await Promise.all([
        db.from('produtos').select('*').order('nome'),
        db.from('itens_pedido').select('quantidade, produtos(preco), comandas!inner(status, arquivado)').eq('comandas.status', 'Fechada').eq('arquivado', false),
        db.from('despesas').select('valor').eq('arquivado', false),
        db.from('configuracoes').select('taxa_garcom_ativa').eq('id', 1).single()
    ]);
    
    // Alerta de Estoque
    let alertas = '';
    if (produtos) {
        produtos.forEach(p => {
            if (p.estoque_atual <= p.estoque_minimo) {
                alertas += `<div class="bg-red-100 border-l-4 border-red-500 text-red-700 p-2 mb-2 font-bold">⚠️ ${p.nome} está acabando! Faltam apenas ${p.estoque_atual}.</div>`;
            }
        });
    }
    if (!alertas) alertas = '<div class="text-green-600 font-bold">Todos os estoques sob controle.</div>';
    
    // DRE Financeiro
    let totalReceitas = 0;
    if (pagos) {
        pagos.forEach(p => { totalReceitas += p.quantidade * p.produtos.preco; });
    }
    
    let totalDespesas = 0;
    if (desp) {
        desp.forEach(d => { totalDespesas += d.valor; });
    }
    
    // Lógica da Gorjeta a Repassar se a Flag está On
    let usaTaxa = cfg && cfg.taxa_garcom_ativa;
    let gorjetas = usaTaxa ? (totalReceitas * 0.10) : 0;
    
    let lucro = totalReceitas - totalDespesas;
    let corLucro = lucro >= 0 ? 'text-green-600' : 'text-red-600';

    container.innerHTML = `
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <h1 class="text-3xl font-bold">Painel Administrativo 📈</h1>
            <div class="flex flex-wrap gap-2 w-full md:w-auto">
                <button onclick="exportarExcel()" class="flex-1 md:flex-none bg-green-100 text-green-800 font-bold py-2 px-3 rounded hover:bg-green-200 shadow transition-colors" title="Baixar relatório completo">
                    📉 Exportar
                </button>
                <label class="flex-1 md:flex-none cursor-pointer bg-green-600 text-white font-bold py-2 px-3 rounded hover:bg-green-700 shadow transition-colors text-center" title="Lê arquivo exportado para repor históricos/estoque">
                    📈 Importar
                    <input type="file" id="import_excel" accept=".xlsx" onchange="importarExcel(event)" class="hidden">
                </label>
                <button onclick="setMode('dono')" class="flex-1 md:flex-none bg-blue-100 text-blue-800 font-bold py-2 px-3 rounded hover:bg-blue-200 shadow transition-colors">
                    ↻ Atualizar
                </button>
                <button onclick="zerarDia()" class="flex-1 md:flex-none bg-red-600 text-white font-bold py-2 px-3 rounded hover:bg-red-700 shadow flex items-center justify-center gap-2 transition-colors">
                    🗑️ Encerrar do Dia
                </button>
            </div>
        </div>
        
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
            <!-- FINANCEIRO -->
            <div class="lg:col-span-2 bg-white rounded-lg shadow p-6">
                <h2 class="text-xl font-bold mb-4">Fluxo de Caixa (Balancete)</h2>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    <div class="bg-gray-50 border rounded p-4">
                        <div class="text-xs text-gray-500 uppercase font-bold">Vendido Diário</div>
                        <div class="text-xl sm:text-2xl font-bold text-gray-800">R$ ${totalReceitas.toFixed(2)}</div>
                    </div>
                    <div class="bg-gray-50 border rounded p-4">
                        <div class="text-xs text-gray-500 uppercase font-bold">Insumos Pagos</div>
                        <div class="text-xl sm:text-2xl font-bold text-gray-800">R$ ${totalDespesas.toFixed(2)}</div>
                    </div>
                    <div class="bg-gray-50 border rounded p-4">
                        <div class="text-xs text-gray-500 uppercase font-bold">Líquido Final</div>
                        <div class="text-xl sm:text-2xl font-bold ${corLucro}">R$ ${lucro.toFixed(2)}</div>
                    </div>
                    <div class="bg-sky-50 border border-sky-200 rounded p-4">
                        <div class="text-xs text-sky-700 uppercase font-bold">Gorjetas (A Repassar)</div>
                        <div class="text-xl sm:text-2xl font-bold text-sky-800">R$ ${gorjetas.toFixed(2)}</div>
                    </div>
                </div>
                
                <h3 class="text-lg font-bold mt-6 mb-2">Lançar Compra / Despesa</h3>
                <div class="flex flex-col sm:flex-row gap-4">
                    <input type="text" id="d_desc" autocomplete="off" placeholder="Ex: Carvão" class="flex-1 p-3 sm:p-2 border rounded text-lg sm:text-base">
                    <input type="number" id="d_val" autocomplete="off" placeholder="R$ 0.00" class="w-full sm:w-32 p-3 sm:p-2 border rounded text-lg sm:text-base">
                    <button onclick="lancarDespesa()" class="bg-gray-800 text-white font-bold py-3 sm:py-2 px-6 rounded hover:bg-black w-full sm:w-auto mt-2 sm:mt-0">Registrar Saída</button>
                </div>
            </div>
            
            <!-- ALERTAS & CONFIGURAÇÕES -->
            <div class="bg-white rounded-lg shadow p-6 flex flex-col justify-between">
                <div>
                    <h2 class="text-xl font-bold mb-4">Radar da Despensa</h2>
                    ${alertas}
                </div>
                
                <div class="border-t pt-4 mt-8">
                    <h2 class="text-lg font-bold mb-2 text-gray-700">Configurações da Casa</h2>
                    <button onclick="toggleTaxaGarcom(${usaTaxa})" class="w-full font-bold py-3 px-4 rounded shadow transition-colors text-center text-sm md:text-base ${usaTaxa ? 'bg-sky-600 hover:bg-sky-700 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700 border border-gray-300'}">
                        Serviço (10%): ${usaTaxa ? 'Ativado ✅' : 'Desativado ❌'}
                    </button>
                    <p class="text-xs text-center text-gray-400 mt-2">Os 10% do Garçom cobrados nas comandas abertas hoje serão somados dinamicamente.</p>
                </div>
            </div>
        </div>
        
        <div class="bg-white rounded-lg shadow p-6 border-t-4 border-b10">
            <h2 class="text-xl font-bold mb-4">Gestão do Cardápio</h2>
            <div class="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
                <input type="text" id="p_nome" autocomplete="off" placeholder="Nome" class="md:col-span-2 p-3 sm:p-2 border rounded text-lg sm:text-base">
                <input type="number" id="p_preco" autocomplete="off" placeholder="Preço (R$)" step="0.01" class="p-3 sm:p-2 border rounded text-lg sm:text-base">
                <input type="number" id="p_estoque" autocomplete="off" placeholder="Qtd. Hoje" class="p-3 sm:p-2 border rounded text-lg sm:text-base">
                <button onclick="cadastrarProduto()" class="bg-red-600 text-white font-bold p-3 sm:p-2 rounded hover:bg-red-700">Salvar Item</button>
            </div>
            
            <div class="overflow-x-auto">
            <table class="w-full text-left text-sm mt-4 border-t pt-4 min-w-[500px]">
                <tr class="text-gray-500 uppercase border-b"><th class="pb-2">ID</th><th>Produto</th><th>Valor</th><th>Estoque</th><th class="text-center">Ajuste</th></tr>
                ${produtos ? produtos.map(p => `
                <tr class="border-b hover:bg-gray-50">
                    <td class="py-2">#${p.id}</td>
                    <td>${p.nome}</td>
                    <td>R$ ${p.preco.toFixed(2)}</td>
                    <td class="font-bold">${p.estoque_atual}</td>
                    <td class="text-center"><button onclick="corrigirEstoque(${p.id}, '${p.nome}', ${p.estoque_atual})" class="bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs px-2 py-1 rounded" title="Editar Contagem Manualmente">✏️ Mudar</button></td>
                </tr>`).join('') : '<tr><td colspan="5" class="text-center py-4">Tabelas não criadas no Supabase SQL.</td></tr>'}
            </table>
            </div>
        </div>
    `;
}

window.lancarDespesa = async () => {
    const desc = document.getElementById('d_desc').value;
    const val = parseFloat(document.getElementById('d_val').value);
    if (!desc || isNaN(val) || val <= 0) return showAlert("Preencha corretamente", true);
    
    await db.from('despesas').insert({ descricao: desc, valor: val, arquivado: false });
    showAlert("Despesa registrada e computada no DRE.");
    setMode('dono');
}

window.cadastrarProduto = async () => {
    const nome = document.getElementById('p_nome').value;
    const preco = parseFloat(document.getElementById('p_preco').value);
    const est = parseInt(document.getElementById('p_estoque').value);
    
    if (!nome || isNaN(preco)) return showAlert("Campo Obrigatório: Nome e Preço", true);
    
    const { error } = await db.from('produtos').insert({ nome: nome, preco: preco, estoque_atual: isNaN(est)? 0 : est });
    if (error) {
        showAlert("Erro no Supabase: " + error.message, true);
    } else {
        showAlert("Item adicionado ao cardápio!");
        setMode('dono');
    }
}

window.corrigirEstoque = (id, nome, estoqueAtual) => {
    const content = document.getElementById('main-content');
    content.innerHTML = `
        <div class="max-w-md mx-auto bg-gray-50 p-8 rounded-lg shadow-lg border-t-4 border-gray-600 mt-10">
            <h2 class="text-xl font-bold mb-4 text-center">Ajuste Manual: ${nome}</h2>
            <div class="mb-6 text-gray-700 text-center bg-white p-3 rounded border">Quantidade sistema: <b class="text-lg">${estoqueAtual}</b></div>
            <label class="block text-gray-700 text-sm font-bold mb-2 text-center">Nova quantidade contada fisicamente:</label>
            <input type="number" id="novo_estoque_val" autocomplete="off" placeholder="Ex: ${estoqueAtual}" class="w-full p-4 border border-gray-300 rounded mb-6 text-center text-xl focus:outline-none focus:ring-2 focus:ring-gray-600">
            <div class="flex gap-4">
                <button onclick="setMode('dono')" class="flex-1 bg-gray-300 text-gray-800 font-bold py-3 rounded hover:bg-gray-400">Cancelar</button>
                <button onclick="salvarCorrecaoEstoque(${id})" class="flex-1 bg-gray-800 text-white font-bold py-3 rounded hover:bg-black">Salvar Correção</button>
            </div>
        </div>
    `;
}

window.salvarCorrecaoEstoque = async (id) => {
    const val = document.getElementById('novo_estoque_val').value;
    if (val === "") { setMode('dono'); return; }
    
    const novoEstoque = parseInt(val);
    if (isNaN(novoEstoque)) return showAlert("Número inválido!", true);
    
    const { error } = await db.from('produtos').update({ estoque_atual: novoEstoque }).eq('id', id);
    if (!error) {
        showAlert("Estoque corrigido com sucesso!");
        setMode('dono');
    } else {
        showAlert("Erro ao corrigir: " + error.message, true);
    }
}

window.zerarDia = () => {
    const content = document.getElementById('main-content');
    content.innerHTML = `
        <div class="max-w-lg mx-auto bg-red-50 p-8 rounded-lg shadow-xl border-2 border-red-500 mt-10 text-center">
            <div class="text-6xl mb-4">🚨</div>
            <h2 class="text-2xl font-bold mb-4 text-red-700">ATENÇÃO EXTREMA!</h2>
            <p class="text-red-900 mb-6 font-medium">Isso arquivará <b>TODAS</b> as Comandas, Vendas e Despesas de hoje, zerando o caixa para amanhã, conservando os históricos.</p>
            <p class="text-gray-700 mb-2">Digite sua senha de adm para prosseguir:</p>
            <input type="password" id="zerar_senha_confirma" placeholder="Senha do Dono" class="w-full p-4 border border-red-200 rounded mb-6 text-center text-xl tracking-widest focus:outline-none focus:ring-2 focus:ring-red-500">
            <div class="flex gap-4">
                <button onclick="setMode('dono')" class="flex-1 bg-gray-300 text-gray-800 font-bold py-3 rounded hover:bg-gray-400">Mudei de ideia</button>
                <button onclick="confirmarZerarDia()" class="flex-1 bg-red-600 text-white font-bold py-3 rounded hover:bg-red-700">Zerar Caixa do Dia!</button>
            </div>
        </div>
    `;
}

window.confirmarZerarDia = async () => {
    const val = document.getElementById('zerar_senha_confirma').value;
    const { data: valida } = await db.rpc('verificar_senha', { senha_tentada: val });
    
    if (valida) {
        showAlert("Arquivando dados do dia atual...", false);
        // Desativa botao enquanto carrega
        document.querySelector('button[onclick="confirmarZerarDia()"]').innerHTML = "Arquivando...";
        
        await db.from('itens_pedido').update({ arquivado: true }).eq('arquivado', false);
        await db.from('comandas').update({ arquivado: true }).eq('arquivado', false);
        await db.from('despesas').update({ arquivado: true }).eq('arquivado', false);
        
        showAlert("✨ Caixa fechado para um novo dia ensolarado!", false);
        setMode('dono');
    } else {
        showAlert("Senha incorreta. Abortado.", true);
        setMode('dono');
    }
}

window.toggleTaxaGarcom = async (estadoAtual) => {
    // Usamos Upsert para trocar a toggle ID 1 no Supabase!
    const { error } = await db.from('configuracoes').upsert({ id: 1, taxa_garcom_ativa: !estadoAtual });
    if (error) {
        showAlert("Erro de Rede ao trocar taxa: " + error.message, true);
    } else {
        setMode('dono'); // Recarrega tela do dono para ver balancete redesenhar
    }
}

// ==========================================
// MÓDULO EXCEL (Importação e Exportação)
// ==========================================
window.exportarExcel = async () => {
    showAlert("Buscando dados para o Excel... Aguarde.", false);
    
    try {
        const [ {data: prods}, {data: coms}, {data: itens}, {data: desps} ] = await Promise.all([
            db.from('produtos').select('*').order('id'),
            db.from('comandas').select('*').order('id'),
            db.from('itens_pedido').select('*').order('id'),
            db.from('despesas').select('*').order('id')
        ]);

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(prods || []), "produtos");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(coms || []), "comandas");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itens || []), "itens_pedido");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(desps || []), "despesas");

        XLSX.writeFile(wb, "historico_b10.xlsx");
        showAlert("Download do Excel concluído!");
    } catch (e) {
        showAlert("Erro executando exportação: " + e.message, true);
    }
}

window.importarExcel = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    showAlert("Lendo arquivo Excel...", false);
    const reader = new FileReader();

    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const wb = XLSX.read(data, { type: 'array' });

            const tabs = ["produtos", "comandas", "itens_pedido", "despesas"];
            for(let tab of tabs) {
                if(!wb.Sheets[tab]) return showAlert(`Aba '${tab}' não encontrada na planilha.`, true);
            }
            
            showAlert("Injetando Excel no Banco (aguarde uns segundos)...", false);
            
            const jsonProds = XLSX.utils.sheet_to_json(wb.Sheets["produtos"]);
            const jsonComs = XLSX.utils.sheet_to_json(wb.Sheets["comandas"]);
            const jsonItens = XLSX.utils.sheet_to_json(wb.Sheets["itens_pedido"]);
            const jsonDesps = XLSX.utils.sheet_to_json(wb.Sheets["despesas"]);

            if(jsonProds.length > 0) await db.from('produtos').upsert(jsonProds);
            if(jsonComs.length > 0) await db.from('comandas').upsert(jsonComs);
            if(jsonItens.length > 0) await db.from('itens_pedido').upsert(jsonItens);
            if(jsonDesps.length > 0) await db.from('despesas').upsert(jsonDesps);
            
            showAlert("✅ Planilha importada e sincronizada com banco!");
            event.target.value = '';
            setMode('dono');
        } catch (error) {
            console.error("Erro importando", error);
            showAlert("Erro na subida. " + error.message, true);
        }
    };
    reader.readAsArrayBuffer(file);
}
