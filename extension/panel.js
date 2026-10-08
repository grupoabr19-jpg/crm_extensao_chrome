/* ABR CRM MVP. Dock lateral direita integrada ao WhatsApp Web. Nao envia mensagem automaticamente. */
(function () {
  'use strict';
  if (document.getElementById('abr-crm-host')) return;

  var STORE_KEY = 'abrCrmMvpConfig';
  var AUTH_KEY = 'abrCrmSession';
  var DEFAULT_API = 'https://abr-crm-api.onrender.com';
  var OPTION_FIELDS = [
    { key: 'sourceOptions', settingsId: 'cfgSourceOptions', defaultId: 'cfgDefaultSource', formId: 'source', values: ['Não informado', 'Instagram', 'Facebook', 'LinkedIn', 'Google', 'Feiras/Eventos'], fallback: 'Não informado' },
    { key: 'segmentOptions', settingsId: 'cfgSegmentOptions', defaultId: 'cfgDefaultSegment', formId: 'segment', values: ['Cliente Final', 'Construtoras', 'Deposito (Armadores)', 'Distribuidores', 'Industria de Transformacao', 'Revendedores', 'Revendas', 'Construcao Civil', 'Arquitetura', 'Pedreiro'], fallback: 'Construtoras' },
    { key: 'departmentOptions', settingsId: 'cfgDepartmentOptions', defaultId: 'cfgDefaultDepartment', formId: 'department', values: ['Vendas', 'Financeiro', 'Expedicao', 'SAC', 'Pos-venda'], fallback: 'Vendas' },
    { key: 'pipelineOptions', settingsId: 'cfgPipelineOptions', defaultId: 'cfgDefaultPipeline', formId: null, values: ['VAREJO', 'ATACADO', 'Pos-Venda', 'Reativacao', 'Liderancas'], fallback: 'VAREJO' },
    { key: 'stageOptions', settingsId: 'cfgStageOptions', defaultId: 'cfgDefaultStage', formId: null, values: ['Novo Lead', 'Contato', 'Qualificacao', 'Cotacao', 'Venda ganha', 'Venda perdida'], fallback: 'Novo Lead' },
    { key: 'potentialOptions', settingsId: 'cfgPotentialOptions', defaultId: 'cfgDefaultPotential', formId: 'potential', values: ['Medio', 'Baixo', 'Alto', 'Conta-chave', 'Nao classificado'], fallback: 'Medio' },
    { key: 'temperatureOptions', settingsId: 'cfgTemperatureOptions', defaultId: 'cfgDefaultTemperature', formId: 'temperature', values: ['Morno', 'Quente', 'Frio', 'Nao classificado'], fallback: 'Morno' }
  ];
  var TEXT_DEFAULTS = [
    { key: 'defaultResponsibleName', id: 'cfgDefaultResponsibleName', formId: 'responsibleName', fallback: 'Vendedor ABR' },
    { key: 'defaultResponsiblePhone', id: 'cfgDefaultResponsiblePhone', formId: 'responsiblePhone', fallback: '' },
    { key: 'defaultNextTask', id: 'cfgDefaultNextTask', formId: 'nextTask', fallback: '' },
    { key: 'defaultSaleValue', id: 'cfgDefaultSaleValue', formId: 'saleValue', fallback: '' }
  ];
  var crmFunnels = [];
  var crmCases = [];
  var activeCaseId = '';
  var activePipelineId = '';
  var authToken = '';
  var authOrigin = '';
  var authRevision = 0;
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
  function apiOrigin() {
    try { return new URL(apiBase()).origin; } catch (_) { return ''; }
  }
  function say(msg, kind) {
    $('status').textContent = msg;
    $('status').className = 'status ' + (kind || '');
  }
  function request(path, opts) {
    var headers = { 'content-type': 'application/json' };
    if (value('device')) headers['x-abr-device-id'] = value('device');
    var requestOptions = Object.assign({}, opts || {});
    requestOptions.headers = Object.assign(headers, requestOptions.headers || {});
    var origin = apiOrigin();
    if (authToken && authOrigin === origin && path !== '/v1/auth/login') {
      requestOptions.headers.authorization = 'Bearer ' + authToken;
    }
    var requestToken = authToken;
    return fetch(apiBase() + path, requestOptions).then(function (res) {
      return res.text().then(function (txt) {
        if (requestToken !== authToken) throw new Error('session_changed');
        var data = txt ? JSON.parse(txt) : null;
        if (!res.ok) {
          if (res.status === 401 && authToken && path !== '/v1/auth/login') clearSession(true);
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
  function findFunnel(identifier) {
    return crmFunnels.find(function (funnel) {
      return funnel.id === identifier || String(funnel.name || '').toLowerCase() === String(identifier || '').toLowerCase();
    }) || null;
  }
  function funnelForCase(crmCase) {
    return crmCase ? findFunnel(crmCase.fields && crmCase.fields.pipeline) : null;
  }
  function stageForCase(funnel, crmCase) {
    var currentName = crmCase && crmCase.fields && crmCase.fields.stage;
    return funnel && (funnel.stages || []).find(function (stage) {
      return String(stage.name || '').toLowerCase() === String(currentName || '').toLowerCase();
    }) || null;
  }
  function appendOption(select, valueText, labelText) {
    var option = document.createElement('option');
    option.value = valueText;
    option.textContent = labelText;
    select.appendChild(option);
  }
  function setFormSelect(id, selected) {
    var select = $(id);
    var normalized = String(selected || '');
    var values = { low: 'Baixo', medium: 'Medio', high: 'Alto', key_account: 'Conta-chave', hot: 'Quente', warm: 'Morno', cold: 'Frio' };
    if (values[normalized]) normalized = values[normalized];
    if (normalized && !Array.prototype.some.call(select.options, function (option) { return option.value === normalized; })) {
      appendOption(select, normalized, normalized);
    }
    select.value = normalized;
  }
  function setCaseForm(crmCase) {
    var fields = crmCase && crmCase.fields || {};
    var defaults = {
      source: value('cfgDefaultSource'), segment: value('cfgDefaultSegment'),
      department: value('cfgDefaultDepartment'), potential: value('cfgDefaultPotential'),
      temperature: value('cfgDefaultTemperature')
    };
    $('name').value = crmCase && crmCase.contact && crmCase.contact.name || '';
    $('phone').value = crmCase && crmCase.contact && crmCase.contact.phone || '';
    $('company').value = fields.company || '';
    $('city').value = fields.city || '';
    $('uf').value = fields.uf || '';
    $('need').value = fields.need || '';
    $('saleValue').value = crmCase
      ? (fields.saleValue == null ? '' : String(fields.saleValue))
      : value('cfgDefaultSaleValue');
    ['source', 'segment', 'department', 'potential', 'temperature'].forEach(function (id) {
      setFormSelect(id, crmCase ? fields[id] || '' : defaults[id] || '');
    });
    $('responsibleName').value = crmCase && crmCase.owner && crmCase.owner.name || value('cfgDefaultResponsibleName') || 'Vendedor ABR';
    $('responsiblePhone').value = crmCase && crmCase.owner && crmCase.owner.phone || value('cfgDefaultResponsiblePhone');
    $('nextTask').value = crmCase ? '' : value('cfgDefaultNextTask');
    var editing = !!(crmCase && crmCase.id);
    $('createCase').textContent = editing ? 'Salvar alterações' : 'Criar ficha + link';
    $('responsibleName').disabled = editing;
    $('responsiblePhone').disabled = editing;
    $('nextTask').disabled = editing;
    $('responsibleName').title = editing ? 'Para trocar o responsável, faça uma transferência.' : '';
    $('responsiblePhone').title = editing ? 'Para trocar o responsável, faça uma transferência.' : '';
    $('nextTask').title = editing ? 'Para não criar tarefas duplicadas, cadastre novas tarefas pela área de tarefas.' : '';
    updateQualification();
  }
  function caseFormPayload() {
    return {
      name: value('name'), phone: value('phone'), company: value('company'),
      city: value('city'), uf: value('uf').toUpperCase(), source: value('source'),
      segment: value('segment'), department: value('department'),
      pipeline: value('cfgDefaultPipeline'), stage: value('cfgDefaultStage'),
      potential: value('potential'), temperature: value('temperature'),
      need: value('need'), nextTask: value('nextTask'), saleValue: value('saleValue'),
      responsibleName: value('responsibleName'), responsiblePhone: value('responsiblePhone')
    };
  }
  function startNewCase() {
    activeCaseId = '';
    $('activeCase').value = '';
    setCaseForm(null);
    renderPipelineTracker();
    say('Preencha os dados e crie uma nova ficha.', 'ok');
  }
  function renderPipelineTracker() {
    var pipelineSelect = $('activePipeline');
    var stageSelect = $('activeStage');
    var selectedCase = crmCases.find(function (item) { return item.id === activeCaseId; }) || null;
    var actualFunnel = funnelForCase(selectedCase);
    if (actualFunnel && !activePipelineId) activePipelineId = actualFunnel.id;
    if (!findFunnel(activePipelineId)) activePipelineId = actualFunnel ? actualFunnel.id : (crmFunnels[0] && crmFunnels[0].id) || '';

    while (pipelineSelect.firstChild) pipelineSelect.removeChild(pipelineSelect.firstChild);
    crmFunnels.forEach(function (funnel) { appendOption(pipelineSelect, funnel.id, funnel.name); });
    pipelineSelect.value = activePipelineId;

    var funnel = findFunnel(activePipelineId);
    var stages = funnel ? (funnel.stages || []).slice().sort(function (a, b) { return Number(a.position) - Number(b.position); }) : [];
    var actualStage = actualFunnel && actualFunnel.id === activePipelineId ? stageForCase(actualFunnel, selectedCase) : null;
    var selectedStageId = actualStage ? actualStage.id : '';
    while (stageSelect.firstChild) stageSelect.removeChild(stageSelect.firstChild);
    appendOption(stageSelect, '', selectedCase ? 'Selecione uma etapa para mover' : 'Selecione um lead primeiro');
    if (selectedCase) stages.forEach(function (stage) { appendOption(stageSelect, stage.id, stage.name); });
    stageSelect.disabled = !selectedCase || stages.length === 0;
    if (selectedStageId) stageSelect.value = selectedStageId;

    var progress = $('pipelineSteps');
    progress.textContent = '';
    var currentIndex = stages.findIndex(function (stage) { return stage.id === selectedStageId; });
    stages.forEach(function (stage, index) {
      var item = document.createElement('span');
      item.className = 'step ' + (index === currentIndex ? 'current' : index < currentIndex ? 'entered' : 'future');
      item.setAttribute('aria-label', stage.name + (index === currentIndex ? ', etapa atual' : index < currentIndex ? ', etapa já percorrida' : ''));
      item.title = stage.name;
      progress.appendChild(item);
    });
    $('pipelineProgressLabel').textContent = selectedCase
      ? (actualFunnel && actualFunnel.id === activePipelineId
        ? 'Etapa atual: ' + ((actualStage && actualStage.name) || 'não identificada') + (selectedCase.fields.pipeline ? ' · ' + selectedCase.fields.pipeline : '')
        : 'Selecione uma etapa para mover esta ficha para o funil escolhido.')
      : 'Selecione ou crie uma ficha para acompanhar o funil.';
  }
  function renderCaseOptions() {
    var select = $('activeCase');
    while (select.firstChild) select.removeChild(select.firstChild);
    appendOption(select, '', 'Selecione uma ficha do cliente');
    crmCases.forEach(function (crmCase) {
      var fields = crmCase.fields || {};
      var name = crmCase.contact && crmCase.contact.name || fields.company || 'Lead';
      var details = [fields.pipeline, fields.stage].filter(Boolean).join(' · ');
      appendOption(select, crmCase.id, name + (details ? ' — ' + details : ''));
    });
    select.value = activeCaseId;
    renderPipelineTracker();
  }
  function loadCrmData(preferredCaseId) {
    var revision = authRevision;
    if (!authToken) return Promise.reject(new Error('unauthorized'));
    return Promise.all([request('/v1/funnels'), request('/v1/cases')]).then(function (results) {
      if (!authToken || revision !== authRevision) throw new Error('session_changed');
      crmFunnels = (results[0].items || []).filter(function (funnel) { return (funnel.stages || []).length > 0; });
      crmCases = results[1].items || [];
      if (preferredCaseId && crmCases.some(function (item) { return item.id === preferredCaseId; })) activeCaseId = preferredCaseId;
      else if (!crmCases.some(function (item) { return item.id === activeCaseId; })) activeCaseId = '';
      var selectedCase = crmCases.find(function (item) { return item.id === activeCaseId; });
      var selectedFunnel = funnelForCase(selectedCase);
      activePipelineId = selectedFunnel ? selectedFunnel.id : (crmFunnels[0] && crmFunnels[0].id) || '';
      renderCaseOptions();
      return { cases: crmCases, funnels: crmFunnels };
    });
  }
  function moveActiveCaseToStage(stageId) {
    var current = crmCases.find(function (item) { return item.id === activeCaseId; });
    if (!current || !stageId) return;
    var actualStage = stageForCase(funnelForCase(current), current);
    if (actualStage && actualStage.id === stageId) {
      activePipelineId = (funnelForCase(current) || {}).id || activePipelineId;
      renderPipelineTracker();
      return;
    }
    var stageSelect = $('activeStage');
    stageSelect.disabled = true;
    $('activeCase').disabled = true;
    say('Movendo ficha no Kanban...');
    request('/v1/cases/' + encodeURIComponent(current.id) + '/stage', {
      method: 'POST',
      body: JSON.stringify({ stageId: stageId })
    }).then(function (result) {
      if (result.case) {
        var index = crmCases.findIndex(function (item) { return item.id === result.case.id; });
        if (index >= 0) crmCases[index] = result.case;
      }
      return loadCrmData(current.id);
    }).then(function () {
      say('Etapa atualizada. O card do Kanban já reflete esta mudança.', 'ok');
    }).catch(function (err) {
      activePipelineId = (funnelForCase(current) || {}).id || activePipelineId;
      renderPipelineTracker();
      say('Não foi possível mover a ficha: ' + err.message, 'err');
    }).finally(function () {
      $('activeCase').disabled = false;
      renderPipelineTracker();
    });
  }

  var host = document.createElement('div');
  host.id = 'abr-crm-host';
  host.style.cssText = 'position:fixed;inset:0 0 auto auto;z-index:2147483647;';
  var pageTheme = document.createElement('style');
  pageTheme.id = 'abr-crm-page-theme';
  pageTheme.textContent = [
    '@media (min-width:1200px) and (min-height:600px) {',
    'html.abr-crm-open body,html.abr-crm-open #app { width:calc(100vw - 488px)!important; max-width:calc(100vw - 488px)!important; min-width:0!important; box-sizing:border-box!important; transition:width .2s ease,max-width .2s ease; }',
    'html.abr-crm-open #app #side { flex:0 0 clamp(280px,26vw,380px)!important; width:clamp(280px,26vw,380px)!important; max-width:clamp(280px,26vw,380px)!important; min-width:0!important; }',
    'html.abr-crm-open #app #main { flex:1 1 0!important; width:auto!important; min-width:0!important; }',
    '}',
    'html.abr-crm-open #app #side [aria-selected="true"] { box-shadow:inset 3px 0 #ed8922!important; }',
    '@media (prefers-reduced-motion:reduce) { html.abr-crm-open body,html.abr-crm-open #app { transition:none!important; } }'
  ].join('');
  document.head.appendChild(pageTheme);
  var sh = host.attachShadow({ mode: 'open' });
  sh.innerHTML = '<style>' + `
:host{all:initial;color:#19263b;--ink:#19263b;--muted:#758398;--line:#e6eaf0;--paper:#fff;--canvas:#f5f7fa;--navy:#172641;--orange:#ed8922;--orange-dark:#cf6f11;--green:#26835a;--red:#b95048;--shadow:0 12px 34px rgba(22,39,66,.14);font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}*{box-sizing:border-box;font-family:inherit;letter-spacing:-.01em}.dock{position:fixed;top:0;right:0;height:100vh;display:flex;align-items:stretch;pointer-events:none;color:var(--ink);-webkit-font-smoothing:antialiased}.rail{width:68px;height:100vh;background:var(--navy);border-left:1px solid #ffffff12;display:flex;flex-direction:column;align-items:center;padding:12px 8px;gap:9px;pointer-events:auto;z-index:2}.brand{width:38px;height:38px;border-radius:12px;background:linear-gradient(145deg,#ffb64f,#ee8419);color:#fff;display:grid;place-items:center;font-weight:850;font-size:11px;letter-spacing:.05em;box-shadow:0 5px 13px #ee8a2235;margin-bottom:8px}.railBtn{position:relative;width:44px;height:44px;flex:none;border:1px solid transparent;border-radius:13px;background:transparent;color:#a9b8cc;display:grid;place-items:center;cursor:pointer;padding:0;transition:background .18s ease,color .18s ease,transform .18s ease,border-color .18s ease}.railBtn svg{width:19px;height:19px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.railBtn:hover,.railBtn:focus-visible{background:#ffffff12;color:#fff}.railBtn:focus-visible,.iconBtn:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid #ef9c45a3;outline-offset:2px}.railBtn.active{background:#ffffff17;border-color:#ffffff12;color:#fff;box-shadow:inset 3px 0 0 var(--orange)}.railBtn.primary{color:#ffb04b}.railBtn .badge{position:absolute;top:0;right:-1px;min-width:18px;height:18px;border-radius:9px;background:#35a878;color:#fff;border:2px solid var(--navy);font-size:9px;display:grid;place-items:center;font-weight:750;padding:0 4px}.railBtn:after{content:attr(title);position:absolute;right:calc(100% + 9px);top:50%;transform:translateY(-50%) translateX(4px);padding:7px 9px;border:1px solid #31435e;border-radius:8px;background:#172641;color:#fff;font-size:11px;font-weight:620;white-space:nowrap;box-shadow:0 6px 18px #0f1d322c;opacity:0;visibility:hidden;pointer-events:none;transition:opacity .16s ease,transform .16s ease,visibility .16s}.railBtn:hover:after,.railBtn:focus-visible:after{opacity:1;visibility:visible;transform:translateY(-50%) translateX(0)}.spacer{flex:1}.miniLogo{width:30px;height:30px;border:1px solid #ffffff1a;border-radius:10px;background:#ffffff0c;color:#d5deea;display:grid;place-items:center;font-size:8px;letter-spacing:.07em;font-weight:800}.drawer{width:420px;max-width:calc(100vw - 68px);height:100vh;background:var(--canvas);border-left:1px solid #dfe5ed;box-shadow:var(--shadow);display:none;pointer-events:auto;overflow:hidden}.drawer.open{display:flex;flex-direction:column}.top{position:relative;min-height:70px;background:#fff;color:var(--ink);display:flex;align-items:center;justify-content:space-between;padding:13px 15px 12px 19px;border-bottom:1px solid var(--line)}.top:before{content:"";position:absolute;left:0;top:15px;bottom:15px;width:3px;border-radius:0 4px 4px 0;background:var(--orange)}.topTitle{display:grid;gap:4px}.topTitle b{font-size:15px;line-height:1.2;letter-spacing:-.03em;font-weight:740;color:var(--ink)}.topTitle span{font-size:11px;color:var(--muted)}.iconBtn{border:1px solid var(--line);background:#fff;color:#5a6b82;border-radius:10px;width:34px;height:34px;display:grid;place-items:center;cursor:pointer;font-size:18px;transition:background .16s,color .16s,border-color .16s}.iconBtn:hover{background:#f8f9fb;color:var(--ink);border-color:#cfd7e2}.body{padding:13px 14px 22px;overflow:auto;scrollbar-width:thin;scrollbar-color:#cbd3df transparent}.status{display:block;min-height:0;font-size:11px;font-weight:600;line-height:1.45;color:#51627b;margin:0 0 9px;padding:0}.status:not(:empty){padding:9px 11px;border:1px solid #dce4ee;border-radius:9px;background:#eef3f8;margin-bottom:11px}.status:empty{display:none}.status.ok:not(:empty){color:#216b49;background:#eaf5ee;border-color:#d7eadf}.status.warn:not(:empty){color:#96601c;background:#fff5e7;border-color:#f4e4c9}.status.err:not(:empty){color:#a3413c;background:#fdf0ef;border-color:#f1ddda}.views{display:block}.view{display:none}.view.active{display:block}.section{border:1px solid var(--line);border-radius:13px;padding:14px;background:var(--paper);margin:0 0 10px;box-shadow:0 2px 5px rgba(22,39,66,.025)}.section:first-child{padding-top:14px}.section h3{font-size:13px;text-transform:none;letter-spacing:-.01em;color:#2d405b;margin:0 0 11px;font-weight:730;display:flex;align-items:center;gap:7px}.section h3:before{content:"";width:6px;height:6px;border-radius:50%;background:var(--orange);flex:none}.hint{font-size:11px;color:var(--muted);margin:5px 0 9px;line-height:1.5}.grid{display:grid;grid-template-columns:1fr 1fr;gap:7px 9px}.full{grid-column:1/-1}label{display:block;font-size:11px;color:#68788e;margin:7px 0 4px;font-weight:650;letter-spacing:.02em}input,select,textarea{width:100%;min-height:40px;border:1px solid #dfe4eb;border-radius:8px;padding:8px 10px;font-size:12px;background:#fff;color:#293a52;min-width:0;transition:border-color .16s,box-shadow .16s}input::placeholder,textarea::placeholder{color:#a1abba}input:hover,select:hover,textarea:hover{border-color:#cbd4df}input:focus,select:focus,textarea:focus{outline:none;border-color:#e8a354;box-shadow:0 0 0 3px #ed89221a}input[readonly]{background:#f5f7fa;color:#718096}textarea{min-height:74px;resize:vertical;line-height:1.45}button{min-height:38px;border:1px solid transparent;border-radius:8px;padding:0 11px;font-size:11px;font-weight:650;cursor:pointer;background:var(--orange);color:#fff;white-space:normal;transition:background .16s,border-color .16s,box-shadow .16s,transform .16s}button:hover{background:var(--orange-dark);box-shadow:0 4px 12px #ed892226}button:active{transform:translateY(1px)}button.secondary{background:#fff;color:#40536d;border-color:#dde3eb}button.secondary:hover{background:#f7f9fb;border-color:#cbd4df;box-shadow:none}button.ghost{background:transparent;color:#4e6078;border-color:#dfe4eb}button.ghost:hover{background:#f7f8fb;box-shadow:none}.actions{display:flex;gap:7px;flex-wrap:wrap;margin:11px 0 0}.actions>button{flex:1 1 auto}.actions.tight{margin:9px 0 0}.metricRow{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.metric{min-width:0;border:1px solid #e7ebf1;border-radius:10px;padding:9px 8px;background:#fafbfc}.metric b{display:block;font-size:17px;line-height:1.1;color:#2d4261;letter-spacing:-.04em;font-weight:760;overflow-wrap:anywhere}.metric span{display:block;font-size:10px;color:var(--muted);margin-top:5px;line-height:1.25}.metric:first-child b{color:var(--orange-dark)}.pipe{display:grid;grid-template-columns:repeat(6,1fr);gap:4px;margin-top:12px}.step{height:5px;border-radius:9px;background:#e5e9ef}.step.active{background:var(--orange)}.step.done{background:#7890ae}.stepLabel{font-size:10px;line-height:1.5;color:#718096;margin-top:6px}.qual{display:grid;grid-template-columns:1fr 1fr;gap:8px}.score{border:1px solid var(--line);border-radius:9px;padding:9px;background:#fafbfc}.score strong{font-size:12px;color:#2d4261}.chips{display:flex;gap:5px;flex-wrap:wrap;margin-top:10px}.chip{border:1px solid #e5e9f0;border-radius:999px;background:#f4f6f9;color:#5c6c82;padding:5px 8px;font-size:10px;font-weight:600}.chip.hot{background:#fff5e8;border-color:#f4e4ca;color:#9a5a0b}.chip.good{background:#edf7f0;border-color:#dcefe2;color:#28714e}.deal{border:1px solid var(--line);border-radius:11px;padding:11px;margin:9px 0;background:#fff;box-shadow:0 2px 6px rgba(22,39,66,.035)}.dealTop{display:flex;align-items:center;justify-content:space-between;gap:8px}.dealTop b{font-size:12px;color:#2d4261}.dealTop span{font-size:10px;font-weight:650;color:#28714e;background:#edf7f0;border-radius:999px;padding:4px 7px}.dealLine{font-size:11px;color:#68788e;margin-top:5px;line-height:1.4}.empty{font-size:11px;color:#8390a1;padding:14px 10px;text-align:center;border:1px dashed #dfe4eb;border-radius:9px;background:#fafbfc}#out{display:none;height:130px;font:11px ui-monospace,SFMono-Regular,Consolas,monospace;line-height:1.5;margin-top:10px;border:1px solid var(--line);border-radius:9px;padding:10px;background:#f8f9fb;color:#42536b}.view>.section:first-child h3{margin-bottom:12px}@media(max-width:560px){.rail{width:58px;padding-inline:6px}.drawer{width:calc(100vw - 58px);max-width:calc(100vw - 58px)}.body{padding:10px 9px 18px}.top{padding-inline:13px 10px}.section{padding:11px}.grid{gap:6px}.metric{padding:8px 6px}.metric b{font-size:15px}.metric span{font-size:9px}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important;scroll-behavior:auto!important}}
` + '</style>' +
    '<div class="dock"><section class="drawer open" id="drawer" role="complementary" aria-label="Painel do CRM ABR">' +
    '<div class="top"><div class="topTitle"><b id="title">Ficha CRM</b><span id="subtitle">Qualificação e funil ABR</span></div><button class="iconBtn" id="collapse" title="Recolher painel" aria-label="Recolher painel" aria-expanded="true">×</button></div>' +
    '<div class="body"><div class="status" id="status" role="status" aria-live="polite"></div><div class="views">' +
    '<div class="view active" id="case">' +
      '<div class="section"><h3>Funil e etapa</h3><label>Ficha do cliente</label><select id="activeCase"><option value="">Carregando fichas...</option></select><div class="grid"><div><label>Funil</label><select id="activePipeline"><option value="">Carregando funis...</option></select></div><div><label>Etapa</label><select id="activeStage" disabled><option value="">Selecione um lead primeiro</option></select></div></div><div class="pipe" id="pipelineSteps" aria-label="Progresso do lead no funil"></div><div class="stepLabel" id="pipelineProgressLabel">Carregando funis e fichas...</div><div class="actions"><button class="secondary" id="refreshPipeline">Atualizar ficha</button></div></div>' +
      '<div class="section"><h3>Qualificação</h3><div class="metricRow"><div class="metric"><b id="leadScore">0%</b><span>completo</span></div><div class="metric"><b id="tempLabel">Morno</b><span>temperatura</span></div><div class="metric"><b id="potLabel">Medio</b><span>potencial</span></div></div></div>' +
      '<div class="section"><h3>Contato</h3><div class="grid"><div><label>Nome</label><input id="name" placeholder="Cliente"></div><div><label>Telefone</label><input id="phone" placeholder="+5511999999999"></div><div><label>Empresa</label><input id="company"></div><div><label>Origem</label><select id="source"><option>Não informado</option><option>Instagram</option><option>Facebook</option><option>LinkedIn</option><option>Google</option><option>Feiras/Eventos</option></select></div><div><label>Cidade</label><input id="city"></div><div><label>UF</label><input id="uf" maxlength="2"></div></div></div>' +
      '<div class="section"><h3>Negócio</h3><div class="grid"><div><label>Segmento</label><select id="segment"><option></option><option>Cliente Final</option><option>Construtoras</option><option>Deposito (Armadores)</option><option>Distribuidores</option><option>Industria de Transformacao</option><option>Revendedores</option><option>Revendas</option><option>Construcao Civil</option><option>Arquitetura</option><option>Pedreiro</option></select></div><div><label>Departamento</label><select id="department"><option>Vendas</option><option>Financeiro</option><option>Expedicao</option><option>SAC</option><option>Pos-venda</option></select></div><div><label>Funil</label><select id="pipeline"><option>VAREJO</option><option>ATACADO</option><option>Pos-Venda</option><option>Reativacao</option><option>Liderancas</option></select></div><div><label>Etapa</label><select id="stage"><option>Novo Lead</option><option>Contato</option><option>Qualificacao</option><option>Cotacao</option><option>Venda ganha</option><option>Venda perdida</option></select></div><div><label>Potencial</label><select id="potential"><option>Medio</option><option>Baixo</option><option>Alto</option><option>Conta-chave</option><option>Nao classificado</option></select></div><div><label>Temperatura</label><select id="temperature"><option>Morno</option><option>Quente</option><option>Frio</option><option>Nao classificado</option></select></div><div class="full"><label>Necessidade / resumo da triagem</label><textarea id="need" placeholder="Produto, quantidade, medidas, contexto e restricoes informadas pelo cliente"></textarea></div><div><label>Responsavel</label><input id="responsibleName" value="Vendedor ABR"></div><div><label>WhatsApp responsavel</label><input id="responsiblePhone" placeholder="+5511999990001"></div><div><label>Proxima tarefa</label><input id="nextTask" placeholder="Retornar, cotar, confirmar dados..."></div><div><label>Valor estimado interno</label><input id="saleValue" placeholder="Nao preencher se desconhecido"></div></div><div class="chips"><span class="chip good">Humano pode assumir</span><span class="chip">IA supervisionada</span><span class="chip hot">Nao prometer preco/prazo</span></div><div class="actions"><button id="createCase">Criar ficha + link</button><button class="secondary" id="listCases">Listar fichas</button></div></div>' +
    '</div>' +
    '<div class="view" id="dest"><div class="section"><h3>Fila do responsavel</h3><label>Telefone destino</label><input id="destinationPhone" placeholder="+5511999990001"><div class="actions"><button id="pending">Buscar pendentes</button><button class="secondary" id="refreshPend">Atualizar</button></div><div id="handoffs"></div></div></div>' +
    '<div class="view" id="tasks"><div class="section"><h3>Notas e tarefas</h3><label>Nota interna</label><textarea id="note" placeholder="Nao vai para o WhatsApp"></textarea><label>Tarefa</label><input id="task" placeholder="Ex.: ligar amanha as 9h"><div class="actions"><button class="secondary" id="holdAi">Pausar IA</button><button class="secondary" id="resumeAi">Retomar triagem</button><button class="ghost" id="finish">Concluir</button></div><div class="hint">MVP local: notas e tarefas ficam no painel ate a proxima recarga.</div></div></div>' +
    '<div class="view" id="cfg">' +
      '<div class="section"><h3>Conexão e dispositivo</h3><label>Endereço da API</label><input id="api" value="' + DEFAULT_API + '" placeholder="https://seu-crm.onrender.com"><div class="grid"><div><label>Perfil deste dispositivo</label><select id="mode"><option value="main">Atendimento principal</option><option value="destination">Atendimento de destino</option></select></div><div><label>Telefone WhatsApp deste dispositivo</label><input id="localPhone" placeholder="+5511999990000"></div></div><label>Identificador do dispositivo</label><input id="device" readonly><div class="hint">O ID é gerado e registrado pela API; não precisa ser preenchido manualmente.</div><div class="actions"><button id="health">Testar conexão</button><button class="secondary" id="register">Registrar dispositivo</button><button class="ghost" id="signOut">Encerrar sessão</button></div></div>' +
      '<div class="section"><h3>Preenchimento padrão da ficha</h3><div class="grid"><div><label>Responsável</label><input id="cfgDefaultResponsibleName" placeholder="Vendedor ABR"></div><div><label>WhatsApp do responsável</label><input id="cfgDefaultResponsiblePhone" placeholder="+5511999990001"></div><div class="full"><label>Próxima tarefa sugerida</label><input id="cfgDefaultNextTask" placeholder="Ex.: retornar para cotação"></div><div class="full"><label>Valor estimado padrão (opcional)</label><input id="cfgDefaultSaleValue" placeholder="Deixe vazio se não houver um valor padrão"></div></div>' +
      '<div class="grid">' +
      '<div><label>Origem padrão</label><select id="cfgDefaultSource"></select></div><div><label>Segmento padrão</label><select id="cfgDefaultSegment"></select></div>' +
      '<div><label>Departamento padrão</label><select id="cfgDefaultDepartment"></select></div><div><label>Funil padrão</label><select id="cfgDefaultPipeline"></select></div>' +
      '<div><label>Etapa padrão</label><select id="cfgDefaultStage"></select></div><div><label>Potencial padrão</label><select id="cfgDefaultPotential"></select></div>' +
      '<div class="full"><label>Temperatura padrão</label><select id="cfgDefaultTemperature"></select></div></div>' +
      '<div class="hint">Os padrões são aplicados ao criar fichas. Para mover um cliente depois, use o controle único de funil na ficha.</div></div>' +
      '<div class="section"><h3>Opções dos campos</h3><div class="hint">Edite as opções dos menus. Use uma opção por linha; as alterações afetam também os menus da ficha.</div>' +
      '<label>Origens do lead</label><textarea id="cfgSourceOptions" class="configOptions"></textarea>' +
      '<label>Segmentos de cliente</label><textarea id="cfgSegmentOptions" class="configOptions"></textarea>' +
      '<label>Departamentos</label><textarea id="cfgDepartmentOptions" class="configOptions"></textarea>' +
      '<label>Funis</label><textarea id="cfgPipelineOptions" class="configOptions"></textarea>' +
      '<label>Etapas</label><textarea id="cfgStageOptions" class="configOptions"></textarea>' +
      '<label>Potenciais</label><textarea id="cfgPotentialOptions" class="configOptions"></textarea>' +
      '<label>Temperaturas</label><textarea id="cfgTemperatureOptions" class="configOptions"></textarea>' +
      '<div class="actions"><button class="secondary" id="save">Salvar todas as configurações</button><button class="ghost" id="resetConfig">Restaurar padrões</button></div></div></div>' +
    '<div class="view" id="diag"><div class="section"><h3>Leitura observacional</h3><p class="muted">Coleta estrutura e contagens anonimizadas do WhatsApp. O relatório é enviado à API CRM; não coleta o texto das mensagens nem envia mensagens.</p><label>Cenario</label><select id="scenario"><option value="mvp-chat-aberto">chat aberto</option><option value="mvp-sem-conversa">sem conversa aberta</option><option value="mvp-observacao">janela de observacao</option></select><div class="actions"><button id="snapshot">Capturar estrutura</button><button class="secondary" id="observe">Observar 15s</button></div></div></div>' +
    '<textarea id="out" readonly></textarea></div></div></section>' +
    '<nav class="rail" aria-label="Navegação do CRM"><div class="brand" title="Grupo ABR"><span class="brandFallback">ABR</span><img src="' + chrome.runtime.getURL('brand-logo.png') + '" alt=""></div>' +
    '<button class="railBtn active" data-tab="case" title="Ficha do lead" aria-label="Ficha do lead" aria-pressed="true"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3.5" width="16" height="17" rx="2"/><circle cx="12" cy="9" r="2.5"/><path d="M8 16.5a4 4 0 0 1 8 0"/></svg></button>' +
    '<button class="railBtn" id="openKanban" title="Abrir Kanban do CRM" aria-label="Abrir Kanban do CRM"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="7" height="7" rx="1.5"/><rect x="13.5" y="4" width="7" height="4" rx="1.5"/><rect x="13.5" y="11" width="7" height="9" rx="1.5"/><rect x="3.5" y="14" width="7" height="6" rx="1.5"/></svg></button>' +
    '<button class="railBtn" data-tab="dest" title="Fila de atendimentos" aria-label="Fila de atendimentos" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4z"/><path d="M4 11h4l2 3h4l2-3h4"/></svg><span class="badge" id="railPendCount">0</span></button>' +
    '<button class="railBtn" data-tab="tasks" title="Notas e tarefas" aria-label="Notas e tarefas" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="m8 12 2.5 2.5L16 9"/></svg></button>' +
    '<button class="railBtn" data-tab="cfg" title="Conexão" aria-label="Conexão" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2h-2.6v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1A1.7 1.7 0 0 0 8 15a1.7 1.7 0 0 0-1.5-1H6.3v-2.6h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5v-.2H15v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.2V14h-.2a1.7 1.7 0 0 0-1.5 1Z"/></svg></button>' +
    '<button class="railBtn" data-tab="diag" title="Diagnóstico" aria-label="Diagnóstico" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l2-6 4 12 2-6h6"/></svg></button>' +
    '<div class="spacer"></div><div class="miniLogo" title="Grupo ABR">ABR</div></nav></div>';
  sh.querySelector('style').textContent += '.brand{position:relative;overflow:hidden;background:#263878}.brandFallback{position:absolute}.brand img{position:relative;z-index:1;width:100%;height:100%;display:block;object-fit:contain;border-radius:0;background:#263878}.pipelineControls{display:grid;grid-template-columns:1fr 1fr;gap:8px}.pipelineControls>div{min-width:0}.pipelineControls label{margin-top:10px}.pipelineControls select{font-size:12px;min-height:39px}.pipe{grid-template-columns:repeat(auto-fit,minmax(24px,1fr));gap:5px}.pipe .step{height:6px;background:#dfe4eb}.pipe .step.entered{background:#536578}.pipe .step.current{background:#ed8922;box-shadow:0 0 0 2px #ed892226}.stepLabel{min-height:30px}.caseRefresh{margin-top:9px}@media(max-width:420px){.pipelineControls{grid-template-columns:1fr}}';
  ['pipeline', 'stage'].forEach(function (id) {
    var field = $(id);
    if (field && field.parentElement) field.parentElement.remove();
  });
  document.documentElement.appendChild(host);
  sh.querySelector('.brand img').addEventListener('error', function () { this.style.display = 'none'; });
  sh.querySelector('style').textContent +=
    '[hidden]{display:none!important}.loginGate{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:24px;background:rgba(10,20,37,.78);backdrop-filter:blur(8px);pointer-events:auto}.loginCard{width:min(360px,100%);padding:26px;border:1px solid #e5eaf1;border-radius:18px;background:#fff;box-shadow:0 24px 70px #09132466;color:#19263b}.loginCard h2{margin:0;font-size:21px;letter-spacing:-.04em}.loginCard p{margin:7px 0 19px;color:#758398;font-size:12px;line-height:1.55}.loginCard label{display:block;margin:12px 0 6px;color:#52627a;font-size:11px;font-weight:650}.loginCard input{width:100%;height:42px;padding:0 11px;border:1px solid #dfe4eb;border-radius:9px;background:#fff;color:#19263b;font-size:13px}.loginCard button{width:100%;height:42px;margin-top:17px;border:0;border-radius:9px;background:#ed8922;color:#fff;font-size:13px;font-weight:700;cursor:pointer}.loginCard button:disabled{opacity:.65;cursor:wait}.loginError{min-height:18px;margin-top:9px;color:#b95048;font-size:11px}';
  var loginGate = document.createElement('div');
  loginGate.className = 'loginGate';
  loginGate.innerHTML = '<form class="loginCard" id="loginForm"><h2>Entrar no CRM ABR</h2><p>Acesse com seu usuário corporativo. As fichas só serão carregadas após a autenticação.</p><label for="loginEmail">E-mail ou usuário</label><input id="loginEmail" name="username" autocomplete="username" required placeholder="nome.sobrenome ou e-mail"><label for="loginPassword">Senha</label><input id="loginPassword" name="password" type="password" autocomplete="current-password" required><button id="loginSubmit" type="submit">Entrar</button><div class="loginError" id="loginError" role="status" aria-live="polite"></div></form>';
  sh.appendChild(loginGate);
  $('loginForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var button = $('loginSubmit');
    button.disabled = true;
    $('loginError').textContent = '';
    request('/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: value('loginEmail'), password: $('loginPassword').value })
    }).then(function (session) {
      authToken = session.token;
      authOrigin = apiOrigin();
      authRevision += 1;
      var savedSession = { token: authToken, origin: authOrigin };
      if (store) {
        var record = {}; record[AUTH_KEY] = savedSession;
        store.set(record);
      }
      $('loginPassword').value = '';
      loginGate.hidden = true;
      return loadCrmData(activeCaseId);
    }).then(function () {
      say('Sessão iniciada. Fichas carregadas com sua conta.', 'ok');
    }).catch(function (err) {
      clearSession(false);
      $('loginError').textContent = err.message === 'invalid_credentials' ? 'Usuário ou senha inválidos.' : 'Não foi possível entrar: ' + err.message;
      loginGate.hidden = false;
    }).finally(function () {
      button.disabled = false;
    });
  });
  var newCaseButton = document.createElement('button');
  newCaseButton.type = 'button';
  newCaseButton.className = 'secondary';
  newCaseButton.id = 'newCase';
  newCaseButton.textContent = 'Nova ficha';
  $('listCases').parentElement.insertBefore(newCaseButton, $('listCases'));
  newCaseButton.onclick = startNewCase;
  function syncPageDock(open) {
    document.documentElement.classList.toggle('abr-crm-open', open);
  }
  syncPageDock(true);

  function activate(tab) {
    var titles = {
      case: ['Ficha CRM', 'Qualificação e funil ABR'],
      dest: ['Fila de atendimentos', 'Transferências pendentes'],
      tasks: ['Notas e tarefas', 'Ações internas do atendimento'],
      cfg: ['Conexão', 'API, dispositivo e modo'],
      diag: ['Diagnóstico', 'Capacidades do WhatsApp Web']
    };
    Array.prototype.forEach.call(sh.querySelectorAll('.railBtn'), function (b) { var selected = b.getAttribute('data-tab') === tab; b.classList.toggle('active', selected); if (b.hasAttribute('data-tab')) b.setAttribute('aria-pressed', String(selected)); });
    Array.prototype.forEach.call(sh.querySelectorAll('.view'), function (v) { v.classList.toggle('active', v.id === tab); });
    $('drawer').classList.add('open');
    syncPageDock(true);
    $('collapse').setAttribute('aria-expanded', 'true');
    $('collapse').setAttribute('aria-label', 'Recolher painel');
    $('collapse').title = 'Recolher painel';
    $('collapse').textContent = '×';
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
  function optionValues(text, fallback) {
    var values = String(text || '').split(/[\r\n,]+/).map(function (item) { return item.trim(); }).filter(Boolean);
    return values.length ? values.filter(function (item, index) { return values.indexOf(item) === index; }) : fallback.slice();
  }
  function fillSelect(id, values, selected) {
    var select = $(id);
    while (select.firstChild) select.removeChild(select.firstChild);
    values.forEach(function (item) {
      var option = document.createElement('option');
      option.value = item;
      option.textContent = item;
      select.appendChild(option);
    });
    if (values.indexOf(selected) >= 0) select.value = selected;
    else if (values.length) select.value = values[0];
  }
  function applyOptionConfig(cfg) {
    OPTION_FIELDS.forEach(function (field) {
      var options = optionValues(cfg[field.key], field.values);
      var selected = options.indexOf(cfg[field.defaultId]) >= 0 ? cfg[field.defaultId] : field.fallback;
      if (options.indexOf(selected) < 0) selected = options[0];
      $(field.settingsId).value = options.join('\n');
      if (field.formId) fillSelect(field.formId, options, selected);
      fillSelect(field.defaultId, options, selected);
    });
  }
  function readOptionConfig(cfg) {
    OPTION_FIELDS.forEach(function (field) {
      var options = optionValues(value(field.settingsId), field.values);
      cfg[field.key] = options;
      cfg[field.defaultId] = options.indexOf(value(field.defaultId)) >= 0 ? value(field.defaultId) : options[0];
    });
    return cfg;
  }

  Array.prototype.forEach.call(sh.querySelectorAll('.railBtn'), function (b) {
    b.onclick = function () { activate(b.getAttribute('data-tab')); };
  });
  $('activeCase').onchange = function () {
    activeCaseId = this.value;
    var selectedCase = crmCases.find(function (item) { return item.id === activeCaseId; });
    var funnel = funnelForCase(selectedCase);
    activePipelineId = funnel ? funnel.id : (crmFunnels[0] && crmFunnels[0].id) || '';
    setCaseForm(selectedCase);
    renderCaseOptions();
  };
  $('activePipeline').onchange = function () {
    activePipelineId = this.value;
    renderPipelineTracker();
  };
  $('activeStage').onchange = function () {
    if (this.value) moveActiveCaseToStage(this.value);
  };
  $('refreshPipeline').onclick = function () {
    say('Atualizando ficha e funis...');
    loadCrmData(activeCaseId).then(function () {
      say('Ficha e funis atualizados.', 'ok');
    }).catch(function (err) {
      say('Falha ao atualizar ficha e funis: ' + err.message, 'err');
    });
  };
  $('collapse').onclick = function () { var opened = $('drawer').classList.toggle('open'); syncPageDock(opened); this.setAttribute('aria-expanded', String(opened)); this.setAttribute('aria-label', opened ? 'Recolher painel' : 'Expandir painel'); this.title = opened ? 'Recolher painel' : 'Expandir painel'; this.textContent = opened ? '×' : '‹'; };
  $('openKanban').onclick = function () { window.open(apiBase() + '/crm', '_blank', 'noopener,noreferrer'); };
  host.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && $('drawer').classList.contains('open')) $('collapse').click(); });
  Array.prototype.forEach.call(sh.querySelectorAll('input,select,textarea'), function (el) {
    var label = el.previousElementSibling;
    if (!el.hasAttribute('aria-label') && label && label.tagName === 'LABEL') el.setAttribute('aria-label', label.textContent.trim());
    el.addEventListener('input', updateQualification);
    el.addEventListener('change', updateQualification);
  });

  load(function (cfg) {
    var configuredApi = cfg.api || '';
    if (configuredApi === 'http://127.0.0.1:10000' || configuredApi === 'http://localhost:10000') {
      configuredApi = DEFAULT_API;
      cfg.api = DEFAULT_API;
      save(cfg);
    }
    $('api').value = configuredApi || DEFAULT_API;
    $('mode').value = cfg.mode || 'main';
    $('localPhone').value = cfg.localPhone || '';
    $('device').value = cfg.deviceId || '';
    $('destinationPhone').value = cfg.localPhone || '';
    $('scenario').value = cfg.scenario || 'mvp-chat-aberto';
    applyOptionConfig(cfg);
    TEXT_DEFAULTS.forEach(function (field) {
      $(field.id).value = cfg[field.key] || '';
      $(field.formId).value = cfg[field.key] || field.fallback;
    });
    updateQualification();
    if (store) store.get(AUTH_KEY, function (record) {
      var session = record && record[AUTH_KEY];
      if (!session || !session.token || !apiOrigin() || session.origin !== apiOrigin()) return;
      authToken = session.token;
      authOrigin = session.origin;
      authRevision += 1;
      request('/v1/auth/me').then(function () {
        loginGate.hidden = true;
        return loadCrmData(activeCaseId);
      }).then(function () {
        say('Sessão restaurada.', 'ok');
      }).catch(function () {
        clearSession(true);
      });
    });
  });

  function clearSession(showGate) {
    authToken = '';
    authOrigin = '';
    authRevision += 1;
    if (store && typeof store.remove === 'function') store.remove(AUTH_KEY);
    crmCases = [];
    crmFunnels = [];
    activeCaseId = '';
    activePipelineId = '';
    setCaseForm(null);
    renderCaseOptions();
    $('handoffs').innerHTML = '<div class="empty">Entre novamente para carregar a fila.</div>';
    $('railPendCount').textContent = '0';
    $('out').value = '';
    $('note').value = '';
    $('task').value = '';
    $('transferName').value = '';
    $('transferPhone').value = '';
    if (showGate) {
      loginGate.hidden = false;
      $('loginPassword').value = '';
      $('loginEmail').focus();
    }
  }
  $('signOut').onclick = function () {
    clearSession(true);
    say('Sessão encerrada.', 'warn');
  };
  $('save').onclick = function () {
    load(function (previous) {
      var cfg = readOptionConfig(Object.assign({}, previous, {
        api: value('api'),
        mode: value('mode'),
        localPhone: value('localPhone'),
        deviceId: value('device'),
        scenario: value('scenario')
      }));
      TEXT_DEFAULTS.forEach(function (field) { cfg[field.key] = value(field.id); });
      save(cfg, function () {
        applyOptionConfig(cfg);
        TEXT_DEFAULTS.forEach(function (field) {
          $(field.id).value = cfg[field.key];
          $(field.formId).value = cfg[field.key] || field.fallback;
        });
        $('destinationPhone').value = cfg.localPhone;
        updateQualification();
        say('Todas as configurações foram salvas.', 'ok');
      });
    });
  };
  $('resetConfig').onclick = function () {
    load(function (previous) {
      var cfg = { api: DEFAULT_API, mode: 'main', localPhone: '', deviceId: previous.deviceId || '', scenario: 'mvp-chat-aberto' };
      OPTION_FIELDS.forEach(function (field) {
        cfg[field.key] = field.values.slice();
        cfg[field.defaultId] = field.fallback;
      });
      TEXT_DEFAULTS.forEach(function (field) { cfg[field.key] = field.fallback; });
      save(cfg, function () {
        $('api').value = cfg.api;
        $('mode').value = cfg.mode;
        $('localPhone').value = cfg.localPhone;
        $('device').value = cfg.deviceId;
        $('destinationPhone').value = '';
        $('scenario').value = cfg.scenario;
        applyOptionConfig(cfg);
        TEXT_DEFAULTS.forEach(function (field) {
          $(field.id).value = cfg[field.key];
          $(field.formId).value = cfg[field.key];
        });
        updateQualification();
        say('Configurações restauradas para os padrões.', 'ok');
      });
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
    var button = this;
    var editing = !!activeCaseId;
    button.disabled = true;
    say(editing ? 'Salvando alterações...' : 'Criando ficha...');
    request(editing ? '/v1/cases/' + encodeURIComponent(activeCaseId) : '/v1/cases', {
      method: editing ? 'PATCH' : 'POST',
      body: JSON.stringify(caseFormPayload())
    }).then(function (data) {
      setOutput(data);
      if (!editing && data.handoff) copyText(data.handoff.message);
      activeCaseId = data.case.id;
      return loadCrmData(activeCaseId).then(function () {
        var selectedCase = crmCases.find(function (item) { return item.id === activeCaseId; });
        setCaseForm(selectedCase);
        activate('case');
        say(editing ? 'Alterações salvas na ficha.' : 'Ficha criada. Agora você está nela; novas edições serão salvas nesta mesma ficha.', 'ok');
      });
    }).catch(function (err) {
      say((editing ? 'Falha ao salvar alterações: ' : 'Falha ao criar ficha: ') + err.message, 'err');
      setOutput(err.data || err.message);
    }).finally(function () {
      button.disabled = false;
      button.textContent = activeCaseId ? 'Salvar alterações' : 'Criar ficha + link';
    });
  };
  $('listCases').onclick = function () {
    loadCrmData(activeCaseId).then(function (data) {
      setOutput({ items: data.cases, total: data.cases.length });
      say('Fichas e funis carregados.', 'ok');
    })
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
    var payload;
    try { payload = window.ABRProbe.snapshot(document, value('scenario')); }
    catch (err) { return say('Falha ao ler a estrutura da página: ' + err.message, 'err'); }
    request('/v1/observations', { method: 'POST', body: JSON.stringify({ kind: 'snapshot', payload: payload }) })
      .then(function (data) { setOutput(data); say('Snapshot enviado ao backend.', 'ok'); })
      .catch(function (err) { say('Falha ao enviar snapshot: ' + err.message, 'err'); });
  };
  $('observe').onclick = function () {
    if (!window.ABRProbe) return say('Probe nao carregado.', 'err');
    var button = this;
    button.disabled = true;
    say('Observando a estrutura por 15 segundos; nenhuma mensagem será enviada...');
    window.ABRProbe.observe(document, 15000).then(function (payload) {
      return request('/v1/observations', { method: 'POST', body: JSON.stringify({ kind: 'observe_15s', payload: payload }) });
    }).then(function (data) { setOutput(data); say('Observacao enviada.', 'ok'); })
      .catch(function (err) { say('Falha na observacao: ' + err.message, 'err'); })
      .finally(function () { button.disabled = false; });
  };
})();
