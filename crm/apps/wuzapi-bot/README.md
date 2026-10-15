# Bot WuzAPI

Bot HTTP usado pelo webhook da WuzAPI. O Abraão acolhe o cliente, responde dúvidas sobre o portfólio e enriquece a ficha antes do encaminhamento. Toda transferência exige nome, cidade, UF, produto e ao menos um detalhe útil da necessidade, inclusive quando o cliente pede diretamente por um vendedor.

O bot não oferece orçamento, preço, estoque, prazo, condições comerciais nem comparações com concorrentes. Na transferência, cria a ficha no CRM e envia ao vendedor a prévia do diálogo, o protocolo e o link direto da ficha.

As credenciais são fornecidas exclusivamente por variáveis de ambiente. Nunca copie perfis, QR Codes, tokens ou arquivos de ambiente para esta pasta.

As respostas ao cliente recebem um pequeno atraso proporcional ao tamanho da mensagem, com variação para evitar um ritmo mecânico. Os padrões são de 1,8 a 5 segundos. O comportamento pode ser ajustado com `REPLY_DELAY_ENABLED`, `REPLY_DELAY_MIN_MS`, `REPLY_DELAY_MAX_MS`, `REPLY_DELAY_PER_CHAR_MS` e `REPLY_DELAY_JITTER_MS`. Mensagens internas para vendedores não recebem esse atraso.
