// Painel de Funcionários — Cesta Aliança. Lógica do app (Supabase + UI).

const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
let COMISSAO_DATA = null; // window.COMISSAO_VENDEDORES, carregado do painel principal
let FUNCIONARIOS_CACHE = [];

// ---------- Login (Supabase Auth — só quem tem conta criada consegue entrar) ----------
async function tentarLogin() {
  const email = document.getElementById('emailInput').value.trim();
  const senha = document.getElementById('senhaInput').value;
  document.getElementById('loginErro').textContent = '';
  const { error } = await sb.auth.signInWithPassword({ email, password: senha });
  if (error) {
    document.getElementById('loginErro').textContent = 'E-mail ou senha incorretos.';
    return;
  }
  iniciarApp();
}
document.getElementById('senhaInput').addEventListener('keydown', e => { if (e.key === 'Enter') tentarLogin(); });
document.getElementById('emailInput').addEventListener('keydown', e => { if (e.key === 'Enter') tentarLogin(); });

function iniciarApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  carregarComissaoData();
  mudarView('funcionarios');
}
function sair() {
  sb.auth.signOut().then(() => location.reload());
}
sb.auth.getSession().then(({ data }) => { if (data.session) iniciarApp(); });

// ---------- Navegação ----------
function mudarView(v) {
  ['funcionarios','fechamento','historico'].forEach(id => {
    document.getElementById('view-' + id).classList.toggle('hidden', id !== v);
  });
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  if (v === 'funcionarios') carregarFuncionarios();
  if (v === 'fechamento') iniciarFechamentoDefault();
  if (v === 'historico') carregarSelectHistFuncionario();
}

// ---------- Dados do painel principal (comissão automática) ----------
function carregarComissaoData() {
  const s = document.createElement('script');
  s.src = window.PAINEL_URL + '/comissao-vendedores.js?_=' + Date.now();
  s.onload = () => { COMISSAO_DATA = window.COMISSAO_VENDEDORES || null; };
  s.onerror = () => { console.warn('Não consegui carregar comissao-vendedores.js do painel principal.'); };
  document.head.appendChild(s);
}

// ---------- Funcionários: lista ----------
async function carregarFuncionarios() {
  const { data, error } = await sb.from('rh_funcionarios').select('*').order('nome');
  if (error) { alert('Erro ao carregar funcionários: ' + error.message); return; }
  FUNCIONARIOS_CACHE = data || [];
  const el = document.getElementById('listaFuncionarios');
  if (!data || !data.length) { el.innerHTML = '<p class="muted">Nenhum funcionário cadastrado ainda.</p>'; return; }
  el.innerHTML = data.map(f => `
    <div class="emp-item" onclick="abrirFormFuncionario('${f.id}')">
      <div>
        <div class="name">${escapeHtml(f.nome)}</div>
        <div class="muted">${labelRegra(f)}</div>
      </div>
      <div>
        <span class="badge ${f.status}">${f.status === 'ativo' ? 'Ativo' : 'Desligado'}</span>
        ${f.registrado ? '<span class="badge registrado">Registrado</span>' : ''}
      </div>
    </div>`).join('');
}
function labelRegra(f) {
  if (f.regra_pagamento === 'comissao') return 'Comissão' + (f.vendedor_painel ? ' — ' + f.vendedor_painel : '');
  if (f.regra_pagamento === 'fixo') return 'Fixo ' + fmtMoney(f.valor_fixo);
  if (f.regra_pagamento === 'diaria') return 'Diária ' + fmtMoney(f.valor_diaria);
  if (f.regra_pagamento === 'fixo_diaria') return `Fixo ${fmtMoney(f.valor_fixo)} + diária ${fmtMoney(f.valor_diaria)}`;
  return '';
}
function escapeHtml(s) { return (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// ---------- Funcionários: cadastro/edição ----------
function abrirFormFuncionario(id) {
  const f = id ? FUNCIONARIOS_CACHE.find(x => x.id === id) : {};
  const isNovo = !id;
  const vendedores = (COMISSAO_DATA && COMISSAO_DATA.vendedores) || [];
  const html = `
    <div class="modal-bg" onclick="if(event.target===this) fecharModal()">
      <div class="modal">
        <h3>${isNovo ? 'Novo funcionário' : escapeHtml(f.nome)}</h3>
        <div class="grid">
          <div class="field" style="grid-column:1/-1"><label>Nome completo</label><input id="fNome" value="${escapeHtml(f.nome||'')}"></div>
          <div class="field"><label>CPF</label><input id="fCpf" value="${escapeHtml(f.cpf||'')}"></div>
          <div class="field"><label>RG</label><input id="fRg" value="${escapeHtml(f.rg||'')}"></div>
          <div class="field"><label>Telefone</label><input id="fTelefone" value="${escapeHtml(f.telefone||'')}"></div>
          <div class="field"><label>Data nascimento</label><input type="date" id="fNascimento" value="${f.data_nascimento||''}"></div>
          <div class="field"><label>Data admissão</label><input type="date" id="fAdmissao" value="${f.data_admissao||''}"></div>
          <div class="field" style="grid-column:1/-1"><label>Endereço</label><input id="fEndereco" value="${escapeHtml(f.endereco||'')}"></div>
        </div>
        <div class="field">
          <label><input type="checkbox" id="fRegistrado" ${f.registrado?'checked':''} style="width:auto;display:inline-block;margin-right:6px"> Registrado (carteira assinada)</label>
        </div>
        <div class="field">
          <label>Regra de pagamento</label>
          <select id="fRegra" onchange="atualizarCamposRegra()">
            <option value="fixo" ${f.regra_pagamento==='fixo'?'selected':''}>Só fixo (mensalista)</option>
            <option value="diaria" ${f.regra_pagamento==='diaria'?'selected':''}>Só diária</option>
            <option value="fixo_diaria" ${f.regra_pagamento==='fixo_diaria'?'selected':''}>Fixo + diária</option>
            <option value="comissao" ${f.regra_pagamento==='comissao'?'selected':''}>Comissão (vendedor)</option>
          </select>
        </div>
        <div class="row">
          <div class="field" id="wrapFixo" style="max-width:160px"><label>Valor fixo mensal</label><input type="number" step="0.01" id="fValorFixo" value="${f.valor_fixo||''}"></div>
          <div class="field" id="wrapDiaria" style="max-width:160px"><label>Valor da diária</label><input type="number" step="0.01" id="fValorDiaria" value="${f.valor_diaria||''}"></div>
          <div class="field" id="wrapVendedor" style="max-width:220px"><label>Vendedor (dados do painel)</label>
            <select id="fVendedorPainel">
              <option value="">— selecionar —</option>
              ${vendedores.map(v => `<option value="${v}" ${f.vendedor_painel===v?'selected':''}>${v}</option>`).join('')}
            </select>
          </div>
        </div>
        ${!isNovo ? `<div class="field"><label>Documentos</label><div id="docsList"></div>
          <div class="row" style="margin-top:6px">
            <select id="docTipo" style="max-width:220px">
              <option value="rg_cpf">RG/CPF</option>
              <option value="comprovante_endereco">Comprovante de endereço</option>
              <option value="carteira_contrato">Carteira/contrato</option>
              <option value="exame_atestado">Exame/atestado</option>
              <option value="outro">Outro</option>
            </select>
            <input type="file" id="docFile" style="max-width:220px">
            <button class="btn ghost" onclick="enviarDocumento('${id}')">Anexar</button>
          </div>
        </div>` : ''}
        <div class="row" style="justify-content:space-between; margin-top:14px">
          <div>
            ${!isNovo && f.status==='ativo' ? `<button class="btn danger" onclick="abrirDesligamento('${id}')">Desligar</button>` : ''}
          </div>
          <div class="row">
            <button class="btn ghost" onclick="fecharModal()">Cancelar</button>
            <button class="btn gold" onclick="salvarFuncionario('${id||''}')">Salvar</button>
          </div>
        </div>
      </div>
    </div>`;
  document.getElementById('modalRoot').innerHTML = html;
  atualizarCamposRegra();
  if (!isNovo) carregarDocumentos(id);
}
function atualizarCamposRegra() {
  const r = document.getElementById('fRegra').value;
  document.getElementById('wrapFixo').classList.toggle('hidden', r === 'diaria' || r === 'comissao');
  document.getElementById('wrapDiaria').classList.toggle('hidden', r === 'fixo' || r === 'comissao');
  document.getElementById('wrapVendedor').classList.toggle('hidden', r !== 'comissao');
}
function fecharModal() { document.getElementById('modalRoot').innerHTML = ''; }

async function salvarFuncionario(id) {
  const payload = {
    nome: document.getElementById('fNome').value.trim(),
    cpf: document.getElementById('fCpf').value.trim(),
    rg: document.getElementById('fRg').value.trim(),
    telefone: document.getElementById('fTelefone').value.trim(),
    endereco: document.getElementById('fEndereco').value.trim(),
    data_nascimento: document.getElementById('fNascimento').value || null,
    data_admissao: document.getElementById('fAdmissao').value || null,
    registrado: document.getElementById('fRegistrado').checked,
    regra_pagamento: document.getElementById('fRegra').value,
    valor_fixo: parseFloat(document.getElementById('fValorFixo').value) || 0,
    valor_diaria: parseFloat(document.getElementById('fValorDiaria').value) || 0,
    vendedor_painel: document.getElementById('fVendedorPainel').value || null,
  };
  if (!payload.nome) { alert('Nome é obrigatório.'); return; }
  let error;
  if (id) {
    ({ error } = await sb.from('rh_funcionarios').update(payload).eq('id', id));
  } else {
    ({ error } = await sb.from('rh_funcionarios').insert(payload));
  }
  if (error) { alert('Erro ao salvar: ' + error.message); return; }
  fecharModal();
  carregarFuncionarios();
}

// ---------- Documentos ----------
async function carregarDocumentos(funcionarioId) {
  const { data } = await sb.from('rh_documentos').select('*').eq('funcionario_id', funcionarioId).order('created_at');
  const el = document.getElementById('docsList');
  if (!el) return;
  if (!data || !data.length) { el.innerHTML = '<p class="muted">Nenhum documento anexado.</p>'; return; }
  el.innerHTML = data.map(d => `
    <div class="doc-item">
      <span>${labelTipoDoc(d.tipo)} — ${escapeHtml(d.nome_arquivo)}</span>
      <span><a href="#" onclick="abrirDocumento('${d.storage_path}');return false;">abrir</a> ·
      <a href="#" onclick="removerDocumento('${d.id}','${funcionarioId}');return false;" style="color:var(--red)">remover</a></span>
    </div>`).join('');
}
function labelTipoDoc(t) {
  return { rg_cpf:'RG/CPF', comprovante_endereco:'Comprov. endereço', carteira_contrato:'Carteira/contrato', exame_atestado:'Exame/atestado', outro:'Outro' }[t] || t;
}
async function enviarDocumento(funcionarioId) {
  const tipo = document.getElementById('docTipo').value;
  const fileInput = document.getElementById('docFile');
  const file = fileInput.files[0];
  if (!file) { alert('Escolha um arquivo.'); return; }
  const path = `${funcionarioId}/${Date.now()}_${file.name}`;
  const { error: upErr } = await sb.storage.from('rh-documentos').upload(path, file);
  if (upErr) { alert('Erro no upload: ' + upErr.message); return; }
  const { error } = await sb.from('rh_documentos').insert({ funcionario_id: funcionarioId, tipo, nome_arquivo: file.name, storage_path: path });
  if (error) { alert('Erro ao salvar registro: ' + error.message); return; }
  fileInput.value = '';
  carregarDocumentos(funcionarioId);
}
async function abrirDocumento(path) {
  const { data, error } = await sb.storage.from('rh-documentos').createSignedUrl(path, 300);
  if (error) { alert('Erro: ' + error.message); return; }
  window.open(data.signedUrl, '_blank');
}
async function removerDocumento(docId, funcionarioId) {
  if (!confirm('Remover esse documento?')) return;
  const { data: doc } = await sb.from('rh_documentos').select('storage_path').eq('id', docId).single();
  if (doc) await sb.storage.from('rh-documentos').remove([doc.storage_path]);
  await sb.from('rh_documentos').delete().eq('id', docId);
  carregarDocumentos(funcionarioId);
}

// ---------- Desligamento ----------
function abrirDesligamento(id) {
  const f = FUNCIONARIOS_CACHE.find(x => x.id === id);
  document.getElementById('modalRoot').innerHTML = `
    <div class="modal-bg" onclick="if(event.target===this) fecharModal()">
      <div class="modal">
        <h3>Desligar — ${escapeHtml(f.nome)}</h3>
        <p class="muted">O histórico e os documentos continuam guardados. Isso só marca como desligado.</p>
        <div class="field"><label>Data de saída</label><input type="date" id="dlgData" value="${new Date().toISOString().slice(0,10)}"></div>
        <div class="field"><label>Motivo</label><input id="dlgMotivo" placeholder="Ex: pedido de demissão, dispensa..."></div>
        <div class="field"><label>Valor do acerto (combinado)</label><input type="number" step="0.01" id="dlgValor"></div>
        <div class="field"><label>Observações</label><textarea id="dlgObs" rows="3"></textarea></div>
        <div class="row" style="justify-content:flex-end">
          <button class="btn ghost" onclick="abrirFormFuncionario('${id}')">Voltar</button>
          <button class="btn danger" onclick="confirmarDesligamento('${id}')">Confirmar desligamento</button>
        </div>
      </div>
    </div>`;
}
async function confirmarDesligamento(id) {
  const payload = {
    status: 'desligado',
    data_desligamento: document.getElementById('dlgData').value,
    motivo_desligamento: document.getElementById('dlgMotivo').value.trim(),
    valor_acerto: parseFloat(document.getElementById('dlgValor').value) || null,
    obs_desligamento: document.getElementById('dlgObs').value.trim(),
  };
  const { error } = await sb.from('rh_funcionarios').update(payload).eq('id', id);
  if (error) { alert('Erro: ' + error.message); return; }
  fecharModal();
  carregarFuncionarios();
}

// ---------- Fechamento mensal ----------
function iniciarFechamentoDefault() {
  const sel = document.getElementById('fechMes');
  if (!sel.options.length) {
    for (let m = 1; m <= 12; m++) sel.innerHTML += `<option value="${m}">${mesNome(m)}</option>`;
  }
  const hoje = new Date();
  sel.value = hoje.getMonth() + 1;
  document.getElementById('fechAno').value = hoje.getFullYear();
  carregarFechamentoMes();
}

async function carregarFechamentoMes() {
  const mes = parseInt(document.getElementById('fechMes').value, 10);
  const ano = parseInt(document.getElementById('fechAno').value, 10);
  const { data: funcs, error } = await sb.from('rh_funcionarios').select('*').eq('status', 'ativo').order('nome');
  if (error) { alert('Erro: ' + error.message); return; }
  const { data: fechExistentes } = await sb.from('rh_fechamentos').select('*').eq('mes', mes).eq('ano', ano);
  const mapFech = {}; (fechExistentes || []).forEach(f => mapFech[f.funcionario_id] = f);

  const el = document.getElementById('listaFechamento');
  el.innerHTML = '';
  for (const f of funcs) {
    const div = document.createElement('div');
    div.className = 'card';
    div.id = 'fech-' + f.id;
    el.appendChild(div);
    await renderCardFechamento(f, mes, ano, mapFech[f.id], div);
  }
  if (!funcs.length) el.innerHTML = '<p class="muted">Nenhum funcionário ativo.</p>';
}

async function buscarVendidoRecebido(vendedor, mes, ano) {
  if (!COMISSAO_DATA || !vendedor) return { vendidoM1: 0, vendidoM2: 0, recebidoMes: 0 };
  const key = (y,m) => `${y}-${String(m).padStart(2,'0')}`;
  const m1 = mesAnterior(mes, ano);
  const m2 = mesAnterior(m1.mes, m1.ano);
  const vendido = COMISSAO_DATA.vendido[vendedor] || {};
  const recebido = COMISSAO_DATA.recebido[vendedor] || {};
  return {
    vendidoM1: vendido[key(m1.ano, m1.mes)] || 0,
    vendidoM2: vendido[key(m2.ano, m2.mes)] || 0,
    recebidoMes: recebido[key(ano, mes)] || 0,
  };
}

async function renderCardFechamento(f, mes, ano, existente, container) {
  const jaFechado = existente && existente.status === 'fechado';
  const descontosExistentes = jaFechado ? (await sb.from('rh_descontos').select('*').eq('fechamento_id', existente.id)).data || [] : [];
  container._descontos = descontosExistentes.length ? descontosExistentes : (container._descontos || []);

  let camposCalc = '';
  if (f.regra_pagamento === 'comissao') {
    const { vendidoM1, vendidoM2, recebidoMes } = await buscarVendidoRecebido(f.vendedor_painel, mes, ano);
    container._vendidoM1 = existente?.ideal_calculado != null ? null : vendidoM1;
    camposCalc = `
      <div class="row">
        <div class="field" style="max-width:150px"><label>Vendido mês -1</label><input type="number" step="0.01" id="in-vm1-${f.id}" value="${(existente?.formal_valor_comissao_base==null && existente)? '' : vendidoM1.toFixed(2)}"></div>
        <div class="field" style="max-width:150px"><label>Vendido mês -2</label><input type="number" step="0.01" id="in-vm2-${f.id}" value="${vendidoM2.toFixed(2)}"></div>
        <div class="field" style="max-width:150px"><label>Recebido no mês</label><input type="number" step="0.01" id="in-rec-${f.id}" value="${(existente?existente.recebido_mes:recebidoMes).toFixed(2)}"></div>
      </div>`;
    if (f.registrado) {
      const dm = diasNoMes(ano, mes), df = contarDomingos(ano, mes);
      camposCalc += `
      <div class="row">
        <div class="field" style="max-width:130px"><label>Dias no mês</label><input type="number" id="in-dm-${f.id}" value="${existente?.formal_dias_mes || dm}"></div>
        <div class="field" style="max-width:150px"><label>Domingos+feriados</label><input type="number" step="0.5" id="in-df-${f.id}" value="${existente?.formal_dom_feriados || df}"></div>
      </div>
      <p class="muted">Funcionário registrado — sistema calcula os encargos formais (DSR, 13º e férias proporcionais) automaticamente.</p>`;
    }
  } else {
    camposCalc = `<div class="row">
      <div class="field" style="max-width:150px"><label>Dias trabalhados</label><input type="number" step="0.5" id="in-dias-${f.id}" value="${existente?.dias_trabalhados ?? ''}"></div>
    </div>`;
  }

  if (jaFechado) camposCalc = camposCalc.replace(/<input /g, '<input disabled ');

  container.innerHTML = `
    <div class="row" style="justify-content:space-between">
      <h3 style="margin:4px 0">${escapeHtml(f.nome)} <span class="badge ${f.status}">${labelRegra(f)}</span></h3>
      ${jaFechado ? '<span class="badge" style="background:#DDEBE2;color:#1e7d4a">Fechado</span>' : ''}
    </div>
    <div id="calcArea-${f.id}">${camposCalc}</div>
    <div id="descontosArea-${f.id}"></div>
    <div id="resumo-${f.id}" class="calc-box"></div>
    ${!jaFechado ? `<div class="row" style="justify-content:flex-end">
      <button class="btn ghost" onclick="recalcularCard('${f.id}', ${mes}, ${ano})">Recalcular</button>
      <button class="btn gold" onclick="fecharPagamento('${f.id}', ${mes}, ${ano})">Fechar e marcar pago</button>
    </div>` : ''}
  `;
  renderDescontos(f.id, jaFechado);
  document.querySelectorAll(`#calcArea-${f.id} input`).forEach(inp => inp.addEventListener('input', () => recalcularCard(f.id, mes, ano)));
  recalcularCard(f.id, mes, ano);
}

function renderDescontos(fId, readonly) {
  const container = document.getElementById('fech-' + fId);
  const lista = container._descontos || [];
  const el = document.getElementById('descontosArea-' + fId);
  const tipos = { vale:'Vale/Adiantamento', falta:'Falta', mercadoria:'Mercadoria', saldo_anterior:'Saldo devedor anterior', outro:'Outro' };
  el.innerHTML = `<label style="margin-top:8px">Descontos</label>` +
    lista.map((d, i) => `<div class="desconto-row">
        <span style="min-width:150px">${tipos[d.tipo]}</span>
        <span class="money neg">- ${fmtMoney(d.valor)}</span>
        <span class="muted" style="flex:2">${escapeHtml(d.observacao||'')}</span>
        ${!readonly ? `<button class="btn ghost" onclick="removerDescontoLinha('${fId}',${i})">x</button>` : ''}
      </div>`).join('') +
    (!readonly ? `<div class="desconto-row">
        <select id="novoDescTipo-${fId}">${Object.entries(tipos).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select>
        <input type="number" step="0.01" id="novoDescValor-${fId}" placeholder="Valor">
        <input id="novoDescObs-${fId}" placeholder="Observação (opcional)">
        <button class="btn ghost" onclick="adicionarDescontoLinha('${fId}')">+ Adicionar</button>
      </div>` : '');
}
function adicionarDescontoLinha(fId) {
  const container = document.getElementById('fech-' + fId);
  const tipo = document.getElementById('novoDescTipo-' + fId).value;
  const valor = parseFloat(document.getElementById('novoDescValor-' + fId).value) || 0;
  const observacao = document.getElementById('novoDescObs-' + fId).value.trim();
  if (!valor) return;
  container._descontos = container._descontos || [];
  container._descontos.push({ tipo, valor, observacao });
  renderDescontos(fId, false);
  const [mes, ano] = container.dataset.mesAno ? container.dataset.mesAno.split('-') : [];
  recalcularCardFromDom(fId);
}
function removerDescontoLinha(fId, idx) {
  const container = document.getElementById('fech-' + fId);
  container._descontos.splice(idx, 1);
  renderDescontos(fId, false);
  recalcularCardFromDom(fId);
}
function recalcularCardFromDom(fId) {
  // Recalcula usando o mês/ano guardado no card (evita precisar repassar argumento em todo onclick).
  const container = document.getElementById('fech-' + fId);
  if (container && container._mes) recalcularCard(fId, container._mes, container._ano);
}

function recalcularCard(fId, mes, ano) {
  const container = document.getElementById('fech-' + fId);
  container._mes = mes; container._ano = ano;
  const f = FUNCIONARIOS_CACHE.find(x => x.id === fId);
  const descontos = container._descontos || [];
  const totalDescontos = somaDescontos(descontos);
  let bruto = 0, extraInfo = {};

  if (f.regra_pagamento === 'comissao') {
    const vm1 = parseFloat(document.getElementById('in-vm1-' + fId)?.value) || 0;
    const vm2 = parseFloat(document.getElementById('in-vm2-' + fId)?.value) || 0;
    const rec = parseFloat(document.getElementById('in-rec-' + fId)?.value) || 0;
    const r = calcComissaoInformal(vm1, vm2, rec);
    extraInfo = { ideal: r.ideal, atingimentoPct: r.atingimentoPct, comissaoPct: r.comissaoPct, comissaoValorInformal: r.comissaoValor, recebidoMes: rec };
    if (f.registrado) {
      const dm = parseFloat(document.getElementById('in-dm-' + fId)?.value) || 30;
      const df = parseFloat(document.getElementById('in-df-' + fId)?.value) || 0;
      const base = calcFormalCLTReverso(r.comissaoValor, totalDescontos, dm, df);
      const formal = calcFormalCLT(base, dm, df);
      extraInfo.formal = formal;
      bruto = formal.totalVencimentos;
    } else {
      bruto = r.comissaoValor;
    }
  } else {
    const dias = parseFloat(document.getElementById('in-dias-' + fId)?.value) || 0;
    const r = calcInformalFixoDiaria(f, dias);
    extraInfo = { fixo: r.fixo, diaria: r.diaria };
    bruto = r.bruto;
  }

  const liquido = bruto - totalDescontos;
  container._ultimoCalc = { bruto, totalDescontos, liquido, extraInfo };

  const resumo = document.getElementById('resumo-' + fId);
  let linhas = '';
  if (f.regra_pagamento === 'comissao') {
    linhas += `<div><span>Ideal (média 2 meses)</span><span>${fmtMoney(extraInfo.ideal)}</span></div>`;
    linhas += `<div><span>Atingimento</span><span>${(extraInfo.atingimentoPct||0).toFixed(1)}%</span></div>`;
    linhas += `<div><span>% Comissão (teto 9%)</span><span>${(extraInfo.comissaoPct||0).toFixed(2)}%</span></div>`;
    linhas += `<div><span>Comissão calculada</span><span>${fmtMoney(extraInfo.comissaoValorInformal)}</span></div>`;
    if (extraInfo.formal) {
      linhas += `<div><span>— Base declarada (comissão)</span><span>${fmtMoney(extraInfo.formal.comissaoBase)}</span></div>`;
      linhas += `<div><span>— DSR s/ comissão</span><span>${fmtMoney(extraInfo.formal.dsr)}</span></div>`;
      linhas += `<div><span>— 13º proporcional</span><span>${fmtMoney(extraInfo.formal.decimoTerceiroProp)}</span></div>`;
      linhas += `<div><span>— Férias proporcional</span><span>${fmtMoney(extraInfo.formal.feriasProp)}</span></div>`;
      linhas += `<div><span>— 1/3 férias proporcional</span><span>${fmtMoney(extraInfo.formal.umTercoFeriasProp)}</span></div>`;
    }
  } else {
    linhas += `<div><span>Fixo</span><span>${fmtMoney(extraInfo.fixo)}</span></div>`;
    linhas += `<div><span>Diária</span><span>${fmtMoney(extraInfo.diaria)}</span></div>`;
  }
  linhas += `<div><strong>Bruto</strong><strong>${fmtMoney(bruto)}</strong></div>`;
  linhas += `<div><span>Descontos</span><span class="money neg">- ${fmtMoney(totalDescontos)}</span></div>`;
  linhas += `<div style="border-top:1px solid #ccc;padding-top:4px;margin-top:4px"><strong>Líquido</strong><strong class="money pos">${fmtMoney(liquido)}</strong></div>`;
  resumo.innerHTML = linhas;
}

async function fecharPagamento(fId, mes, ano) {
  const container = document.getElementById('fech-' + fId);
  const calc = container._ultimoCalc;
  if (!calc) { alert('Calcule antes de fechar.'); return; }
  if (!confirm('Fechar esse pagamento e marcar como pago? Depois de fechado não dá pra editar por aqui.')) return;
  const f = FUNCIONARIOS_CACHE.find(x => x.id === fId);
  const extra = calc.extraInfo;
  const payload = {
    funcionario_id: fId, mes, ano,
    dias_trabalhados: f.regra_pagamento !== 'comissao' ? (parseFloat(document.getElementById('in-dias-' + fId)?.value) || 0) : null,
    valor_fixo_aplicado: extra.fixo ?? null,
    valor_diaria_aplicado: extra.diaria ?? null,
    ideal_calculado: extra.ideal ?? null,
    recebido_mes: extra.recebidoMes ?? null,
    atingimento_pct: extra.atingimentoPct ?? null,
    comissao_pct: extra.comissaoPct ?? null,
    comissao_valor: extra.comissaoValorInformal ?? null,
    formal_valor_comissao_base: extra.formal?.comissaoBase ?? null,
    formal_dias_mes: extra.formal ? (parseFloat(document.getElementById('in-dm-' + fId)?.value) || null) : null,
    formal_dom_feriados: extra.formal ? (parseFloat(document.getElementById('in-df-' + fId)?.value) || null) : null,
    formal_dsr: extra.formal?.dsr ?? null,
    formal_decimo_terceiro_prop: extra.formal?.decimoTerceiroProp ?? null,
    formal_ferias_prop: extra.formal?.feriasProp ?? null,
    formal_um_terco_ferias_prop: extra.formal?.umTercoFeriasProp ?? null,
    formal_total_vencimentos: extra.formal?.totalVencimentos ?? null,
    bruto: calc.bruto, total_descontos: calc.totalDescontos, liquido: calc.liquido,
    status: 'fechado', fechado_em: new Date().toISOString(),
  };
  const { data, error } = await sb.from('rh_fechamentos').upsert(payload, { onConflict: 'funcionario_id,mes,ano' }).select().single();
  if (error) { alert('Erro ao fechar: ' + error.message); return; }
  const descontos = container._descontos || [];
  if (descontos.length) {
    const rows = descontos.map(d => ({ fechamento_id: data.id, tipo: d.tipo, valor: d.valor, observacao: d.observacao }));
    await sb.from('rh_descontos').insert(rows);
  }
  carregarFechamentoMes();
}

// ---------- Histórico ----------
async function carregarSelectHistFuncionario() {
  const { data } = await sb.from('rh_funcionarios').select('id,nome,status').order('nome');
  const sel = document.getElementById('histFuncionario');
  sel.innerHTML = (data || []).map(f => `<option value="${f.id}">${escapeHtml(f.nome)}${f.status==='desligado'?' (desligado)':''}</option>`).join('');
  if (data && data.length) carregarHistorico();
}
async function carregarHistorico() {
  const fId = document.getElementById('histFuncionario').value;
  if (!fId) return;
  const { data } = await sb.from('rh_fechamentos').select('*').eq('funcionario_id', fId).order('ano', { ascending: false }).order('mes', { ascending: false });
  const el = document.getElementById('listaHistorico');
  if (!data || !data.length) { el.innerHTML = '<p class="muted">Nenhum fechamento registrado ainda.</p>'; return; }
  el.innerHTML = `<table><thead><tr><th>Mês</th><th>Bruto</th><th>Descontos</th><th>Líquido</th><th>Status</th></tr></thead><tbody>` +
    data.map(f => `<tr>
      <td>${mesNome(f.mes)}/${f.ano}</td>
      <td class="money">${fmtMoney(f.bruto)}</td>
      <td class="money neg">${fmtMoney(f.total_descontos)}</td>
      <td class="money pos">${fmtMoney(f.liquido)}</td>
      <td><span class="badge ${f.status==='fechado'?'ativo':'desligado'}">${f.status}</span></td>
    </tr>`).join('') + `</tbody></table>`;
}
