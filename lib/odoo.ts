// lib/odoo.ts

export interface OdooConfig {
  url: string;
  db: string;
}

export interface OdooSession {
  uid: number;
  name: string;
  sessionId: string;
  config: OdooConfig;
}

async function rpc(
  config: OdooConfig,
  endpoint: string,
  params: any,
  sessionId?: string
) {
  const res = await fetch("/api/odoo/proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      odooUrl: config.url,
      endpoint,
      params,
      sessionId,
    }),
  });

  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(data.error || `Erreur ${res.status}`);
  }

  return { result: data.result, sessionId: data.sessionId };
}

// === AUTH ===
export async function authenticate(
  config: OdooConfig,
  login: string,
  password: string
): Promise<OdooSession> {
  const { result, sessionId: cookieSessionId } = await rpc(config, "/web/session/authenticate", {
    db: config.db,
    login,
    password,
  });

  if (!result || !result.uid || result.uid === false) {
    throw new Error("Identifiants incorrects");
  }

  // Le session_id peut venir du cookie ou du body
  const sid = cookieSessionId || result.session_id || "";

  return {
    uid: result.uid,
    name: result.name || result.username || login,
    sessionId: sid,
    config,
  };
}

// === GENERIC ===
async function call(session: OdooSession, endpoint: string, params: any) {
  const { result } = await rpc(session.config, endpoint, params, session.sessionId);
  return result;
}

export async function searchRead(
  session: OdooSession,
  model: string,
  domain: any[],
  fields: string[],
  limit = 0,
  order = ""
) {
  return call(session, "/web/dataset/call_kw", {
    model,
    method: "search_read",
    args: [domain],
    kwargs: { fields, limit, order },
  });
}

export async function callMethod(
  session: OdooSession,
  model: string,
  method: string,
  args: any[] = [],
  kwargs: any = {}
) {
  return call(session, "/web/dataset/call_kw", {
    model,
    method,
    args,
    kwargs,
  });
}

export async function create(session: OdooSession, model: string, values: any) {
  return call(session, "/web/dataset/call_kw", {
    model,
    method: "create",
    args: [values],
    kwargs: {},
  });
}

// === MÉTIERS ===

export async function getProductByBarcode(session: OdooSession, barcode: string) {
  const products = await searchRead(
    session,
    "product.product",
    [["barcode", "=", barcode]],
    ["id", "name", "barcode", "default_code", "uom_id", "tracking"],
    1
  );
  return products[0] || null;
}

export async function getStockAtLocation(session: OdooSession, productId: number, locationId: number) {
  return searchRead(
    session,
    "stock.quant",
    [
      ["product_id", "=", productId],
      ["location_id", "=", locationId],
    ],
    ["quantity", "lot_id", "reserved_quantity"]
  );
}

export async function getLocations(session: OdooSession) {
  return searchRead(
    session,
    "stock.location",
    [["usage", "=", "internal"]],
    ["id", "name", "complete_name", "barcode"],
    200,
    "complete_name"
  );
}

export async function getLocationByBarcode(session: OdooSession, barcode: string) {
  const locations = await searchRead(
    session,
    "stock.location",
    [["barcode", "=", barcode]],
    ["id", "name", "complete_name", "barcode"],
    1
  );
  return locations[0] || null;
}

export async function createInternalTransfer(
  session: OdooSession,
  sourceLocationId: number,
  destLocationId: number,
  lines: { productId: number; productName: string; qty: number; uomId: number; lotId?: number | null }[]
) {
  const pickingTypes = await searchRead(
    session,
    "stock.picking.type",
    [["code", "=", "internal"]],
    ["id"],
    1
  );
  if (!pickingTypes.length) throw new Error("Aucun type d'opération interne trouvé");

  const pickingId = await create(session, "stock.picking", {
    picking_type_id: pickingTypes[0].id,
    location_id: sourceLocationId,
    location_dest_id: destLocationId,
    move_ids_without_package: lines.map((line) => [
      0, 0, {
        name: line.productName,
        product_id: line.productId,
        product_uom_qty: line.qty,
        product_uom: line.uomId,
        location_id: sourceLocationId,
        location_dest_id: destLocationId,
        ...(line.lotId ? { lot_id: line.lotId } : {}),
      },
    ]),
  });

  await callMethod(session, "stock.picking", "action_confirm", [[pickingId]]);
  await callMethod(session, "stock.picking", "action_assign", [[pickingId]]);

  return pickingId;
}

export async function validatePicking(session: OdooSession, pickingId: number) {
  return callMethod(session, "stock.picking", "button_validate", [[pickingId]]);
}
