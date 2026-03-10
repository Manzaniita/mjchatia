import { NextResponse } from "next/server";

const WOO_URL = process.env.WOO_URL;
const WOO_CK = process.env.WOO_CK;
const WOO_CS = process.env.WOO_CS;

async function wooFetch(endpoint, method = "GET", body = null) {
  const sep = endpoint.includes("?") ? "&" : "?";
  const url = `${WOO_URL}/wp-json/wc/v3/${endpoint}${sep}consumer_key=${WOO_CK}&consumer_secret=${WOO_CS}`;
  const opts = { method, headers: { "Content-Type": "application/json" }, cache: "no-store" };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  return res.json();
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get("endpoint") || "products";
  const params = new URLSearchParams();
  for (const [key, value] of searchParams.entries()) {
    if (key !== "endpoint") params.set(key, value);
  }
  try {
    const data = await wooFetch(`${endpoint}${params.toString() ? "?" + params.toString() : ""}`);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  const body = await request.json();
  const { endpoint, ...payload } = body;
  try {
    const data = await wooFetch(endpoint, "POST", payload);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request) {
  const body = await request.json();
  const { endpoint, ...payload } = body;
  try {
    const data = await wooFetch(endpoint, "PUT", payload);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
