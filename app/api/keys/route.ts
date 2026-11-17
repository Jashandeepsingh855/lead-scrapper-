import { NextRequest, NextResponse } from "next/server";

function maskToken(token: string): string {
  if (token.length <= 8) return "****";
  if (token.length <= 16) {
    return `${token.slice(0, 4)}...${token.slice(-3)}`;
  }
  return `${token.slice(0, 12)}...${token.slice(-4)}`;
}

export async function GET() {
  try {
    const rawTokens: string[] = [];

    const envMulti = process.env.APIFY_API_TOKENS || "";
    for (const t of envMulti.split(/[\r\n,;]+/)) {
      if (t.trim()) rawTokens.push(t.trim());
    }

    const single = process.env.APIFY_API_TOKEN?.trim();
    if (single && !rawTokens.includes(single)) {
      rawTokens.push(single);
    }

    const keyDetails = await Promise.all(
      rawTokens.map(async (tok, index) => {
        try {
          const res = await fetch("https://api.apify.com/v2/users/me", {
            headers: {
              Authorization: `Bearer ${tok}`,
            },
            cache: "no-store",
          });

          if (!res.ok) {
            return {
              index,
              maskedToken: maskToken(tok),
              isValid: false,
              status: res.status === 402 ? "exhausted" : "invalid",
              error: `HTTP ${res.status}`,
            };
          }

          const data = (await res.json()) as {
            data?: {
              username?: string;
              email?: string;
              plan?: {
                id?: string;
                maxMonthlyUsageUsd?: number;
              };
            };
          };

          return {
            index,
            maskedToken: maskToken(tok),
            isValid: true,
            status: "active",
            username: data.data?.username,
            email: data.data?.email,
            plan: data.data?.plan?.id || "FREE",
            maxMonthlyUsageUsd: data.data?.plan?.maxMonthlyUsageUsd ?? 5,
          };
        } catch {
          return {
            index,
            maskedToken: maskToken(tok),
            isValid: false,
            status: "network_error",
          };
        }
      })
    );

    return NextResponse.json({
      totalConfigured: rawTokens.length,
      keys: keyDetails,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to query keys" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { token?: string };
    const token = body.token?.trim();
    if (!token) {
      return NextResponse.json(
        { error: "Token string is required" },
        { status: 400 }
      );
    }

    const res = await fetch("https://api.apify.com/v2/users/me", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const errJson = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      return NextResponse.json({
        valid: false,
        status: res.status,
        error:
          errJson.error?.message ||
          `Validation failed with HTTP status ${res.status}`,
      });
    }

    const json = (await res.json()) as {
      data?: {
        id?: string;
        username?: string;
        email?: string;
        plan?: {
          id?: string;
          maxMonthlyUsageUsd?: number;
        };
      };
    };

    return NextResponse.json({
      valid: true,
      maskedToken: maskToken(token),
      username: json.data?.username,
      email: json.data?.email,
      plan: json.data?.plan?.id || "FREE",
      maxMonthlyUsageUsd: json.data?.plan?.maxMonthlyUsageUsd ?? 5,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Validation error" },
      { status: 500 }
    );
  }
}
