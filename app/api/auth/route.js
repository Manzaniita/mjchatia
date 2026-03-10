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

// XML escape to prevent injection in XML-RPC calls
function escapeXml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

// Verify WordPress password via XML-RPC (works with regular WP passwords)
async function verifyWpPasswordXmlRpc(login, password) {
  try {
    const xml = `<?xml version="1.0"?><methodCall><methodName>wp.getUsersBlogs</methodName><params><param><value><string>${escapeXml(login)}</string></value></param><param><value><string>${escapeXml(password)}</string></value></param></params></methodCall>`;
    const res = await fetch(`${WOO_URL}/xmlrpc.php`, {
      method: "POST",
      headers: { "Content-Type": "text/xml" },
      body: xml,
      cache: "no-store",
    });
    const text = await res.text();
    return res.ok && !text.includes("<fault>") && text.includes("<methodResponse>");
  } catch (e) {
    return false;
  }
}

// Search WordPress users by email via admin API (requires Application Password in WP_ADMIN_PASS)
async function findWpUserByEmail(email) {
  try {
    const auth = Buffer.from(`${WP_USER}:${WP_PASS}`).toString("base64");
    const res = await fetch(`${WOO_URL}/wp-json/wp/v2/users?search=${encodeURIComponent(email)}&context=edit`, {
      headers: { "Authorization": `Basic ${auth}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const users = await res.json();
    return Array.isArray(users) ? users.find(u => u.email?.toLowerCase() === email.toLowerCase()) || null : null;
  } catch (e) {
    return null;
  }
}

// Get WP user info via XML-RPC wp.getProfile (uses the user's own credentials)
async function getWpProfileXmlRpc(login, password) {
  try {
    const xml = `<?xml version="1.0"?><methodCall><methodName>wp.getProfile</methodName><params><param><value><int>1</int></value></param><param><value><string>${escapeXml(login)}</string></value></param><param><value><string>${escapeXml(password)}</string></value></param></params></methodCall>`;
    const res = await fetch(`${WOO_URL}/xmlrpc.php`, {
      method: "POST",
      headers: { "Content-Type": "text/xml" },
      body: xml,
      cache: "no-store",
    });
    const text = await res.text();
    if (text.includes("<fault>")) return null;
    const get = (tag) => { const m = text.match(new RegExp(`<name>${tag}</name>\\s*<value>(?:<string>)?([^<]*)(?:</string>)?</value>`)); return m ? m[1] : ""; };
    const roles = text.match(/<name>roles<\/name>\s*<value><array><data>([\s\S]*?)<\/data><\/array><\/value>/);
    const roleList = roles ? [...roles[1].matchAll(/<string>([^<]+)<\/string>/g)].map(m => m[1]) : [];
    return {
      username: get("username"),
      email: get("email"),
      first_name: get("first_name"),
      last_name: get("last_name"),
      display_name: get("display_name"),
      roles: roleList,
    };
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

      const emailLower = email.toLowerCase().trim();

      // Step 1: Search WooCommerce customers by email
      const customers = await wooFetch(`customers?email=${encodeURIComponent(emailLower)}`);
      const customer = Array.isArray(customers) && customers.length > 0
        ? customers.find(c => c.email?.toLowerCase() === emailLower) || customers[0]
        : null;

      // Step 2: If password provided, verify via XML-RPC
      let xmlRpcProfile = null;
      if (password) {
        // Try authenticating with email as login
        let authOk = await verifyWpPasswordXmlRpc(emailLower, password);
        let loginUsed = emailLower;

        // If failed, try with WooCommerce customer's username
        if (!authOk && customer?.username) {
          authOk = await verifyWpPasswordXmlRpc(customer.username, password);
          if (authOk) loginUsed = customer.username;
        }

        // If failed, try with email prefix as username
        if (!authOk) {
          const prefix = emailLower.split("@")[0];
          if (prefix !== emailLower) {
            authOk = await verifyWpPasswordXmlRpc(prefix, password);
            if (authOk) loginUsed = prefix;
          }
        }

        if (!authOk) {
          // User not found at all or password is wrong
          if (!customer) {
            return NextResponse.json({ success: false, error: "No se encontró una cuenta con ese email o la contraseña es incorrecta" });
          }
          return NextResponse.json({ success: false, error: "Contraseña incorrecta. Verificá tus datos." });
        }

        // Auth succeeded - get profile info via XML-RPC
        xmlRpcProfile = await getWpProfileXmlRpc(loginUsed, password);
      } else {
        // No password: only allow if customer exists in WooCommerce (API-created accounts)
        if (!customer) {
          return NextResponse.json({ success: false, error: "No se encontró una cuenta con ese email" });
        }
      }

      // Step 3: Also try WP REST API for more user info (works if WP_ADMIN_PASS is an Application Password)
      const wpUser = await findWpUserByEmail(emailLower);

      // Step 4: Resolve role from all available sources
      const wpRoles = xmlRpcProfile?.roles || wpUser?.roles || (customer?.id ? await getWpUserRole(customer.id) : null);
      const role = resolveRole(customer?.role, wpRoles);

      // Step 5: Build user response combining all data sources
      const firstName = customer?.first_name || xmlRpcProfile?.first_name || wpUser?.first_name || "";
      const lastName = customer?.last_name || xmlRpcProfile?.last_name || wpUser?.last_name || "";
      const displayName = xmlRpcProfile?.display_name || wpUser?.name || `${firstName} ${lastName}`.trim() || emailLower;

      return NextResponse.json({
        success: true,
        user: {
          id: wpUser?.id || customer?.id,
          woo_id: customer?.id || null,
          email: customer?.email || xmlRpcProfile?.email || wpUser?.email || emailLower,
          name: displayName,
          first_name: firstName,
          last_name: lastName,
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
