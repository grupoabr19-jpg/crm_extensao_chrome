# ABR Diagnóstico WhatsApp Web (somente leitura)

Mede o que o WhatsApp Web permite OBSERVAR. **Não envia mensagens, não escreve na página, não faz requisições de rede.**
Permissões: apenas `web.whatsapp.com` e `storage` (guarda o relatório no navegador, dentro da extensão).

## Instalar (nos dois Chromes)
1. Extraia o zip. 2. `chrome://extensions` → ligue **Modo do desenvolvedor** → **Carregar sem compactação** → escolha a pasta.
3. Abra/recarregue `web.whatsapp.com`. Aparece o botão **ABR diag** no canto superior direito.

## Roteiro (use só conversas de teste entre os dois números; ~10 min por navegador)
Para cada passo: escolha o cenário no painel e clique **Capturar**.
1. Nenhuma conversa aberta (só a lista).
2. Abra a conversa individual com o outro número de teste (com algumas mensagens visíveis).
3. Abra um **grupo de teste** (crie um com os 2 números, se não houver).
4. Na conversa individual, **digite algo no campo sem enviar** (ex.: "teste") e capture.
5. Escolha "janela de observação", clique **Observar 60 s** e, nesse tempo, **envie uma mensagem do outro número** para esta conversa; depois mande mais uma igual.
Repita tudo no segundo navegador. (Opcional: troque o idioma do WhatsApp e repita o passo 2.)

## Entregar
**Ver relatório** → copie tudo, ou **Baixar .json**. Mande os dois arquivos (um por navegador/número) e diga qual é o "principal".
**Antes de enviar, abra o JSON e confira**: ele não deve conter textos de mensagens, nomes nem telefones (só "formas" como `<digits:13>`).
