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
    const body = await request.text();
    const res = await fetch(SHEET_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body,
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to post to sheet." },
      { status: 500 }
    );
  }
}
