/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require("node:assert/strict");
async function main(){const base=process.env.DASHBOARD_TEST_URL||"http://localhost:3099";for(const path of ["/admin","/business/demo-eats/settings","/business/demo-eats/inbox","/business/demo-motos/settings"]){const response=await fetch(base+path,{signal:AbortSignal.timeout(20000)});assert.equal(response.status,200,path);const html=await response.text();assert.ok(!/Internal Server Error|data-next-error|Available with Pro|Upgrade to Pro/.test(html),path);if(path.endsWith("/settings")){assert.ok(html.includes("WhatsApp product catalog"));assert.ok(html.includes("Product mappings"));}console.log(`PASS: ${path}`);}}
main().catch(error=>{console.error(error);process.exitCode=1;});
