# Aster V2 — Meta Varejo

Implementação nova e isolada para extrair o **Resumo Comercial** do Aster, atualizar os lançamentos diários da planilha e enviar o e-mail comercial diário.

## Fluxo

1. Às 05:00, um agendador faz `POST /run` com `Authorization: Bearer TRIGGER_TOKEN`.
2. O serviço abre o Aster com Playwright, autentica e baixa o Resumo Comercial filtrado para o dia anterior.
3. O CSV é validado: vendedor, tipo, região, segmento, peso total e valor total.
4. A planilha é lida pelo Apps Script V2 somente nas abas `1_Lançamentos Diários`, `4_Metas` e `5_Configurações`.
5. Os nomes do Aster são associados aos vendedores da aba `4_Metas` por normalização e tokens.
6. O serviço preserva lançamentos manuais, remove somente a fotografia automática anterior da mesma data e publica a nova fotografia de forma idempotente.
7. O e-mail é montado com totais do dia, meta diária total, atingimento, vendedores, regiões e ranking acumulado.

## Segurança da implantação

A variável `DRY_RUN=true` é obrigatória no primeiro deploy. Nesse modo, o Aster é extraído e os cálculos são executados, mas nenhuma escrita é feita na planilha e nenhum e-mail é enviado. Depois de validar o `output/last_run.json`, altere para `DRY_RUN=false`.

O sistema usa um Apps Script V2 separado. Não reutilize o endpoint legado. Publique `apps_script/SheetApiV2.gs` como Web App, configure `SPREADSHEET_ID` e `ASTER_V2_TOKEN`, e informe a URL `/exec` em `SHEETS_V2_URL` e o mesmo token em `SHEETS_V2_TOKEN`.

## Variáveis obrigatórias

- `ASTER_URL`, `ASTER_USERNAME`, `ASTER_PASSWORD`;
- `ASTER_USERNAME_SELECTOR`, `ASTER_PASSWORD_SELECTOR`, `ASTER_LOGIN_BUTTON_SELECTOR`;
- `ASTER_REPORT_URL`, `ASTER_REPORT_READY_SELECTOR`, `ASTER_REPORT_DOWNLOAD_SELECTOR`;
- `ASTER_REPORT_CARD_SELECTOR` se o relatório precisar ser aberto por cartão;
- `ASTER_REPORT_START_DATE_SELECTOR` e `ASTER_REPORT_END_DATE_SELECTOR`;
- `SHEETS_V2_URL`, `SHEETS_V2_TOKEN` e `TRIGGER_TOKEN`.

Para habilitar e-mail, configure também `EMAIL_ENABLED=true`, SMTP, `MAIL_FROM` e `MAIL_TO`. O fuso padrão é `America/Sao_Paulo`.

## Execução local

```bash
python -m pip install -r requirements.txt
python -m playwright install chromium
DRY_RUN=true python main.py --date 2026-09-09
```

## Render

O serviço continua sendo o Web Service Docker já conectado ao repositório. O health check é `/health`, e o processo usa `web_app:app`. O agendador pode ser o Render Cron ou outro serviço externo, fazendo POST diário às 05:00 no horário de São Paulo.

## Testes

```bash
python -m unittest discover -s tests -v
```

Os módulos antigos foram movidos para `legacy_v1/` e não participam mais da execução V2.
