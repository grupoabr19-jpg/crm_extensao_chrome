/* ABR diagnóstico v0.1 — SOMENTE LEITURA. Sem rede, sem escrita na página, sem tocar storage do site.
 * Os "candidatos" abaixo são HIPÓTESES a medir, não seletores verificados.
 * Privacidade: nunca coleta texto de mensagem, nomes ou números. Ids/textos viram "formas" (ex.: <digits:13>). */
(function (root) {
  'use strict';
  var VERSION = '0.1.0';
  var KEEP_TOKENS = { 'true': 1, 'false': 1, 'c.us': 1, 'g.us': 1, 'lid': 1, 's.whatsapp.net': 1, 'newsletter': 1, 'broadcast': 1, 'status': 1 };
  var SAFE_ATTRS = { 'role': 1, 'data-tab': 1, 'contenteditable': 1, 'data-icon': 1, 'aria-multiline': 1, 'tabindex': 1, 'type': 1, 'dir': 1, 'spellcheck': 1, 'aria-hidden': 1, 'aria-readonly': 1, 'data-testid': 1, 'data-lexical-editor': 1 };
  var LABEL_ATTRS = { 'aria-label': 1, 'title': 1, 'placeholder': 1, 'aria-placeholder': 1 };

  function maskText(s) {
    return String(s == null ? '' : s).replace(/\p{Lu}/gu, 'A').replace(/\p{L}/gu, 'a').replace(/\p{N}/gu, '9');
  }
  function maskToken(t) {
    if (KEEP_TOKENS[t]) return t;
    if (/^[0-9]+$/.test(t)) return '<digits:' + t.length + '>';
    if (/^[0-9A-Fa-f]+$/.test(t)) return '<hex:' + t.length + '>';
    return '<alnum:' + t.length + '>';
  }
  function shapeId(id) {
    return String(id).split(/(_|@)/).map(function (t) { return (t === '_' || t === '@') ? t : maskToken(t); }).join('');
  }
  function safeZone(el) {
    return !!(el.closest && el.closest('footer')) || el.getAttribute('contenteditable') === 'true';
  }
  function describe(el) {
    var attrs = {}, names = [], i, a;
    for (i = 0; i < el.attributes.length; i++) {
      a = el.attributes[i]; names.push(a.name);
      if (a.name === 'data-id') attrs[a.name] = shapeId(a.value);
      else if (a.name === 'data-pre-plain-text') attrs[a.name] = maskText(a.value).slice(0, 60);
      else if (SAFE_ATTRS[a.name]) attrs[a.name] = String(a.value).slice(0, 60);
      else if (LABEL_ATTRS[a.name] && safeZone(el)) attrs[a.name] = String(a.value).slice(0, 80);
      else if (a.name === 'class') {
        var c = String(a.value);
        attrs.class_flags = { tokens: c.split(/\s+/).filter(Boolean).length, has_message_in: /message-in/.test(c), has_message_out: /message-out/.test(c) };
      }
    }
    var r = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 0, height: 0 };
    return { tag: el.tagName.toLowerCase(), attr_names: names.sort(), attrs: attrs, children: el.childElementCount, rect: { w: Math.round(r.width), h: Math.round(r.height) } };
  }

  var CANDIDATES = [
    ['app_root', '#app'],
    ['chat_list', '#pane-side'], ['chat_list', '[role="grid"]'], ['chat_list', '[role="listbox"]'],
    ['main_pane', '#main'], ['main_pane', 'main'],
    ['header', '#main header'], ['header', 'header'],
    ['composer', '#main footer [contenteditable="true"]'], ['composer', 'footer [contenteditable="true"]'],
    ['composer', '[contenteditable="true"][role="textbox"]'], ['composer', '[contenteditable="true"][data-tab]'],
    ['message_rows', '#main [data-id]'], ['message_rows', '#main [role="row"]'],
    ['message_rows', '#main [data-pre-plain-text]'], ['message_rows', '[class*="message-in"]'], ['message_rows', '[class*="message-out"]'],
    ['send_button', 'footer [data-icon="send"]'], ['send_button', 'footer button[aria-label]'], ['send_button', 'footer [role="button"]']
  ];

  function probeCandidates(doc) {
    return CANDIDATES.map(function (c) {
      var out = { group: c[0], query: c[1], count: 0, sample: null, error: null };
      try { var list = doc.querySelectorAll(c[1]); out.count = list.length; if (list.length) out.sample = describe(list[0]); }
      catch (e) { out.error = String(e && e.message || e); }
      return out;
    });
  }

  function findComposer(doc) {
    var qs = ['#main footer [contenteditable="true"]', 'footer [contenteditable="true"]', '[contenteditable="true"][role="textbox"]'];
    for (var i = 0; i < qs.length; i++) { var el = doc.querySelector(qs[i]); if (el) return el; }
    return null;
  }
  function probeComposer(doc) {
    var el = findComposer(doc);
    if (!el) return { found: false };
    var len = (el.textContent || '').replace(/\u200b/g, '').length;
    var footer = el.closest('footer');
    var buttons = footer ? Array.prototype.slice.call(footer.querySelectorAll('button, [role="button"]'), 0, 15).map(describe) : [];
    return { found: true, element: describe(el), text_length: len, is_empty: len === 0, focused: doc.activeElement === el, footer_buttons: buttons };
  }

  function directionOf(id) { return /^true_/.test(id) ? 'out' : /^false_/.test(id) ? 'in' : 'unknown'; }
  function probeMessages(doc) {
    var scope = doc.querySelector('#main') || doc;
    var all = Array.prototype.filter.call(scope.querySelectorAll('[data-id]'), function (e) { return /^(true|false)_/.test(e.getAttribute('data-id') || '') || /@/.test(e.getAttribute('data-id') || ''); });
    var rows = all.slice(-40);
    var res = { scanned: rows.length, total_with_id: all.length, by_direction: { 'in': 0, out: 0, unknown: 0 }, id_shapes: {}, with_pre_plain_text: 0, with_media_hint: 0, class_hint: { message_in: 0, message_out: 0 }, group_marker_g_us: 0 };
    rows.forEach(function (r) {
      var id = r.getAttribute('data-id'); res.by_direction[directionOf(id)]++;
      var s = shapeId(id); res.id_shapes[s] = (res.id_shapes[s] || 0) + 1;
      if (/@g\.us/.test(id)) res.group_marker_g_us++;
      if (r.querySelector('[data-pre-plain-text]')) res.with_pre_plain_text++;
      if (r.querySelector('img, audio, video, [data-icon*="audio"], [data-icon*="media"], [data-icon*="document"]')) res.with_media_hint++;
      if (r.querySelector('[class*="message-in"]') || /message-in/.test(r.className || '')) res.class_hint.message_in++;
      if (r.querySelector('[class*="message-out"]') || /message-out/.test(r.className || '')) res.class_hint.message_out++;
    });
    return res;
  }

  function probeHeader(doc) {
    var h = doc.querySelector('#main header') || doc.querySelector('header');
    if (!h) return { found: false };
    var leaves = [];
    Array.prototype.forEach.call(h.querySelectorAll('*'), function (e) {
      if (e.childElementCount === 0 && (e.textContent || '').trim()) leaves.push({ tag: e.tagName.toLowerCase(), has_title_attr: e.hasAttribute('title'), text_shape: maskText(e.textContent.trim()).slice(0, 50) });
    });
    return { found: true, element: describe(h), text_leaves: leaves.slice(0, 8) };
  }

  function probeIcons(doc) {
    var scope = doc.querySelector('#main') || doc, seen = {}, out = [];
    Array.prototype.forEach.call(scope.querySelectorAll('[data-icon]'), function (e) { var n = e.getAttribute('data-icon'); if (n && !seen[n]) { seen[n] = 1; out.push(n); } });
    return out.slice(0, 60);
  }

  function snapshot(doc, scenario) {
    var w = doc.defaultView || root;
    return {
      tool: 'abr-diagnostic', version: VERSION, scenario: scenario || null, at: new Date().toISOString(),
      env: { html_lang: doc.documentElement.lang || null, nav_lang: (w.navigator && w.navigator.language) || null, ua: (w.navigator && w.navigator.userAgent) || null, viewport: { w: w.innerWidth, h: w.innerHeight } },
      candidates: probeCandidates(doc), composer: probeComposer(doc), header: probeHeader(doc), messages: probeMessages(doc), icons_in_main: probeIcons(doc)
    };
  }

  /* Observa a página por `ms` e resume linhas [data-id] adicionadas. Mede se dá para observar mensagens novas,
   * se há ids repetidos (remontagem) e se #main é substituído (troca de conversa/SPA). Nada de texto é guardado. */
  function observe(doc, ms) {
    return new Promise(function (resolve) {
      var seen = new Set(), t0 = Date.now(), events = [], cbs = 0, repeats = 0, mainChanges = 0, lastMain = doc.querySelector('#main');
      var MO = (doc.defaultView || root).MutationObserver;
      var mo = new MO(function (muts) {
        cbs++;
        var m = doc.querySelector('#main'); if (m !== lastMain) { mainChanges++; lastMain = m; }
        muts.forEach(function (mu) {
          Array.prototype.forEach.call(mu.addedNodes, function (n) {
            if (n.nodeType !== 1) return;
            var nodes = n.hasAttribute && n.hasAttribute('data-id') ? [n] : [];
            if (n.querySelectorAll) nodes = nodes.concat(Array.prototype.slice.call(n.querySelectorAll('[data-id]')));
            nodes.forEach(function (e) {
              var id = e.getAttribute('data-id') || ''; if (!/^(true|false)_/.test(id)) return;
              var rep = seen.has(id); if (rep) repeats++; seen.add(id);
              if (events.length < 50) events.push({ t_ms: Date.now() - t0, direction: directionOf(id), shape: shapeId(id), repeat: rep });
            });
          });
        });
      });
      mo.observe(doc.body, { childList: true, subtree: true });
      setTimeout(function () { mo.disconnect(); resolve({ window_ms: ms, observer_callbacks: cbs, rows_added: events.length, repeats: repeats, main_replaced_times: mainChanges, events: events }); }, ms);
    });
  }

  root.ABRProbe = { VERSION: VERSION, snapshot: snapshot, observe: observe, _internals: { maskText: maskText, shapeId: shapeId } };
})(typeof window !== 'undefined' ? window : globalThis);
