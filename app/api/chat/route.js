import { NextResponse } from "next/server";

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const WOO_URL = process.env.WOO_URL;
const WOO_CK = process.env.WOO_CK;
const WOO_CS = process.env.WOO_CS;

// ─── Helper: call WooCommerce API ───
async function wooFetch(endpoint, method = "GET", body = null) {
  const sep = endpoint.includes("?") ? "&" : "?";
  const url = `${WOO_URL}/wp-json/wc/v3/${endpoint}${sep}consumer_key=${WOO_CK}&consumer_secret=${WOO_CS}`;
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  return res.json();
}

// ─── Load current store data for Claude's context ───
async function loadStoreContext() {
  try {
    const [products, orders, customers] = await Promise.all([
      wooFetch("products?per_page=50&status=any"),
      wooFetch("orders?per_page=20"),
      wooFetch("customers?per_page=50"),
    ]);

    const prodText = (Array.isArray(products) ? products : [])
      .map(p => `- ID:${p.id} | "${p.name}" | SKU:${p.sku || "N/A"} | Precio:$${p.price} | Regular:$${p.regular_price} | Stock:${p.stock_quantity ?? "N/A"} | Estado:${p.status}`)
      .join("\n");

    const ordText = (Array.isArray(orders) ? orders : [])
      .map(o => `- #${o.id} | ${o.status} | $${o.total} | ${o.billing?.first_name || ""} ${o.billing?.last_name || ""} | ${(o.line_items || []).map(i => `${i.name} x${i.quantity}`).join(", ")}`)
      .join("\n");

    const custText = (Array.isArray(customers) ? customers : [])
      .map(c => `- ID:${c.id} | ${c.first_name} ${c.last_name} | ${c.email} | Pedidos:${c.orders_count} | Gastado:$${c.total_spent}`)
      .join("\n");

    return { prodText, ordText, custText, products, orders, customers };
  } catch (err) {
    return { prodText: "Error cargando productos", ordText: "Error cargando pedidos", custText: "Error cargando clientes", products: [], orders: [], customers: [] };
  }
}

// ─── Build system prompt ───
function buildSystemPrompt(ctx) {
  return `Sos un asistente de gestión de la tienda WooCommerce "MJ Importaciones" (mjimportaciones.com.ar). El usuario te habla en español (Argentina) y vos ejecutás acciones en su tienda.

DATOS ACTUALES DE LA TIENDA:

PRODUCTOS:
${ctx.prodText}

PEDIDOS RECIENTES:
${ctx.ordText}

CLIENTES:
${ctx.custText}

INSTRUCCIONES:
1. Respondé siempre en español argentino, breve y directo. Tuteá o voseá según el usuario.
2. Cuando el usuario pida una ACCIÓN (cambiar precio, stock, crear pedido, etc.), respondé confirmando lo que vas a hacer.
3. Cuando pida INFORMACIÓN (listar productos, ver stock, etc.), mostrá los datos de forma clara y legible.
4. Si necesitás ejecutar una acción, incluí un bloque JSON con la acción al FINAL de tu mensaje en este formato EXACTO:

Para actualizar un producto (precio, stock, nombre, estado):
\`\`\`action
{"type":"UPDATE_PRODUCT","id":123,"changes":{"price":"15000","stock_quantity":30}}
\`\`\`

Para cambiar el estado de un pedido:
\`\`\`action
{"type":"UPDATE_ORDER","id":1042,"changes":{"status":"completed"}}
\`\`\`

Para crear un pedido nuevo:
\`\`\`action
{"type":"CREATE_ORDER","customer_id":1,"line_items":[{"product_id":123,"quantity":2}],"status":"processing"}
\`\`\`

Para crear un cliente:
\`\`\`action
{"type":"CREATE_CUSTOMER","email":"test@mail.com","first_name":"Juan","last_name":"Pérez","billing":{"phone":"1122334455"}}
\`\`\`

5. Podés incluir MÚLTIPLES bloques action en un solo mensaje.
6. Si no estás seguro de algo, preguntá antes de ejecutar.
7. Para precios usá formato numérico sin puntos ni comas (ej: "15000" no "15.000").
8. Cuando muestres precios al usuario, usá formato argentino con $ (ej: $15.000).
9. NUNCA inventes datos. Usá SOLO los datos de la tienda que te di arriba.
10. Si el usuario pide algo que no se puede hacer con la API de WooCommerce, decíselo.`;
}

// ─── Process actions from Claude's response ───
async function processActions(text) {
  const actionRegex = /```action\s*\n([\s\S]*?)\n```/g;
  let match;
  const results = [];

  while ((match = actionRegex.exec(text)) !== null) {
    try {
      const action = JSON.parse(match[1]);
      let result = null;

      switch (action.type) {
        case "UPDATE_PRODUCT":
          result = await wooFetch(`products/${action.id}`, "PUT", action.changes);
          results.push({ type: "product_update", success: !result.code, name: result.name || `ID ${action.id}`, changes: action.changes, error: result.message });
          break;

        case "UPDATE_ORDER":
          result = await wooFetch(`orders/${action.id}`, "PUT", action.changes);
          results.push({ type: "order_update", success: !result.code, id: action.id, changes: action.changes, error: result.message });
          break;

        case "CREATE_ORDER":
          const orderPayload = { ...action };
          delete orderPayload.type;
          result = await wooFetch("orders", "POST", orderPayload);
          results.push({ type: "order_create", success: !result.code, id: result.id, total: result.total, error: result.message });
          break;

        case "CREATE_CUSTOMER":
          const custPayload = { ...action };
          delete custPayload.type;
          result = await wooFetch("customers", "POST", custPayload);
          results.push({ type: "customer_create", success: !result.code, name: `${action.first_name} ${action.last_name}`, error: result.message });
          break;

        default:
          results.push({ type: "unknown", success: false, error: "Acción no reconocida" });
      }
    } catch (err) {
      results.push({ type: "error", success: false, error: err.message });
    }
  }

  const cleanText = text.replace(actionRegex, "").trim();
  return { cleanText, results };
}

// ─── Main chat endpoint ───
export async function POST(request) {
  try {
    const { messages } = await request.json();

    // Load fresh store data
    const ctx = await loadStoreContext();

    // Call Claude
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        system: buildSystemPrompt(ctx),
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content?.map(b => b.text || "").join("") || "Error al procesar el mensaje.";

    // Execute any WooCommerce actions
    const { cleanText, results } = await processActions(rawText);

    return NextResponse.json({
      message: cleanText,
      actions: results,
    });
  } catch (err) {
    return NextResponse.json(
      { message: "Error interno del servidor: " + err.message, actions: [] },
      { status: 500 }
    );
  }
}
