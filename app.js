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
    const est = document.getElementById('reg_estabelecimento').value;
    const nome = document.getElementById('reg_nome').value;
    const email = document.getElementById('reg_email').value;
    const password = document.getElementById('reg_password').value;
    const btn = document.getElementById('btn-signup');

    if (!est || !nome || !email || !password) return showAlert("Preencha todos os campos", true);
    if (password.length < 6) return showAlert("Senha deve ter ao menos 6 caracteres", true);

    btn.disabled = true;
    btn.innerHTML = "CRIANDO CONTA...";

    try {
        const { data, error } = await db.auth.signUp({ 
            email, 
            password,
            options: {
                data: {
                    estabelecimento: est,
                    nome_restaurante: est, 
                    display_name: est, // Chave universal
                    nome_completo: nome
                }
            }
        });

        if (error) {
            showAlert("Erro: " + error.message, true);
            btn.disabled = false;
            btn.innerHTML = "CRIAR CONTA E ACESSAR AGORA";
            return;
        }

        if (data || !error) {
            console.log("Cadastro detectado com sucesso");
            const msg = "✅ CONTA CRIADA COM SUCESSO! Agora faça seu login.";
            
            // Tenta o alerta bonito
            showAlert(msg);
            
            // Backup: Alerta do sistema (janela pop-up) para ter 100% de certeza
            alert(msg);
            
            setTimeout(() => {
                toggleAuthMode(false); // Volta para o login
                if (btn) {
                   btn.disabled = false;
                   btn.innerHTML = "CRIAR CONTA";
                }
            }, 500);
        } else {
            const msgChata = "Verifique seu e-mail para confirmar a conta!";
            showAlert(msgChata, false);
            alert(msgChata);
            btn.disabled = false;
            btn.innerHTML = "CRIAR CONTA";
        }
    } catch (err) {
        console.error("Erro Fatal no Signup:", err);
        showAlert("Erro de Conexão: Tente novamente.", true);
        btn.disabled = false;
        btn.innerHTML = "TENTAR NOVAMENTE";
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

    if (userConfig) {
        if (userConfig.plano_status === 'cancelado') {
            showAlert("🚫 ACESSO REVOGADO: Esta conta foi encerrada pelo administrador.", true);
            alert("🚫 ACESSO REVOGADO: Esta conta foi excluída definitivamente.");
            return handleLogout();
        }
        aplicarTema(userConfig);
    }

    // Se não existir config (usuário foi excluído pelo Master), permite que ele comece do zero
    if (!userConfig) {
        alert("Sua conta anterior foi removida.\n\nVocê será redirecionado para criar uma NOVA CONTA do zero agora.");
        
        const meta = currentUser.user_metadata || {};
        const nomeRestaurante = meta.estabelecimento || meta.nome_restaurante || 'Meu Novo Restaurante';
        
        const { data: newCfg, error: errNew } = await db.from('configuracoes').insert({ 
            user_id: currentUser.id,
            nome_estabelecimento: nomeRestaurante,
            plano_status: 'trial',
            data_vencimento: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            valor_mensalidade: 29.90,
            setup_concluido: false // MUITO IMPORTANTE: Isso obriga a tela de branding aparecer
        }).select().single();

        if (errNew) return showAlert("Erro ao reiniciar conta", true);
        userConfig = newCfg;
        
        // Esconde o app e força a tela de Onboarding/Branding
        document.getElementById('app-wrapper').classList.add('hidden');
        document.getElementById('setup-onboarding').classList.remove('hidden'); // Certifique-se de que este ID existe
        showAlert("Recriando sua conta... Aguarde.");
        setTimeout(() => window.location.reload(), 1000);
        return;
    }

    document.getElementById('auth-container').classList.add('hidden');
    document.getElementById('app-wrapper').classList.remove('hidden');
    document.getElementById('user-badge').innerText = currentUser.email;
    
    // Atualiza nome da marca personalizada
    document.getElementById('app-brand-name').innerText = currentUser.email === 'fredsonfsb45@gmail.com' ? 'AppSolutions' : (userConfig.nome_estabelecimento || 'AppSolutions');

    // Ajustes de Interface por Perfil
    if (currentUser.email === 'fredsonfsb45@gmail.com') {
        document.getElementById('nav-master').classList.remove('hidden');
        document.getElementById('nav-garcom').classList.add('hidden');
        document.getElementById('nav-cozinha').classList.add('hidden');
        document.getElementById('nav-dono').classList.add('hidden');
        
        renderMaster(); // Admin abre direto no Master
        aplicarTemaMaster(); // Aplica cores neutras para o Master
        return;
    }

    // Checagem de Assinatura para clientes normais
    const isAllowed = checkSubscription();
    if (!isAllowed) return;

    // AVISO DE BOAS-VINDAS E REDIRECIONAMENTO (Primeiro Acesso)
    if (userConfig.plano_status === 'trial' && !userConfig.setup_concluido) {
         setTimeout(() => {
            alert("✨ BEM-VINDO À APPSOLUTIONS!\n\nSeu teste de 7 dias começou!\n\nPASSO OBRIGATÓRIO: Antes de começar os pedidos, você precisa confirmar o NOME DO SEU RESTAURANTE e personalizar suas cores.\n\nClique em OK para ser direcionado agora.");
            setMode('dono', 'branding'); 
         }, 800);
         return; // Interrompe a abertura do Garçom
    }

    setMode('garcom');
}

function checkSubscription() {
    const agora = new Date();
    const vencimento = new Date(userConfig.data_vencimento);
    const status = userConfig.plano_status; // 'ativo', 'trial', 'suspenso', 'vencido'

    // 1. Bloqueio por Status Manual (Central Master)
    if (status === 'suspenso' || status === 'bloqueado' || status === 'vencido') {
        showLockedScreen();
        return false;
    }

    // 2. Bloqueio por Data (Comparação precisa por milisegundos)
    if (vencimento <= agora) {
        showLockedScreen();
        return false;
    }

    // Cálculo de dias restantes para o aviso
    const diffDias = Math.ceil((vencimento - agora) / (1000 * 60 * 60 * 24));

    // Aviso de Vencimento Próximo (3 dias)
    if (diffDias <= 3) {
        showAlert(`Assinatura vence em ${diffDias} ${diffDias === 1 ? 'dia' : 'dias'}. Regularize seu acesso.`, true);
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

window.setMode = async (mode, targetAba = null) => {
    const isFredson = currentUser.email === 'fredsonfsb45@gmail.com';
    
    // Bloqueio de segurança: Se não tiver assinatura e não for você, não entra.
    if (!checkSubscription() && !isFredson) return;

    // RESTRICAO ADMIN (FREDSON): Você só vê Master e Config. 
    // Se tentar entrar em Garçom/Cozinha/Dono, o sistema te joga pro Master.
    if (isFredson && ['garcom', 'cozinha', 'dono'].includes(mode)) {
        return setMode('master');
    }

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
            await renderDono(content, targetAba || 'vendas');
        }
    } catch (error) {
        console.error(error);
        showAlert("Erro de conexão com o Banco", true);
        content.innerHTML = '<div class="text-center text-red-500 mt-10">Erro ao carregar dados. Verifique sua conexão.</div>';
    }
}

window.acessarDono = () => {
    const content = document.getElementById('main-content');
    
    // Se a senha ainda é a padrão b10, obriga a criar uma nova
    if (userConfig.manager_password === 'b10') {
        content.innerHTML = `
            <div class="max-w-md mx-auto bg-white p-8 rounded-2xl shadow-xl border-t-8 border-indigo-600 mt-10 animate-fade-in">
                <div class="flex justify-center mb-6">
                    <div class="bg-indigo-50 p-4 rounded-full text-4xl">🔐</div>
                </div>
                <h2 class="text-2xl font-black mb-2 text-center text-gray-800">Defina sua Senha ADM</h2>
                <p class="text-gray-500 text-center mb-8 text-sm">A senha padrão <b>b10</b> é temporária. Crie uma senha segura para proteger seu financeiro.</p>
                <input type="password" id="nova_senha_adm" placeholder="Nova Senha..." class="w-full p-4 border-2 border-gray-100 rounded-xl mb-6 text-center text-3xl tracking-[1em] focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-600 transition-all font-mono">
                <div class="flex gap-4">
                    <button onclick="setMode('garcom')" class="flex-1 bg-gray-100 text-gray-600 font-bold py-4 rounded-xl transition">Depois</button>
                    <button onclick="salvarNovaSenhaAdm()" class="flex-1 bg-indigo-600 text-white font-bold py-4 rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 active:scale-95 transition-all uppercase text-xs tracking-widest">CRIAR SENHA</button>
                </div>
            </div>
        `;
        document.getElementById('nova_senha_adm').focus();
        return;
    }

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
                <button onclick="verificarSenhaDono()" class="flex-1 bg-gray-800 text-white font-bold py-4 rounded-xl hover:bg-black shadow-lg shadow-gray-800/20 active:scale-95 transition-all font-black text-xs uppercase tracking-widest">ENTRAR</button>
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
        setMode('dono', 'vendas');
    } else {
        showAlert('Senha Administrativa Incorreta!', true);
    }
}

window.salvarNovaSenhaAdm = async () => {
    const nova = document.getElementById('nova_senha_adm').value;
    if (!nova || nova.length < 3) return showAlert("Crie uma senha de ao menos 3 caracteres", true);

    const { error } = await db.from('configuracoes').update({ manager_password: nova }).eq('user_id', currentUser.id);
    
    if (!error) {
        userConfig.manager_password = nova; // Atualiza local
        showAlert("Senha Administrativa Criada!");
        setMode('dono', 'vendas');
    } else {
        showAlert("Erro ao salvar senha: " + error.message, true);
    }
}

function renderPinGarcom(container) {
    container.innerHTML = `
        <div class="max-w-md mx-auto bg-white p-10 rounded-3xl shadow-2xl border-t-8 border-red-600 mt-10 animate-fade-in">
            <div class="flex justify-center mb-6">
                <div class="bg-red-50 p-6 rounded-full text-5xl">📱</div>
            </div>
            <h2 class="text-3xl font-black mb-2 text-center text-gray-800 italic uppercase italic tracking-tighter">Acesso de Turno</h2>
            <p class="text-gray-400 text-center mb-8 font-medium">Digite o código operacional de 4 dígitos fornecido pelo proprietário.</p>
            
            <input type="password" id="pin_input" maxlength="4" placeholder="••••" readonly
                   class="w-full p-6 bg-gray-50 border-2 border-gray-100 rounded-3xl mb-8 text-center text-5xl font-black tracking-[0.5em] focus:outline-none focus:ring-8 focus:ring-red-600/10 focus:border-red-600 transition-all font-mono">
            
            <div class="grid grid-cols-3 gap-4 mb-8">
                ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, 'OK'].map(n => `
                    <button onclick="tecladoPin('${n}')" class="h-20 flex items-center justify-center bg-gray-50 rounded-2xl text-2xl font-black text-gray-800 hover:bg-red-600 hover:text-white active:scale-95 transition-all shadow-sm">
                        ${n}
                    </button>
                `).join('')}
            </div>

            <button onclick="setMode('garcom')" class="w-full text-gray-400 font-bold py-4 rounded-xl hover:text-red-600 transition-all text-xs uppercase tracking-widest">Tentar Novamente</button>
        </div>
    `;
}

window.tecladoPin = (val) => {
    const input = document.getElementById('pin_input');
    if (val === 'C') {
        input.value = '';
    } else if (val === 'OK') {
        verificarPinGarcom();
    } else {
        if (input.value.length < 4) input.value += val;
        if (input.value.length === 4) {
             setTimeout(verificarPinGarcom, 300);
        }
    }
}

window.verificarPinGarcom = () => {
    const pin = document.getElementById('pin_input').value;
    if (pin === userConfig.pin_garcom) {
        sessionStorage.setItem('pin_autorizado', pin);
        showAlert("Acesso Liberado! Bom trabalho.");
        setMode('garcom');
    } else {
        showAlert("PIN incorreto! Tente novamente.", true);
        document.getElementById('pin_input').value = '';
    }
}

// ==========================================
// VISÃO DO GARÇOM
// ==========================================
async function renderGarcom(container) {
    // Trava de PIN do Garçom: Se não tiver o PIN correto na sessão, bloqueia
    if (sessionStorage.getItem('pin_autorizado') !== userConfig.pin_garcom) {
        return renderPinGarcom(container);
    }
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
                    <button onclick="marcarEntregue(${p.id})" class="bg-green-500 text-white p-3 rounded-xl hover:bg-green-600 transition-all shadow-md active:scale-90" title="Marcar como levado para a mesa">
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
            
            <!-- LANÇAR PEDIDO (NOVO MODELO GRID) -->
            <div class="bg-white p-8 rounded-2xl shadow-xl border-t-8 border-green-500 transform hover:-translate-y-1 transition-all duration-300">
                <div class="flex items-center gap-3 mb-6">
                    <div class="bg-green-50 p-2 rounded-lg text-green-600 text-2xl">🍟</div>
                    <h2 class="text-2xl font-black text-gray-800">Lançar Item</h2>
                </div>
                <select id="g_comanda" class="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-xl mb-4 text-lg font-bold focus:ring-4 focus:ring-green-500/10 focus:border-green-500 outline-none appearance-none font-black text-red-600">${comandasOptions}</select>
                
                <div id="categoria-grid" class="grid grid-cols-2 gap-3 mb-4">
                   <!-- Botões de Categorias serão injetados aqui -->
                </div>

                <div id="produtos-selecao" class="hidden animate-fade-in">
                    <div class="flex items-center justify-between mb-4 border-b pb-2">
                        <span id="selected-cat-name" class="font-black text-green-600 uppercase italic">CATEGORIA</span>
                        <button onclick="voltarCategorias()" class="text-xs bg-gray-100 px-3 py-1 rounded font-bold hover:bg-gray-200">← Voltar</button>
                    </div>
                    <div id="produtos-grid" class="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-2">
                        <!-- Produtos da categoria serão injetados aqui -->
                    </div>
                </div>

                <p id="hint-grid" class="text-center text-gray-400 text-[10px] font-black leading-tight mt-4 uppercase tracking-widest italic animate-pulse">1. Escolha a Mesa <br> 2. Clique na Categoria <br> 3. Ajuste os Itens abaixo</p>

                <div class="mt-8 pt-6 border-t border-dashed border-gray-200">
                    <h3 class="text-sm font-black text-gray-800 mb-2 uppercase italic tracking-tighter">Revisar Pedido do Lote</h3>
                    <div id="resumo-carrinho" class="bg-gray-50 rounded-2xl p-4 min-h-[60px] mb-4">
                        <p class="text-center text-gray-400 text-xs italic py-4">Nenhum item selecionado</p>
                    </div>
                    <button id="btn-enviar-lote" onclick="enviarCarrinho()" class="hidden w-full bg-green-600 text-white font-black py-5 rounded-2xl shadow-xl shadow-green-600/20 active:scale-95 transition-all uppercase tracking-widest">ENVIAR LOTE PARA COZINHA 📤</button>
                </div>
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
    `;

    // Injeta Categorias no Grid após o HTML ser renderizado
    const categorias = [...new Set(produtos.map(p => p.categoria || 'Geral'))];
    const gridCat = document.getElementById('categoria-grid');
    if (gridCat) {
        gridCat.innerHTML = categorias.map(cat => `
            <button onclick='mostrarProdutosPorCategoria("${cat}")' class="bg-gray-100 p-6 rounded-2xl border-2 border-gray-200 text-center hover:bg-green-50 hover:border-green-300 transition-all shadow-sm active:scale-95">
                <div class="text-3xl mb-1">${cat.toLowerCase().includes('bebida') ? '🥤' : cat.toLowerCase().includes('carne') ? '🥩' : '🍽️'}</div>
                <div class="text-[10px] font-black uppercase text-gray-500 truncate">${cat}</div>
            </button>
        `).join('');
    }

    // Salva produtos globalmente para facilitar o filtro sem nova requisição
    window.currentProdutos = produtos;
}

// CARRINHO GLOBAL
window.carrinho = [];

window.mostrarProdutosPorCategoria = (cat) => {
    const cid = document.getElementById('g_comanda').value;
    if (!cid) return showAlert("Selecione a Comanda primeiro!", true);

    document.getElementById('categoria-grid').classList.add('hidden');
    document.getElementById('hint-grid').classList.add('hidden');
    const prodSect = document.getElementById('produtos-selecao');
    prodSect.classList.remove('hidden');
    document.getElementById('selected-cat-name').innerText = cat;

    const filtrados = window.currentProdutos.filter(p => (p.categoria || 'Geral') === cat);
    const gridProd = document.getElementById('produtos-grid');
    gridProd.innerHTML = filtrados.map(p => {
        const noCarrinho = window.carrinho.find(item => item.id === p.id);
        const qtd = noCarrinho ? noCarrinho.quantidade : 0;

        return `
            <div id="prod-card-${p.id}" data-pid="${p.id}" class="flex flex-col bg-white border-2 ${qtd > 0 ? 'border-green-500' : 'border-gray-100'} p-3 rounded-xl shadow-sm transition-all text-left">
                <span class="font-black text-gray-800 text-sm leading-tight mb-1 truncate">${p.nome}</span>
                <span class="text-[10px] font-bold text-green-600 uppercase">R$ ${p.preco.toFixed(2)}</span>
                <span class="text-[9px] font-black ${p.estoque_atual <= p.estoque_minimo ? 'text-red-500' : 'text-gray-400'} uppercase">Estoque: ${p.estoque_atual}</span>
                
                <div class="mt-auto flex items-center justify-between bg-gray-50 rounded-lg p-1">
                    <button onclick="alterarQtdCarrinho(${p.id}, -1)" class="w-8 h-8 flex items-center justify-center bg-white border border-gray-200 rounded-lg text-gray-400 hover:text-red-500 font-bold">-</button>
                    <span class="contador-val font-black text-gray-800 text-sm">${qtd}</span>
                    <button onclick="alterarQtdCarrinho(${p.id}, 1)" class="w-8 h-8 flex items-center justify-center bg-white border border-gray-200 rounded-lg text-gray-400 hover:text-green-600 font-bold">+</button>
                </div>
            </div>
        `;
    }).join('');
}

window.alterarQtdCarrinho = (pid, delta) => {
    const p = window.currentProdutos.find(item => item.id === pid);
    const index = window.carrinho.findIndex(item => item.id === pid);

    if (index > -1) {
        window.carrinho[index].quantidade += delta;
        if (window.carrinho[index].quantidade <= 0) {
            window.carrinho.splice(index, 1);
        }
    } else if (delta > 0) {
        window.carrinho.push({ ...p, quantidade: 1, observacao: '' });
    }

    // ATUALIZAÇÃO LEVE: Apenas o contador visual do botão, sem re-renderizar o grid todo (evita pulo de tela)
    const cardContador = document.querySelector(`[data-pid="${pid}"] .contador-val`);
    if (cardContador) {
        const itemObj = window.carrinho.find(it => it.id === pid);
        cardContador.innerText = itemObj ? itemObj.quantidade : 0;
        
        // Atualiza a borda do card pai
        const cardParent = document.getElementById(`prod-card-${pid}`);
        if (cardParent) {
            if (itemObj) cardParent.classList.add('border-green-500');
            else cardParent.classList.remove('border-green-500');
        }
    }

    renderResumoCarrinho();
}

function renderResumoCarrinho() {
    const resumo = document.getElementById('resumo-carrinho');
    if (!resumo) return;

    if (window.carrinho.length === 0) {
        resumo.innerHTML = '<p class="text-center text-gray-400 text-xs italic py-4">Nenhum item selecionado</p>';
        document.getElementById('btn-enviar-lote').classList.add('hidden');
        return;
    }

    document.getElementById('btn-enviar-lote').classList.remove('hidden');
    resumo.innerHTML = window.carrinho.map((item, idx) => `
        <div class="bg-white border-2 border-gray-100 rounded-xl p-3 mb-2 shadow-sm animate-fade-in">
            <div class="flex justify-between items-center mb-2">
                <span class="text-xs font-black text-gray-800 uppercase tracking-tighter">${item.quantidade}x ${item.nome}</span>
                <button onclick="removerItemCarrinho(${idx})" class="text-red-400 hover:text-red-700 font-black">×</button>
            </div>
            <input type="text" 
                   onchange="atualizarObsCarrinho(${idx}, this.value)" 
                   placeholder="Obs: Mal passado, sem gelo..." 
                   value="${item.observacao || ''}"
                   class="w-full text-[10px] p-2 bg-gray-50 border border-gray-100 rounded-lg outline-none focus:border-red-300 font-medium italic">
        </div>
    `).join('');
}

window.atualizarObsCarrinho = (index, val) => {
    window.carrinho[index].observacao = val;
}

window.removerItemCarrinho = (index) => {
    window.carrinho.splice(index, 1);
    const prodSect = document.getElementById('produtos-selecao');
    if (!prodSect.classList.contains('hidden')) {
        const cat = document.getElementById('selected-cat-name').innerText;
        mostrarProdutosPorCategoria(cat);
    }
    renderResumoCarrinho();
}

window.enviarCarrinho = async () => {
    const cid = document.getElementById('g_comanda').value;
    if (!cid) return showAlert("Selecione a Comanda!", true);
    if (window.carrinho.length === 0) return;

    const btn = document.getElementById('btn-enviar-lote');
    btn.disabled = true;
    btn.innerText = "ENVIANDO...";

    try {
        // Envia item por item usando a RPC segura
        for (const item of window.carrinho) {
            const { error } = await db.rpc('lancar_item_seguro_v2', { 
                p_comanda_id: cid, 
                p_produto_id: item.id, 
                p_quantidade: item.quantidade,
                p_obs: item.observacao || ''
            });
            if (error) throw error;
        }

        showAlert("Pedido enviado com sucesso! 🚀");
        window.carrinho = [];
        setMode('garcom');
    } catch (e) {
        showAlert("Erro no estoque: " + e.message, true);
        btn.disabled = false;
        btn.innerText = "ENVIAR PEDIDO";
    }
}

window.voltarCategorias = () => {
    document.getElementById('categoria-grid').classList.remove('hidden');
    document.getElementById('hint-grid').classList.remove('hidden');
    document.getElementById('produtos-selecao').classList.add('hidden');
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
    const { data: pendentes, error } = await db.from('itens_pedido').select(`
        id, 
        quantidade, 
        observacao,
        produtos!inner(nome), 
        comandas!inner(id, mesa_cliente, status, arquivado)
    `).eq('status_producao', 'Recebido').eq('arquivado', false);
    
    const ativos = pendentes ? pendentes.filter(p => p.comandas && p.comandas.status === 'Aberta' && p.comandas.arquivado === false) : [];
    
    // Agrupa os itens por ID da Comanda (Mesa)
    const mesasAgrupadas = {};
    ativos.forEach(item => {
        const cid = item.comandas.id;
        if (!mesasAgrupadas[cid]) {
            mesasAgrupadas[cid] = {
                nome: item.comandas.mesa_cliente,
                itens: []
            };
        }
        mesasAgrupadas[cid].itens.push(item);
    });

    const idsMesas = Object.keys(mesasAgrupadas);
    let cards = idsMesas.length ? '' : '<div class="col-span-full border-4 border-dashed border-gray-100 rounded-3xl p-20 flex flex-col items-center justify-center text-gray-300"><span class="text-8xl mb-4">✨</span><p class="text-xl font-black italic tracking-widest text-center">COZINHA LIMPA: SEM TICKETS AGUARDANDO</p></div>';
    
    idsMesas.forEach(cid => {
        const mesa = mesasAgrupadas[cid];
        cards += `
            <div class="bg-white border-t-8 border-gray-800 p-6 rounded-3xl shadow-xl flex flex-col justify-between hover:scale-[1.02] transition-all duration-300 animate-fade-in">
                <div class="mb-4">
                    <div class="flex justify-between items-center mb-2">
                        <span class="bg-gray-100 text-gray-600 px-3 py-1 rounded-md text-[10px] font-black uppercase">Pedido Mesa</span>
                        <div class="h-8 w-8 bg-yellow-400 rounded-full animate-pulse"></div>
                    </div>
                    <h2 class="text-5xl font-black text-gray-900 tracking-tighter mb-4">${mesa.nome}</h2>
                    <ul class="space-y-3 border-t pt-4">
                        ${mesa.itens.map(item => `
                            <li class="flex flex-col gap-1">
                                <div class="flex items-center gap-3">
                                    <span class="text-2xl font-black text-red-600">${item.quantidade}x</span>
                                    <span class="text-lg font-bold text-gray-800 tracking-tight leading-none">${item.produtos.nome}</span>
                                </div>
                                ${item.observacao ? `<div class="text-red-500 text-[10px] font-black uppercase italic bg-red-50 px-2 py-0.5 rounded border border-red-100">Obs: ${item.observacao}</div>` : ''}
                            </li>
                        `).join('')}
                    </ul>
                </div>
                <button onclick="marcarMesaPronta('${cid}')" class="w-full mt-6 bg-green-600 hover:bg-green-700 text-white font-black py-4 rounded-2xl shadow-lg active:scale-95 transition-all text-sm uppercase tracking-widest">
                    CONCLUIR MESA 🔥
                </button>
            </div>
        `;
    });

    container.innerHTML = `
        <div class="flex justify-between items-center mb-10">
            <h1 class="text-4xl font-black text-gray-800 tracking-tighter">Chef de Cozinha 👨‍🍳</h1>
            <button onclick="setMode('cozinha')" class="bg-gray-800 text-white p-4 rounded-xl shadow-lg hover:scale-105 active:scale-95 transition-all font-black text-xs uppercase tracking-widest">↻ ATUALIZAR FILA</button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            ${cards}
        </div>
    `;
}

window.marcarMesaPronta = async (cid) => {
    // Marca todos os itens pendentes dessa comanda como Pronto
    const { error } = await db.from('itens_pedido')
        .update({ status_producao: 'Pronto' })
        .eq('comanda_id', cid)
        .eq('status_producao', 'Recebido');
    
    if (!error) {
        showAlert("Mesa concluída! Notificando Garçom. 🔔");
        setMode('cozinha');
    }
}

// ==========================================
// VISÃO DO DONO
// ==========================================
async function renderDono(container, initialAba = 'vendas') {
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

    // Detecta se é o primeiro acesso (Setup não concluído)
    const isPrimeiroAcesso = (userConfig.plano_status === 'trial' && !userConfig.setup_concluido);

    container.innerHTML = `
        <div class="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-12 animate-fade-in">
            <div>
                <h1 class="text-5xl font-black text-gray-800 tracking-tighter italic">Painel do <span class="text-red-700">Dono</span></h1>
                <p class="text-gray-400 font-medium italic">Gestão e Identidade Visual</p>
            </div>
            <div class="flex flex-wrap gap-2 w-full lg:w-auto ${isPrimeiroAcesso ? 'opacity-20 pointer-events-none' : ''}">
                <button onclick="changeDonoAba('vendas')" class="aba-btn ${initialAba === 'vendas' ? 'active bg-white border-2 border-gray-100' : 'bg-gray-100'} flex-1 lg:flex-none font-black py-4 px-6 rounded-xl hover:bg-gray-50 transition-all uppercase text-xs tracking-widest">📊 Financeiro</button>
                <button onclick="changeDonoAba('estoque')" class="aba-btn ${initialAba === 'estoque' ? 'active bg-white border-2 border-gray-100' : 'bg-gray-100'} flex-1 lg:flex-none font-black py-4 px-6 rounded-xl hover:bg-gray-50 transition-all uppercase text-xs tracking-widest">📦 Estoque</button>
                <button onclick="changeDonoAba('branding')" class="aba-btn ${initialAba === 'branding' ? 'active bg-white border-2 border-gray-100' : 'bg-indigo-600 text-white'} flex-1 lg:flex-none font-black py-4 px-6 rounded-xl shadow-lg transition-all uppercase text-xs tracking-widest">🎨 Personalizar</button>
                <button onclick="exportarExcel()" class="flex-1 lg:flex-none bg-blue-50 text-blue-700 font-black py-4 px-6 rounded-xl hover:bg-blue-100 transition-all shadow-sm border border-blue-200 uppercase text-xs tracking-widest">📉 Relatório</button>
                <button onclick="document.getElementById('import-excel').click()" class="flex-1 lg:flex-none bg-green-50 text-green-700 font-black py-4 px-6 rounded-xl hover:bg-green-100 transition-all shadow-sm border border-green-200 uppercase text-xs tracking-widest">📥 Importar</button>
                <input type="file" id="import-excel" class="hidden" accept=".xlsx, .xls" onchange="importarExcel(event)">
            </div>
            ${isPrimeiroAcesso ? '<div class="w-full bg-red-100 text-red-600 p-4 rounded-xl text-xs font-black text-center uppercase animate-pulse">⚠️ Complete a personalização abaixo para liberar o menu</div>' : ''}
        </div>

        <div id="dono-conteudo">
            <div id="aba-vendas" class="${initialAba === 'vendas' ? '' : 'hidden'} animate-fade-in text-gray-800">
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
                <div class="mt-4 pt-4 border-t border-gray-100 space-y-4">
                    <button onclick="toggleTaxaGarcom(${usaTaxa})" class="w-full font-black py-3 px-4 rounded-xl shadow-md transition-all text-center flex items-center justify-center gap-2 text-xs ${usaTaxa ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-500 border border-gray-200'}">
                        TAXA SERVIÇO (10%): ${usaTaxa ? 'ATIVADA ✅' : 'DESLIGADA ❌'}
                    </button>
                    <div>
                        <p class="text-[10px] font-black text-gray-300 uppercase mb-2">Assinatura</p>
                        <div class="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-100">
                            <span class="text-xs font-bold text-gray-500">${new Date(userConfig.data_vencimento).toLocaleDateString()}</span>
                            <span class="bg-blue-100 text-blue-600 px-2 py-0.5 rounded text-[10px] font-black uppercase">${userConfig.plano_status}</span>
                        </div>
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

            <!-- FECHAMENTO DE DIA -->
            <div class="bg-red-50 rounded-3xl shadow-xl p-8 border-2 border-red-100 flex flex-col justify-center text-center">
                <div class="text-3xl mb-2">🔒</div>
                <h2 class="text-xl font-black text-red-600 mb-2 uppercase">Encerrar Turno</h2>
                <p class="text-red-400 text-xs font-bold mb-6">Esta ação zera o faturamento e as comandas do dia. Use somente no fim do expediente.</p>
                <button onclick="zerarDia()" class="w-full bg-red-600 text-white font-black py-4 rounded-xl hover:bg-red-700 transition-all shadow-xl active:scale-95 uppercase text-xs tracking-widest">FECHAR CAIXA E ZERAR TUDO</button>
            </div>
        </div>
    </div>

        <!-- ABA BRANDING (PERSONALIZAÇÃO) -->
        <div id="aba-branding" class="${initialAba === 'branding' ? '' : 'hidden'} animate-fade-in text-gray-800">
            <div class="bg-white p-10 rounded-3xl shadow-xl border-t-8 border-indigo-500">
                <h3 class="text-3xl font-black text-gray-800 mb-8 tracking-tighter italic">Identidade Visual & <span class="text-indigo-600">Marca</span></h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div class="space-y-6">
                        <div>
                            <label class="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Nome do Estabelecimento</label>
                            <input type="text" id="b_nome" value="${userConfig.nome_estabelecimento || ''}" class="w-full p-5 bg-gray-50 border-2 border-gray-100 rounded-2xl font-black text-xl outline-none focus:border-indigo-500 transition-all shadow-inner">
                        </div>
                        <div>
                            <label class="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1 italic text-indigo-500">PIN de Acesso dos Garçons (4 dígitos)</label>
                            <input type="text" id="b_pin" maxlength="4" placeholder="Ex: 1234" value="${userConfig.pin_garcom || '0000'}" class="w-full p-5 bg-indigo-50 border-2 border-indigo-100 rounded-2xl font-black text-3xl tracking-[1em] text-center outline-none focus:border-indigo-500 transition-all shadow-inner">
                        </div>
                        <div>
                            <label class="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1 italic">Cor do Cabeçalho (Header)</label>
                            <div class="flex gap-4 items-center bg-gray-50 p-4 rounded-2xl border-2 border-gray-100">
                                <input type="color" id="b_cor_header" value="${userConfig.cor_header || '#dc2626'}" class="w-16 h-12 rounded-xl cursor-pointer border-none bg-transparent">
                                <span class="font-mono text-sm font-black text-gray-400 uppercase">${userConfig.cor_header || '#dc2626'}</span>
                            </div>
                        </div>
                    </div>
                    <div class="space-y-6">
                        <div>
                            <label class="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1 italic">Cor de Fundo Geral</label>
                            <div class="flex gap-4 items-center bg-gray-50 p-4 rounded-2xl border-2 border-gray-100">
                                <input type="color" id="b_cor_fundo" value="${userConfig.cor_fundo || '#f8fafc'}" class="w-16 h-12 rounded-xl cursor-pointer border-none bg-transparent">
                                <span class="font-mono text-sm font-black text-gray-400 uppercase">${userConfig.cor_fundo || '#f8fafc'}</span>
                            </div>
                        </div>
                        <div>
                            <label class="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1 italic">Cor das Letras e Títulos</label>
                            <div class="flex gap-4 items-center bg-gray-50 p-4 rounded-2xl border-2 border-gray-100">
                                <input type="color" id="b_cor_texto" value="${userConfig.cor_texto || '#1e293b'}" class="w-16 h-12 rounded-xl cursor-pointer border-none bg-transparent">
                                <span class="font-mono text-sm font-black text-gray-400 uppercase">${userConfig.cor_texto || '#1e293b'}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="mt-12 bg-indigo-50 p-6 rounded-3xl border-2 border-dashed border-indigo-100">
                    <button onclick="salvarBranding()" class="w-full bg-indigo-600 text-white font-black py-6 rounded-2xl shadow-xl hover:bg-indigo-700 hover:scale-[1.02] active:scale-95 transition-all text-xs uppercase tracking-widest">
                        🚀 SALVAR IDENTIDADE VISUAL E APLICAR AGORA
                    </button>
                </div>
            </div>
        </div>
        
        <!-- ABA ESTOQUE / CARDÁPIO -->
        <div id="aba-estoque" class="${initialAba === 'estoque' ? '' : 'hidden'} animate-fade-in space-y-8 text-gray-800">
            <div class="bg-white rounded-3xl shadow-xl p-8 border-t-8 border-red-600">
                <h2 class="text-3xl font-black mb-8 text-gray-800 tracking-tighter">Gestão de <span class="text-red-600">Estoque & Itens</span></h2>
            <div class="grid grid-cols-1 md:grid-cols-6 gap-4 mb-10 pb-10 border-b-2 border-dashed border-gray-100">
                <input type="text" id="p_nome" placeholder="Produto / Insumo" class="md:col-span-2 p-4 bg-gray-50 border-2 border-gray-100 rounded-xl text-lg font-bold">
                <input type="number" id="p_preco" placeholder="Venda R$" step="0.01" class="p-4 bg-gray-50 border-2 border-gray-100 rounded-xl text-lg font-black text-center">
                <input type="text" id="p_categoria" placeholder="Categoria (Ex: Bebidas)" class="p-4 bg-gray-50 border-2 border-gray-100 rounded-xl text-lg font-bold">
                <input type="number" id="p_estoque" placeholder="Quant. Estoque" class="p-4 bg-gray-50 border-2 border-gray-100 rounded-xl text-lg font-black text-center">
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
                            <td class="py-5 text-center flex items-center justify-center gap-2">
                                <button onclick="corrigirEstoque(${p.id}, '${p.nome}', ${p.estoque_atual})" class="bg-gray-800 text-white text-[10px] font-black px-4 py-2 rounded-lg shadow-sm hover:scale-105 transition-all uppercase tracking-widest">Ajustar</button>
                                <button onclick="excluirProduto(${p.id}, '${p.nome}')" class="bg-red-100 text-red-600 p-2 rounded-lg hover:bg-red-600 hover:text-white transition-all" title="Excluir Produto">🗑️</button>
                            </td>
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
    
    const cat = document.getElementById('p_categoria').value || 'Geral';
    
    if (!nome || isNaN(preco)) return showAlert("Nome e Preço são obrigatórios", true);
    
    const { error } = await db.from('produtos').insert({ nome: nome, preco: preco, categoria: cat, estoque_atual: isNaN(est)? 0 : est, user_id: currentUser.id });
    if (error) {
        showAlert("Erro: " + error.message, true);
    } else {
        showAlert("Novo Item Adicionado!");
        setMode('dono', 'estoque');
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
        setMode('dono', 'estoque');
    } else {
        showAlert("Erro: " + error.message, true);
    }
}

window.excluirProduto = async (id, nome) => {
    if (!confirm(`Deseja realmente EXCLUIR o produto "${nome}"? Isso removerá o item do cardápio e não poderá ser desfeito.`)) return;
    
    const { error } = await db.from('produtos').delete().eq('id', id);
    if (!error) {
        showAlert("Produto Excluído!");
        setMode('dono', 'estoque');
    } else {
        showAlert("Erro ao excluir: " + error.message, true);
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
    content.innerHTML = '<div class="text-center py-20 font-black animate-pulse text-red-600">PROCESSANDO RECEITA SAAS...</div>';

    // Agora buscamos da VIEW que inclui os emails
    const { data: clientes, error } = await db.from('lista_clientes_master').select('*').order('data_vencimento', { ascending: true });

    if (error) return showAlert("Erro ao carregar Central Master", true);

    // Cálculos da Plataforma (Somente mensalidades)
    const agora = new Date();
    const receitaAcumulada = clientes.reduce((acc, c) => acc + (parseFloat(c.saas_receita_acumulada) || 0), 0);
    const receitaMensalPrevista = clientes.reduce((acc, c) => {
        const isAtivo = new Date(c.data_vencimento) > agora;
        return isAtivo ? acc + (parseFloat(c.valor_mensalidade) || 0) : acc;
    }, 0);

    const ativos = clientes.filter(c => new Date(c.data_vencimento) > agora || c.user_id === '7a037349-c10b-4ca8-8e5b-5a34f8cc42a2').length;
    const vencidos = clientes.length - ativos;

    content.innerHTML = `
        <div class="mb-10 flex justify-between items-end">
            <div>
                <h1 class="text-5xl font-black text-gray-900 tracking-tighter italic">CENTRAL MASTER <span class="text-red-600">APPSOLUTIONS</span></h1>
                <p class="text-gray-400 font-bold uppercase tracking-widest text-xs mt-2">Monitoramento Financeiro e de Licenças</p>
            </div>
            <div class="flex gap-3">
                <button onclick="zerarDadosSaaS()" class="bg-red-50 text-red-600 px-6 py-2 rounded-xl font-black text-[10px] uppercase hover:bg-red-600 hover:text-white transition-all border border-red-100">🗑️ Zerar Dados Globais</button>
                <button onclick="logout()" class="bg-gray-100 text-gray-500 px-6 py-2 rounded-xl font-black text-[10px] uppercase hover:bg-red-50 hover:text-red-600 transition-all">Sair do Sistema 🚪</button>
            </div>
        </div>

        <!-- DASHBOARD FINANCEIRO SAAS (RECEITA DA PLATAFORMA) -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
            <div class="bg-white border-2 border-gray-100 p-8 rounded-3xl shadow-xl">
                <div class="text-xs font-black text-gray-400 uppercase mb-2">Total Recebido (Ciclo Atual)</div>
                <div class="text-5xl font-black tracking-tighter text-gray-800">R$ ${receitaAcumulada.toFixed(2)}</div>
                <p class="text-[10px] text-gray-400 mt-2 font-bold uppercase">VALORES CONFIRMADOS PELO MASTER</p>
            </div>
            <div class="bg-gray-900 text-white p-8 rounded-3xl shadow-xl">
                <div class="text-xs font-black text-gray-500 uppercase mb-2">Receita Mensal Prevista</div>
                <div class="text-5xl font-black tracking-tighter text-green-400">R$ ${receitaMensalPrevista.toFixed(2)}</div>
                <p class="text-[10px] text-gray-500 mt-2 font-bold uppercase">BASEADO EM CLIENTES ATIVOS</p>
            </div>
        </div>

        <!-- KPI DE LICENÇAS -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <div class="bg-gray-50 p-6 rounded-2xl border border-gray-200">
                <div class="text-[10px] font-black text-gray-400 uppercase mb-1">Total de Estabelecimentos</div>
                <div class="text-3xl font-black">${clientes.length}</div>
            </div>
            <div class="bg-green-50 p-6 rounded-2xl border border-green-100">
                <div class="text-[10px] font-black text-green-600 uppercase mb-1">Contas Ativas</div>
                <div class="text-3xl font-black text-green-700">${ativos}</div>
            </div>
            <div class="bg-red-50 p-6 rounded-2xl border border-red-100">
                <div class="text-[10px] font-black text-red-600 uppercase mb-1">Contas Bloqueadas</div>
                <div class="text-3xl font-black text-red-700">${vencidos}</div>
            </div>
        </div>

        <div class="bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100">
            <table class="w-full text-left">
                <thead class="bg-gray-50">
                    <tr class="text-[10px] text-gray-400 font-black uppercase tracking-widest">
                        <th class="p-6">Estabelecimento</th>
                        <th class="p-6">Mensalidade</th>
                        <th class="p-6">Status</th>
                        <th class="p-6 text-center">Ações</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                    ${clientes.map(c => {
                        const isAdmin = c.user_id === '7a037349-c10b-4ca8-8e5b-5a34f8cc42a2';
                        const isAtivo = new Date(c.data_vencimento) > agora || isAdmin;
                        const nomeExibicao = isAdmin ? 'AppSolutions' : c.nome_estabelecimento;
                        
                        return `
                        <tr class="hover:bg-gray-50 transition-colors">
                            <td class="p-6">
                                <div class="font-black text-gray-800">${nomeExibicao}</div>
                                <div class="text-[10px] text-gray-400 font-mono italic">${isAdmin ? 'PLATAFORMA MASTER' : c.email_cliente}</div>
                            </td>
                            <td class="p-6">
                                ${isAdmin ? '<span class="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-lg italic tracking-widest">CONTA LIBERADA</span>' : `
                                <div class="flex items-center gap-1 bg-gray-50 rounded-lg px-2 py-1 border border-gray-100">
                                    <span class="text-[10px] font-black text-gray-400">R$</span>
                                    <input type="number" 
                                           step="0.01" 
                                           value="${c.valor_mensalidade || 0}" 
                                           onchange="atualizarMensalidade('${c.user_id}', this.value)"
                                           class="w-20 bg-transparent font-black text-gray-700 outline-none text-sm">
                                </div>`}
                            </td>
                            <td class="p-6">
                                <span class="px-3 py-1 rounded-full text-[10px] font-black uppercase ${isAtivo ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}">
                                    ${isAdmin ? 'VITALÍCIO' : (isAtivo ? 'ATIVO' : 'BLOQUEADO')}
                                </span>
                            </td>
                             <td class="p-6 text-center flex items-center justify-center gap-2">
                                 ${isAdmin ? '<span class="text-[10px] font-black text-gray-300 uppercase italic">Acesso Master</span>' : `
                                 <button onclick="confirmarPagamentoSaaS('${c.user_id}', ${c.valor_mensalidade})" class="bg-green-600 text-white text-[10px] font-black px-3 py-2 rounded-lg hover:bg-green-700 shadow-sm transition-all uppercase">💰 PAGO</button>
                                 <button onclick="estenderAssinatura('${c.user_id}')" class="bg-gray-900 text-white text-[10px] font-black px-3 py-2 rounded-lg hover:bg-blue-600 transition-all uppercase tracking-tighter">Renovar</button>
                                 <button onclick="mudarStatusBloqueio('${c.user_id}', '${c.plano_status}')" class="${c.plano_status === 'bloqueado' ? 'bg-orange-500' : 'bg-gray-400'} text-white text-[10px] font-black px-3 py-2 rounded-lg hover:bg-orange-600 transition-all uppercase tracking-tighter">${c.plano_status === 'bloqueado' ? 'Desbloquear' : 'Bloquear'}</button>
                                 <button onclick="excluirParaSempre('${c.user_id}', '${c.nome_estabelecimento}')" class="bg-red-500 text-white text-[10px] font-black px-3 py-2 rounded-lg hover:bg-red-700 transition-all uppercase tracking-tighter">Excluir</button>
                                 `}
                             </td>
                        </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

window.estenderAssinatura = async (uid) => {
    const { data: atual } = await db.from('configuracoes').select('data_vencimento').eq('user_id', uid).single();
    const novaData = new Date(atual.data_vencimento);
    if (novaData < new Date()) {
        novaData.setTime(new Date().getTime());
    }
    novaData.setDate(novaData.getDate() + 30);

    const { error } = await db.from('configuracoes').update({ data_vencimento: novaData, plano_status: 'ativo' }).eq('user_id', uid);
    if (!error) {
        showAlert("Assinatura estendida manualmente!");
        renderMaster();
    }
}

window.atualizarMensalidade = async (uid, valor) => {
    const { error } = await db.from('configuracoes').update({ valor_mensalidade: parseFloat(valor) }).eq('user_id', uid);
    if (!error) {
        showAlert("Valor da mensalidade atualizado!");
        renderMaster(); // Recarrega para atualizar os totais do dashboard
    } else {
        showAlert("Erro ao atualizar valor", true);
    }
}


window.excluirParaSempre = async (uid, nome) => {
    if (!confirm(`⚠️ PERIGO: Você vai apagar o cliente "${nome}" e TODOS os seus dados? Esta ação não tem volta.`)) return;
    
    // Primeiro limpamos a configuração (que gerencia o acesso)
    const { error } = await db.from('configuracoes').delete().eq('user_id', uid);
    
    if (!error) {
        showAlert(`O cliente ${nome} foi removido.`);
        renderMaster();
    } else {
        showAlert("Erro ao excluir: " + error.message, true);
    }
}

window.zerarDadosSaaS = async () => {
    if (!confirm("🚨 ATENÇÃO: Você deseja zerar o FINANCEIRO DA PLATAFORMA? (Isso não afetará os dados dos restaurantes)")) return;
    if (!confirm("Confirmar reset do Total Recebido?")) return;
    
    showAlert("Limpando receita master...", false);

    try {
        // Agora zeramos apenas o seu contador saas_receita_acumulada para todos
        const { error } = await db.from('configuracoes').update({ saas_receita_acumulada: 0 }).neq('id', 0);
        
        if (!error) {
            showAlert("Financeiro Master Zerado!");
            renderMaster();
        } else {
            throw error;
        }
    } catch (err) {
        showAlert("Erro ao zerar: " + err.message, true);
    }
}

window.confirmarPagamentoSaaS = async (uid, valor) => {
    // Busca valor atual para somar
    const { data } = await db.from('configuracoes').select('saas_receita_acumulada').eq('user_id', uid).single();
    const novoTotal = (parseFloat(data.saas_receita_acumulada) || 0) + parseFloat(valor);

    const { error } = await db.from('configuracoes').update({ saas_receita_acumulada: novoTotal }).eq('user_id', uid);
    if (!error) {
        showAlert("Pagamento Registrado com Sucesso! 💰");
        renderMaster();
    }
}

function aplicarTema(cfg) {
    if (!cfg) return;
    const body = document.body;
    const header = document.querySelector('nav');
    
    // Injeta CSS Dinâmico
    let style = document.getElementById('dynamic-theme');
    if (!style) {
        style = document.createElement('style');
        style.id = 'dynamic-theme';
        document.head.appendChild(style);
    }

    style.innerHTML = `
        :root {
            --primary-color: ${cfg.cor_header || '#dc2626'};
            --bg-color: ${cfg.cor_fundo || '#f8fafc'};
            --text-color: ${cfg.cor_texto || '#1e293b'};
        }
        body { background-color: var(--bg-color) !important; color: var(--text-color) !important; }
        nav { background-color: var(--primary-color) !important; }
    `;
    
    if (header) header.style.backgroundColor = cfg.cor_header;
    document.getElementById('app-brand-name').innerText = cfg.nome_estabelecimento || 'AppSolutions';
}
window.changeDonoAba = (aba) => {
    // Esconde todas as abas
    ['vendas', 'estoque', 'branding'].forEach(a => {
        const el = document.getElementById(`aba-${a}`);
        if (el) el.classList.add('hidden');
    });
    // Mostra a aba selecionada
    const target = document.getElementById(`aba-${aba}`);
    if (target) target.classList.remove('hidden');

    // Estilo dos botões (UI Cleaner)
    document.querySelectorAll('.aba-btn').forEach(btn => {
        btn.classList.replace('active', 'inactive');
        btn.classList.replace('bg-white', 'bg-gray-100');
        btn.classList.remove('border-2', 'border-gray-100', 'text-white', 'bg-indigo-600');
        btn.classList.add('text-gray-500');
    });

    if(event && event.currentTarget) {
        event.currentTarget.classList.add('active', 'bg-white', 'border-2', 'border-gray-100');
        event.currentTarget.classList.remove('bg-gray-100', 'inactive', 'text-gray-500');
        event.currentTarget.classList.add('text-gray-800');
    }
}

window.salvarBranding = async () => {
    const nome = document.getElementById('b_nome').value;
    const pin = document.getElementById('b_pin').value;
    const header = document.getElementById('b_cor_header').value;
    const fundo = document.getElementById('b_cor_fundo').value;
    const texto = document.getElementById('b_cor_texto').value;

    showAlert("Salvando sua marca...", false);

    const { error } = await db.from('configuracoes').update({
        nome_estabelecimento: nome,
        pin_garcom: pin,
        cor_header: header,
        cor_fundo: fundo,
        cor_texto: texto,
        setup_concluido: true // Marca como concluído para nunca mais pedir
    }).eq('user_id', currentUser.id);

    if (!error) {
        // Atualiza localmente e reaplica
        userConfig.nome_estabelecimento = nome;
        userConfig.pin_garcom = pin;
        userConfig.cor_header = header;
        userConfig.cor_fundo = fundo;
        userConfig.cor_texto = texto;
        userConfig.setup_concluido = true;
        aplicarTema(userConfig);
        showAlert("Identidade Visual atualizada! Menu Liberado. 🚀");
        setTimeout(() => window.location.reload(), 1500);
    } else {
        showAlert("Erro ao salvar branding", true);
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

        const nomeFormatado = (userConfig.nome_estabelecimento || 'AppSolutions').replace(/\s+/g, '_');
        XLSX.writeFile(wb, `${nomeFormatado}_Relatorio_${new Date().toLocaleDateString()}.xlsx`);
        showAlert("Excel gerado com sucesso!");
    } catch (e) {
        showAlert("Erro na exportação: " + e.message, true);
    }
}

function aplicarTemaMaster() {
    aplicarTema({
        cor_header: '#000000',
        cor_fundo: '#f8fafc',
        cor_texto: '#1e293b',
        nome_estabelecimento: 'AppSolutions'
    });
}

window.importarExcel = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    showAlert("Processando importação...", false);
    const reader = new FileReader();

    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            
            // Vamos focar na aba de produtos para este exemplo de importação
            const firstSheet = workbook.SheetNames[0];
            const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet]);

            if (jsonData.length === 0) throw new Error("Planilha vazia!");

            showAlert(`Importando ${jsonData.length} registros...`, false);

            // Mapeia os dados para o formato do Supabase (exemplo para produtos)
            const rows = jsonData.map(row => {
                const p = {
                    user_id: currentUser.id,
                    nome: String(row.nome || row.Nome || "Produto Sem Nome").trim(),
                    categoria: String(row.categoria || row.Categoria || "Geral").trim(),
                    preco: parseFloat(row.preco || row.Preco || 0),
                    estoque_atual: parseInt(row.estoque_atual || row.estoque || row.Estoque || row['quant. estoque'] || row.quantidade || 0),
                    estoque_minimo: parseInt(row.estoque_minimo || row.EstoqueMinimo || row.minimo || 5)
                };
                return p;
            });

            const { error } = await db.from('produtos').upsert(rows, { onConflict: 'nome,user_id' });

            if (error) throw error;

            showAlert("Importação concluída com sucesso! 🚀");
            acessarDono(); // Recarrega o painel
        } catch (err) {
            console.error(err);
            showAlert("Erro na importação: " + err.message, true);
        }
    };

    reader.readAsArrayBuffer(file);
    event.target.value = ''; // Reseta o input
}

window.mudarStatusBloqueio = async (uid, statusAtual) => {
    const novoStatus = statusAtual === 'bloqueado' ? 'ativo' : 'bloqueado';
    const acao = novoStatus === 'bloqueado' ? 'BLOQUEAR' : 'DESBLOQUEAR';
    
    if (!confirm(`Deseja realmente ${acao} este cliente?`)) return;

    const { error } = await db.from('configuracoes').update({ plano_status: novoStatus }).eq('user_id', uid);
    if (!error) {
        showAlert(`Cliente ${novoStatus === 'bloqueado' ? 'Bloqueado' : 'Ativado'} com sucesso!`);
        renderMaster();
    } else {
        showAlert("Erro ao mudar status: " + error.message, true);
    }
}

window.excluirParaSempre = async (uid, nome) => {
    if (!confirm(`🚨 CUIDADO: Você deseja EXCLUIR DEFINITIVAMENTE o estabelecimento "${nome}"?\n\nEsta ação removerá todos os dados e o cliente perderá o acesso imediatamente.`)) return;
    if (!confirm("CONFIRMAÇÃO FINAL: Deseja apagar tudo deste cliente?")) return;

    showAlert("Excluindo conta e limpando dados...", false);

    // LIMPEZA COMPLETA (Cascata Manual)
    const resultados = await Promise.all([
        db.from('produtos').delete().eq('user_id', uid),
        db.from('comandas').delete().eq('user_id', uid),
        db.from('itens_pedido').delete().eq('user_id', uid),
        db.from('despesas').delete().eq('user_id', uid),
        db.from('configuracoes').delete().eq('user_id', uid)
    ]);

    const erro = resultados.find(r => r.error);
    if (erro) {
        showAlert("Erro parcial na exclusão: " + erro.error.message, true);
        console.error("Erro na cascata:", erro.error);
    } else {
        showAlert("Estabelecimento e todos os registros foram apagados definitivamente!");
        renderMaster();
    }
}
