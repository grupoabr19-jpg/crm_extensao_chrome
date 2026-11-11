from pathlib import Path
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright
import os

root = Path(__file__).parent
load_dotenv(root / '.env')

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.set_default_timeout(30000)
    page.goto(os.environ['ASTER_URL'], wait_until='domcontentloaded')
    page.locator(os.environ['ASTER_USERNAME_SELECTOR']).fill(os.environ['ASTER_USERNAME'])
    page.locator(os.environ['ASTER_PASSWORD_SELECTOR']).fill(os.environ['ASTER_PASSWORD'])
    page.locator(os.environ['ASTER_LOGIN_BUTTON_SELECTOR']).click()
    page.wait_for_url(lambda url: '/login' not in url.lower(), timeout=60000)
    page.wait_for_timeout(10000)
    print('URL', page.url)
    print((page.locator('body').inner_text() or '')[:20000])
    print('LINKS', page.locator('a').all_inner_texts()[:100])
    print('BUTTONS', page.locator('button').all_inner_texts()[:100])
    page.locator('section').get_by_text('Parceiro de Negócio por CNPJ', exact=True).click(force=True)
    page.wait_for_timeout(5000)
    print('PARTNER_URL', page.url)
    print((page.locator('body').inner_text() or '')[:20000])
    print('INPUTS', page.locator('input').evaluate_all("els => els.map(e => ({name:e.name,id:e.id,placeholder:e.placeholder,type:e.type}))"))
    print('SELECTS', page.locator('select').evaluate_all("els => els.map(e => ({name:e.name,id:e.id,options:Array.from(e.options).map(o=>o.text).slice(0,20)}))"))
    print('PARTNER_BUTTONS', page.locator('button').all_inner_texts()[:100])
    page.goto('https://aster.gruposps.com.br/BusinessPartners', wait_until='domcontentloaded')
    page.wait_for_timeout(8000)
    print('LIST_URL', page.url)
    print((page.locator('body').inner_text() or '')[:20000])
    print('LIST_INPUTS', page.locator('input').evaluate_all("els => els.map(e => ({name:e.name,id:e.id,placeholder:e.placeholder,type:e.type}))"))
    print('LIST_BUTTONS', page.locator('button').all_inner_texts()[:100])
    search = page.locator('input[placeholder="Pesquisar..."]').first
    search.click(force=True)
    page.wait_for_timeout(1000)
    print('TOP_AFTER_CLICK', (page.locator('body').inner_text() or '')[:5000])
    print('TOP_INPUTS', page.locator('input').evaluate_all("els => els.map(e => ({name:e.name,id:e.id,placeholder:e.placeholder,type:e.type,readonly:e.readOnly}))"))
    search = page.locator('input[placeholder="Buscar aplicações e menus..."]').first
    search.fill('simulação')
    search.press('Enter')
    page.wait_for_timeout(5000)
    print('SEARCHED_BODY', (page.locator('body').inner_text() or '')[:10000])
    page.screenshot(path=str(root / 'output' / 'aster_inspect_home.png'), full_page=True)
    browser.close()
