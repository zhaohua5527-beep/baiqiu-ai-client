const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const servicePath = path.join(__dirname, "..", "services", "verified-task-service.js");
const source = fs.readFileSync(servicePath, "utf8");
const marker = "window.__baiqiuCalculatorTest";
const markerIndex = source.indexOf(marker);
if (markerIndex < 0) throw new Error("calculator test hook missing");
const scriptStart = source.lastIndexOf("<script>", markerIndex);
const scriptEnd = source.indexOf("</script>", markerIndex);
if (scriptStart < 0 || scriptEnd < 0) throw new Error("calculator script block not found");
const script = source.slice(scriptStart + "<script>".length, scriptEnd).replace(/\\\\/g, "\\");

const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, { id, textContent: "", dataset: {}, addEventListener() {} });
  return elements.get(id);
}

const sandbox = {
  window: {},
  document: {
    getElementById: element,
    querySelectorAll: () => [],
    addEventListener: () => {}
  },
  console
};
vm.createContext(sandbox);
vm.runInContext(script, sandbox, { filename: "calculator-inline.js" });

const calc = sandbox.window.__baiqiuCalculatorTest;
const checks = [];
function check(name, actual, expected) {
  checks.push({ name, actual, expected, ok: actual === expected });
}

calc.clear();
check("55+55", calc.press("55+55="), "110");
check("digit after equals starts new input", calc.press("5"), "5");
calc.clear();
check("5*5", calc.press("5*5="), "25");
calc.clear();
check("10/4", calc.press("10/4="), "2.5");
calc.clear();
check("50%", calc.press("50%="), "0.5");
calc.clear();
check("decimal add", calc.press("0.1+0.2="), "0.3");

const ok = checks.every((item) => item.ok);
console.log(JSON.stringify({ ok, checks }, null, 2));
if (!ok) process.exit(1);
