import { NextResponse } from "next/server";

const WOO_URL = process.env.WOO_URL; // https://mjimportaciones.com.ar
const WOO_CK = process.env.WOO_CK;
const WOO_CS = process.env.WOO_CS;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get("endpoint") || "products";
  const params = new URLSearchParams();
  
  // Forward any extra query params
  for (const [key, value] of searchParams.entries()) {
    if (key !== "endpoint") params.set(key, value);
  }

  params.set("consumer_key", WOO_CK);
  params.set("consumer_secret", WOO_CS);

  try {
    const res = await fetch(
      `${WOO_URL}/wp-json/wc/v3/${endpoint}?${params.toString()}`,
      { headers: { "Content-Type": "application/json" }, cache: "no-store" }
    );
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  const body = await request.json();
  const { endpoint, ...payload } = body;

  try {
    const res = await fetch(
      `${WOO_URL}/wp-json/wc/v3/${endpoint}?consumer_key=${WOO_CK}&consumer_secret=${WOO_CS}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request) {
  const body = await request.json();
  const { endpoint, ...payload } = body;

  try {
    const res = await fetch(
      `${WOO_URL}/wp-json/wc/v3/${endpoint}?consumer_key=${WOO_CK}&consumer_secret=${WOO_CS}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
