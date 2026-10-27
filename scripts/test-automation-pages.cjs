/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
async function main() {
  const base = process.env.DASHBOARD_TEST_URL || "http://localhost:3098";
  for (const path of [
    "/admin/automations",
    "/business/demo-motos/automations",
    "/business/demo-eats/automations",
    "/business/demo-salon/automations",
  ]) {
    const response = await fetch(base + path, {
      signal: AbortSignal.timeout(20000),
    });
    assert.equal(response.status, 200, path);
    const html = await response.text();
    assert.ok(!/Internal Server Error|data-next-error/.test(html), path);
    assert.ok(!/Available with Pro|Upgrade to Pro/.test(html), path);
    if (path.startsWith("/business/"))
      for (const text of [
        "Create Automation",
        "Recommended for",
        "Use Template",
        "Recent runs",
      ])
        assert.ok(html.includes(text), `${path}: ${text}`);
    else assert.ok(html.includes("Choose a business workspace"));
  }
  console.log(
    "PASS: live Super Admin selector and Demo Motos/Eats/Salon automation pages render builder, editable starters and run history without dashboard locks.",
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
