from pathlib import Path
import os
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright
import re

root = Path(__file__).parent
load_dotenv(root / '.env')

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()
    page.set_default_timeout(30000)
    def log_response(response):
        if response.url.endswith('BusinessPartners?$filter='):
            try:
                payload = response.json()
                print('LIST_JSON_TYPE', type(payload).__name__, 'LEN', len(payload) if hasattr(payload, '__len__') else None)
                if isinstance(payload, list) and payload:
                    print('LIST_JSON_FIRST_KEYS', list(payload[0].keys()))
            except Exception as exc:
                print('LIST_JSON_ERROR', exc)
            return
        if response.url.endswith('/C020098'):
            print('DETAIL_HEADERS_ALL', response.request.all_headers())
            try:
                payload = response.json()
                print('DETAIL_JSON', payload if isinstance(payload, dict) else type(payload).__name__)
            except Exception as exc:
                print('DETAIL_JSON_ERROR', exc)
        elif any(token in response.url.lower() for token in ['api', 'business', 'partner', 'search']):
            print('RESPONSE', response.status, response.url)
    page.on('response', log_response)
    page.goto(os.environ['ASTER_URL'], wait_until='domcontentloaded')
    page.locator(os.environ['ASTER_USERNAME_SELECTOR']).fill(os.environ['ASTER_USERNAME'])
    page.locator(os.environ['ASTER_PASSWORD_SELECTOR']).fill(os.environ['ASTER_PASSWORD'])
    page.locator(os.environ['ASTER_LOGIN_BUTTON_SELECTOR']).click()
    page.wait_for_url(lambda url: '/login' not in url.lower(), timeout=60000)
    menu_item = page.locator('button').filter(has_text=re.compile('Parceiro')).first
    menu_item.click(force=True)
    page.get_by_text(re.compile('Parceiro de Neg')).last.click(force=True)
    page.wait_for_timeout(5000)
    search = page.locator('input[placeholder="Pesquisar"]').first
    search.fill('C020098')
    search.press('Enter')
    page.wait_for_timeout(3000)
    page.get_by_text('C020098', exact=True).click(force=True)
    page.wait_for_timeout(2000)
    if page.get_by_role('button', name='Sim').count():
        page.get_by_role('button', name='Sim').click(force=True)
        page.wait_for_timeout(2000)
    print('URL', page.url)
    print('COOKIES', context.cookies())
    print('LOCAL_STORAGE', page.evaluate("Object.fromEntries(Object.entries(localStorage))"))
    print('SESSION_STORAGE', page.evaluate("Object.fromEntries(Object.entries(sessionStorage))"))
    print('INPUTS', page.locator('input').evaluate_all("els => els.map(e => ({id:e.id,name:e.name,placeholder:e.placeholder,readonly:e.readOnly,value:e.value}))"))
    print('BUTTONS', page.locator('button').all_inner_texts()[:80])
    body = page.locator('body').inner_text() or ''
    print('BODY', body[:6000])
    browser.close()
