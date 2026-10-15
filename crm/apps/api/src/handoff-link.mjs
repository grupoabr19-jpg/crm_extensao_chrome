function cleanName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function firstName(value) {
  return cleanName(value).split(' ')[0] || '';
}

export function personalizedCustomerMessage({ customerName, responsibleName, publicProtocol } = {}) {
  const customer = firstName(customerName);
  const responsible = cleanName(responsibleName);
  const greeting = customer ? `Olá, ${customer}!` : 'Olá!';
  const introduction = responsible
    ? `Aqui é ${responsible}, do Grupo ABR.`
    : 'Falo em nome do Grupo ABR.';
  const protocol = cleanName(publicProtocol);
  const receipt = protocol
    ? `Recebi seu atendimento pelo protocolo ${protocol}.`
    : 'Recebi seu atendimento e vou dar continuidade por aqui.';
  return `${greeting} ${introduction} ${receipt}`;
}

export function handoffLink(targetE164, publicProtocol, messageOrContext = '') {
  if (!targetE164 || !String(targetE164).startsWith('+')) return '';
  const message = typeof messageOrContext === 'string' && messageOrContext.trim()
    ? messageOrContext.trim()
    : personalizedCustomerMessage({
      ...(messageOrContext && typeof messageOrContext === 'object' ? messageOrContext : {}),
      publicProtocol
    });
  return `https://wa.me/${String(targetE164).slice(1)}?text=${encodeURIComponent(message)}`;
}
