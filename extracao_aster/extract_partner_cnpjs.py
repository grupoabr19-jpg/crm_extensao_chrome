from __future__ import annotations

import csv
import json
import re
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from dotenv import load_dotenv
from openpyxl import load_workbook
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")
INPUT = ROOT / "output" / "inativos.xlsx"
OUTPUT = ROOT / "output" / "inativos_cnpj.csv"
API = "https://astersrv.gruposps.com.br/APP/CRM/BusinessPartners/{}"


def norm(value: object) -> str:
    text = " ".join(str(value or "").split()).strip().upper()
    return "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))


def load_clients() -> list[tuple[str, str]]:
    workbook = load_workbook(INPUT, read_only=True, data_only=True)
    sheet = workbook["Base bruta 60+"]
    result: list[tuple[str, str]] = []
    seen: set[str] = set()
    for code, name in sheet.iter_rows(min_row=2, max_col=2, values_only=True):
        code = str(code or "").strip()
        name = " ".join(str(name or "").split()).strip()
        if code and name and code not in seen:
            result.append((code, name))
            seen.add(code)
    return result


def convert(code: str, expected_name: str, payload: dict) -> dict[str, str]:
    actual_name = str(payload.get("CardName") or "").strip()
    cnpj = str(payload.get("TaxId0") or "").strip()
    if not cnpj:
        for address in payload.get("Addresses") or []:
            cnpj = str(address.get("TaxId0") or "").strip()
            if cnpj:
                break
    return {
        "codigo": code,
        "nome_base": expected_name,
        "razao_social_aster": actual_name,
        "cnpj": cnpj,
        "nome_confere": "SIM" if norm(expected_name) == norm(actual_name) else "NAO",
        "tipo_pessoa": str(payload.get("U_TIPOPESSOA") or ""),
        "status": str(payload.get("_Status") or ""),
    }


def main() -> None:
    clients = load_clients()
    test_code = os.environ.get("ASTER_TEST_CODE")
    if test_code:
        clients = [item for item in clients if item[0] == test_code]
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, args=["--disable-web-security"])
        context = browser.new_context()
        page = context.new_page()
        captured_headers: dict[str, str] = {}
        def capture_headers(request) -> None:
            if "astersrv.gruposps.com.br" in request.url and "authorization" in request.headers:
                captured_headers.update({key: value for key, value in request.all_headers().items() if key not in {"host", "content-length"}})
        page.on("request", capture_headers)
        page.set_default_timeout(60_000)
        page.goto(os.environ["ASTER_URL"], wait_until="domcontentloaded")
        page.locator(os.environ["ASTER_USERNAME_SELECTOR"]).fill(os.environ["ASTER_USERNAME"])
        page.locator(os.environ["ASTER_PASSWORD_SELECTOR"]).fill(os.environ["ASTER_PASSWORD"])
        page.locator(os.environ["ASTER_LOGIN_BUTTON_SELECTOR"]).click()
        page.wait_for_url(lambda url: "/login" not in url.lower(), timeout=60_000)
        page.locator("button").filter(has_text=re.compile("Parceiro")).first.click(force=True)
        page.get_by_text(re.compile("Parceiro de Neg")).last.click(force=True)
        page.wait_for_timeout(3000)
        if "/BusinessPartners" not in page.url:
            page.goto(f"{os.environ['ASTER_BASE_URL'].rstrip('/')}/BusinessPartners", wait_until="domcontentloaded")
        page.wait_for_selector('input[placeholder="Pesquisar"]', timeout=60_000)
        page.wait_for_timeout(1000)
        print(f"cabecalhos_api={sorted(captured_headers.keys())}", flush=True)
        company_token = page.evaluate("localStorage.getItem('companyToken')")
        if not company_token:
            raise RuntimeError("Token da empresa do Aster não encontrado na sessão")
        results: list[dict[str, str]] = []
        for start in range(0, len(clients), 200):
            batch = clients[start:start + 200]
            codes = [code for code, _ in batch]
            payloads = page.evaluate("""async (args) => {
                return await Promise.all(args.codes.map(async (code) => {
                    try {
                        const headers = {authorization: `Bearer ${args.token}`, connectionalias: args.headers.connectionalias || 'Aster', crid: args.headers.crid || '[object Object]', eventname: '', locale: args.headers.locale || 'pt-BR', sktid: args.headers.sktid || '', accept: 'application/json, text/plain, */*'};
                        const response = await fetch(args.base + encodeURIComponent(code), {credentials: 'include', headers});
                        if (!response.ok) return {error: `HTTP ${response.status} ${await response.text()}`};
                        return await response.json();
                    } catch (error) { return {error: String(error)}; }
                }));
            }""", {"base": API, "codes": codes, "token": company_token, "headers": captured_headers})
            for index, ((code, name), payload) in enumerate(zip(batch, payloads), start=1):
                results.append(convert(code, name, payload) if "error" not in payload else {"codigo": code, "nome_base": name, "erro": str(payload["error"])})
            print(f"consultados={min(start + len(batch), len(clients))}/{len(clients)}", flush=True)
        browser.close()

    results.sort(key=lambda row: row["codigo"])
    fields = ["codigo", "nome_base", "razao_social_aster", "cnpj", "nome_confere", "tipo_pessoa", "status", "erro"]
    with OUTPUT.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore", delimiter=";")
        writer.writeheader()
        writer.writerows(results)
    print(json.dumps({"total": len(results), "com_cnpj": sum(bool(r.get("cnpj")) and r.get("nome_confere") == "SIM" for r in results), "output": str(OUTPUT)}, ensure_ascii=False))


if __name__ == "__main__":
    import os
    main()
