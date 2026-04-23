import './style.css';
import { createClient } from '@supabase/supabase-js';

// Configurações do Supabase via Variáveis de Ambiente (Vite)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

let db;
let currentUser = null;

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        console.error("FATAL: Variáveis de ambiente VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não estão definidas!");
        document.getElementById('main-content').innerHTML = `
            <div class="max-w-xl mx-auto mt-20 bg-red-50 border-2 border-red-200 p-8 rounded-3xl text-red-800 text-center shadow-2xl">
                <div class="text-6xl mb-4">⚙️</div>
                <h1 class="text-2xl font-black mb-4 uppercase">Erro de Configuração SaaS</h1>
                <p class="font-medium mb-6">As chaves de conexão com o Supabase não foram encontradas no ambiente.</p>
                <div class="bg-white p-4 rounded-xl text-left border border-red-100 mb-6 font-mono text-sm">
                    Verifique se o arquivo <span class="bg-gray-100 px-1 rounded">.env</span> local existe ou se as variáveis estão configuradas no painel da Vercel.
                </div>
                <p class="text-xs text-red-400">Verifique o Console (F12) para detalhes técnicos.</p>
            </div>`;
        return;
    }

    try {
        db = createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log("Supabase Client Inicializado com Sucesso.");
        checkUserSession();
    } catch (e) {
        console.error("Erro ao inicializar Supabase:", e);
    }
});

// ==========================================
// SISTEMA DE AUTENTICAÇÃO (LOGIN/SIGNUP)
// ==========================================

async function checkUserSession() {
    const { data: { session } } = await db.auth.getSession();
    
    if (session) {
        currentUser = session.user;
        showApp();
    } else {
        showAuth();
    }

    // Listener para mudanças de estado (Login/Logout)
    db.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN') {
            currentUser = session.user;
            showApp();
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            showAuth();
        }
    });
}

window.toggleAuthMode = (isSignup) => {
    document.getElementById('login-form').classList.toggle('hidden', isSignup);
    document.getElementById('signup-form').classList.toggle('hidden', !isSignup);
}

window.handleLogin = async () => {
    const email = document.getElementById('auth_email').value;
    const password = document.getElementById('auth_password').value;
    const btn = document.getElementById('btn-login');

    if (!email || !password) return showAlert("Preencha todos os campos", true);

    btn.disabled = true;
    btn.innerHTML = "CARREGANDO...";

    console.log("Tentando Login para:", email);
    const { data, error } = await db.auth.signInWithPassword({ email, password });

    if (error) {
        console.error("Erro no SignIn:", error);
        showAlert("Erro de Acesso: " + (error.message === 'Invalid login credentials' ? 'E-mail ou Senha incorretos' : error.message), true);
        btn.disabled = false;
        btn.innerHTML = "ACESSAR PAINEL";
    } else {
        console.log("Login realizado com sucesso!", data);
    }
}

window.handleSignup = async () => {
    const nome = document.getElementById('reg_nome').value;
    const email = document.getElementById('reg_email').value;
    const password = document.getElementById('reg_password').value;
    const btn = document.getElementById('btn-signup');

    if (!nome || !email || !password) return showAlert("Preencha todos os campos", true);
    if (password.length < 6) return showAlert("Senha deve ter ao menos 6 caracteres", true);

    btn.disabled = true;
    btn.innerHTML = "CRIANDO CONTA...";

    console.log("Tentando Cadastro para:", email);
    const { data, error } = await db.auth.signUp({ email, password });

    if (error) {
        console.error("Erro no SignUp:", error);
        showAlert("Erro no Cadastro: " + error.message, true);
        btn.disabled = false;
        btn.innerHTML = "CADASTRAR E ENTRAR";
    } else {
        console.log("Usuário cadastrado com sucesso!", data);
        if (data.user && data.session) {
            showAlert("Conta criada com sucesso!");
            await db.from('configuracoes').insert({ 
                user_id: data.user.id,
                nome_estabelecimento: nome 
            });
        } else if (data.user) {
            showAlert("Conta pré-criada! Verifique seu e-mail para confirmar o acesso.", false);
        } else {
            showAlert("Erro inesperado no cadastro.", true);
        }
        btn.disabled = false;
        btn.innerHTML = "CADASTRAR E ENTRAR";
    }
}

window.handleLogout = async () => {
    await db.auth.signOut();
}

function showAuth() {
    document.getElementById('auth-container').classList.remove('hidden');
    document.getElementById('app-wrapper').classList.add('hidden');
}

let userConfig = null;

async function showApp() {
    // Busca configurações completas (SaaS)
    const { data: cfg, error } = await db.from('configuracoes').select('*').eq('user_id', currentUser.id).single();
    userConfig = cfg;

    if (error && error.code !== 'PGRST116') {
        console.error("Erro ao carregar SaaS Config:", error);
    }

    // Se não existir config (usuário novo), cria o trial de 7 dias
    if (!userConfig) {
        const { data: newCfg } = await db.from('configuracoes').insert({ 
            user_id: currentUser.id,
            nome_estabelecimento: 'Meu Novo Restaurante'
        }).select().single();
        userConfig = newCfg;
    }

    document.getElementById('auth-container').classList.add('hidden');
    document.getElementById('app-wrapper').classList.remove('hidden');
    document.getElementById('user-badge').innerText = currentUser.email;
    
    // Atualiza nome da marca personalizada
    document.getElementById('app-brand-name').innerText = userConfig.nome_estabelecimento || 'CHURRASCO B10';

    // Habilita Painel Master apenas para o Fredson
    if (currentUser.email === 'fredsonfsb45@gmail.com') {
        document.getElementById('nav-master').classList.remove('hidden');
    }

    // Checagem de Assinatura
    if (!checkSubscription()) return;

    setMode('garcom');
}

function checkSubscription() {
    const agora = new Date();
    const vencimento = new Date(userConfig.data_vencimento);
    const diffDias = Math.ceil((vencimento - agora) / (1000 * 60 * 60 * 24));

    // Bloqueio Total
    if (diffDias <= 0) {
        showLockedScreen();
        return false;
    }

    // Aviso de Vencimento Próximo (3 dias)
    if (diffDias <= 3) {
        showAlert(`Sua assinatura vence em ${diffDias} dias! Regularize para não perder o acesso.`, true);
    }

    return true;
}

function showLockedScreen() {
    const content = document.getElementById('main-content');
    content.innerHTML = `
        <div class="max-w-2xl mx-auto mt-10 bg-white p-10 rounded-3xl shadow-2xl border-t-8 border-red-600 text-center animate-fade-in">
            <div class="text-7xl mb-6">🔒</div>
            <h1 class="text-3xl font-black text-gray-800 mb-4 uppercase tracking-tighter">Acesso Suspenso</h1>
            <p class="text-gray-500 mb-8 font-medium">Sua assinatura ou período de teste expirou. Para continuar utilizando a plataforma e acessar seus dados, realize o pagamento da mensalidade.</p>
            
            <div class="bg-red-50 p-6 rounded-2xl mb-8 border border-red-100">
                <p class="text-red-700 font-bold">Vencimento: ${new Date(userConfig.data_vencimento).toLocaleDateString()}</p>
            </div>

            <div class="flex flex-col sm:flex-row gap-4 justify-center">
                <a href="https://mpago.la/12q1ThP" target="_blank" class="bg-red-600 text-white font-black py-4 px-10 rounded-xl hover:bg-red-700 shadow-xl transition-all uppercase tracking-widest text-sm">Pagar Mensalidade (Mercado Pago)</a>
                <button onclick="handleLogout()" class="text-gray-400 font-bold hover:text-gray-600">Sair da Conta</button>
            </div>
            
            <p class="mt-10 text-[10px] text-gray-300 font-bold uppercase tracking-widest">Suporte Técnico: AppSolutions Tecnologia</p>
        </div>
    `;
}

// ==========================================
// CORE APP LOGIC (ORIGINAL PRESERVED)
// ==========================================

function showAlert(message, isError=false) {
    const container = document.getElementById('alert-container');
    const alertId = 'alert_' + Math.random().toString(36).substr(2, 9);
    const colorClass = isError ? 'bg-red-500' : 'bg-green-500';
    
    const div = document.createElement('div');
    div.id = alertId;
    div.className = `${colorClass} text-white px-6 py-4 rounded-xl shadow-2xl mb-3 transition-all duration-500 opacity-0 transform translate-x-10 pointer-events-auto flex items-center gap-3`;
    div.innerHTML = `
        <span class="text-xl">${isError ? '❌' : '✅'}</span>
        <span class="font-bold">${message}</span>
    `;
    
    container.appendChild(div);
    
    // Trigger animation
    setTimeout(() => {
        div.classList.remove('opacity-0', 'translate-x-10');
    }, 10);
    
    setTimeout(() => {
        div.classList.add('opacity-0', 'translate-x-10');
        setTimeout(() => div.remove(), 500);
    }, 4000);
}

window.setMode = async (mode) => {
    // Bloqueio de segurança: Se não tiver assinatura e não for Admin, não entra.
    if (!checkSubscription() && currentUser.email !== 'fredsonfsb45@gmail.com') return;

    const content = document.getElementById('main-content');
    content.innerHTML = `
        <div class="flex flex-col items-center justify-center mt-20 space-y-4">
            <div class="animate-spin rounded-full h-12 w-12 border-b-4 border-red-600"></div>
            <p class="text-gray-500 font-medium animate-pulse">Sincronizando dados da nuvem...</p>
        </div>
    `;
    
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
        content.innerHTML = '<div class="text-center text-red-500 mt-10">Erro ao carregar dados. Verifique sua conexão.</div>';
    }
}

window.acessarDono = () => {
    const content = document.getElementById('main-content');
    content.innerHTML = `
        <div class="max-w-md mx-auto bg-white p-8 rounded-2xl shadow-xl border-t-8 border-gray-800 mt-10 animate-fade-in">
            <div class="flex justify-center mb-6">
                <div class="bg-gray-100 p-4 rounded-full text-4xl">🔒</div>
            </div>
            <h2 class="text-2xl font-black mb-2 text-center text-gray-800">Área do Proprietário</h2>
            <p class="text-gray-500 text-center mb-8">Confirme sua senha administrativa para visualizar o financeiro.</p>
            <input type="password" id="dono_senha" placeholder="Senha ADM..." class="w-full p-4 border-2 border-gray-100 rounded-xl mb-6 text-center text-3xl tracking-[1em] focus:outline-none focus:ring-4 focus:ring-gray-800/10 focus:border-gray-800 transition-all font-mono">
            <div class="flex gap-4">
                <button onclick="setMode('garcom')" class="flex-1 bg-gray-100 text-gray-600 font-bold py-4 rounded-xl hover:bg-gray-200 transition">Voltar</button>
                <button onclick="verificarSenhaDono()" class="flex-1 bg-gray-800 text-white font-bold py-4 rounded-xl hover:bg-black shadow-lg shadow-gray-800/20 active:scale-95 transition-all">ENTRAR</button>
            </div>
        </div>
    `;
    document.getElementById('dono_senha').focus();
}

window.verificarSenhaDono = async () => {
    const senha = document.getElementById('dono_senha').value;
    // Usando a nova RPC multi-tenant
    const { data: valida, error } = await db.rpc('verificar_senha_manager', { senha_tentada: senha });
    
    if (error) {
        console.error(error);
        return showAlert('ERRO BANCO: Verifique sua conexão.', true);
    }

    if (valida) {
        setMode('dono');
    } else {
        showAlert('Senha Administrativa Incorreta!', true);
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
                <div class="bg-white border-b-4 border-green-500 p-4 rounded-xl shadow-md flex justify-between items-center animate-bounce-in">
                    <div>
                        <div class="text-[10px] text-gray-400 font-black uppercase tracking-widest">Mesa</div>
                        <div class="text-xl font-black text-gray-800 leading-tight">${p.comandas.mesa_cliente}</div>
                        <div class="font-bold text-green-600 text-sm mt-1">${p.quantidade}x ${p.produtos.nome}</div>
                    </div>
                    <button onclick="marcarEntregue(${p.id})" class="bg-green-50 text-green-600 p-3 rounded-full hover:bg-green-600 hover:text-white transition-all shadow-sm" title="Marcar como levado para a mesa">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor font-bold">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                        </svg>
                    </button>
                </div>
            `;
        });
    } else {
        prontosCards = '<div class="text-gray-400 text-sm italic col-span-full border-2 border-dashed border-gray-200 rounded-xl p-4 text-center">Nenhum prato aguardando entrega...</div>';
    }
    
    let comandasOptions = "<option value=''>Selecione uma comanda...</option>";
    if (comandas) {
        comandas.forEach(c => { comandasOptions += `<option value='${c.id}'>Mesa ${c.mesa_cliente}</option>` });
    }
    
    let produtosOptions = "<option value=''>Selecione o produto...</option>";
    if (produtos) {
        produtos.forEach(p => { produtosOptions += `<option value='${p.id}'>${p.nome} - R$ ${p.preco} (Estoque: ${p.estoque_atual})</option>` });
    }

    container.innerHTML = `
        <h1 class="text-4xl font-black mb-8 text-gray-800 tracking-tight">Painel de Mesas 🍽️</h1>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
            <!-- ABRIR MESA -->
            <div class="bg-white p-8 rounded-2xl shadow-xl border-t-8 border-b10 transform hover:-translate-y-1 transition-all duration-300">
                <div class="flex items-center gap-3 mb-6">
                    <div class="bg-red-50 p-2 rounded-lg text-red-600 text-2xl">📋</div>
                    <h2 class="text-2xl font-black text-gray-800">Nova Mesa</h2>
                </div>
                <input type="text" id="g_mesa" autocomplete="off" placeholder="Nº Mesa ou Nome Cliente" class="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-xl mb-6 text-xl font-bold focus:ring-4 focus:ring-red-500/10 focus:border-red-500 outline-none transition-all placeholder:text-gray-300">
                <button onclick="abrirMesa()" class="w-full bg-red-600 text-white font-black py-4 rounded-xl hover:bg-red-700 shadow-lg shadow-red-600/20 active:scale-95 transition-all">ABRIR COMANDA</button>
            </div>
            
            <!-- LANÇAR PEDIDO -->
            <div class="bg-white p-8 rounded-2xl shadow-xl border-t-8 border-green-500 transform hover:-translate-y-1 transition-all duration-300">
                <div class="flex items-center gap-3 mb-6">
                    <div class="bg-green-50 p-2 rounded-lg text-green-600 text-2xl">🍟</div>
                    <h2 class="text-2xl font-black text-gray-800">Lançar Item</h2>
                </div>
                <select id="g_comanda" class="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-xl mb-4 text-lg font-bold focus:ring-4 focus:ring-green-500/10 focus:border-green-500 outline-none appearance-none">${comandasOptions}</select>
                <select id="g_produto" class="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-xl mb-4 text-lg font-bold focus:ring-4 focus:ring-green-500/10 focus:border-green-500 outline-none appearance-none">${produtosOptions}</select>
                <div class="flex items-center gap-4 mb-6">
                    <span class="font-bold text-gray-400">Qtd:</span>
                    <input type="number" id="g_qtd" value="1" min="1" class="flex-1 p-4 bg-gray-50 border-2 border-gray-100 rounded-xl text-xl font-black text-center focus:outline-none">
                </div>
                <button onclick="lancarPedido()" class="w-full bg-green-600 text-white font-black py-4 rounded-xl hover:bg-green-700 shadow-lg shadow-green-600/20 active:scale-95 transition-all">ENVIAR PARA COZINHA</button>
            </div>
        </div>
        
        <!-- PAINEL DE AVISOS DA COZINHA -->
        <div class="mt-12 bg-green-50/50 p-8 rounded-2xl shadow-inner border-2 border-green-200">
            <div class="flex justify-between items-center mb-6">
                <div class="flex items-center gap-3">
                    <h2 class="text-2xl font-black text-green-800">Campainha 🔔</h2>
                    <span class="bg-green-200 text-green-700 px-3 py-1 rounded-full text-xs font-black uppercase tracking-tighter">Itens Prontos</span>
                </div>
                <button onclick="setMode('garcom')" class="text-xs font-bold bg-white text-green-700 px-4 py-2 rounded-lg shadow-sm hover:shadow-md transition-all">↻ SINCRO</button>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="g_prontos">
                ${prontosCards}
            </div>
        </div>
        
        <!-- FECHAMENTO -->
        <div class="mt-12 bg-white p-8 rounded-2xl shadow-xl border-t-8 border-blue-500">
            <h2 class="text-2xl font-black mb-6 text-gray-800 flex items-center gap-3">
                <span class="bg-blue-50 p-2 rounded-lg">💰</span> Checkout / Fechamento
            </h2>
            <div class="flex flex-col md:flex-row gap-4 mb-6">
                <select id="f_comanda" onchange="verConta()" class="flex-1 p-4 bg-gray-50 border-2 border-gray-100 rounded-xl text-lg font-bold outline-none appearance-none">${comandasOptions}</select>
                <button onclick="fecharMesa()" class="bg-blue-600 text-white font-black py-4 px-10 rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-600/20 active:scale-95 transition-all">BAIXAR CONTA</button>
            </div>
            <div id="conta_detalhes" class="bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl p-6 min-h-[150px]">
                <div class="flex flex-col items-center justify-center text-gray-400 h-full">
                    <span class="text-4xl mb-2">🧾</span>
                    <p class="font-medium">Selecione uma mesa para conferência</p>
                </div>
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
        showAlert("Mesa/Cliente já está com comanda aberta!", true);
        document.getElementById('g_mesa').disabled = false;
        return;
    }
    
    const { error } = await db.from('comandas').insert({ mesa_cliente: mesa, arquivado: false, user_id: currentUser.id });
    if (!error) {
        showAlert("Comanda Aberta!");
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
    if (isNaN(qtd) || qtd <= 0) return showAlert("Quantidade inválida", true);
    
    const { error } = await db.rpc('lancar_item_seguro', { p_comanda_id: cid, p_produto_id: pid, p_quantidade: qtd });
    
    if (!error) {
        showAlert("Pedido enviado à Cozinha!");
        setMode('garcom');
    } else {
        showAlert("Erro ao lançar: Verifique o estoque.", true);
    }
}

window.marcarEntregue = async (itemId) => {
    await db.from('itens_pedido').update({ status_producao: 'Entregue' }).eq('id', itemId);
    showAlert("Item Entregue!");
    setMode('garcom');
}

window.verConta = async () => {
    const cid = document.getElementById('f_comanda').value;
    if (!cid) return;
    
    const [ {data}, {data: cfg} ] = await Promise.all([
        db.from('itens_pedido').select('id, quantidade, status_producao, produto_id, produtos(nome, preco)').eq('comanda_id', cid).eq('arquivado', false),
        db.from('configuracoes').select('taxa_garcom_ativa').eq('user_id', currentUser.id).single()
    ]);
    
    if (!data || data.length === 0) {
        return document.getElementById('conta_detalhes').innerHTML = '<div class="text-center text-gray-400 py-10 font-bold">Mesa aberta, mas sem itens lançados.</div>';
    }
    
    let html = '<div class="overflow-x-auto"><table class="w-full text-left"><thead><tr class="text-[10px] text-gray-400 uppercase font-black tracking-widest"><th class="pb-4">Qtd</th><th class="pb-4">Produto</th><th class="pb-4">Unit.</th><th class="pb-4">Subtotal</th><th class="pb-4 text-center">Ações</th></tr></thead><tbody>';
    let total = 0;
    data.forEach(i => {
        let val = i.quantidade * i.produtos.preco;
        total += val;
        html += `<tr class="border-t border-gray-100">
            <td class="py-4 font-black text-gray-500">${i.quantidade}x</td>
            <td class="py-4 font-bold text-gray-800">${i.produtos.nome}</td>
            <td class="py-4 text-gray-400 text-sm italic">R$ ${i.produtos.preco.toFixed(2)}</td>
            <td class="py-4 font-black text-gray-800">R$ ${val.toFixed(2)}</td>
            <td class="py-4 text-center"><button onclick="deletarItemPedido(${i.id}, ${i.produto_id}, ${i.quantidade})" class="bg-red-50 text-red-500 p-2 rounded-lg hover:bg-red-500 hover:text-white transition-all shadow-sm">🗑️</button></td>
        </tr>`;
    });
    
    let usaTaxa = cfg && cfg.taxa_garcom_ativa;
    let taxa = usaTaxa ? (total * 0.10) : 0;
    let totalFinal = total + taxa;

    html += '</tbody></table></div>';
    
    if (usaTaxa) {
        html += `
        <div class="mt-6 space-y-2 border-t pt-4">
            <div class="flex justify-between text-gray-400 font-bold text-sm"><span>Subtotal s/ Taxa:</span> <span>R$ ${total.toFixed(2)}</span></div>
            <div class="flex justify-between text-blue-600 font-black text-sm uppercase"><span>Taxa de Serviço (10%):</span> <span>+ R$ ${taxa.toFixed(2)}</span></div>
        </div>`;
    }

    html += `<div class="mt-8 flex justify-between items-end border-t pt-6"><span class="text-gray-400 font-black uppercase text-xs">Total para Pagamento:</span><span class="text-4xl font-black text-red-600 leading-none tracking-tighter">R$ ${totalFinal.toFixed(2)}</span></div>`;
    
    document.getElementById('conta_detalhes').innerHTML = html;
}

window.deletarItemPedido = (itemId, produtoId, qtdDevolvida) => {
    const content = document.getElementById('main-content');
    content.innerHTML = `
        <div class="max-w-md mx-auto bg-white p-8 rounded-2xl shadow-2xl border-4 border-red-500 mt-10 text-center animate-shake">
            <div class="text-6xl mb-4">⚠️</div>
            <h2 class="text-2xl font-black text-red-600 mb-2">Estornar Item</h2>
            <p class="text-gray-500 mb-8 font-medium">Isso removerá <b>${qtdDevolvida} unidade(s)</b> e retornará ao estoque físico.</p>
            <div class="flex gap-4">
                <button onclick="setMode('garcom')" class="flex-1 bg-gray-100 text-gray-500 font-bold py-4 rounded-xl">CANCELAR</button>
                <button onclick="confirmarExclusaoItem(${itemId}, ${produtoId}, ${qtdDevolvida})" class="flex-1 bg-red-600 text-white font-black py-4 rounded-xl shadow-lg shadow-red-600/20 active:scale-95 transition-all">CONFIRMAR</button>
            </div>
        </div>
    `;
}

window.confirmarExclusaoItem = async (itemId, produtoId, qtdDevolvida) => {
    const { data: p } = await db.from('produtos').select('estoque_atual').eq('id', produtoId).single();
    if (p) {
        await db.from('produtos').update({ estoque_atual: p.estoque_atual + qtdDevolvida }).eq('id', produtoId);
    }
    await db.from('itens_pedido').delete().eq('id', itemId);
    showAlert("Lançamento estornado!");
    setMode('garcom');
}

window.fecharMesa = () => {
    const cid = document.getElementById('f_comanda').value;
    if (!cid) return showAlert("Selecione a mesa primeiro", true);
    
    const content = document.getElementById('main-content');
    content.innerHTML = `
        <div class="max-w-md mx-auto bg-white p-8 rounded-2xl shadow-2xl border-4 border-blue-600 mt-10 text-center animate-fade-in">
            <div class="text-6xl mb-4">💳</div>
            <h2 class="text-2xl font-black text-blue-600 mb-2">Confirmar Pagamento</h2>
            <p class="text-gray-500 mb-8 font-medium">Você confirma que o valor total já foi **recebido** do cliente?</p>
            <div class="flex gap-4">
                <button onclick="setMode('garcom')" class="flex-1 bg-gray-100 text-gray-500 font-bold py-4 rounded-xl transition">NÃO</button>
                <button onclick="confirmarFechamentoMesa(${cid})" class="flex-1 bg-blue-600 text-white font-black py-4 rounded-xl shadow-lg shadow-blue-600/20 active:scale-95 transition-all">SIM, PAGO!</button>
            </div>
        </div>
    `;
}

window.confirmarFechamentoMesa = async (cid) => {
    await db.from('comandas').update({ status: 'Fechada' }).eq('id', cid);
    showAlert("Mesa Baixada e Liquidada!");
    setMode('garcom');
}

// ==========================================
// VISÃO DA COZINHA
// ==========================================
async function renderCozinha(container) {
    const { data: pendentes, error } = await db.from('itens_pedido').select('id, quantidade, produtos!inner(nome), comandas!inner(mesa_cliente, status, arquivado)').eq('status_producao', 'Recebido').eq('arquivado', false);
    
    const ativos = pendentes ? pendentes.filter(p => p.comandas && p.comandas.status === 'Aberta' && p.comandas.arquivado === false) : [];
    
    let cards = ativos.length ? '' : '<div class="col-span-full border-4 border-dashed border-gray-100 rounded-3xl p-20 flex flex-col items-center justify-center text-gray-300"><span class="text-8xl mb-4">✨</span><p class="text-xl font-black italic tracking-widest text-center">COZINHA LIMPA: SEM TICKETS AGUARDANDO</p></div>';
    
    if (ativos) ativos.forEach(p => {
        cards += `
            <div class="bg-yellow-50 border-t-8 border-yellow-400 p-6 rounded-2xl shadow-xl flex flex-col justify-between hover:bg-yellow-100 transition-colors duration-300 animate-fade-in">
                <div class="mb-6">
                    <div class="flex justify-between items-start">
                        <div class="bg-yellow-400 text-yellow-900 px-3 py-1 rounded-md text-xs font-black uppercase tracking-tighter shadow-sm">MESA/COMANDA</div>
                        <div class="text-gray-400 text-[10px] font-bold">#${p.id}</div>
                    </div>
                    <div class="text-4xl font-black text-yellow-900 mt-2">${p.comandas.mesa_cliente}</div>
                    <div class="mt-6 space-y-2">
                        <div class="flex items-center gap-2">
                            <span class="text-2xl font-black text-yellow-800">${p.quantidade}x</span>
                            <span class="text-2xl font-black text-gray-800 tracking-tight">${p.produtos.nome}</span>
                        </div>
                    </div>
                </div>
                <button onclick="marcarPronto(${p.id})" class="w-full bg-yellow-400 hover:bg-yellow-500 text-yellow-900 font-black py-5 rounded-xl shadow-lg border-b-4 border-yellow-600 active:transform active:scale-95 transition-all text-xl">
                    PRONTO 🔥
                </button>
            </div>
        `;
    });

    container.innerHTML = `
        <div class="flex justify-between items-center mb-10">
            <h1 class="text-4xl font-black text-gray-800 tracking-tighter">Tickets Cozinha 🍽️🔥</h1>
            <button onclick="setMode('cozinha')" class="bg-gray-800 text-white p-4 rounded-xl shadow-lg hover:scale-105 active:scale-95 transition-all font-black text-xs uppercase tracking-widest">↻ RECARR. BOLETAS</button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            ${cards}
        </div>
    `;
}

window.marcarPronto = async (itemId) => {
    await db.from('itens_pedido').update({ status_producao: 'Pronto' }).eq('id', itemId);
    showAlert("Item Notificado ao Garçom!");
    setMode('cozinha');
}

// ==========================================
// VISÃO DO DONO
// ==========================================
async function renderDono(container) {
    const [ {data: produtos}, {data: pagos}, {data: desp}, {data: cfg} ] = await Promise.all([
        db.from('produtos').select('*').order('nome'),
        db.from('itens_pedido').select('quantidade, produtos!inner(preco), comandas!inner(status, arquivado)').eq('comandas.status', 'Fechada').eq('arquivado', false),
        db.from('despesas').select('valor').eq('arquivado', false),
        db.from('configuracoes').select('taxa_garcom_ativa').eq('user_id', currentUser.id).single()
    ]);
    
    let alertas = '';
    if (produtos) {
        produtos.forEach(p => {
            if (p.estoque_atual <= p.estoque_minimo) {
                alertas += `<div class="bg-red-50 border-l-8 border-red-500 text-red-800 p-4 mb-3 rounded-xl font-bold flex items-center justify-between shadow-sm animate-pulse"><span>⚠️ ${p.nome}</span> <span class="bg-red-200 px-2 py-0.5 rounded text-xs font-black uppercase">${p.estoque_atual} UND</span></div>`;
            }
        });
    }
    if (!alertas) alertas = '<div class="bg-green-50 text-green-700 p-6 rounded-xl font-black text-center shadow-inner border-2 border-green-100">✅ ESTOQUES EM CONFORMIDADE</div>';
    
    let totalReceitas = 0;
    if (pagos) {
        pagos.forEach(p => { totalReceitas += p.quantidade * p.produtos.preco; });
    }
    
    let totalDespesas = 0;
    if (desp) {
        desp.forEach(d => { totalDespesas += d.valor; });
    }
    
    let usaTaxa = cfg && cfg.taxa_garcom_ativa;
    let gorjetas = usaTaxa ? (totalReceitas * 0.10) : 0;
    let lucro = totalReceitas - totalDespesas;
    let corLucro = lucro >= 0 ? 'text-green-600' : 'text-red-600';

    container.innerHTML = `
        <div class="flex flex-col lg:flex-row justify-between items-start lg:items-end mb-10 gap-6">
            <div>
                <h1 class="text-5xl font-black text-gray-800 tracking-tighter">Dashboard <span class="text-red-600 italic">Financial</span></h1>
                <p class="text-gray-400 font-medium">Gerenciamento Diário de Fluxo e Estoque</p>
            </div>
            <div class="flex flex-wrap gap-3 w-full lg:w-auto">
                <button onclick="exportarExcel()" class="flex-1 lg:flex-none bg-blue-50 text-blue-700 font-black py-4 px-6 rounded-xl hover:bg-blue-100 transition-all shadow-sm border border-blue-200 uppercase text-xs tracking-widest">📉 Relatório</button>
                <button onclick="setMode('dono')" class="flex-1 lg:flex-none bg-gray-100 text-gray-700 font-black py-4 px-6 rounded-xl transition-all uppercase text-xs tracking-widest">↻ SINCRO</button>
                <button onclick="zerarDia()" class="flex-1 lg:flex-none bg-red-600 text-white font-black py-4 px-6 rounded-xl shadow-lg border-b-4 border-red-800 active:transform active:scale-95 transition-all uppercase text-xs tracking-widest">🗑️ ENCERRAR HOJE</button>
            </div>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-4 gap-8 mb-12">
            <!-- FINANCEIRO CARDS -->
            <div class="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div class="bg-white rounded-2xl shadow-xl p-6 border-t-4 border-gray-100 transform hover:scale-[1.02] transition-all">
                    <div class="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Faturamento Bruto</div>
                    <div class="text-3xl font-black text-gray-800 leading-none">R$ ${totalReceitas.toFixed(2)}</div>
                </div>
                <div class="bg-white rounded-2xl shadow-xl p-6 border-t-4 border-gray-100 transform hover:scale-[1.02] transition-all">
                    <div class="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Custo Insumos</div>
                    <div class="text-3xl font-black text-red-400 leading-none">R$ ${totalDespesas.toFixed(2)}</div>
                </div>
                <div class="bg-white rounded-2xl shadow-xl p-6 border-t-4 border-gray-100 transform hover:scale-[1.02] transition-all">
                    <div class="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Lucro Líquido</div>
                    <div class="text-3xl font-black ${corLucro} leading-none">R$ ${lucro.toFixed(2)}</div>
                </div>
                <div class="bg-blue-50 rounded-2xl shadow-xl p-6 border-2 border-blue-100 transform hover:scale-[1.02] transition-all">
                    <div class="text-[10px] text-blue-400 font-black uppercase tracking-widest mb-1">Repasse Garçom</div>
                    <div class="text-3xl font-black text-blue-700 leading-none">R$ ${gorjetas.toFixed(2)}</div>
                </div>
            </div>
            
            <!-- RADAR -->
            <div class="bg-white rounded-3xl shadow-xl p-6 border-2 border-dashed border-gray-100 flex flex-col justify-between">
                <div>
                    <h2 class="text-sm font-black text-gray-400 uppercase tracking-widest mb-4">Ruptura de Estoque</h2>
                    ${alertas}
                </div>
                <div class="mt-4 pt-4 border-t border-gray-100">
                    <p class="text-[10px] font-black text-gray-300 uppercase mb-2">Assinatura</p>
                    <div class="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-100">
                        <span class="text-xs font-bold text-gray-500">${new Date(userConfig.data_vencimento).toLocaleDateString()}</span>
                        <span class="bg-blue-100 text-blue-600 px-2 py-0.5 rounded text-[10px] font-black uppercase">${userConfig.plano_status}</span>
                    </div>
                </div>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
            <!-- LANÇAR DESPESA -->
            <div class="bg-white rounded-3xl shadow-xl p-8 border-t-8 border-gray-800">
                <h2 class="text-2xl font-black mb-6 text-gray-800 flex items-center gap-3">
                    <span class="bg-gray-100 p-2 rounded-lg text-lg">💸</span> Nova Despesa
                </h2>
                <div class="flex flex-col sm:flex-row gap-4">
                    <input type="text" id="d_desc" placeholder="Ex: Gás, Carvão..." class="flex-1 p-4 bg-gray-50 border-2 border-gray-100 rounded-xl text-lg font-bold outline-none">
                    <input type="number" id="d_val" placeholder="R$ 0,00" class="sm:w-32 p-4 bg-gray-50 border-2 border-gray-100 rounded-xl text-lg font-black text-center outline-none">
                </div>
                <button onclick="lancarDespesa()" class="w-full mt-4 bg-gray-800 text-white font-black py-4 rounded-xl hover:bg-black transition-all shadow-xl active:scale-95 uppercase text-xs tracking-widest">REGISTRAR SAÍDA NO CAIXA</button>
            </div>

            <!-- PERSONALIZAÇÃO -->
            <div class="bg-white rounded-3xl shadow-xl p-8 flex flex-col justify-between border-t-8 border-indigo-500">
                <div>
                  <h2 class="text-2xl font-black mb-1 text-gray-800">Personalização</h2>
                  <p class="text-gray-400 text-sm font-medium mb-6">Mude o nome do seu estabelecimento na tela.</p>
                </div>
                <div class="flex gap-2">
                    <input type="text" id="p_nome_est" value="${userConfig.nome_estabelecimento || ''}" class="flex-1 p-4 bg-gray-50 border-2 border-gray-100 rounded-xl text-lg font-bold outline-none">
                    <button onclick="salvarNomeEstabelecimento()" class="bg-indigo-600 text-white font-black px-6 rounded-xl hover:bg-indigo-700 transition-all">SALVAR</button>
                </div>
                <div class="mt-4 p-4 bg-indigo-50 rounded-xl text-[10px] text-indigo-600 font-bold leading-tight uppercase italic opacity-75">
                    * O nome alterado aparecerá imediatamente no topo do sistema.
                </div>
            </div>
        </div>
        
        <!-- CARDÁPIO -->
        <div class="bg-white rounded-3xl shadow-xl p-8 border-t-8 border-b10">
            <h2 class="text-3xl font-black mb-8 text-gray-800 tracking-tighter">Management Board <span class="text-red-600">Cardápio</span></h2>
            <div class="grid grid-cols-1 md:grid-cols-5 gap-4 mb-10 pb-10 border-b-2 border-dashed border-gray-100">
                <input type="text" id="p_nome" placeholder="Produto / Insumo" class="md:col-span-2 p-4 bg-gray-50 border-2 border-gray-100 rounded-xl text-lg font-bold">
                <input type="number" id="p_preco" placeholder="Venda R$" step="0.01" class="p-4 bg-gray-50 border-2 border-gray-100 rounded-xl text-lg font-black text-center">
                <input type="number" id="p_estoque" placeholder="Aporte Inic." class="p-4 bg-gray-50 border-2 border-gray-100 rounded-xl text-lg font-black text-center">
                <button onclick="cadastrarProduto()" class="bg-red-600 text-white font-black p-4 rounded-xl shadow-lg border-b-4 border-red-800 hover:bg-red-700 uppercase text-xs tracking-widest active:scale-95 transition-all">SALVAR ITEM</button>
            </div>
            
            <div class="overflow-x-auto">
                <table class="w-full text-left">
                    <thead>
                        <tr class="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] border-b pb-4">
                            <th class="pb-4">REFE./ID</th>
                            <th class="pb-4">NOME DO ITEM</th>
                            <th class="pb-4">UNITÁRIO</th>
                            <th class="pb-4">ESTOQUE ATUAL</th>
                            <th class="pb-4 text-center">GESTÃO</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-50">
                        ${produtos ? produtos.map(p => `
                        <tr class="hover:bg-gray-50/50 transition-colors">
                            <td class="py-5 font-black text-gray-300 text-xs text-center">#${p.id}</td>
                            <td class="py-5 font-bold text-gray-800">${p.nome}</td>
                            <td class="py-5 font-black text-gray-800">R$ ${p.preco.toFixed(2)}</td>
                            <td class="py-5"><span class="bg-gray-100 px-3 py-1 rounded-full font-black text-gray-700 text-sm">${p.estoque_atual} UND</span></td>
                            <td class="py-5 text-center"><button onclick="corrigirEstoque(${p.id}, '${p.nome}', ${p.estoque_atual})" class="bg-gray-800 text-white text-[10px] font-black px-4 py-2 rounded-lg shadow-sm hover:scale-105 transition-all uppercase tracking-widest">Mudar Físico</button></td>
                        </tr>`).join('') : '<tr><td colspan="5" class="text-center py-10 font-bold text-gray-400 italic">Nenhum item no cardápio.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

window.lancarDespesa = async () => {
    const desc = document.getElementById('d_desc').value;
    const val = parseFloat(document.getElementById('d_val').value);
    if (!desc || isNaN(val) || val <= 0) return showAlert("Preencha corretamente", true);
    
    await db.from('despesas').insert({ descricao: desc, valor: val, user_id: currentUser.id });
    showAlert("Saída Registrada!");
    setMode('dono');
}

window.cadastrarProduto = async () => {
    const nome = document.getElementById('p_nome').value;
    const preco = parseFloat(document.getElementById('p_preco').value);
    const est = parseInt(document.getElementById('p_estoque').value);
    
    if (!nome || isNaN(preco)) return showAlert("Nome e Preço são obrigatórios", true);
    
    const { error } = await db.from('produtos').insert({ nome: nome, preco: preco, estoque_atual: isNaN(est)? 0 : est, user_id: currentUser.id });
    if (error) {
        showAlert("Erro: " + error.message, true);
    } else {
        showAlert("Novo Item Adicionado!");
        setMode('dono');
    }
}

window.corrigirEstoque = (id, nome, estoqueAtual) => {
    const content = document.getElementById('main-content');
    content.innerHTML = `
        <div class="max-w-md mx-auto bg-white p-10 rounded-2xl shadow-2xl border-4 border-gray-800 mt-10 animate-fade-in">
            <h2 class="text-2xl font-black mb-2 text-center text-gray-800 italic uppercase">Ajuste Físico</h2>
            <p class="text-gray-400 text-center font-bold mb-8">${nome}</p>
            <div class="mb-4 bg-gray-50 p-4 rounded-xl border-2 border-gray-100 flex justify-between items-center">
                <span class="text-xs font-black text-gray-400 uppercase">Quantidade Sistema:</span>
                <span class="text-2xl font-black text-gray-800">${estoqueAtual}</span>
            </div>
            <label class="block text-gray-400 text-[10px] font-black mb-2 text-center uppercase tracking-widest">Nova contagem real (balcão):</label>
            <input type="number" id="novo_estoque_val" placeholder="0" class="w-full p-6 bg-gray-50 border-2 border-gray-100 rounded-2xl mb-8 text-center text-4xl font-black focus:outline-none focus:ring-4 focus:ring-gray-800/10 focus:border-gray-800 transition-all">
            <div class="flex gap-4">
                <button onclick="setMode('dono')" class="flex-1 bg-gray-100 text-gray-400 font-black py-4 rounded-xl">CANCELAR</button>
                <button onclick="salvarCorrecaoEstoque(${id})" class="flex-1 bg-gray-800 text-white font-black py-4 rounded-xl shadow-xl active:scale-95 transition-all">SALVAR AJUSTE</button>
            </div>
        </div>
    `;
    document.getElementById('novo_estoque_val').focus();
}

window.salvarCorrecaoEstoque = async (id) => {
    const val = document.getElementById('novo_estoque_val').value;
    if (val === "") { setMode('dono'); return; }
    
    const novoEstoque = parseInt(val);
    if (isNaN(novoEstoque)) return showAlert("Número inválido!", true);
    
    const { error } = await db.from('produtos').update({ estoque_atual: novoEstoque }).eq('id', id);
    if (!error) {
        showAlert("Estoque Atualizado!");
        setMode('dono');
    } else {
        showAlert("Erro: " + error.message, true);
    }
}

window.zerarDia = () => {
    const content = document.getElementById('main-content');
    content.innerHTML = `
        <div class="max-w-xl mx-auto bg-white p-10 rounded-2xl shadow-2xl border-4 border-red-500 mt-10 text-center animate-shake">
            <div class="text-8xl mb-4">🚩</div>
            <h2 class="text-4xl font-black mb-2 text-red-600 tracking-tighter">FECHAMENTO RESTRITO</h2>
            <p class="text-gray-500 mb-10 font-bold">Isso irá **arquivar** todas as vendas e despesas de hoje, gerando um histórico e limpando o balancete para o próximo turno.</p>
            <label class="block text-xs font-black text-red-400 mb-2 uppercase tracking-widest">Senha ADM necessária:</label>
            <input type="password" id="zerar_senha_confirma" placeholder="••••" class="w-full p-6 bg-gray-50 border-2 border-red-100 rounded-2xl mb-10 text-center text-4xl font-mono tracking-[1em] focus:outline-none focus:ring-8 focus:ring-red-100 focus:border-red-500 transition-all">
            <div class="flex gap-4">
                <button onclick="setMode('dono')" class="flex-1 bg-gray-100 text-gray-400 font-black py-5 rounded-2xl">MUDEI DE IDEIA</button>
                <button onclick="confirmarZerarDia()" class="flex-1 bg-red-600 text-white font-black py-5 rounded-2xl shadow-2xl shadow-red-600/30 active:scale-95 transition-all uppercase tracking-widest">EXECUTAR FECHAMENTO</button>
            </div>
        </div>
    `;
    document.getElementById('zerar_senha_confirma').focus();
}

window.confirmarZerarDia = async () => {
    const val = document.getElementById('zerar_senha_confirma').value;
    const { data: valida } = await db.rpc('verificar_senha_manager', { senha_tentada: val });
    
    if (valida) {
        showAlert("Tratando dados financeiros...", false);
        document.querySelector('button[onclick="confirmarZerarDia()"]').innerHTML = "PROCESSANDO...";
        
        await Promise.all([
            db.from('itens_pedido').update({ arquivado: true }).eq('arquivado', false),
            db.from('comandas').update({ arquivado: true }).eq('arquivado', false),
            db.from('despesas').update({ arquivado: true }).eq('arquivado', false)
        ]);
        
        showAlert("✨ Turno Encerrado. Operação gerada no histórico.");
        setMode('dono');
    } else {
        showAlert("Senha incorreta bloqueou a ação.", true);
        setMode('dono');
    }
}

window.toggleTaxaGarcom = async (estadoAtual) => {
    const { error } = await db.from('configuracoes').upsert({ user_id: currentUser.id, taxa_garcom_ativa: !estadoAtual }, { onConflict: 'user_id' });
    if (error) {
        showAlert("Erro de Rede: " + error.message, true);
    } else {
        setMode('dono');
    }
}

window.salvarNomeEstabelecimento = async () => {
    const nome = document.getElementById('p_nome_est').value;
    if (!nome) return showAlert("Nome não pode ser vazio", true);
    
    const { error } = await db.from('configuracoes').update({ nome_estabelecimento: nome }).eq('user_id', currentUser.id);
    if (!error) {
        showAlert("Nome atualizado com sucesso!");
        showApp(); // Recarrega para atualizar Navbar
    } else {
        showAlert("Erro ao atualizar nome", true);
    }
}

// ==========================================
// PAINEL MASTER (APPSOLUTIONS)
// ==========================================
window.renderMaster = async () => {
    const content = document.getElementById('main-content');
    content.innerHTML = '<div class="text-center py-20 font-black animate-pulse">CARREGANDO DADOS DO ECOSSISTEMA...</div>';

    const { data: clientes, error } = await db.from('configuracoes').select('*').order('data_vencimento', { ascending: true });

    if (error) return showAlert("Erro ao carregar Central Master", true);

    const ativos = clientes.filter(c => new Date(c.data_vencimento) > new Date()).length;
    const vencidos = clientes.length - ativos;

    content.innerHTML = `
        <div class="mb-10">
            <h1 class="text-5xl font-black text-gray-900 tracking-tighter italic">CENTRAL MASTER <span class="text-red-600">APPSOLUTIONS</span></h1>
            <p class="text-gray-400 font-bold uppercase tracking-widest text-xs mt-2">Monitoramento Global em Tempo Real</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <div class="bg-gray-900 text-white p-8 rounded-3xl shadow-xl">
                <div class="text-xs font-black text-gray-500 uppercase mb-2">Total de Licenças</div>
                <div class="text-5xl font-black tracking-tighter">${clientes.length}</div>
            </div>
            <div class="bg-green-500 text-white p-8 rounded-3xl shadow-xl">
                <div class="text-xs font-black text-green-200 uppercase mb-2">Clientes em Dia</div>
                <div class="text-5xl font-black tracking-tighter">${ativos}</div>
            </div>
            <div class="bg-red-500 text-white p-8 rounded-3xl shadow-xl">
                <div class="text-xs font-black text-red-200 uppercase mb-2">Inadimplentes / Vencidos</div>
                <div class="text-5xl font-black tracking-tighter">${vencidos}</div>
            </div>
        </div>

        <div class="bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100">
            <table class="w-full text-left">
                <thead class="bg-gray-50">
                    <tr class="text-[10px] text-gray-400 font-black uppercase tracking-widest">
                        <th class="p-6">Estabelecimento</th>
                        <th class="p-6">Vencimento</th>
                        <th class="p-6">Status</th>
                        <th class="p-6 text-center">Ações</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                    ${clientes.map(c => `
                        <tr class="hover:bg-gray-50 transition-colors">
                            <td class="p-6">
                                <div class="font-black text-gray-800">${c.nome_estabelecimento}</div>
                                <div class="text-[10px] text-gray-400 font-mono">${c.user_id}</div>
                            </td>
                            <td class="p-6 font-bold text-gray-600">${new Date(c.data_vencimento).toLocaleDateString()}</td>
                            <td class="p-6">
                                <span class="px-3 py-1 rounded-full text-[10px] font-black uppercase ${new Date(c.data_vencimento) > new Date() ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}">
                                    ${new Date(c.data_vencimento) > new Date() ? 'ATIVO' : 'BLOQUEADO'}
                                </span>
                            </td>
                            <td class="p-6 text-center">
                                <button onclick="estenderAssinatura('${c.user_id}')" class="bg-gray-900 text-white text-[10px] font-black px-4 py-2 rounded-lg hover:bg-blue-600 transition-all uppercase tracking-widest">Estender +30 Dias</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

window.estenderAssinatura = async (uid) => {
    const { data: atual } = await db.from('configuracoes').select('data_vencimento').eq('user_id', uid).single();
    const novaData = new Date(atual.data_vencimento);
    novaData.setDate(novaData.getDate() + 30);

    const { error } = await db.from('configuracoes').update({ data_vencimento: novaData, plano_status: 'ativo' }).eq('user_id', uid);
    if (!error) {
        showAlert("Assinatura estendida manualmente!");
        renderMaster();
    }
}

// ==========================================
// MÓDULO EXCEL (Importação e Exportação)
// ==========================================
window.exportarExcel = async () => {
    showAlert("Gerando planilha analítica...", false);
    
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

        XLSX.writeFile(wb, `B10_Relatorio_${new Date().toLocaleDateString()}.xlsx`);
        showAlert("Excel gerado com sucesso!");
    } catch (e) {
        showAlert("Erro na exportação: " + e.message, true);
    }
}
