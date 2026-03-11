// app/api/sendcloud/route.ts — Server-side proxy for SendCloud API
// Keys stay server-side, never exposed to the browser

import { NextRequest, NextResponse } from "next/server";

const BASE_URL = "https://panel.sendcloud.sc/api/v2";

function getAuth(): string {
  const pub = process.env.SENDCLOUD_PUBLIC_KEY || "";
  const sec = process.env.SENDCLOUD_SECRET_KEY || "";
  if (!pub || !sec) return "";
  return "Basic " + Buffer.from(`${pub}:${sec}`).toString("base64");
}

export async function GET(req: NextRequest) {
  const auth = getAuth();
  if (!auth) return NextResponse.json({ error: "SENDCLOUD_PUBLIC_KEY / SENDCLOUD_SECRET_KEY non configurées" }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  try {
    // List parcels — optionally filtered by status
    if (action === "parcels") {
      const status = searchParams.get("status") || "";
      const limit = searchParams.get("limit") || "100";
      const cursor = searchParams.get("cursor") || "";

      let url = `${BASE_URL}/parcels?limit=${limit}`;
      if (cursor) url += `&cursor=${cursor}`;

      const res = await fetch(url, {
        headers: { "Authorization": auth },
      });
      if (!res.ok) return NextResponse.json({ error: `SendCloud ${res.status}: ${await res.text()}` }, { status: res.status });
      const data = await res.json();

      // Filter by status client-side if needed (SendCloud API filtering is limited)
      let parcels = data.parcels || [];
      if (status) {
        const statuses = status.split(",").map(s => s.trim().toLowerCase());
        parcels = parcels.filter((p: any) =>
          statuses.includes(p.status?.message?.toLowerCase()) ||
          statuses.includes(String(p.status?.id))
        );
      }

      return NextResponse.json({
        parcels,
        next: data.next || null,
      });
    }

    // Get single parcel
    if (action === "parcel") {
      const id = searchParams.get("id");
      if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

      const res = await fetch(`${BASE_URL}/parcels/${id}`, {
        headers: { "Authorization": auth },
      });
      if (!res.ok) return NextResponse.json({ error: `SendCloud ${res.status}` }, { status: res.status });
      return NextResponse.json(await res.json());
    }

    // Get label PDF
    if (action === "label") {
      const id = searchParams.get("id");
      if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

      // First get parcel to find label URL
      const parcelRes = await fetch(`${BASE_URL}/parcels/${id}`, {
        headers: { "Authorization": auth },
      });
      if (!parcelRes.ok) return NextResponse.json({ error: `SendCloud ${parcelRes.status}` }, { status: parcelRes.status });
      const parcelData = await parcelRes.json();
      const parcel = parcelData.parcel;

      const labelUrl = parcel?.label?.label_printer || parcel?.label?.normal_printer?.[0];
      if (!labelUrl) return NextResponse.json({ error: "Pas d'étiquette disponible pour ce parcel" }, { status: 404 });

      // Download label PDF
      const labelRes = await fetch(labelUrl, {
        headers: { "Authorization": auth },
      });
      if (!labelRes.ok) return NextResponse.json({ error: `Erreur téléchargement étiquette: ${labelRes.status}` }, { status: labelRes.status });

      const pdfBuffer = Buffer.from(await labelRes.arrayBuffer());
      const pdfBase64 = pdfBuffer.toString("base64");

      return NextResponse.json({
        parcelId: parcel.id,
        tracking: parcel.tracking_number || "",
        carrier: parcel.carrier?.code || "",
        labelBase64: pdfBase64,
      });
    }

    // Search parcels by order number
    if (action === "search") {
      const orderNumber = searchParams.get("order_number");
      if (!orderNumber) return NextResponse.json({ error: "order_number requis" }, { status: 400 });

      const res = await fetch(`${BASE_URL}/parcels?order_number=${encodeURIComponent(orderNumber)}`, {
        headers: { "Authorization": auth },
      });
      if (!res.ok) return NextResponse.json({ error: `SendCloud ${res.status}` }, { status: res.status });
      return NextResponse.json(await res.json());
    }

    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = getAuth();
  if (!auth) return NextResponse.json({ error: "SendCloud non configuré" }, { status: 500 });

  try {
    const body = await req.json();
    const { action } = body;

    // Update parcel status (e.g., mark as shipped)
    if (action === "update_status") {
      // Not directly supported — SendCloud status changes happen via label creation
      return NextResponse.json({ error: "Utilisez l'interface SendCloud pour changer le statut" }, { status: 400 });
    }

    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
