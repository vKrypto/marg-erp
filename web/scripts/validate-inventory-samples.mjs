/**
 * Loads web/js/inventory-csv.js in a VM and runs MargInventoryCsv.validateSamples().
 * Usage: node web/scripts/validate-inventory-samples.mjs
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.join(__dirname, "..", "js", "inventory-csv.js");
const code = fs.readFileSync(csvPath, "utf8");

const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const C = sandbox.MargInventoryCsv;
if (!C || typeof C.validateSamples !== "function") {
  console.error("MargInventoryCsv.validateSamples not found (check VM global).");
  process.exit(1);
}

const result = C.validateSamples();
if (!result.ok) {
  console.error("Sample CSV validation failed:\n");
  result.errors.forEach(function (e) {
    console.error("  - " + e);
  });
  process.exit(1);
}

console.log("Sample CSVs OK (products, vendors, customers, lots schema + cross-refs).");
