// app/api/odoo/proxy/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { odooUrl, endpoint, params, sessionId } = body;

    if (!odooUrl || !endpoint) {
      return NextResponse.json({ error: "odooUrl et endpoint requis" }, { status: 400 });
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (sessionId) {
      headers["Cookie"] = `session_id=${sessionId}`;
    }

    const url = `${odooUrl.replace(/\/$/, "")}${endpoint}`;

    const odooRes = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        id: Date.now(),
        params,
      }),
    });

    // Récupérer le session_id depuis les cookies de réponse
    const setCookies = odooRes.headers.getSetCookie?.() || [];
    let newSessionId = null;
    for (const cookie of setCookies) {
      const match = cookie.match(/session_id=([^;]+)/);
      if (match) {
        newSessionId = match[1];
        break;
      }
    }

    // Fallback: essayer avec get("set-cookie")
    if (!newSessionId) {
      const cookieHeader = odooRes.headers.get("set-cookie");
      if (cookieHeader) {
        const match = cookieHeader.match(/session_id=([^;]+)/);
        if (match) newSessionId = match[1];
      }
    }

    const data = await odooRes.json();

    if (data.error) {
      const msg = data.error.data?.message || data.error.message || JSON.stringify(data.error);
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // Injecter le session_id dans le résultat si c'est une auth
    if (endpoint === "/web/session/authenticate" && data.result) {
      if (newSessionId) {
        data.result.session_id = newSessionId;
      }
      // Vérifier que l'auth a réussi
      if (!data.result.uid || data.result.uid === false) {
        return NextResponse.json({ error: "Identifiants incorrects" }, { status: 401 });
      }
    }

    return NextResponse.json({ result: data.result, sessionId: newSessionId });
  } catch (e: any) {
    console.error("Proxy Odoo error:", e);
    return NextResponse.json(
      { error: e.message || "Erreur de connexion au serveur Odoo" },
      { status: 500 }
    );
  }
}
