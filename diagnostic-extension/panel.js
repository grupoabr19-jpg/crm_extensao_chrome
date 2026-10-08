/* ABR CRM MVP. Dock lateral direita integrada ao WhatsApp Web. Nao envia mensagem automaticamente. */
(function () {
  'use strict';
  if (document.getElementById('abr-crm-host')) return;

  var STORE_KEY = 'abrCrmMvpConfig';
  var DEFAULT_API = 'http://127.0.0.1:10000';
  var mem = {};
  var store = (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) ? chrome.storage.local : null;

  function load(cb) {
    if (!store) return cb(mem);
    store.get(STORE_KEY, function (r) { cb((r && r[STORE_KEY]) || {}); });
  }
  function save(cfg, cb) {
    mem = cfg;
    if (!store) return cb && cb();
    var o = {}; o[STORE_KEY] = cfg;
    store.set(o, function () { cb && cb(); });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function $(id) { return sh.getElementById(id); }
  function value(id) { return ($(id).value || '').trim(); }
  function apiBase() { return (value('api') || DEFAULT_API).replace(/\/+$/, ''); }
  function say(msg, kind) {
    $('status').textContent = msg;
    $('status').className = 'status ' + (kind || '');
  }
  function request(path, opts) {
    var headers = { 'content-type': 'application/json' };
    if (value('device')) headers['x-abr-device-id'] = value('device');
    return fetch(apiBase() + path, Object.assign({ headers: headers }, opts || {})).then(function (res) {
      return res.text().then(function (txt) {
        var data = txt ? JSON.parse(txt) : null;
        if (!res.ok) {
          var err = new Error((data && data.error) || res.statusText);
          err.data = data;
          throw err;
        }
        return data;
      });
    });
  }
  function setOutput(data) {
    $('out').style.display = 'block';
    $('out').value = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  }
  function copyText(text) {
    navigator.clipboard.writeText(text).then(function () {
      say('Mensagem copiada. Revise antes de enviar no WhatsApp.', 'ok');
    }, function () {
      setOutput(text);
      say('Nao consegui copiar automaticamente; selecione o texto no painel.', 'warn');
    });
  }

  function renderHandoffs(items) {
    $('railPendCount').textContent = String(items.length || 0);
    if (!items.length) {
      $('handoffs').innerHTML = '<div class="empty">Nenhuma ficha pendente para este destino.</div>';
      return;
    }
    $('handoffs').innerHTML = items.map(function (h) {
      return '<div class="deal">' +
        '<div class="dealTop"><b>' + esc(h.protocol) + '</b><span>' + esc(h.state || 'created') + '</span></div>' +
        '<div class="dealLine">' + esc(h.destination_name) + ' - ' + esc(h.destination_department) + '</div>' +
        '<div class="dealLine">Criado em ' + esc(h.created_at) + '</div>' +
        '<div class="actions tight"><button data-copy="' + esc(h.message) + '">Copiar link</button><button class="secondary" data-claim="' + esc(h.id) + '">Assumir</button></div>' +
        '</div>';
    }).join('');
  }

  var host = document.createElement('div');
  host.id = 'abr-crm-host';
  host.style.cssText = 'position:fixed;inset:0 0 auto auto;z-index:2147483647;';
  var sh = host.attachShadow({ mode: 'open' });
  sh.innerHTML = '<style>' +
    ':host{all:initial}*{box-sizing:border-box;font-family:Arial,sans-serif;letter-spacing:0}' +
    '.dock{position:fixed;top:0;right:0;height:100vh;display:flex;align-items:stretch;pointer-events:none;color:#172033}' +
    '.rail{width:64px;height:100vh;background:#f7f8fb;border-left:1px solid #d9dee8;box-shadow:-1px 0 0 #fff inset;display:flex;flex-direction:column;align-items:center;padding:12px 8px;gap:10px;pointer-events:auto}' +
    '.brand{width:40px;height:40px;border-radius:20px;background:#253575;color:#fff;display:grid;place-items:center;font-weight:800;font-size:12px;line-height:1;box-shadow:0 2px 10px #25357533}' +
    '.railBtn{position:relative;width:44px;height:44px;border:0;border-radius:12px;background:transparent;color:#5f6675;display:grid;place-items:center;font-size:20px;cursor:pointer}' +
    '.railBtn:hover,.railBtn.active{background:#e9edf6;color:#253575}.railBtn.primary{background:#253575;color:#fff}.railBtn .badge{position:absolute;top:2px;right:1px;min-width:18px;height:18px;border-radius:9px;background:#16a765;color:#fff;border:2px solid #f7f8fb;font-size:10px;display:grid;place-items:center;font-weight:700}' +
    '.spacer{flex:1}.drawer{width:430px;max-width:calc(100vw - 64px);height:100vh;background:#fff;border-left:1px solid #cfd6e4;box-shadow:-12px 0 32px #0002;display:none;pointer-events:auto;overflow:hidden}.drawer.open{display:flex;flex-direction:column}' +
    '.top{min-height:58px;background:#253575;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:10px 14px}.topTitle{display:grid;gap:2px}.topTitle b{font-size:14px}.topTitle span{font-size:11px;color:#dfe5ff}.iconBtn{border:0;background:#eef1f8;color:#253575;border-radius:8px;width:34px;height:34px;cursor:pointer;font-size:17px}' +
    '.body{padding:12px 14px;overflow:auto}.status{min-height:18px;font-size:12px;color:#253575;margin-bottom:8px}.ok{color:#1b7f45}.warn{color:#a15c00}.err{color:#9f2d20}' +
    '.views{display:block}.view{display:none}.view.active{display:block}.section{border-bottom:1px solid #edf0f5;padding:10px 0}.section:first-child{padding-top:0}.section h3{font-size:12px;text-transform:uppercase;color:#253575;margin:0 0 8px}.hint{font-size:11px;color:#667085;margin:4px 0 8px}' +
    '.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.full{grid-column:1/-1}label{display:block;font-size:11px;color:#4b5568;margin:7px 0 3px}' +
    'input,select,textarea{width:100%;border:1px solid #cdd5e3;border-radius:7px;padding:7px;font-size:12px;background:#fff;color:#111;min-width:0}textarea{min-height:68px;resize:vertical}' +
    'button{border:0;border-radius:7px;padding:8px 10px;font-size:12px;cursor:pointer;background:#f08700;color:#fff;white-space:nowrap}button.secondary{background:#e9edf6;color:#253575}button.ghost{background:transparent;color:#253575;border:1px solid #d8deea}' +
    '.actions{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.actions.tight{margin:8px 0 0}.metricRow{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.metric{border:1px solid #e0e5ee;border-radius:8px;padding:8px;background:#fafbfe}.metric b{display:block;font-size:16px;color:#253575}.metric span{font-size:10px;color:#667085}' +
    '.pipe{display:grid;grid-template-columns:repeat(6,1fr);gap:4px;margin-top:7px}.step{height:9px;border-radius:6px;background:#dfe5ee}.step.active{background:#f08700}.step.done{background:#253575}.stepLabel{font-size:10px;color:#667085;margin-top:4px}' +
    '.qual{display:grid;grid-template-columns:1fr 1fr;gap:8px}.score{border:1px solid #e0e5ee;border-radius:8px;padding:8px;background:#fbfcff}.score strong{font-size:12px;color:#253575}.chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.chip{border-radius:999px;background:#eef1f8;color:#253575;padding:4px 7px;font-size:11px}.chip.hot{background:#fff1e3;color:#9a4d00}.chip.good{background:#e9f8ef;color:#146c3b}' +
    '.deal{border:1px solid #d8deea;border-radius:8px;padding:9px;margin:8px 0;background:#fff}.dealTop{display:flex;justify-content:space-between;gap:8px}.dealTop b{font-size:12px;color:#253575}.dealTop span{font-size:10px;color:#146c3b;background:#e9f8ef;border-radius:999px;padding:2px 6px}.dealLine{font-size:11px;color:#566174;margin-top:4px}.empty{font-size:12px;color:#667085;padding:8px 0}' +
    '#out{display:none;height:160px;font:11px Consolas,monospace;margin-top:8px;border:1px solid #d8deea;border-radius:7px}.miniLogo{width:28px;height:28px;border-radius:14px;background:#253575;color:#fff;display:grid;place-items:center;font-size:9px;font-weight:800}' +
    '</style>' +
    '<div class="dock"><section class="drawer open" id="drawer">' +
    '<div class="top"><div class="topTitle"><b id="title">Ficha CRM</b><span id="subtitle">Qualificacao e funil ABR</span></div><button class="iconBtn" id="collapse" title="Recolher">›</button></div>' +
    '<div class="body"><div class="status" id="status"></div><div class="views">' +
    '<div class="view active" id="case">' +
      '<div class="section"><h3>Qualificacao</h3><div class="metricRow"><div class="metric"><b id="leadScore">0%</b><span>completo</span></div><div class="metric"><b id="tempLabel">Morno</b><span>temperatura</span></div><div class="metric"><b id="potLabel">Medio</b><span>potencial</span></div></div>' +
      '<div class="pipe"><span class="step done"></span><span class="step active"></span><span class="step"></span><span class="step"></span><span class="step"></span><span class="step"></span></div><div class="stepLabel">Novo Lead -> Contato -> Qualificacao -> Cotacao -> Ganho/Perda</div></div>' +
      '<div class="section"><h3>Contato</h3><div class="grid"><div><label>Nome</label><input id="name" placeholder="Cliente"></div><div><label>Telefone</label><input id="phone" placeholder="+5511999999999"></div><div><label>Empresa</label><input id="company"></div><div><label>Origem</label><select id="source"><option>Nao informado</option><option>Instagram</option><option>Facebook</option><option>LinkedIn</option><option>Google</option><option>Feiras/Eventos</option></select></div><div><label>Cidade</label><input id="city"></div><div><label>UF</label><input id="uf" maxlength="2"></div></div></div>' +
      '<div class="section"><h3>Negocio</h3><div class="grid"><div><label>Segmento</label><select id="segment"><option></option><option>Cliente Final</option><option>Construtoras</option><option>Deposito (Armadores)</option><option>Distribuidores</option><option>Industria de Transformacao</option><option>Revendedores</option><option>Revendas</option><option>Construcao Civil</option><option>Arquitetura</option><option>Pedreiro</option></select></div><div><label>Departamento</label><select id="department"><option>Vendas</option><option>Financeiro</option><option>Expedicao</option><option>SAC</option><option>Pos-venda</option></select></div><div><label>Funil</label><select id="pipeline"><option>VAREJO</option><option>ATACADO</option><option>Pos-Venda</option><option>Reativacao</option><option>Liderancas</option></select></div><div><label>Etapa</label><select id="stage"><option>Novo Lead</option><option>Contato</option><option>Qualificacao</option><option>Cotacao</option><option>Venda ganha</option><option>Venda perdida</option></select></div><div><label>Potencial</label><select id="potential"><option>Medio</option><option>Baixo</option><option>Alto</option><option>Conta-chave</option><option>Nao classificado</option></select></div><div><label>Temperatura</label><select id="temperature"><option>Morno</option><option>Quente</option><option>Frio</option><option>Nao classificado</option></select></div><div class="full"><label>Necessidade / resumo da triagem</label><textarea id="need" placeholder="Produto, quantidade, medidas, contexto e restricoes informadas pelo cliente"></textarea></div><div><label>Responsavel</label><input id="responsibleName" value="Vendedor ABR"></div><div><label>WhatsApp responsavel</label><input id="responsiblePhone" placeholder="+5511999990001"></div><div><label>Proxima tarefa</label><input id="nextTask" placeholder="Retornar, cotar, confirmar dados..."></div><div><label>Valor estimado interno</label><input id="saleValue" placeholder="Nao preencher se desconhecido"></div></div><div class="chips"><span class="chip good">Humano pode assumir</span><span class="chip">IA supervisionada</span><span class="chip hot">Nao prometer preco/prazo</span></div><div class="actions"><button id="createCase">Criar ficha + link</button><button class="secondary" id="listCases">Listar fichas</button></div></div>' +
    '</div>' +
    '<div class="view" id="dest"><div class="section"><h3>Fila do responsavel</h3><label>Telefone destino</label><input id="destinationPhone" placeholder="+5511999990001"><div class="actions"><button id="pending">Buscar pendentes</button><button class="secondary" id="refreshPend">Atualizar</button></div><div id="handoffs"></div></div></div>' +
    '<div class="view" id="tasks"><div class="section"><h3>Notas e tarefas</h3><label>Nota interna</label><textarea id="note" placeholder="Nao vai para o WhatsApp"></textarea><label>Tarefa</label><input id="task" placeholder="Ex.: ligar amanha as 9h"><div class="actions"><button class="secondary" id="holdAi">Pausar IA</button><button class="secondary" id="resumeAi">Retomar triagem</button><button class="ghost" id="finish">Concluir</button></div><div class="hint">MVP local: notas e tarefas ficam no painel ate a proxima recarga.</div></div></div>' +
    '<div class="view" id="cfg"><div class="section"><h3>Conexao</h3><label>API</label><input id="api" value="' + DEFAULT_API + '"><div class="grid"><div><label>Modo</label><select id="mode"><option value="main">Principal</option><option value="destination">Destino</option></select></div><div><label>Telefone local</label><input id="localPhone" placeholder="+5511999990000"></div></div><label>Device ID</label><input id="device" readonly><div class="actions"><button id="health">Testar API</button><button class="secondary" id="register">Registrar dispositivo</button><button class="secondary" id="save">Salvar</button></div></div></div>' +
    '<div class="view" id="diag"><div class="section"><h3>Diagnostico</h3><label>Cenario</label><select id="scenario"><option value="mvp-chat-aberto">chat aberto</option><option value="mvp-sem-conversa">sem conversa aberta</option><option value="mvp-observacao">janela de observacao</option></select><div class="actions"><button id="snapshot">Enviar snapshot</button><button class="secondary" id="observe">Observar 15s</button></div></div></div>' +
    '<textarea id="out" readonly></textarea></div></div></section>' +
    '<nav class="rail"><div class="brand">ABR</div><button class="railBtn primary active" data-tab="case" title="Ficha">◆</button><button class="railBtn" id="openKanban" title="Abrir Kanban CRM">▦</button><button class="railBtn" data-tab="dest" title="Fila"><span>☰</span><span class="badge" id="railPendCount">0</span></button><button class="railBtn" data-tab="tasks" title="Notas e tarefas">□</button><button class="railBtn" data-tab="cfg" title="Conexao">⚙</button><button class="railBtn" data-tab="diag" title="Diagnostico">!</button><div class="spacer"></div><div class="miniLogo">CRM</div></nav></div>';
  document.documentElement.appendChild(host);

  function activate(tab) {
    var titles = {
      case: ['Ficha CRM', 'Qualificacao e funil ABR'],
      dest: ['Fila', 'Handoffs e pendencias'],
      tasks: ['Notas', 'Acoes internas'],
      cfg: ['Conexao', 'API, dispositivo e modo'],
      diag: ['Diagnostico', 'Capacidades do WhatsApp Web']
    };
    Array.prototype.forEach.call(sh.querySelectorAll('.railBtn'), function (b) { b.classList.toggle('active', b.getAttribute('data-tab') === tab); });
    Array.prototype.forEach.call(sh.querySelectorAll('.view'), function (v) { v.classList.toggle('active', v.id === tab); });
    $('drawer').classList.add('open');
    $('title').textContent = titles[tab][0];
    $('subtitle').textContent = titles[tab][1];
  }
  function updateQualification() {
    var ids = ['name', 'phone', 'city', 'uf', 'segment', 'department', 'need', 'responsiblePhone'];
    var filled = ids.filter(function (id) { return value(id); }).length;
    $('leadScore').textContent = Math.round((filled / ids.length) * 100) + '%';
    $('tempLabel').textContent = value('temperature') || 'Morno';
    $('potLabel').textContent = value('potential') || 'Medio';
  }

  Array.prototype.forEach.call(sh.querySelectorAll('.railBtn'), function (b) {
    b.onclick = function () { activate(b.getAttribute('data-tab')); };
  });
  $('collapse').onclick = function () { $('drawer').classList.toggle('open'); };
  $('openKanban').onclick = function () { window.open(apiBase() + '/crm', '_blank', 'noopener,noreferrer'); };
  Array.prototype.forEach.call(sh.querySelectorAll('input,select,textarea'), function (el) {
    el.addEventListener('input', updateQualification);
    el.addEventListener('change', updateQualification);
  });

  load(function (cfg) {
    $('api').value = cfg.api || DEFAULT_API;
    $('mode').value = cfg.mode || 'main';
    $('localPhone').value = cfg.localPhone || '';
    $('device').value = cfg.deviceId || '';
    $('destinationPhone').value = cfg.localPhone || '';
    updateQualification();
  });

  $('save').onclick = function () {
    save({ api: value('api'), mode: value('mode'), localPhone: value('localPhone'), deviceId: value('device') }, function () {
      say('Configuracao salva.', 'ok');
    });
  };
  $('health').onclick = function () {
    say('Testando API...');
    request('/healthz').then(function (data) {
      setOutput(data);
      say('API online: ' + data.service + ' (' + data.mode + ')', 'ok');
    }).catch(function (err) { say('Falha na API: ' + err.message, 'err'); });
  };
  $('register').onclick = function () {
    say('Registrando dispositivo...');
    request('/v1/devices/register', {
      method: 'POST',
      body: JSON.stringify({ label: 'Chrome WhatsApp Web', mode: value('mode'), localPhone: value('localPhone') })
    }).then(function (data) {
      $('device').value = data.device.id;
      $('destinationPhone').value = data.device.local_phone || value('localPhone');
      $('save').onclick();
      setOutput(data);
      say('Dispositivo registrado.', 'ok');
    }).catch(function (err) { say('Falha ao registrar: ' + err.message, 'err'); });
  };
  $('createCase').onclick = function () {
    say('Criando ficha...');
    request('/v1/cases', {
      method: 'POST',
      body: JSON.stringify({
        name: value('name'),
        phone: value('phone'),
        company: value('company'),
        city: value('city'),
        uf: value('uf').toUpperCase(),
        source: value('source'),
        segment: value('segment'),
        department: value('department'),
        pipeline: value('pipeline'),
        stage: value('stage'),
        potential: value('potential'),
        temperature: value('temperature'),
        need: value('need'),
        nextTask: value('nextTask'),
        saleValue: value('saleValue'),
        responsibleName: value('responsibleName'),
        responsiblePhone: value('responsiblePhone')
      })
    }).then(function (data) {
      setOutput(data);
      copyText(data.handoff.message);
      say('Ficha criada e disponivel para o responsavel.', 'ok');
      activate('dest');
      $('pending').onclick();
    }).catch(function (err) {
      say('Falha ao criar ficha: ' + err.message, 'err');
      setOutput(err.data || err.message);
    });
  };
  $('listCases').onclick = function () {
    request('/v1/cases').then(function (data) { setOutput(data); say('Fichas carregadas.', 'ok'); })
      .catch(function (err) { say('Falha ao listar: ' + err.message, 'err'); });
  };
  function loadPending() {
    var q = value('destinationPhone') ? '?destination_phone=' + encodeURIComponent(value('destinationPhone')) : '';
    request('/v1/handoffs/pending' + q).then(function (data) {
      renderHandoffs(data.items || []);
      setOutput(data);
      say('Fila atualizada.', 'ok');
    }).catch(function (err) { say('Falha ao buscar pendencias: ' + err.message, 'err'); });
  }
  $('pending').onclick = loadPending;
  $('refreshPend').onclick = loadPending;
  $('handoffs').onclick = function (ev) {
    var copy = ev.target && ev.target.getAttribute && ev.target.getAttribute('data-copy');
    if (copy) return copyText(copy);
    var id = ev.target && ev.target.getAttribute && ev.target.getAttribute('data-claim');
    if (!id) return;
    request('/v1/handoffs/' + encodeURIComponent(id) + '/claim', { method: 'POST', body: '{}' }).then(function (data) {
      setOutput(data);
      say('Atendimento assumido. IA pausada para este atendimento.', 'ok');
      loadPending();
    }).catch(function (err) { say('Falha ao assumir: ' + err.message, 'err'); });
  };
  $('holdAi').onclick = function () { say('IA pausada neste atendimento (estado local MVP).', 'warn'); };
  $('resumeAi').onclick = function () { say('Triagem marcada para retomada supervisionada (estado local MVP).', 'ok'); };
  $('finish').onclick = function () { say('Atendimento marcado como concluido no painel local MVP.', 'ok'); };
  $('snapshot').onclick = function () {
    if (!window.ABRProbe) return say('Probe nao carregado.', 'err');
    var payload = window.ABRProbe.snapshot(document, value('scenario'));
    request('/v1/observations', { method: 'POST', body: JSON.stringify({ kind: 'snapshot', payload: payload }) })
      .then(function (data) { setOutput(data); say('Snapshot enviado ao backend.', 'ok'); })
      .catch(function (err) { say('Falha ao enviar snapshot: ' + err.message, 'err'); });
  };
  $('observe').onclick = function () {
    if (!window.ABRProbe) return say('Probe nao carregado.', 'err');
    say('Observando 15 segundos...');
    window.ABRProbe.observe(document, 15000).then(function (payload) {
      return request('/v1/observations', { method: 'POST', body: JSON.stringify({ kind: 'observe_15s', payload: payload }) });
    }).then(function (data) { setOutput(data); say('Observacao enviada.', 'ok'); })
      .catch(function (err) { say('Falha na observacao: ' + err.message, 'err'); });
  };
})();
