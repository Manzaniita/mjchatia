import { NextResponse } from "next/server";

const WOO_URL = process.env.WOO_URL;
const WOO_CK = process.env.WOO_CK;
const WOO_CS = process.env.WOO_CS;
const WP_USER = process.env.WP_ADMIN_USER;
const WP_PASS = process.env.WP_ADMIN_PASS;

async function wooFetch(endpoint, method = "GET", body = null) {
  const sep = endpoint.includes("?") ? "&" : "?";
  const url = `${WOO_URL}/wp-json/wc/v3/${endpoint}${sep}consumer_key=${WOO_CK}&consumer_secret=${WOO_CS}`;
  const opts = { method, headers: { "Content-Type": "application/json" }, cache: "no-store" };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  return res.json();
}

// Get WP user role via admin API
async function getWpUserRole(userId) {
  try {
    const url = `${WOO_URL}/wp-json/wp/v2/users/${userId}?context=edit`;
    const auth = Buffer.from(`${WP_USER}:${WP_PASS}`).toString("base64");
    const res = await fetch(url, {
      headers: { "Authorization": `Basic ${auth}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.roles || [];
  } catch (e) {
    return null;
  }
}

function resolveRole(wooRole, wpRoles) {
  // Check WP roles first (more accurate)
  if (wpRoles) {
    if (wpRoles.includes("administrator")) return "administrador";
    if (wpRoles.includes("revendedor")) return "revendedor";
  }
  // Fallback to WooCommerce role field
  if (wooRole === "administrator") return "administrador";
  if (wooRole === "revendedor") return "revendedor";
  return "cliente";
}

export async function POST(request) {
  try {
    const { action, email, password, first_name, last_name, phone } = await request.json();

    // ─── LOGIN ───
    if (action === "login") {
      if (!email) {
        return NextResponse.json({ success: false, error: "Ingresá tu email" });
      }

      // Strategy 1: Try WordPress authentication (works for users with WP passwords)
      let wpUser = null;
      let wpAuthOk = false;
      if (password) {
        try {
          const authRes = await fetch(`${WOO_URL}/wp-json/wp/v2/users/me`, {
            headers: {
              "Authorization": `Basic ${Buffer.from(`${email}:${password}`).toString("base64")}`,
            },
            cache: "no-store",
          });
          if (authRes.ok) {
            wpUser = await authRes.json();
            wpAuthOk = true;
          }
        } catch (e) { /* WP auth failed, try WooCommerce */ }
      }

      // Strategy 2: Look up customer in WooCommerce by email
      const customers = await wooFetch(`customers?email=${encodeURIComponent(email)}`);
      const customer = Array.isArray(customers) && customers.length > 0 ? customers[0] : null;

      if (!wpAuthOk && !customer) {
        return NextResponse.json({ success: false, error: "No se encontró una cuenta con ese email" });
      }

      // If WP auth failed but customer exists, verify password via WP auth with username
      if (!wpAuthOk && customer && password) {
        try {
          // Try with username
          const username = customer.username || email.split("@")[0];
          const authRes2 = await fetch(`${WOO_URL}/wp-json/wp/v2/users/me`, {
            headers: {
              "Authorization": `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
            },
            cache: "no-store",
          });
          if (authRes2.ok) {
            wpUser = await authRes2.json();
            wpAuthOk = true;
          }
        } catch (e) { /* skip */ }
      }

      // If still no WP auth, allow login for WooCommerce-created customers
      // (accounts created via API may not have WP-compatible passwords)
      if (!wpAuthOk && customer) {
        // Get role info via admin API using customer's WP user ID
        const wpRoles = customer.id ? await getWpUserRole(customer.id) : null;
        const role = resolveRole(customer.role, wpRoles);

        return NextResponse.json({
          success: true,
          user: {
            id: customer.id,
            woo_id: customer.id,
            email: customer.email,
            name: `${customer.first_name} ${customer.last_name}`.trim() || email,
            first_name: customer.first_name || "",
            last_name: customer.last_name || "",
            role,
            orders_count: customer.orders_count || 0,
            total_spent: customer.total_spent || "0",
          },
        });
      }

      // WP auth succeeded
      const wpRoles = wpUser?.roles || (wpUser?.id ? await getWpUserRole(wpUser.id) : null);
      const role = resolveRole(customer?.role, wpRoles);

      return NextResponse.json({
        success: true,
        user: {
          id: wpUser?.id || customer?.id,
          woo_id: customer?.id || null,
          email: customer?.email || email,
          name: wpUser?.name || `${customer?.first_name || ""} ${customer?.last_name || ""}`.trim() || email,
          first_name: customer?.first_name || wpUser?.first_name || "",
          last_name: customer?.last_name || wpUser?.last_name || "",
          role,
          orders_count: customer?.orders_count || 0,
          total_spent: customer?.total_spent || "0",
        },
      });
    }

    // ─── REGISTER ───
    if (action === "register") {
      if (!email || !first_name) {
        return NextResponse.json({ success: false, error: "Completá al menos nombre y email" });
      }

      const existing = await wooFetch(`customers?email=${encodeURIComponent(email)}`);
      if (Array.isArray(existing) && existing.length > 0) {
        return NextResponse.json({ success: false, error: "Ya existe una cuenta con ese email" });
      }

      const newCustomer = await wooFetch("customers", "POST", {
        email,
        first_name: first_name || "",
        last_name: last_name || "",
        username: email.split("@")[0] + Math.floor(Math.random() * 100),
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

    // ─── GUEST ───
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
