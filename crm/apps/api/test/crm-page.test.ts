import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../public/crm.html", import.meta.url), "utf8");

describe("CRM web page", () => {
  it("contains valid JavaScript in its inline scripts", () => {
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
    expect(scripts.length).toBeGreaterThan(0);
    for (const [index, match] of scripts.entries()) {
      const source = match[1];
      expect(source).toBeDefined();
      if (source !== undefined) {
        expect(() => new vm.Script(source, { filename: `crm-inline-${index}.js` })).not.toThrow();
      }
    }
  });

  it("keeps administrative views stacked instead of forcing them into a flex row", () => {
    expect(html).toContain(".admin.view.active{display:block}");
  });

  it("opens a directly linked CRM case after authentication", () => {
    expect(html).toContain("url.searchParams.get('case')");
    expect(html).toContain("openCard(result.case)");
  });

  it("exposes customer, sales and recoverable card deletion controls", () => {
    expect(html).toContain('id="navCustomers"');
    expect(html).toContain('id="navSales"');
    expect(html).toContain('class="cardDelete"');
    expect(html).toContain("method: 'DELETE'");
  });

  it("keeps the customer directory hidden until filtered and paginates the results", () => {
    expect(html).toContain('id="customerFilterForm"');
    expect(html).toContain('id="customerSegment"');
    expect(html).toContain('id="customerSeller"');
    expect(html).toContain('id="customerPageSize"');
    expect(html).toContain('<option value="25">25</option>');
    expect(html).toContain('<option value="50">50</option>');
    expect(html).toContain('<option value="100">100</option>');
    expect(html).toContain('Use a busca ou os filtros para localizar clientes.');
    expect(html).toContain("page_size: String(state.customerPageSize)");
  });

  it("requires value and order number in the won-sale workflow", () => {
    expect(html).toContain('id="orderNumber"');
    expect(html).toContain('won_order_number_required');
    expect(html).toContain('Venda perdida enviada ao funil de reativação.');
  });
  it("keeps team routing admin-only and separates attendance from the sales funnel", () => {
    expect(html).toContain("$('navAdmin').hidden = session.user.role !== 'admin'");
    expect(html).toContain("state.user?.role !== 'admin'");
    expect(html).toContain('id="navService"');
    expect(html).toContain('id="service"');
    expect(html).toContain('id="serviceScope"');
    expect(html).toContain("$('service').classList.toggle('active', name === 'service')");
    expect(html).toContain("if (name === 'service') loadKpis()");
    expect(html).toContain('id="sellerSalesGroup"');
    expect(html).toContain('id="teamSalesGroup"');
    expect(html).not.toContain('id="salesTotal"');
    expect(html).not.toContain('id="salesRows"');
    expect(html).not.toContain("$('kpis').hidden = name !== 'board'");
  });
});
