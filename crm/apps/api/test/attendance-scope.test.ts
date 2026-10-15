import { describe, expect, it } from "vitest";
// The API storage module is JavaScript and has no declaration file.
// @ts-expect-error Runtime import covered by this focused test.
import { makeMemoryStorage } from "../src/storage.mjs";

function storage() {
  let protocolSequence = 0;
  return makeMemoryStorage({
    protocol: () => `ABR-TEST-${++protocolSequence}`,
    handoffLink: () => "https://wa.me/5511999999999",
    externalHandoffMessage: () => "Teste"
  });
}

describe("attendance KPI scope", () => {
  it("shows only the operator's cases while supervisors and admins see all cases", async () => {
    const db = storage();
    const state = await db.bootstrap();
    const seller = state.users.find((user: { role: string }) => user.role === "seller");

    await db.createCase({ name: "Cliente do vendedor", phone: "+5511999991001", pipeline: "VAREJO" });
    await db.createCase({
      name: "Cliente de outro vendedor",
      phone: "+5511999991002",
      pipeline: "VAREJO",
      responsibleName: "Outro vendedor",
      responsiblePhone: "+5511999991003"
    });

    const own = await db.kpis("VAREJO", { userId: seller.id, role: "seller" });
    const supervisor = await db.kpis("VAREJO", { userId: "supervisor-id", role: "supervisor" });
    const admin = await db.kpis("VAREJO", { userId: "admin-id", role: "admin" });

    expect(own.scope.mode).toBe("self");
    expect(own.totals.cases).toBe(1);
    expect(supervisor.scope.mode).toBe("all");
    expect(supervisor.totals.cases).toBe(2);
    expect(admin.scope.mode).toBe("all");
    expect(admin.totals.cases).toBe(2);
  });
});
