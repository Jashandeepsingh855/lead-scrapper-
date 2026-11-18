import { NextRequest, NextResponse } from "next/server";

const SHEET_URL = process.env.GOOGLE_SHEET_WEBHOOK_URL ?? "";

export async function GET() {
  if (!SHEET_URL) {
    return NextResponse.json({ error: "GOOGLE_SHEET_WEBHOOK_URL not set." }, { status: 500 });
  }
  try {
    const res = await fetch(SHEET_URL, { cache: "no-store" });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch sheet." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!SHEET_URL) {
    return NextResponse.json({ error: "GOOGLE_SHEET_WEBHOOK_URL not set." }, { status: 500 });
  }
  try {
    const bodyText = await request.text();
    let bodyJson: Record<string, unknown> = {};
    try {
      bodyJson = JSON.parse(bodyText);
    } catch {
      bodyJson = {};
    }

    const action = String(bodyJson.action || "append");
    const rawLead = bodyJson.lead as Record<string, unknown> | undefined;
    const rawLeads = (bodyJson.leads as Record<string, unknown>[] | undefined) || (rawLead ? [rawLead] : []);

    // If syncing a single lead from WhatsApp outreach, attempt append first (works on all Apps Script versions)
    const appendPayload = JSON.stringify({
      action: "append",
      leads: rawLeads,
    });

    const appendRes = await fetch(SHEET_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: appendPayload,
    });

    const appendText = await appendRes.text();
    let appendResult: { ok?: boolean; appended?: number; skipped?: number } | null = null;
    try {
      appendResult = JSON.parse(appendText);
    } catch {}

    // If successfully appended to Google Sheet, return success immediately
    if (appendResult?.ok && (appendResult.appended ?? 0) > 0) {
      return NextResponse.json({
        ok: true,
        action: "appended",
        appended: appendResult.appended,
      });
    }

    // If lead was already in the sheet (skipped because contact/id exists) and we have a single lead, update it
    if (rawLead || (rawLeads.length === 1 && (appendResult?.skipped ?? 0) > 0)) {
      const targetLead = rawLead || rawLeads[0];
      const updatePayload = JSON.stringify({
        action: "update",
        lead: targetLead,
      });

      const updateRes = await fetch(SHEET_URL, {
        method: "POST",
        redirect: "follow",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: updatePayload,
      });

      const updateText = await updateRes.text();
      return new NextResponse(updateText, {
        status: updateRes.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new NextResponse(appendText, {
      status: appendRes.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to sync to Google Sheet." },
      { status: 500 }
    );
  }
}
