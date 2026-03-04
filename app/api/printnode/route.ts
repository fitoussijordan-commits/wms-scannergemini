// app/api/printnode/route.ts — Server-side proxy for PrintNode API
// API key stays server-side, never exposed to the browser

import { NextRequest, NextResponse } from "next/server";

const API_URL = "https://api.printnode.com";

function getApiKey(): string {
  const key = process.env.PRINTNODE_API_KEY || "";
  if (!key) return "";
  return key;
}

function pnHeaders() {
  return {
    "Authorization": "Basic " + Buffer.from(getApiKey() + ":").toString("base64"),
    "Content-Type": "application/json",
  };
}

export async function GET(req: NextRequest) {
  const apiKey = getApiKey();
  if (!apiKey) return NextResponse.json({ error: "PRINTNODE_API_KEY non configurée" }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  try {
    if (action === "printers") {
      const res = await fetch(`${API_URL}/printers`, { headers: pnHeaders() });
      if (!res.ok) return NextResponse.json({ error: `PrintNode ${res.status}` }, { status: res.status });
      const data = await res.json();
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const apiKey = getApiKey();
  if (!apiKey) return NextResponse.json({ error: "PRINTNODE_API_KEY non configurée" }, { status: 500 });

  try {
    const body = await req.json();
    const { action } = body;

    if (action === "print") {
      const { printerId, title, content, source } = body;
      const res = await fetch(`${API_URL}/printjobs`, {
        method: "POST",
        headers: pnHeaders(),
        body: JSON.stringify({
          printerId, title,
          contentType: "raw_base64",
          content,
          source: source || "WMS Scanner",
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        return NextResponse.json({ error: `PrintNode: ${errText}` }, { status: res.status });
      }
      const jobId = await res.json();
      return NextResponse.json({ jobId });
    }

    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
