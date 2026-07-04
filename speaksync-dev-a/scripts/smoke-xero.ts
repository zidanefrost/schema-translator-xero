import "dotenv/config";
import { getXero } from "../src/xero/auth";

async function main() {
  console.log("Authenticating with Xero (Custom Connection, client-credentials)...");
  const { client, tenantId } = await getXero();
  console.log(`Connected. tenantId = ${tenantId}`);

  const res = await client.accountingApi.getContacts(tenantId);
  const contacts = res.body.contacts ?? [];

  console.log(`\nFound ${contacts.length} contacts in the connected org:\n`);
  for (const c of contacts.slice(0, 20)) {
    console.log(`  - ${c.name}  (${c.contactID})`);
  }

  if (contacts.length === 0) {
    console.warn(
      "\nNo contacts found. If this is meant to be the Xero Demo Company, " +
        "confirm the Custom Connection is actually pointed at it."
    );
  } else {
    console.log(
      "\n✅ Phase 1 verified: real Xero auth works and contacts were listed."
    );
  }
}

main().catch((err) => {
  console.error("\n❌ Phase 1 smoke test failed:\n", err);
  process.exit(1);
});
