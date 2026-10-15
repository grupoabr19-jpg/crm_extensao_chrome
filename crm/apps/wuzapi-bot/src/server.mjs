import http from 'node:http';
import crypto from 'node:crypto';

const port = Number(process.env.PORT || 3001);
const wuzapiBaseUrl = process.env.WUZAPI_BASE_URL || 'http://wuzapi:8080';
const wuzapiToken = process.env.WUZAPI_USER_TOKEN || '';
const groqApiKey = process.env.GROQ_API_KEY || '';
const groqModel = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const botName = 'Abraão';
const companyName = process.env.COMPANY_NAME || 'ABR';
const crmBaseUrl = (process.env.CRM_API_BASE_URL || '').replace(/\/+$/, '');
const crmEmail = process.env.CRM_EMAIL || '';
const crmPassword = process.env.CRM_PASSWORD || '';
const pietraName = process.env.PIETRA_NAME || 'Pietra';
const pietraPhone = normalizePhone(process.env.PIETRA_PHONE || '+5535998138542');
const allowedPhones = new Set(
  (process.env.ALLOWED_PHONES || '')
    .split(',')
    .map((phone) => normalizePhone(phone))
    .filter(Boolean)
);

const seenMessageIds = new Map();
const conversations = new Map();
let crmSession = { token: '', expiresAt: 0 };
let sellerDirectory = { items: [], expiresAt: 0 };
const MAX_SEEN = 500;
const MAX_HISTORY = 12;
const HANDOFF_LOCK_MS = 12 * 60 * 60 * 1000;
const SELLER_DIRECTORY_TTL_MS = 5 * 60 * 1000;
const PORTFOLIO_REPLY = 'Claro! No Grupo ABR trabalhamos com telhas, incluindo Telhas PIR ABR Telhas, perfil estrutural, tubos e metalons, vergalhão, malha e treliça. Qual dessas linhas você quer conhecer melhor?';
const BLOCKED_DESTINATION_PHONES = new Set(['5511999990001', '5511999990000']);
const CITY_ALIASES = new Map([
  ['cambui', 'Cambui'],
  ['cambuim', 'Cambui'],
  ['cambuy', 'Cambui'],
  ['cambuí', 'Cambui'],
  ['camanducaia', 'Camanducaia'],
  ['itapeva', 'Itapeva'],
  ['extrema', 'Extrema'],
  ['pouso alegre', 'Pouso Alegre'],
  ['pousoalegre', 'Pouso Alegre'],
  ['braganca', 'Braganca Paulista'],
  ['braganca paulista', 'Braganca Paulista'],
  ['atibaia', 'Atibaia'],
  ['jundiai', 'Jundiai'],
  ['varginha', 'Varginha'],
  ['itajuba', 'Itajuba'],
  ['itajauba', 'Itajuba'],
  ['pocos de caldas', 'Pocos De Caldas']
]);
const PRODUCT_ALIASES = [
  { product: 'Telha PIR ABR Telhas', aliases: ['pir', 'telha pir', 'telhas pir', 'termoacustica', 'termica', 'sanduiche'] },
  { product: 'Telha', aliases: ['telha', 'telhas', 'telia', 'telias', 'teia', 'telh'] },
  { product: 'Tela', aliases: ['tela', 'telas', 'malha', 'malhas', 'tela soldada'] },
  { product: 'Aco', aliases: ['aco', 'aço', 'ferro'] },
  { product: 'Vergalhao', aliases: ['vergalhao', 'vergalhão'] },
  { product: 'Cimento', aliases: ['cimento', 'cimeto'] },
  { product: 'Trelica', aliases: ['trelica', 'treliça', 'trelissa'] },
  { product: 'Coluna', aliases: ['coluna', 'colunas'] },
  { product: 'Calha', aliases: ['calha', 'calhas'] }
];
const STOP_WORDS = new Set(['bom', 'boa', 'dia', 'tarde', 'noite', 'oi', 'ola', 'quero', 'queria', 'preciso', 'procuro', 'comprar', 'orcamento', 'orçamento', 'sou', 'de', 'da', 'do', 'em', 'pra', 'para', 'por', 'favor', 'vendedor', 'atendente', 'transfere', 'transferir', 'manda', 'mande', 'chama']);

function normalizePhone(value) {
  if (!value) return '';
  let raw = String(value).trim();
  if (raw.includes('@g.us')) return '';
  raw = raw.split('@')[0];
  raw = raw.split(':')[0];
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 10 ? digits : '';
}

function isGroupPayload(value) {
  return JSON.stringify(value || {}).includes('@g.us');
}

function parseJsonString(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || !['{', '['].includes(trimmed[0])) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function findValue(input, keys) {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const stack = [input];
  const visited = new Set();

  while (stack.length) {
    const item = stack.shift();
    if (!item || typeof item !== 'object' || visited.has(item)) continue;
    visited.add(item);

    for (const [key, value] of Object.entries(item)) {
      if (wanted.has(key.toLowerCase()) && value !== undefined && value !== null && value !== '') {
        return value;
      }
      if (value && typeof value === 'object') stack.push(value);
      else {
        const parsed = parseJsonString(value);
        if (parsed && typeof parsed === 'object') stack.push(parsed);
      }
    }
  }
  return undefined;
}

function findFirstValue(input, keyGroups) {
  for (const keys of keyGroups) {
    const value = findValue(input, keys);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function findBoolean(input, keys) {
  const value = findValue(input, keys);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return ['true', '1', 'yes'].includes(value.toLowerCase());
  return false;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function conversationalPunctuation(value) {
  return String(value || '')
    .replace(/\s*[—–]\s*/g, '; ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function titleCase(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

function words(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function editDistance(a, b) {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (left === right) return 0;
  if (!left || !right) return Math.max(left.length, right.length);
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array(right.length + 1).fill(0);
  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1)
      );
    }
    for (let j = 0; j <= right.length; j += 1) previous[j] = current[j];
  }
  return previous[right.length];
}

function closeEnough(value, expected) {
  const left = normalizeText(value).replace(/\s+/g, ' ').trim();
  const right = normalizeText(expected).replace(/\s+/g, ' ').trim();
  if (!left || !right) return false;
  if (left === right) return true;
  const limit = right.length <= 5 ? 1 : right.length <= 8 ? 2 : 3;
  return editDistance(left, right) <= limit;
}

function canonicalCity(candidate) {
  const clean = normalizeText(candidate).replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean || clean.length < 3) return '';
  if (CITY_ALIASES.has(clean)) return CITY_ALIASES.get(clean);
  for (const [alias, city] of CITY_ALIASES.entries()) {
    if (closeEnough(clean, alias)) return city;
  }
  return '';
}

function candidateWindows(raw, maxSize = 3) {
  const list = [];
  const textWords = words(raw);
  for (let size = maxSize; size >= 1; size -= 1) {
    for (let index = 0; index <= textWords.length - size; index += 1) {
      list.push(textWords.slice(index, index + size).join(' '));
    }
  }
  return list;
}

function extractCity(raw, commaParts) {
  const candidates = [];
  const explicit = raw.match(/\b(?:sou de|cidade de|cidade|moro em|estou em|entregar em|entrega em|de|em)\s+([A-Za-zÀ-ÿ\s]{3,40})/i);
  if (explicit) candidates.push(explicit[1]);
  if (commaParts.length >= 2) candidates.push(commaParts[1]);
  candidates.push(...candidateWindows(raw, 3));

  for (const candidate of candidates) {
    const cleaned = String(candidate || '')
      .replace(/\b(?:quero|queria|preciso|procuro|comprar|tenho|telha|telhas|tela|aco|aço|ferro|cimento|pir|vendedor|transferir|transfere)\b.*$/i, '')
      .trim();
    const city = canonicalCity(cleaned);
    if (city) return city;
  }
  return '';
}

function extractProduct(raw) {
  const normalized = normalizeText(raw);
  const candidates = new Set([normalized, ...candidateWindows(raw, 3)]);
  for (const item of PRODUCT_ALIASES) {
    for (const alias of item.aliases) {
      const normalizedAlias = normalizeText(alias);
      const aliasWords = words(normalizedAlias);
      const normalizedWords = words(normalized);
      if (aliasWords.length && ` ${normalizedWords.join(' ')} `.includes(` ${aliasWords.join(' ')} `)) return item.product;
      for (const candidate of candidates) {
        if (words(candidate).length !== aliasWords.length) continue;
        const limit = normalizedAlias.length <= 5 ? 1 : normalizedAlias.length <= 8 ? 2 : 3;
        if (editDistance(candidate, normalizedAlias) <= limit) return item.product;
      }
    }
  }
  return '';
}

function extractName(raw, commaParts, city, product) {
  const nameMatch =
    raw.match(/\b(?:meu nome e|me chamo|sou|aqui e|eu sou)\s+([A-Za-zÀ-ÿ]{2,}(?:\s+[A-Za-zÀ-ÿ]{2,}){0,2})/i) ||
    raw.match(/^\s*([A-Za-zÀ-ÿ]{2,})(?:\s*,|\s+de\b)/i);
  if (nameMatch) {
    const extracted = nameMatch[1].replace(/\b(de|da|do|das|dos)\b.*$/i, '').trim();
    const first = words(extracted)[0] || '';
    if (extracted && !STOP_WORDS.has(first) && !canonicalCity(extracted)) return titleCase(extracted);
  }
  if (commaParts.length >= 2 && /^[A-Za-zÀ-ÿ]{2,}(?:\s+[A-Za-zÀ-ÿ]{2,}){0,2}$/.test(commaParts[0])) {
    const extracted = commaParts[0].trim();
    const first = words(extracted)[0] || '';
    if (!STOP_WORDS.has(first) && !extractProduct(extracted) && !canonicalCity(extracted)) return titleCase(extracted);
  }
  if (wantsPortfolio(raw)) return '';
  return '';
}

function extractExpectedName(text) {
  const clean = String(text || '').replace(/[^A-Za-zÀ-ÿ\s'-]/g, ' ').replace(/\s+/g, ' ').trim();
  const parts = words(clean);
  if (!clean || parts.length < 1 || parts.length > 4) return '';
  const blocked = new Set([
    ...STOP_WORDS,
    'cobertura', 'telhado', 'galpao', 'obra', 'reforma', 'estrutura', 'fabricacao',
    'cliente', 'final', 'industria', 'construtora', 'revenda', 'projeto'
  ]);
  if (parts.some((part) => blocked.has(part)) || extractProduct(clean) || canonicalCity(clean)) return '';
  return titleCase(clean);
}

function upsertConversation(phone, text) {
  const current = conversations.get(phone) || { phone, messages: [], name: '', city: '', uf: '', product: '', handoffAt: 0, pendingHandoff: false, purchaseIntent: false, commercialHandoffRequested: false, transferTarget: null, awaitingField: '' };
  current.messages.push({ from: 'customer', text, at: new Date().toISOString() });
  current.messages = current.messages.slice(-MAX_HISTORY);
  const facts = extractFactsSmart(current.messages.filter((message) => message.from === 'customer').map((message) => message.text).join('\n'));
  const expectedName = current.awaitingField === 'name' ? extractExpectedName(text) : '';
  current.name ||= expectedName || facts.name;
  current.city ||= facts.city;
  current.uf ||= facts.uf;
  current.product ||= facts.product;
  if ((current.awaitingField === 'name' && current.name)
    || (current.awaitingField === 'city' && current.city)
    || (current.awaitingField === 'uf' && current.uf)) current.awaitingField = '';
  if (wantsHumanSmart(text)) current.pendingHandoff = true;
  conversations.set(phone, current);
  return current;
}

function extractFacts(text) {
  const raw = String(text || ' ');
  const normalized = normalizeText(raw);
  const result = { name: '', city: '', product: '' };

  const nameMatch =
    raw.match(/\b(?:meu nome e|me chamo|sou|aqui e|eu sou)\s+([A-Za-zÀ-ÿ]{2,}(?:\s+[A-Za-zÀ-ÿ]{2,}){0,2})/i) ||
    raw.match(/^\s*([A-Za-zÀ-ÿ]{2,})(?:\s*,|\s+de\b)/i);
  if (nameMatch) result.name = titleCase(nameMatch[1].replace(/\b(de|da|do|das|dos)\b.*$/i, ''));

  const commaParts = raw
    .split(/[,;\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!result.name && commaParts.length >= 2 && /^[A-Za-zÀ-ÿ]{2,}(?:\s+[A-Za-zÀ-ÿ]{2,}){0,2}$/.test(commaParts[0])) {
    result.name = titleCase(commaParts[0]);
  }

  const cityMatch =
    raw.match(/\b(?:de|sou de|cidade de|em)\s+([A-Za-zÀ-ÿ]{3,}(?:\s+[A-Za-zÀ-ÿ]{2,}){0,3})/i) ||
    raw.match(/\bcidade\s*[:,-]?\s*([A-Za-zÀ-ÿ]{3,}(?:\s+[A-Za-zÀ-ÿ]{2,}){0,3})/i);
  if (cityMatch) {
    result.city = titleCase(
      cityMatch[1]
        .replace(/\b(?:quero|preciso|procuro|tenho|telha|tela|aco|ferro|cimento|pir)\b.*$/i, '')
        .trim()
    );
  }
  if (!result.city && commaParts.length >= 2) {
    const candidate = commaParts[1]
      .replace(/\b(?:quero|preciso|procuro|tenho|telha|tela|aco|ferro|cimento|pir)\b.*$/i, '')
      .trim();
    if (/^[A-Za-zÀ-ÿ]{3,}(?:\s+[A-Za-zÀ-ÿ]{2,}){0,3}$/.test(candidate)) {
      result.city = titleCase(candidate);
    }
  }

  if (/\bpir\b/.test(normalized) || /\btelha(?:s)?\s+pir\b/.test(normalized)) {
    result.product = 'Telha PIR ABR Telhas';
    return result;
  }

  const products = [
    ['telha', 'Telha'],
    ['tela', 'Tela'],
    ['aco', 'Aco'],
    ['ferro', 'Ferro'],
    ['vergalhao', 'Vergalhao'],
    ['cimento', 'Cimento'],
    ['trelica', 'Trelica'],
    ['coluna', 'Coluna'],
    ['calha', 'Calha']
  ];
  const found = products.find(([needle]) => normalized.includes(needle));
  if (found) result.product = found[1];

  return result;
}

function wantsHuman(text) {
  return /\b(vendedor|atendente|humano|pessoa|transfer|transfere|encaminh|passa|mande|manda|chama)\b/i.test(normalizeText(text));
}

function extractUf(text) {
  const normalized = normalizeText(text).replace(/[^a-z0-9\s]/g, ' ');
  const match = normalized.match(/\b(?:ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to)\b/i);
  return match ? match[0].toUpperCase() : '';
}

function extractFactsSmart(text) {
  const raw = String(text || ' ');
  const commaParts = raw
    .split(/[,;\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
  const city = extractCity(raw, commaParts);
  const product = extractProduct(raw);
  const name = extractName(raw, commaParts, city, product);
  const uf = extractUf(raw);
  return { name, city, uf, product };
}

function wantsHumanSmart(text) {
  const normalized = normalizeText(text);
  if (/\b(transferir|transfere|encaminha|encaminhar|passa|passar|mande|manda|chama|chamar)\b/i.test(normalized)) return true;
  if (/\b(quero|preciso|gostaria|falar|atendimento)\b/i.test(normalized)
    && /\b(vendedor|vendedora|atendente|humano|pessoa|alguem|equipe comercial)\b/i.test(normalized)) return true;
  const textWords = words(text);
  if (textWords.some((word) => ['trasfere', 'tranferir', 'encaminha'].includes(word))) return true;
  const hasRequest = textWords.some((word) => ['quero', 'preciso', 'gostaria', 'falar', 'atendimento'].includes(word));
  return hasRequest && textWords.some((word) => ['vendedo', 'vendendor', 'atendete'].includes(word));
}

function wantsQuote(text) {
  const normalized = normalizeText(text);
  return /\b(orcamento|cotacao|preco|valor|fechar pedido|fazer pedido)\b/.test(normalized)
    || /\bquanto (?:custa|fica|sai)\b/.test(normalized);
}

function wantsPurchase(text) {
  const normalized = normalizeText(text);
  return /\b(comprar|adquirir|preciso de|tenho interesse em)\b/.test(normalized);
}

function hasQualificationDetail(conversation) {
  const customerText = normalizeText(
    (conversation?.messages || [])
      .filter((message) => message.from === 'customer')
      .map((message) => message.text)
      .join(' ')
  );
  return /\b\d+(?:[.,]\d+)?\s*(?:m2|m²|metros? quadrados?|metros?|cm|mm|kg|quilos?|toneladas?|unidades?|pecas?|barras?|chapas?|rolos?)\b/.test(customerText)
    || /\b(obra|cobertura|telhado|galpao|serralheria|estrutura|fabricacao|revenda|industria|construtora|reforma|projeto|uso proprio|cliente final)\b/.test(customerText);
}

function nextRequiredQualification(conversation) {
  if (!conversation?.name) return 'name';
  if (!conversation?.city) return 'city';
  if (!conversation?.uf) return 'uf';
  if (!conversation?.product) return 'product';
  if (!hasQualificationDetail(conversation)) return 'detail';
  return '';
}

function isReadyForHandoff(conversation, text) {
  if (conversation.handoffAt && Date.now() - conversation.handoffAt < HANDOFF_LOCK_MS) return false;
  return Boolean(conversation.pendingHandoff && !nextRequiredQualification(conversation));
}

function missingQuestions(conversation) {
  const labels = {
    name: 'seu nome',
    city: 'sua cidade',
    uf: 'a UF',
    product: 'o produto',
    detail: 'a aplicação, medida ou quantidade'
  };
  const next = nextRequiredQualification(conversation);
  return next ? [labels[next]] : [];
}

function wantsPortfolio(text) {
  const normalized = normalizeText(text);
  return /\b(portfoli(?:o)?|portifolio|catalogo|produtos|linha de produtos)\b/.test(normalized)
    && /\b(quero|conhecer|informacao|informacoes|saber|mostrar|mostra|tem|vendem|vende)\b/.test(normalized);
}

function greetingReply(text) {
  const normalized = normalizeText(text).replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!/^(?:(?:oi|ola)\s*)?(?:bom dia|boa tarde|boa noite)?$/.test(normalized) || !normalized) return '';
  const greeting = normalized.includes('bom dia') ? 'Bom dia' : normalized.includes('boa tarde') ? 'Boa tarde' : normalized.includes('boa noite') ? 'Boa noite' : 'Olá';
  return `${greeting}! Sou o Abraão, parceiro de negócios do Grupo ABR. Que bom falar com você. Como posso ajudar?`;
}

function productLabel(product) {
  const labels = {
    Aco: 'aço',
    Vergalhao: 'vergalhão',
    Trelica: 'treliça'
  };
  return labels[product] || String(product || 'material').toLowerCase();
}

function purchaseInterestReply(conversation) {
  if (!conversation?.name) {
    return 'Que bom saber do seu interesse! Antes de continuar, como posso te chamar?';
  }
  if (!conversation?.city) {
    return `Obrigado, ${conversation.name.split(/\s+/)[0]}! Em qual cidade e UF será o atendimento?`;
  }
  if (!conversation?.uf) {
    return `${conversation.city} fica em qual UF?`;
  }
  if (!conversation?.product) {
    return 'Perfeito. Qual produto ou tipo de material você procura?';
  }
  return `Que bom saber do seu interesse em ${productLabel(conversation.product)}! Quero entender sua necessidade para registrar tudo direitinho. Qual será a aplicação do material?`;
}

function requestedPietra(text) {
  const normalized = normalizeText(text);
  return wantsHumanSmart(text) && /\bpietra\b/.test(normalized);
}

function resolveNamedOperator(text, sellers = []) {
  if (!wantsHumanSmart(text)) return null;
  const normalized = normalizeText(text);
  const available = sellers
    .filter((seller) => normalizePhone(seller?.whatsapp_e164 || seller?.phone))
    .map((seller) => {
      const name = String(seller?.name || seller?.display_name || '').trim();
      const normalizedName = normalizeText(name);
      const parts = normalizedName.split(/\s+/).filter((part) => part.length >= 3);
      return { seller, name, normalizedName, parts };
    })
    .filter((entry) => entry.name && entry.parts.length);

  const fullMatches = available.filter((entry) => normalized.includes(entry.normalizedName));
  const matches = fullMatches.length
    ? fullMatches
    : available.filter((entry) => entry.parts.every((part) => new RegExp(`\\b${part}\\b`).test(normalized)));
  if (matches.length === 1) {
    const match = matches[0];
    return {
      name: match.name,
      phone: normalizePhone(match.seller.whatsapp_e164 || match.seller.phone),
      userId: match.seller.user_id || null
    };
  }

  const firstNameMatches = available.filter((entry) => new RegExp(`\\b${entry.parts[0]}\\b`).test(normalized));
  if (firstNameMatches.length !== 1) return null;
  const match = firstNameMatches[0];
  return {
    name: match.name,
    phone: normalizePhone(match.seller.whatsapp_e164 || match.seller.phone),
    userId: match.seller.user_id || null
  };
}

function extractIncoming(payload) {
  if (isGroupPayload(payload)) return { ignored: 'group' };

  if (findBoolean(payload, ['fromMe', 'FromMe', 'IsFromMe', 'is_from_me', 'Owner'])) {
    return { ignored: 'fromMe' };
  }

  const phoneValue = findFirstValue(payload, [
    [
      'SenderAlt',
      'senderAlt',
      'RecipientAlt',
      'recipientAlt',
      'Phone',
      'phone',
      'SenderPhone',
      'senderPhone'
    ],
    [
      'From',
      'from',
      'Sender',
      'sender',
      'SenderJID',
      'sender_jid',
      'Chat',
      'ChatJID',
      'chat_jid',
      'JID',
      'jid',
      'RemoteJid',
      'remoteJid'
    ]
  ]);
  const phone = normalizePhone(phoneValue);

  const textValue = findValue(payload, [
    'Body',
    'body',
    'Text',
    'text',
    'Conversation',
    'conversation',
    'Caption',
    'caption',
    'Content',
    'content'
  ]);
  const text = typeof textValue === 'string' ? textValue.trim() : '';

  const idValue = findValue(payload, ['Id', 'ID', 'MessageID', 'messageId', 'stanzaId']);
  const id = idValue ? String(idValue) : crypto.randomUUID();

  return { phone, text, id };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function remember(id) {
  if (seenMessageIds.has(id)) return false;
  seenMessageIds.set(id, Date.now());
  if (seenMessageIds.size > MAX_SEEN) {
    const firstKey = seenMessageIds.keys().next().value;
    seenMessageIds.delete(firstKey);
  }
  return true;
}

async function askGroq(text, phone) {
  const conversation = conversations.get(phone);
  const known = conversation
    ? `Dados ja informados: nome=${conversation.name || 'nao informado'}, cidade=${conversation.city || 'nao informada'}, UF=${conversation.uf || 'nao informada'}, produto=${conversation.product || 'nao informado'}.`
    : '';
  const history = (conversation?.messages || [])
    .slice(-9, -1)
    .map((message) => ({
      role: message.from === 'assistant' ? 'assistant' : 'user',
      content: message.text
    }));
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${groqApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: groqModel,
      temperature: 0.45,
      max_tokens: 320,
      messages: [
        {
          role: 'system',
          content:
            `Voce e ${botName}, parceiro de negocios do ${companyName === 'ABR' ? 'Grupo ABR' : companyName}. ` +
            'Apresente-se com essa identidade no primeiro contato. Responda em portugues do Brasil, em tom caloroso, amigavel, educado e gentil, mas sem enrolacao. ' +
            'Use no maximo tres frases curtas, sem emoji, lista, markdown ou explicacao de regras internas. Nunca use travessao; prefira ponto, virgula ou ponto e virgula, como em uma conversa natural de WhatsApp. Primeiro reconheca o que o cliente disse e depois faca no maximo uma pergunta util. ' +
            'Seu papel e conversar, explicar os produtos do catalogo conhecido, tirar duvidas gerais e enriquecer a ficha antes de encaminhar ao vendedor. ' +
            'Intencao de compra nao e ordem de transferencia: converse e qualifique. Siga sempre esta ordem, uma pergunta por vez: nome de tratamento, cidade e UF, produto, depois aplicacao, medida ou quantidade. ' +
            'Voce nunca faz, prepara, calcula ou oferece orcamentos ou cotacoes; nunca informa ou estima preco, desconto, estoque, prazo de entrega, condicao de pagamento, credito ou negociacao. ' +
            'Nunca cite, avalie ou compare concorrentes. Nunca prometa disponibilidade, resultado tecnico, certificacao, reserva, entrega, contato ou fechamento. Nao solicite documentos, senha, dados bancarios ou de cartao. ' +
            'Se pedirem preco, orcamento ou cotacao, diga com naturalidade que o vendedor responsavel cuidara disso e aproveite para coletar somente um dado util que ainda esteja faltando. ' +
            'Nunca transfira antes de registrar nome de tratamento, cidade, UF, produto e pelo menos um detalhe da necessidade, como aplicacao, medida ou quantidade. Isso tambem vale quando o cliente pedir um vendedor explicitamente. ' +
            'Nao peca de novo um dado que ja foi informado e nunca diga que o cliente ainda precisa confirmar cidade se ela estiver nos dados ja informados. ' +
            'Quando perguntarem pelo portfolio, informe que trabalhamos com telhas (incluindo Telhas PIR ABR Telhas), perfil estrutural, tubos e metalons, vergalhao, malha e trelica. ' +
            'Conhecimento comercial: telhas PIR devem ser tratadas e vendidas como ABR Telhas. ' +
            'Nunca mencione MBP, MBO, fornecedor, fornecedora ou origem de fornecimento ao cliente. ' +
            'Nao invente dados, precos, prazos ou promessas. ' +
            known
        },
        ...history,
        {
          role: 'user',
          content: `Cliente ${phone}: ${text}`
        }
      ]
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Groq HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 300)}`);
  }

  const reply = payload?.choices?.[0]?.message?.content?.trim() || 'Entendi. Conte um pouco mais sobre o que você precisa para eu registrar corretamente.';
  return enforceCommercialBoundaries(reply, conversation);
}

function qualificationReply(conversation) {
  if (!conversation?.name) {
    return 'Será um prazer ajudar. Como posso te chamar?';
  }
  if (!conversation?.city) {
    return `Obrigado, ${conversation.name.split(/\s+/)[0]}! Em qual cidade e UF será o atendimento?`;
  }
  if (!conversation?.uf) {
    return `${conversation.city} fica em qual UF?`;
  }
  if (!conversation?.product) {
    return 'Entendi. Será um prazer ajudar. Qual produto ou tipo de material você procura?';
  }
  return `Perfeito, já registrei seu interesse em ${conversation.product} para ${conversation.city}. Qual será a aplicação, medida ou quantidade aproximada?`;
}

function commercialQualificationReply(conversation) {
  if (!conversation?.name) {
    return 'O orçamento será tratado pelo vendedor responsável. Como posso te chamar?';
  }
  if (!conversation?.city) {
    return `Obrigado, ${conversation.name.split(/\s+/)[0]}! Em qual cidade e UF será o atendimento?`;
  }
  if (!conversation?.uf) {
    return `${conversation.city} fica em qual UF?`;
  }
  if (!conversation?.product) {
    return 'Com certeza! O orçamento será tratado pelo vendedor responsável. Qual produto ou tipo de material você procura?';
  }
  return `Perfeito, já registrei ${productLabel(conversation.product)} para ${conversation.city}. Para deixar sua ficha bem direcionada, qual é a aplicação, medida ou quantidade aproximada?`;
}

function rememberQualificationQuestion(conversation) {
  conversation.awaitingField = nextRequiredQualification(conversation);
  conversations.set(conversation.phone, conversation);
}

function requiredQualificationReply(conversation) {
  return conversation.commercialHandoffRequested
    ? commercialQualificationReply(conversation)
    : conversation.purchaseIntent
      ? purchaseInterestReply(conversation)
      : qualificationReply(conversation);
}

function enforceCommercialBoundaries(reply, conversation) {
  const normalized = normalizeText(reply);
  const offersQuote = /\b(posso|podemos|vou|vamos|consigo|iremos)\b.{0,40}\b(preparar|fazer|montar|calcular|enviar|passar)\b.{0,30}\b(orcamento|cotacao|preco|valor)\b/.test(normalized);
  const statesPrice = /\b(o preco|o valor|fica por|custa|sai por)\b/.test(normalized);
  const claimsStockOrDelivery = /\b(temos|produto|material)\b.{0,30}\b(em estoque|disponivel para entrega|pronta entrega)\b|\b(entregamos|chega)\b.{0,20}\b(hoje|amanha|em \d+ dias)\b/.test(normalized);
  const mentionsCompetitor = /\b(concorrente|concorrencia|outra empresa|outra marca)\b/.test(normalized);
  return offersQuote || statesPrice || claimsStockOrDelivery || mentionsCompetitor
    ? qualificationReply(conversation)
    : reply;
}

async function crmFetch(path, options = {}) {
  if (!crmBaseUrl) throw new Error('CRM_API_BASE_URL nao configurado');
  const token = await getCrmToken();
  const response = await fetch(`${crmBaseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`CRM HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 300)}`);
  return payload;
}

async function listTransferOperators() {
  if (sellerDirectory.expiresAt > Date.now() && sellerDirectory.items.length) return sellerDirectory.items;
  const payload = await crmFetch('/v1/sellers');
  const items = Array.isArray(payload?.items) ? payload.items : [];
  sellerDirectory = { items, expiresAt: Date.now() + SELLER_DIRECTORY_TTL_MS };
  return items;
}

async function requestedTransferTarget(text) {
  if (!wantsHumanSmart(text)) return null;
  try {
    const target = resolveNamedOperator(text, await listTransferOperators());
    if (target) return target;
  } catch (error) {
    console.error(JSON.stringify({ event: 'seller_directory_error', message: error.message }));
  }
  return requestedPietra(text) && pietraPhone ? { name: pietraName, phone: pietraPhone } : null;
}

async function getCrmToken() {
  if (crmSession.token && crmSession.expiresAt > Date.now()) return crmSession.token;
  if (!crmEmail || !crmPassword) throw new Error('Credenciais do CRM nao configuradas');
  const response = await fetch(`${crmBaseUrl}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: crmEmail, password: crmPassword })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.token) {
    throw new Error(`Login CRM falhou ${response.status}: ${JSON.stringify(payload).slice(0, 200)}`);
  }
  crmSession = { token: payload.token, expiresAt: Date.now() + 55 * 60 * 1000 };
  return crmSession.token;
}

function handoffSummary(conversation) {
  const useful = conversation.messages
    .map((message) => `${message.from === 'assistant' ? 'Abraão' : 'Cliente'}: ${message.text}`)
    .filter(Boolean)
    .slice(-8)
    .join('\n');
  return [
    `Atendimento iniciado pelo bot.`,
    conversation.name ? `Nome: ${conversation.name}.` : '',
    conversation.city ? `Cidade: ${conversation.city}.` : '',
    conversation.uf ? `UF: ${conversation.uf}.` : '',
    conversation.product ? `Interesse: ${conversation.product}.` : '',
    useful ? `Prévia do diálogo:\n${useful}` : ''
  ].filter(Boolean).join('\n').slice(0, 1000);
}

function appendCrmCaseLink(message, baseUrl, caseId) {
  const root = String(baseUrl || '').replace(/\/+$/, '');
  if (!root || !caseId) return message;
  return `${message}\nFicha no CRM: ${root}/crm?case=${encodeURIComponent(caseId)}`;
}

function inferBotSalesFunction(conversation) {
  const text = normalizeText([conversation.product, ...conversation.messages.map((message) => message.text)].join(' '));
  if (/(construcao|construtora|obra|engenharia|civil|empreiteira)/.test(text)) return 'construcao_civil';
  if (/(industria|industrial|revenda|revendedor|distribuidor|atacado|empresa|cnpj|deposito|serralheria)/.test(text)) return 'corporativo';
  return 'especialista';
}

async function createHandoff(phone, conversation) {
  if (!conversation.city) throw new Error('Cidade obrigatoria para roteamento');
  const created = await crmFetch('/v1/cases', {
    method: 'POST',
    body: JSON.stringify({
      name: conversation.name || 'Cliente WhatsApp',
      phone: `+${phone}`,
      city: conversation.city || null,
      uf: conversation.uf || null,
      need: handoffSummary(conversation),
      salesFunction: inferBotSalesFunction(conversation),
      requireRoutedDestination: true,
      source: 'WhatsApp',
      department: 'Vendas',
      pipeline: 'VAREJO',
      stage: 'Novo Lead',
      nextTask: 'Assumir atendimento transferido pelo bot',
      ...(conversation.transferTarget?.phone ? {
        responsibleName: conversation.transferTarget.name,
        responsiblePhone: `+${conversation.transferTarget.phone}`
      } : {})
    })
  });
  let outbox = {};
  if (created.case?.id) {
    outbox = await crmFetch(`/v1/cases/${encodeURIComponent(created.case.id)}/outbox/handoff-message`, {
      method: 'POST',
      body: JSON.stringify({})
    }).catch((error) => ({ error: error.message }));
  }
  return { created, outbox };
}

async function transferToSeller(phone, conversation) {
  const { created, outbox } = await createHandoff(phone, conversation);
  const handoff = created.handoff || {};
  const command = outbox.command || {};
  const message = appendCrmCaseLink(handoff.message || command.payload?.message || '', crmBaseUrl, created.case?.id);
  const destinationPhone = handoff.destination_phone || command.payload?.destination_phone || '';
  const sellerName = handoff.destination_name || 'vendedor responsavel';
  const protocol = handoff.protocol || created.case?.protocol || command.payload?.protocol || '';
  const normalizedDestination = normalizePhone(destinationPhone);
  if (!normalizedDestination || BLOCKED_DESTINATION_PHONES.has(normalizedDestination)) {
    throw new Error(`routing_destination_unavailable: ${sellerName}`);
  }

  // The CRM record already exists at this point. Lock the conversation before
  // any network send so a retry cannot create another case/protocol.
  conversation.handoffAt = Date.now();
  conversation.pendingHandoff = false;
  conversation.purchaseIntent = false;
  conversation.commercialHandoffRequested = false;
  conversation.transferTarget = null;
  conversations.set(phone, conversation);

  if (message) {
    const sellerRecipient = await resolveWhatsAppRecipient(normalizedDestination);
    await sendWhatsAppText(sellerRecipient, message);
  }
  await sendCustomerReply(phone, `Obrigado pela conversa! Já encaminhei sua ficha para ${sellerName}, que continuará o atendimento.${protocol ? ` Protocolo ${protocol}.` : ''}`);
  return { sellerName, protocol, destinationPhone: Boolean(destinationPhone) };
}

async function resolveWhatsAppRecipient(phone) {
  const normalized = normalizePhone(phone);
  const response = await fetch(`${wuzapiBaseUrl}/user/check`, {
    method: 'POST',
    headers: {
      Token: wuzapiToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ Phone: [normalized] })
  });
  const payload = await response.json().catch(() => ({}));
  const user = payload?.data?.Users?.find((item) => normalizePhone(item?.Query) === normalized)
    || payload?.data?.Users?.[0];
  if (!response.ok || payload?.success === false || !user?.IsInWhatsapp || !user?.JID) {
    throw new Error(`whatsapp_destination_unavailable: ${normalized}`);
  }
  return user.JID;
}

async function sendWhatsAppText(phone, body) {
  const response = await fetch(`${wuzapiBaseUrl}/chat/send/text`, {
    method: 'POST',
    headers: {
      Token: wuzapiToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      Phone: phone,
      Body: body,
      Id: crypto.randomBytes(16).toString('hex').toUpperCase()
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(`WuzAPI send failed ${response.status}: ${JSON.stringify(payload).slice(0, 300)}`);
  }
  return payload;
}

async function sendCustomerReply(phone, body) {
  const reply = conversationalPunctuation(body);
  const result = await sendWhatsAppText(phone, reply);
  const conversation = conversations.get(phone);
  if (conversation) {
    conversation.messages.push({ from: 'assistant', text: reply, at: new Date().toISOString() });
    conversation.messages = conversation.messages.slice(-MAX_HISTORY);
    conversations.set(phone, conversation);
  }
  return result;
}

async function handleWebhook(req, res) {
  const raw = await readBody(req);
  const payload = raw ? JSON.parse(raw) : {};
  const incoming = extractIncoming(payload);

  if (incoming.ignored) {
    console.log(JSON.stringify({ event: 'ignored', reason: incoming.ignored }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, ignored: incoming.ignored }));
    return;
  }

  const { phone, text, id } = incoming;
  if (!phone || !text) {
    console.log(JSON.stringify({ event: 'ignored', reason: 'missing_phone_or_text', payloadKeys: Object.keys(payload || {}) }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, ignored: 'missing_phone_or_text' }));
    return;
  }

  if (allowedPhones.size && !allowedPhones.has(phone)) {
    console.log(JSON.stringify({ event: 'ignored', reason: 'not_allowed', phone }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, ignored: 'not_allowed' }));
    return;
  }

  if (!remember(id)) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, ignored: 'duplicate' }));
    return;
  }

  console.log(JSON.stringify({ event: 'incoming', phone, id, preview: text.slice(0, 80) }));
  const conversation = upsertConversation(phone, text);
  const explicitHandoff = wantsHumanSmart(text);
  const quoteRequest = wantsQuote(text);
  const purchaseRequest = wantsPurchase(text);
  if (purchaseRequest) conversation.purchaseIntent = true;
  if (quoteRequest) conversation.commercialHandoffRequested = true;
  if (explicitHandoff) {
    const requestedTarget = await requestedTransferTarget(text);
    conversation.transferTarget = requestedTarget;
  }
  if (explicitHandoff || ((conversation.purchaseIntent || conversation.commercialHandoffRequested) && !nextRequiredQualification(conversation))) {
    conversation.pendingHandoff = true;
  }
  conversations.set(phone, conversation);
  if (conversation.handoffAt && Date.now() - conversation.handoffAt < HANDOFF_LOCK_MS) {
    console.log(JSON.stringify({ event: 'ignored', reason: 'handoff_lock', phone, id }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, ignored: 'handoff_lock' }));
    return;
  }

  const greeting = greetingReply(text);
  const customerMessageCount = conversation.messages.filter((message) => message.from === 'customer').length;
  if (greeting && customerMessageCount === 1) {
    await sendCustomerReply(phone, greeting);
    console.log(JSON.stringify({ event: 'introduced', phone, id }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (wantsPortfolio(text)) {
    await sendCustomerReply(phone, PORTFOLIO_REPLY);
    console.log(JSON.stringify({ event: 'portfolio_replied', phone, id }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (purchaseRequest && !quoteRequest && !conversation.pendingHandoff) {
    const reply = purchaseInterestReply(conversation);
    rememberQualificationQuestion(conversation);
    await sendCustomerReply(phone, reply);
    console.log(JSON.stringify({ event: 'purchase_interest', phone, id }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if ((conversation.purchaseIntent || conversation.commercialHandoffRequested) && !conversation.pendingHandoff) {
    const reply = conversation.commercialHandoffRequested
      ? commercialQualificationReply(conversation)
      : qualificationReply(conversation);
    rememberQualificationQuestion(conversation);
    await sendCustomerReply(phone, reply);
    console.log(JSON.stringify({ event: 'commercial_qualification', phone, id }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  const missing = missingQuestions(conversation);
  if (missing.length && conversation.pendingHandoff) {
    const reply = requiredQualificationReply(conversation);
    rememberQualificationQuestion(conversation);
    await sendCustomerReply(phone, reply);
    console.log(JSON.stringify({ event: 'asked_missing_before_handoff', phone, id, missing }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (isReadyForHandoff(conversation, text)) {
    try {
      const result = await transferToSeller(phone, conversation);
      console.log(JSON.stringify({ event: 'handoff_created', phone, id, sellerName: result.sellerName, protocol: result.protocol, sentToSeller: result.destinationPhone }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, handoff: true }));
      return;
    } catch (error) {
      console.error(JSON.stringify({ event: 'handoff_error', phone, id, message: error.message }));
      conversation.pendingHandoff = false;
      conversations.set(phone, conversation);
      const cityIssue = /routing_city_required|Cidade obrigatoria/i.test(error.message);
      const destinationIssue = /routing_destination_unavailable/i.test(error.message);
      await sendCustomerReply(
        phone,
        cityIssue
          ? 'Em qual cidade e UF voce precisa do atendimento?'
          : destinationIssue
            ? 'Nao consegui concluir a transferencia agora. Vou acionar a equipe comercial para continuar seu atendimento.'
          : conversation.handoffAt
            ? 'Sua solicitacao foi registrada, mas nao consegui avisar o vendedor pelo WhatsApp agora. A equipe comercial vai continuar o atendimento sem gerar um novo protocolo.'
            : 'Tive uma falha momentanea antes de registrar a transferencia. Vou acionar a equipe comercial para continuar seu atendimento.'
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, handoff: false, error: 'handoff_error' }));
      return;
    }
  }

  const reply = await askGroq(text, phone);
  await sendCustomerReply(phone, reply);
  console.log(JSON.stringify({ event: 'replied', phone, id }));

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === 'POST' && req.url === '/webhook') {
      await handleWebhook(req, res);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  } catch (error) {
    console.error(JSON.stringify({ event: 'error', message: error.message, stack: error.stack }));
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: error.message }));
  }
});

if (process.env.BOT_TEST_MODE !== 'true') {
  server.listen(port, () => {
    console.log(JSON.stringify({ event: 'started', port, groqModel, allowedPhones: [...allowedPhones] }));
  });
}

export { appendCrmCaseLink, commercialQualificationReply, conversationalPunctuation, enforceCommercialBoundaries, extractFactsSmart, greetingReply, handoffSummary, hasQualificationDetail, isReadyForHandoff, missingQuestions, purchaseInterestReply, qualificationReply, requestedPietra, resolveNamedOperator, wantsHumanSmart, wantsPortfolio, wantsPurchase, wantsQuote };
