// One-off probe: can we record a £1 payment against INV-1042 using the
// Demo Company's conventional bank account code(s)? The Custom Connection
// lacks accounting.settings.read, so we can't LIST accounts — but the
// payments scope lets us WRITE, so we try the standard codes empirically.
import "dotenv/config";
import { nodeExecutor } from "../src/xero/executor.node";

const CANDIDATE_CODES = ["090", "091", "088", "800"];

(async () => {
  const inv = await nodeExecutor.findInvoiceByNumber("INV-1042");
  if (!inv) throw new Error("INV-1042 not found — run seed-contacts first");
  console.log(`target: INV-1042 (${inv.status}, due ${inv.amountDue})`);

  for (const code of CANDIDATE_CODES) {
    try {
      const res = await nodeExecutor.createPayment({
        invoiceId: inv.invoiceId,
        accountCode: code,
        amount: 1,
        date: new Date().toISOString().slice(0, 10),
      });
      console.log(`SUCCESS with account code ${code}: payment ${res.id} (${res.status})`);
      process.exit(0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`code ${code} failed: ${msg.slice(0, 200)}`);
    }
  }
  console.log("No candidate code worked.");
  process.exit(1);
})();
