import { NextResponse } from "next/server";

const WOO_URL = process.env.WOO_URL;
const WOO_CK = process.env.WOO_CK;
const WOO_CS = process.env.WOO_CS;
const WP_USER = process.env.WP_ADMIN_USER;
const WP_PASS = process.env.WP_ADMIN_PASS;

// ─── WooCommerce API helper ───
async function wooFetch(endpoint, method = "GET", body = null) {
  const sep = endpoint.includes("?") ? "&" : "?";
  const url = `${WOO_URL}/wp-json/wc/v3/${endpoint}${sep}consumer_key=${WOO_CK}&consumer_secret=${WOO_CS}`;
  const opts = { method, headers: { "Content-Type": "application/json" }, cache: "no-store" };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  return res.json();
}

// ─── WordPress API helper (for user roles) ───
async function wpFetch(endpoint, method = "GET", body = null) {
  const url = `${WOO_URL}/wp-json/wp/v2/${endpoint}`;
  const auth = Buffer.from(`${WP_USER}:${WP_PASS}`).toString("base64");
  const opts = {
    method,
    headers: { "Content-Type": "application/json", "Authorization": `Basic ${auth}` },
    cache: "no-store",
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  return res.json();
}

export async function POST(request) {
  try {
    const { action, email, password, first_name, last_name, phone } = await request.json();

    // ─── LOGIN: find customer by email and verify ───
    if (action === "login") {
      // Try WordPress authentication
      const authRes = await fetch(`${WOO_URL}/wp-json/wp/v2/users/me`, {
        headers: {
          "Authorization": `Basic ${Buffer.from(`${email}:${password}`).toString("base64")}`,
        },
        cache: "no-store",
      });

      if (!authRes.ok) {
        return NextResponse.json({ success: false, error: "Email o contraseña incorrectos" });
      }

      const wpUser = await authRes.json();
      
      // Get WooCommerce customer data
      const customers = await wooFetch(`customers?email=${encodeURIComponent(email)}`);
      const customer = Array.isArray(customers) && customers.length > 0 ? customers[0] : null;

      // Determine role
      const roles = wpUser.roles || [];
      let role = "cliente";
      if (roles.includes("administrator")) role = "administrador";
      else if (roles.includes("revendedor") || roles.includes("wholesale_customer") || roles.includes("b2b_customer")) role = "revendedor";

      return NextResponse.json({
        success: true,
        user: {
          id: wpUser.id,
          woo_id: customer?.id || null,
          email: wpUser.slug ? email : wpUser.email,
          name: wpUser.name || `${first_name || ""} ${last_name || ""}`.trim(),
          first_name: customer?.first_name || wpUser.first_name || "",
          last_name: customer?.last_name || wpUser.last_name || "",
          role,
          orders_count: customer?.orders_count || 0,
          total_spent: customer?.total_spent || "0",
          avatar_url: wpUser.avatar_urls?.["48"] || null,
        },
      });
    }

    // ─── REGISTER: create WooCommerce customer ───
    if (action === "register") {
      // Check if email already exists
      const existing = await wooFetch(`customers?email=${encodeURIComponent(email)}`);
      if (Array.isArray(existing) && existing.length > 0) {
        return NextResponse.json({ success: false, error: "Ya existe una cuenta con ese email" });
      }

      const newCustomer = await wooFetch("customers", "POST", {
        email,
        first_name: first_name || "",
        last_name: last_name || "",
        username: email.split("@")[0],
        password: password || undefined,
        billing: {
          first_name: first_name || "",
          last_name: last_name || "",
          email,
          phone: phone || "",
        },
      });

      if (newCustomer.code) {
        return NextResponse.json({ success: false, error: newCustomer.message || "Error al crear cuenta" });
      }

      return NextResponse.json({
        success: true,
        user: {
          id: newCustomer.id,
          woo_id: newCustomer.id,
          email: newCustomer.email,
          name: `${newCustomer.first_name} ${newCustomer.last_name}`.trim(),
          first_name: newCustomer.first_name,
          last_name: newCustomer.last_name,
          role: "cliente",
          orders_count: 0,
          total_spent: "0",
        },
      });
    }

    // ─── GUEST: continue without account ───
    if (action === "guest") {
      return NextResponse.json({
        success: true,
        user: { id: null, woo_id: null, email: null, name: "Invitado", role: "invitado", orders_count: 0, total_spent: "0" },
      });
    }

    return NextResponse.json({ success: false, error: "Acción no válida" });
  } catch (err) {
    return NextResponse.json({ success: false, error: "Error del servidor: " + err.message }, { status: 500 });
  }
}
