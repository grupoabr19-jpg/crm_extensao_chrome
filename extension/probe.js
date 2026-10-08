/* Leitura observacional do WhatsApp Web. Não lê texto de mensagens nem interage com a página. */
(function (root) {
  'use strict';
  var VERSION = '0.1.0';
  var SAFE_ATTRS = { role: 1, 'data-tab': 1, contenteditable: 1, 'data-icon': 1, 'aria-multiline': 1, tabindex: 1, type: 1, dir: 1, spellcheck: 1, 'aria-hidden': 1, 'aria-readonly': 1, 'data-testid': 1, 'data-lexical-editor': 1 };

  function maskedText(text) {
    return String(text || '').replace(/\p{Lu}/gu, 'A').replace(/\p{L}/gu, 'a').replace(/\p{N}/gu, '9');
  }
  function shapeId(id) {
    return String(id).split(/(_|@)/).map(function (part) {
      if (part === '_' || part === '@' || /^(true|false|c\.us|g\.us|lid|s\.whatsapp\.net)$/.test(part)) return part;
      if (/^[0-9]+$/.test(part)) return '<digits:' + part.length + '>';
      if (/^[0-9a-f]+$/i.test(part)) return '<hex:' + part.length + '>';
      return '<alnum:' + part.length + '>';
    }).join('');
  }
  function describe(element) {
    var attrs = {}, names = [];
    Array.prototype.forEach.call(element.attributes, function (attr) {
      names.push(attr.name);
      if (attr.name === 'data-id') attrs[attr.name] = shapeId(attr.value);
      else if (attr.name === 'data-pre-plain-text') attrs[attr.name] = maskedText(attr.value).slice(0, 60);
      else if (SAFE_ATTRS[attr.name]) attrs[attr.name] = String(attr.value).slice(0, 60);
      else if (attr.name === 'class') {
        attrs.class_flags = {
          tokens: String(attr.value).split(/\s+/).filter(Boolean).length,
          has_message_in: /message-in/.test(attr.value),
          has_message_out: /message-out/.test(attr.value)
        };
      }
    });
    var rect = element.getBoundingClientRect ? element.getBoundingClientRect() : { width: 0, height: 0 };
    return {
      tag: element.tagName.toLowerCase(),
      attr_names: names.sort(),
      attrs: attrs,
      children: element.childElementCount,
      rect: { w: Math.round(rect.width), h: Math.round(rect.height) }
    };
  }
  var CANDIDATES = [
    ['app_root', '#app'], ['chat_list', '#pane-side'], ['chat_list', '[role="grid"]'],
    ['chat_list', '[role="listbox"]'], ['main_pane', '#main'], ['main_pane', 'main'],
    ['header', '#main header'], ['header', 'header'],
    ['composer', '#main footer [contenteditable="true"]'],
    ['composer', 'footer [contenteditable="true"]'],
    ['composer', '[contenteditable="true"][role="textbox"]'],
    ['composer', '[contenteditable="true"][data-tab]'],
    ['message_rows', '#main [data-id]'], ['message_rows', '#main [role="row"]'],
    ['message_rows', '#main [data-pre-plain-text]'],
    ['message_rows', '[class*="message-in"]'], ['message_rows', '[class*="message-out"]'],
    ['send_button', 'footer [data-icon="send"]'], ['send_button', 'footer button[aria-label]'],
    ['send_button', 'footer [role="button"]']
  ];
  function probeCandidates(doc) {
    return CANDIDATES.map(function (candidate) {
      var result = { group: candidate[0], query: candidate[1], count: 0, sample: null, error: null };
      try {
        var matches = doc.querySelectorAll(candidate[1]);
        result.count = matches.length;
        if (matches.length) result.sample = describe(matches[0]);
      } catch (error) {
        result.error = String(error && error.message || error);
      }
      return result;
    });
  }
  function probeComposer(doc) {
    var selectors = ['#main footer [contenteditable="true"]', 'footer [contenteditable="true"]', '[contenteditable="true"][role="textbox"]'];
    var element = null;
    for (var i = 0; i < selectors.length && !element; i++) element = doc.querySelector(selectors[i]);
    if (!element) return { found: false };
    var footer = element.closest('footer');
    var length = (element.textContent || '').replace(/\u200b/g, '').length;
    return {
      found: true,
      element: describe(element),
      text_length: length,
      is_empty: length === 0,
      focused: doc.activeElement === element,
      footer_buttons: footer ? Array.prototype.slice.call(footer.querySelectorAll('button, [role="button"]'), 0, 15).map(describe) : []
    };
  }
  function probeMessages(doc) {
    var scope = doc.querySelector('#main') || doc;
    var all = Array.prototype.filter.call(scope.querySelectorAll('[data-id]'), function (element) {
      return /^(true|false)_/.test(element.getAttribute('data-id') || '') || /@/.test(element.getAttribute('data-id') || '');
    });
    var rows = all.slice(-40);
    var result = { scanned: rows.length, total_with_id: all.length, by_direction: { in: 0, out: 0, unknown: 0 }, id_shapes: {}, with_pre_plain_text: 0, with_media_hint: 0, class_hint: { message_in: 0, message_out: 0 }, group_marker_g_us: 0 };
    rows.forEach(function (row) {
      var id = row.getAttribute('data-id') || '';
      var direction = /^true_/.test(id) ? 'out' : /^false_/.test(id) ? 'in' : 'unknown';
      result.by_direction[direction]++;
      var shape = shapeId(id);
      result.id_shapes[shape] = (result.id_shapes[shape] || 0) + 1;
      if (/@g\.us/.test(id)) result.group_marker_g_us++;
      if (row.querySelector('[data-pre-plain-text]')) result.with_pre_plain_text++;
      if (row.querySelector('img, audio, video, [data-icon*="audio"], [data-icon*="media"], [data-icon*="document"]')) result.with_media_hint++;
      if (row.querySelector('[class*="message-in"]') || /message-in/.test(row.className || '')) result.class_hint.message_in++;
      if (row.querySelector('[class*="message-out"]') || /message-out/.test(row.className || '')) result.class_hint.message_out++;
    });
    return result;
  }
  function probeHeader(doc) {
    var header = doc.querySelector('#main header') || doc.querySelector('header');
    if (!header) return { found: false };
    var leaves = [];
    Array.prototype.forEach.call(header.querySelectorAll('*'), function (element) {
      if (element.childElementCount === 0 && (element.textContent || '').trim()) {
        leaves.push({ tag: element.tagName.toLowerCase(), has_title_attr: element.hasAttribute('title'), text_shape: maskedText(element.textContent.trim()).slice(0, 50) });
      }
    });
    return { found: true, element: describe(header), text_leaves: leaves.slice(0, 8) };
  }
  function probeIcons(doc) {
    var scope = doc.querySelector('#main') || doc, seen = {}, icons = [];
    Array.prototype.forEach.call(scope.querySelectorAll('[data-icon]'), function (element) {
      var icon = element.getAttribute('data-icon');
      if (icon && !seen[icon]) { seen[icon] = true; icons.push(icon); }
    });
    return icons.slice(0, 60);
  }
  function snapshot(doc, scenario) {
    var view = doc.defaultView || root;
    return {
      tool: 'abr-diagnostic',
      version: VERSION,
      scenario: scenario || null,
      at: new Date().toISOString(),
      env: { html_lang: doc.documentElement.lang || null, nav_lang: view.navigator && view.navigator.language || null, ua: view.navigator && view.navigator.userAgent || null, viewport: { w: view.innerWidth, h: view.innerHeight } },
      candidates: probeCandidates(doc),
      composer: probeComposer(doc),
      header: probeHeader(doc),
      messages: probeMessages(doc),
      icons_in_main: probeIcons(doc)
    };
  }
  function observe(doc, ms) {
    return new Promise(function (resolve, reject) {
      if (!doc.body) return reject(new Error('WhatsApp Web ainda está carregando.'));
      var Observer = (doc.defaultView || root).MutationObserver;
      if (!Observer) return reject(new Error('MutationObserver não está disponível.'));
      var seen = new Set(), started = Date.now(), events = [], callbacks = 0, repeats = 0, mainChanges = 0, lastMain = doc.querySelector('#main');
      var observer = new Observer(function (mutations) {
        callbacks++;
        var main = doc.querySelector('#main');
        if (main !== lastMain) { mainChanges++; lastMain = main; }
        mutations.forEach(function (mutation) {
          Array.prototype.forEach.call(mutation.addedNodes, function (node) {
            if (node.nodeType !== 1) return;
            var nodes = node.hasAttribute && node.hasAttribute('data-id') ? [node] : [];
            if (node.querySelectorAll) nodes = nodes.concat(Array.prototype.slice.call(node.querySelectorAll('[data-id]')));
            nodes.forEach(function (element) {
              var id = element.getAttribute('data-id') || '';
              if (!/^(true|false)_/.test(id)) return;
              var repeated = seen.has(id);
              if (repeated) repeats++;
              seen.add(id);
              if (events.length < 50) events.push({ t_ms: Date.now() - started, direction: /^true_/.test(id) ? 'out' : 'in', shape: shapeId(id), repeat: repeated });
            });
          });
        });
      });
      observer.observe(doc.body, { childList: true, subtree: true });
      setTimeout(function () {
        observer.disconnect();
        resolve({ window_ms: ms, observer_callbacks: callbacks, rows_added: events.length, repeats: repeats, main_replaced_times: mainChanges, events: events });
      }, ms);
    });
  }
  root.ABRProbe = { VERSION: VERSION, snapshot: snapshot, observe: observe };
})(typeof window !== 'undefined' ? window : globalThis);
