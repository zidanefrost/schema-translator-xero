import { XeroClient } from "xero-node";

// Phase 1 (critical path): Custom Connection, client-credentials grant,
// single organisation (the Xero Demo Company). No OAuth redirect flow.
//
// NOTE: verify method names/signatures against the current xero-node docs
// on developer.xero.com before relying on this — SDK versions drift.

let cachedClient: XeroClient | null = null;
let cachedTenantId: string | null = null;
let tokenExpiresAt = 0; // epoch ms

function assertEnv() {
  const { XERO_CLIENT_ID, XERO_CLIENT_SECRET } = process.env;
  if (!XERO_CLIENT_ID || !XERO_CLIENT_SECRET) {
    throw new Error(
      "Missing XERO_CLIENT_ID / XERO_CLIENT_SECRET — set them in .env (see .env.example)"
    );
  }
  return { XERO_CLIENT_ID, XERO_CLIENT_SECRET };
}

/**
 * Returns an authenticated XeroClient + the connected tenantId, fetching
 * or refreshing the client-credentials token as needed. Custom Connections
 * are scoped to exactly one organisation, so there is only ever one tenant.
 */
export async function getXero(): Promise<{ client: XeroClient; tenantId: string }> {
  const now = Date.now();

  if (cachedClient && cachedTenantId && now < tokenExpiresAt - 30_000) {
    return { client: cachedClient, tenantId: cachedTenantId };
  }

  const { XERO_CLIENT_ID, XERO_CLIENT_SECRET } = assertEnv();

  const client = new XeroClient({
    clientId: XERO_CLIENT_ID,
    clientSecret: XERO_CLIENT_SECRET,
    grantType: "client_credentials",
  });

  const tokenSet = await client.getClientCredentialsToken();
  // tokenSet.expires_in is in seconds
  tokenExpiresAt = Date.now() + (tokenSet.expires_in ?? 1800) * 1000;

  const tenants = await client.updateTenants(false);
  if (!tenants || tenants.length === 0) {
    throw new Error(
      "Xero auth succeeded but no connected tenant was returned — confirm " +
        "the Custom Connection is enabled on the target org (Xero Demo Company)."
    );
  }

  const tenantId = tenants[0].tenantId;
  cachedClient = client;
  cachedTenantId = tenantId;

  return { client, tenantId };
}
