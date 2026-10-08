/* Painel mínimo (Shadow DOM). Guarda relatórios só no storage da EXTENSÃO. Nenhuma requisição de rede. */
(function () {
  'use strict';
  if (document.getElementById('abr-diag-host')) return;
  var KEY = 'abrDiagBundle', mem = [];
  var store = (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) ? chrome.storage.local : null;
  function load(cb) { if (!store) return cb(mem); store.get(KEY, function (r) { cb(r && r[KEY] || []); }); }
  function save(arr, cb) { mem = arr; if (!store) return cb && cb(); var o = {}; o[KEY] = arr; store.set(o, function () { cb && cb(); }); }

  var host = document.createElement('div'); host.id = 'abr-diag-host';
  host.style.cssText = 'position:fixed;top:8px;right:8px;z-index:2147483647;';
  var sh = host.attachShadow({ mode: 'open' });
  sh.innerHTML = '<style>' +
    ':host{all:initial}*{box-sizing:border-box;font-family:Montserrat,Arial,sans-serif}' +
    '.pill{background:#253575;color:#fff;border:0;border-radius:16px;padding:6px 12px;font-size:12px;cursor:pointer}' +
    '.box{display:none;width:320px;background:#fff;color:#111;border:2px solid #253575;border-radius:10px;padding:10px;font-size:12px;box-shadow:0 4px 16px #0004}' +
    '.box.open{display:block}.row{margin:6px 0;display:flex;gap:6px;flex-wrap:wrap}' +
    'button.a{background:#f08700;color:#fff;border:0;border-radius:6px;padding:6px 8px;cursor:pointer;font-size:12px}button.b{background:#e9ecf5;border:0;border-radius:6px;padding:6px 8px;cursor:pointer;font-size:12px}' +
    'select{width:100%;padding:4px}textarea{width:100%;height:110px;font:10px monospace}.st{color:#253575;min-height:16px}</style>' +
    '<button class="pill" id="t">ABR diag</button>' +
    '<div class="box" id="box"><b>Diagnóstico somente leitura</b>' +
    '<div class="row"><select id="sc">' +
    '<option value="1-sem-conversa-aberta">1 · nenhuma conversa aberta</option>' +
    '<option value="2-individual-com-mensagens">2 · conversa individual com mensagens</option>' +
    '<option value="3-grupo-aberto">3 · grupo aberto</option>' +
    '<option value="4-rascunho-digitado">4 · rascunho digitado (não envie)</option>' +
    '<option value="5-janela-observacao">5 · janela de observação</option></select></div>' +
    '<div class="row"><button class="a" id="snap">Capturar</button><button class="a" id="obs">Observar 60 s</button></div>' +
    '<div class="st" id="st"></div>' +
    '<div class="row"><button class="b" id="show">Ver relatório</button><button class="b" id="dl">Baixar .json</button><button class="b" id="clr">Limpar</button></div>' +
    '<textarea id="out" readonly style="display:none"></textarea></div>';
  document.documentElement.appendChild(host);
  var $ = function (id) { return sh.getElementById(id); };
  var say = function (m) { $('st').textContent = m; };
  $('t').onclick = function () { $('box').classList.toggle('open'); };

  $('snap').onclick = function () {
    var s = window.ABRProbe.snapshot(document, $('sc').value);
    load(function (a) { a.push(s); save(a, function () { say('Capturado (' + a.length + ' no total): ' + s.scenario); }); });
  };
  $('obs').onclick = function () {
    var sc = $('sc').value; say('Observando 60 s… envie mensagem do OUTRO número agora.');
    window.ABRProbe.observe(document, 60000).then(function (o) {
      var s = { tool: 'abr-diagnostic', version: window.ABRProbe.VERSION, scenario: sc, at: new Date().toISOString(), observation: o };
      load(function (a) { a.push(s); save(a, function () { say('Observação salva: ' + o.rows_added + ' linha(s) nova(s).'); }); });
    });
  };
  $('show').onclick = function () { load(function (a) { var t = $('out'); t.style.display = 'block'; t.value = JSON.stringify(a, null, 1); t.select(); say('Selecione tudo e copie (Ctrl+C).'); }); };
  $('dl').onclick = function () {
    load(function (a) {
      var blob = new Blob([JSON.stringify(a, null, 1)], { type: 'application/json' });
      var url = URL.createObjectURL(blob), l = document.createElement('a');
      l.href = url; l.download = 'abr-diagnostico-' + Date.now() + '.json'; l.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    });
  };
  $('clr').onclick = function () { save([], function () { $('out').style.display = 'none'; say('Relatórios apagados.'); }); };
})();
