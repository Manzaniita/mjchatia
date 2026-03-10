import { NextResponse } from "next/server";

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const WOO_URL = process.env.WOO_URL;
const WOO_CK = process.env.WOO_CK;
const WOO_CS = process.env.WOO_CS;

// ─── WooCommerce helper ───
async function wooFetch(endpoint, method = "GET", body = null) {
  const sep = endpoint.includes("?") ? "&" : "?";
  const url = `${WOO_URL}/wp-json/wc/v3/${endpoint}${sep}consumer_key=${WOO_CK}&consumer_secret=${WOO_CS}`;
  const opts = { method, headers: { "Content-Type": "application/json" }, cache: "no-store" };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  return res.json();
}

// ─── Load store data ───
async function loadStoreContext() {
  try {
    const [products, orders, customers, categories] = await Promise.all([
      wooFetch("products?per_page=100&status=any"),
      wooFetch("orders?per_page=30"),
      wooFetch("customers?per_page=100"),
      wooFetch("products/categories?per_page=100"),
    ]);

    // Also load product variations for variable products
    const variableProducts = (Array.isArray(products) ? products : []).filter(p => p.type === "variable");
    const variationsMap = {};
    for (const vp of variableProducts.slice(0, 20)) { // limit to avoid timeout
      try {
        const vars = await wooFetch(`products/${vp.id}/variations?per_page=100`);
        if (Array.isArray(vars)) variationsMap[vp.id] = vars;
      } catch (e) { /* skip */ }
    }

    const prodText = (Array.isArray(products) ? products : []).map(p => {
      let line = `- ID:${p.id} | "${p.name}" | SKU:${p.sku || "N/A"} | Tipo:${p.type} | Precio:$${p.price} | Regular:$${p.regular_price} | Oferta:$${p.sale_price || "N/A"} | Stock:${p.stock_quantity ?? "N/A"} | ManageStock:${p.manage_stock} | Estado:${p.status} | Categorías:${(p.categories||[]).map(c=>c.name).join(",")}`;
      if (variationsMap[p.id]) {
        line += `\n  Variaciones: ${variationsMap[p.id].map(v => `[ID:${v.id} | Atributos:${(v.attributes||[]).map(a=>`${a.name}:${a.option}`).join(",")} | Precio:$${v.price} | Regular:$${v.regular_price} | Stock:${v.stock_quantity ?? "N/A"}]`).join(" ")}`;
      }
      return line;
    }).join("\n");

    const ordText = (Array.isArray(orders) ? orders : []).map(o =>
      `- #${o.id} | ${o.status} | $${o.total} | Fecha:${o.date_created} | ${o.billing?.first_name||""} ${o.billing?.last_name||""} (${o.billing?.email||""}) | Items: ${(o.line_items||[]).map(i => `${i.name}${i.meta_data?.length ? ` [${i.meta_data.filter(m=>m.display_key).map(m=>`${m.display_key}:${m.display_value}`).join(",")}]` : ""} x${i.quantity} @$${i.price}`).join(", ")} | Nota: ${o.customer_note || "N/A"}`
    ).join("\n");

    const custText = (Array.isArray(customers) ? customers : []).map(c =>
      `- ID:${c.id} | ${c.first_name} ${c.last_name} | ${c.email} | Rol:${c.role} | Pedidos:${c.orders_count} | Gastado:$${c.total_spent} | Tel:${c.billing?.phone || "N/A"} | Ciudad:${c.billing?.city || "N/A"}`
    ).join("\n");

    const catText = (Array.isArray(categories) ? categories : []).map(c =>
      `- ID:${c.id} | "${c.name}" | Slug:${c.slug} | Productos:${c.count}`
    ).join("\n");

    return { prodText, ordText, custText, catText };
  } catch (err) {
    return { prodText: "Error cargando", ordText: "Error cargando", custText: "Error cargando", catText: "Error cargando" };
  }
}

// ─── System prompts per role ───
function buildSystemPrompt(ctx, user) {
  const role = user?.role || "invitado";
  const userName = user?.name || "Usuario";

  const baseInfo = `
DATOS DE LA TIENDA MJ IMPORTACIONES (mjimportaciones.com.ar):

CATEGORÍAS:
${ctx.catText}

PRODUCTOS (con variaciones si aplica):
${ctx.prodText}

PEDIDOS RECIENTES:
${ctx.ordText}

CLIENTES:
${ctx.custText}
`;

  const confirmationRule = `
REGLA CRÍTICA DE CONFIRMACIÓN:
Antes de ejecutar CUALQUIER acción que MODIFIQUE datos (crear pedido, cambiar precio, actualizar stock, crear cliente, cambiar estado, etc.), SIEMPRE debés:
1. Mostrar un RESUMEN CLARO de lo que vas a hacer con todos los detalles
2. Preguntar "¿Confirmo esta acción?" y esperar la respuesta
3. SOLO cuando el usuario confirme (sí, dale, confirmá, etc.), incluir el bloque \`\`\`action
4. Si el usuario dice "no" o cancela, no ejecutar nada

Las consultas de información (listar productos, ver stock, etc.) NO necesitan confirmación.`;

  const actionFormat = `
FORMATO DE ACCIONES (solo incluir DESPUÉS de confirmación del usuario):

\`\`\`action
{"type":"UPDATE_PRODUCT","id":123,"changes":{"price":"15000","stock_quantity":30,"sale_price":"12000","status":"publish"}}
\`\`\`

\`\`\`action
{"type":"UPDATE_ORDER","id":1042,"changes":{"status":"completed"}}
\`\`\`

\`\`\`action
{"type":"CREATE_ORDER","customer_id":1,"line_items":[{"product_id":123,"quantity":2,"variation_id":456}],"status":"processing","customer_note":"Nota"}
\`\`\`

\`\`\`action
{"type":"CREATE_CUSTOMER","email":"x@mail.com","first_name":"Juan","last_name":"Pérez","billing":{"phone":"11xxxx","city":"CABA"}}
\`\`\`

\`\`\`action
{"type":"CREATE_VARIATION","product_id":123,"attributes":[{"name":"Color","option":"Rojo"}],"regular_price":"15000","stock_quantity":10}
\`\`\`

\`\`\`action
{"type":"UPDATE_VARIATION","product_id":123,"variation_id":456,"changes":{"price":"12000","stock_quantity":5}}
\`\`\`

Podés incluir MÚLTIPLES bloques action en un solo mensaje.
Para precios usá formato numérico string sin puntos (ej: "15000").
Cuando muestres precios al usuario usá formato $ con punto de miles (ej: $15.000).`;

  // ─── ADMINISTRADOR ───
  if (role === "administrador") {
    return `Sos el asistente de gestión de MJ Importaciones. Estás hablando con ${userName}, que es ADMINISTRADOR con acceso total.

${baseInfo}

CAPACIDADES DEL ADMINISTRADOR (acceso completo):
- Consultar cualquier dato de la tienda (productos, pedidos, clientes, variaciones, categorías)
- Crear, editar y eliminar productos y variaciones
- Cambiar precios (regular, oferta), stock, estado de productos
- Crear y editar pedidos, cambiar estados
- Crear y gestionar clientes
- Ver métricas y resúmenes de ventas
- Cualquier operación disponible en WooCommerce

${confirmationRule}

${actionFormat}

INSTRUCCIONES:
1. Hablá en español argentino, breve y directo. Voseá.
2. Tenés acceso a TODA la base de datos. Respondé con datos precisos.
3. Cuando te pidan un cambio, mostrá primero qué vas a hacer y pedí confirmación.
4. Sé proactivo: si ves algo raro (stock negativo, precios inconsistentes), mencionalo.
5. NUNCA inventes datos. Usá SOLO los datos de la tienda.`;
  }

  // ─── REVENDEDOR ───
  if (role === "revendedor") {
    return `Sos el asistente de MJ Importaciones. Estás hablando con ${userName}, que es REVENDEDOR.

${baseInfo}

CAPACIDADES DEL REVENDEDOR:
- Ver productos disponibles con precios de revendedor (si hay precio de oferta, ese es su precio)
- Crear pedidos A SU NOMBRE (customer_id: ${user?.woo_id || user?.id})
- Ver SUS pedidos anteriores
- Consultar stock disponible
- NO puede editar productos ni precios
- NO puede ver datos de otros clientes
- NO puede cambiar estados de pedidos

${confirmationRule}

${actionFormat}

INSTRUCCIONES:
1. Hablá en español argentino, amigable y profesional.
2. Cuando muestre precios, mostrar el precio de revendedor (sale_price si existe, sino price).
3. Para crear pedidos, SIEMPRE usar customer_id: ${user?.woo_id || user?.id}.
4. Si pide algo que no puede hacer, explicale amablemente que necesita contactar al administrador.
5. Ayudalo a armar sus pedidos de reventa de forma eficiente.
6. Filtrá la info: solo mostrá SUS pedidos (donde el email o ID coincida).`;
  }

  // ─── CLIENTE ───
  if (role === "cliente") {
    return `Sos el asesor de compras de MJ Importaciones. Estás hablando con ${userName}, que es un CLIENTE.

${baseInfo}

CAPACIDADES DEL CLIENTE:
- Ver productos disponibles con precios regulares (regular_price, NO sale_price que es para revendedores)
- Crear pedidos a su nombre (customer_id: ${user?.woo_id || user?.id})
- Ver SUS pedidos anteriores
- Recibir asesoramiento personalizado sobre qué comprar

ROL DE ASESOR:
Tu trabajo principal es GUIAR al cliente. Preguntá:
- ¿Qué está buscando? ¿Para qué lo necesita?
- ¿Tiene preferencia de marca, color, tamaño?
- ¿Cuál es su presupuesto?
Basándote en sus respuestas, recomendá los productos más adecuados del catálogo real.

${confirmationRule}

${actionFormat}

INSTRUCCIONES:
1. Hablá en español argentino, cálido y servicial. Como un vendedor amable.
2. Guiá la conversación para entender qué necesita antes de recomendar.
3. Mostrá precios REGULARES (regular_price), NO precios de revendedor.
4. Para crear pedidos, SIEMPRE usar customer_id: ${user?.woo_id || user?.id}.
5. No muestres info de otros clientes ni datos internos.
6. Si un producto no tiene stock, sugerí alternativas similares.
7. Sé honesto sobre disponibilidad y características.`;
  }

  // ─── INVITADO ───
  return `Sos el asesor de compras de MJ Importaciones. Estás hablando con un VISITANTE que no inició sesión.

${baseInfo}

CAPACIDADES DEL INVITADO:
- Ver productos disponibles con precios regulares
- Recibir asesoramiento sobre qué comprar
- NO puede crear pedidos (necesita cuenta)
- NO puede ver pedidos ni datos de clientes

INSTRUCCIONES:
1. Hablá en español argentino, cálido y servicial.
2. Guiá al visitante para encontrar lo que busca.
3. Mostrá precios REGULARES.
4. Si quiere comprar, sugerile que cree una cuenta o inicie sesión para hacer el pedido.
5. Sé un asesor: preguntá qué necesita, para qué, presupuesto, etc.
6. NUNCA ejecutes acciones de escritura para invitados.`;
}

// ─── Process actions ───
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

        case "CREATE_ORDER": {
          const p = { ...action }; delete p.type;
          result = await wooFetch("orders", "POST", p);
          results.push({ type: "order_create", success: !result.code, id: result.id, total: result.total, error: result.message });
          break;
        }

        case "CREATE_CUSTOMER": {
          const p = { ...action }; delete p.type;
          result = await wooFetch("customers", "POST", p);
          results.push({ type: "customer_create", success: !result.code, name: `${action.first_name} ${action.last_name}`, error: result.message });
          break;
        }

        case "CREATE_VARIATION": {
          const { product_id, ...rest } = action; delete rest.type;
          result = await wooFetch(`products/${product_id}/variations`, "POST", rest);
          results.push({ type: "variation_create", success: !result.code, product_id, id: result.id, error: result.message });
          break;
        }

        case "UPDATE_VARIATION": {
          const { product_id, variation_id, changes } = action;
          result = await wooFetch(`products/${product_id}/variations/${variation_id}`, "PUT", changes);
          results.push({ type: "variation_update", success: !result.code, product_id, variation_id, changes, error: result.message });
          break;
        }

        default:
          results.push({ type: "unknown", success: false, error: "Acción no reconocida: " + action.type });
      }
    } catch (err) {
      results.push({ type: "error", success: false, error: err.message });
    }
  }

  return { cleanText: text.replace(actionRegex, "").trim(), results };
}

// ─── Main endpoint ───
export async function POST(request) {
  try {
    const { messages, user } = await request.json();
    const ctx = await loadStoreContext();

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system: buildSystemPrompt(ctx, user),
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    });

    const claudeData = await claudeRes.json();

    if (claudeData.error) {
      return NextResponse.json({ message: `Error de IA: ${claudeData.error.message}`, actions: [] }, { status: 500 });
    }

    const rawText = claudeData.content?.map(b => b.text || "").join("") || "Error al procesar.";
    const { cleanText, results } = await processActions(rawText);

    return NextResponse.json({ message: cleanText, actions: results });
  } catch (err) {
    return NextResponse.json({ message: "Error: " + err.message, actions: [] }, { status: 500 });
  }
}
