"""Consulta CNPJ pela interface visual do Aster, sem chamadas diretas à API."""
from __future__ import annotations

import csv
import os
import re
import time
from pathlib import Path
from playwright.sync_api import sync_playwright
from dotenv import load_dotenv

ROOT = Path(__file__).parent
load_dotenv(ROOT / '.env')
INPUT = ROOT / 'output' / 'inativos_ab.csv'
OUTPUT = ROOT / 'output' / 'inativos_cnpj_ui.csv'

def main() -> None:
    with INPUT.open(encoding='utf-8-sig', newline='') as f:
        clients = list(csv.reader(f, delimiter=';'))
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_default_timeout(60_000)
        page.goto(os.environ['ASTER_URL'], wait_until='domcontentloaded')
        page.locator(os.environ['ASTER_USERNAME_SELECTOR']).fill(os.environ['ASTER_USERNAME'])
        page.locator(os.environ['ASTER_PASSWORD_SELECTOR']).fill(os.environ['ASTER_PASSWORD'])
        page.locator(os.environ['ASTER_LOGIN_BUTTON_SELECTOR']).click()
        page.wait_for_url(lambda url: '/login' not in url.lower(), timeout=60_000)
        page.locator('button').filter(has_text=re.compile('Parceiro')).first.click(force=True)
        page.get_by_text(re.compile('Parceiro de Neg')).last.click(force=True)
        page.wait_for_timeout(2000)
        if '/BusinessPartners' not in page.url:
            page.goto(f"{os.environ['ASTER_BASE_URL'].rstrip('/')}/BusinessPartners", wait_until='domcontentloaded')
        search = page.locator('input[placeholder="Pesquisar"]').first
        results = []
        for index, (code, expected_name) in enumerate(clients, 1):
            try:
                search.fill(code)
                search.press('Enter')
                page.get_by_text(code, exact=True).first.click(force=True)
                if page.get_by_role('button', name='Sim').count():
                    page.get_by_role('button', name='Sim').click(force=True)
                page.wait_for_selector('input[name="TaxId0"]', timeout=30_000)
                actual_name = page.locator('input').evaluate_all(
                    "(els, name) => (els.find(e => e.value && e.value.trim().toUpperCase() === name.trim().toUpperCase()) || {}).value || ''",
                    expected_name,
                )
                cnpj = page.locator('input[name="TaxId0"]').input_value().strip()
                results.append([code, expected_name, actual_name, cnpj, 'SIM' if actual_name.strip().upper() == expected_name.strip().upper() else 'NAO', ''])
            except Exception as error:
                results.append([code, expected_name, '', '', 'NAO', str(error)])
            if index % 25 == 0:
                print(f'processados={index}/{len(clients)}', flush=True)
        browser.close()
    with OUTPUT.open('w', encoding='utf-8-sig', newline='') as f:
        writer = csv.writer(f, delimiter=';')
        writer.writerow(['codigo', 'nome_base', 'nome_aster', 'cnpj', 'nome_confere', 'erro'])
        writer.writerows(results)

if __name__ == '__main__':
    main()
