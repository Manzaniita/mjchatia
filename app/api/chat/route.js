import { NextResponse } from "next/server";

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
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

function calcPrices(listPrice) {
  const lista = Number(listPrice);
  if (!lista || isNaN(lista)) return null;
  return {
    lista: Math.round(lista),
    efectivo: Math.round(lista * 0.80),
    transferencia: Math.round(lista * 0.90),
  };
}

async function loadStoreContext() {
  try {
    const [products, orders, customers, categories] = await Promise.all([
      wooFetch("products?per_page=100&status=any"),
      wooFetch("orders?per_page=20&orderby=date&order=desc"),
      wooFetch("customers?per_page=100"),
      wooFetch("products/categories?per_page=100"),
    ]);

    const variableProducts = (Array.isArray(products) ? products : []).filter(p => p.type === "variable");
    const variationsMap = {};
    await Promise.all(variableProducts.slice(0, 15).map(async (vp) => {
      try {
        const vars = await wooFetch(`products/${vp.id}/variations?per_page=100`);
        if (Array.isArray(vars)) variationsMap[vp.id] = vars;
      } catch (e) {}
    }));

    const prodText = (Array.isArray(products) ? products : []).map(p => {
      const meta = p.meta_data || [];
      const gm = (k) => { const m = meta.find(x => x.key === k); return m ? m.value : null; };
      const usdR = gm("_mj_usd_regular_price");
      const usdS = gm("_mj_usd_sale_price");
      const pr = calcPrices(p.regular_price || p.price);
      const sp = p.sale_price ? calcPrices(p.sale_price) : null;

      let l = `- ID:${p.id} | "${p.name}" | SKU:${p.sku||"N/A"} | Tipo:${p.type} | Estado:${p.status} | Stock:${p.stock_quantity??"N/A"}`;
      if (usdR) l += ` | USD:$${usdR}${usdS?` ofertaUSD:$${usdS}`:""}`;
      if (pr) l += ` | Lista:$${pr.lista} Efect:$${pr.efectivo} Transf:$${pr.transferencia}`;
      if (sp) l += ` | OFERTA→ Lista:$${sp.lista} Efect:$${sp.efectivo} Transf:$${sp.transferencia}`;
      l += ` | Cat:${(p.categories||[]).map(c=>c.name).join(",")}`;

      if (variationsMap[p.id]) {
        for (const v of variationsMap[p.id]) {
          const vpr = calcPrices(v.regular_price || v.price);
          const vsp = v.sale_price ? calcPrices(v.sale_price) : null;
          l += `\n  [Var ID:${v.id} | ${(v.attributes||[]).map(a=>`${a.name}:${a.option}`).join(",")} | Stock:${v.stock_quantity??"N/A"}`;
          if (vpr) l += ` | L:$${vpr.lista} E:$${vpr.efectivo} T:$${vpr.transferencia}`;
          if (vsp) l += ` | Oferta L:$${vsp.lista} E:$${vsp.efectivo} T:$${vsp.transferencia}`;
          l += `]`;
        }
      }
      return l;
    }).join("\n");

    const ordText = (Array.isArray(orders)?orders:[]).map(o =>
      `- #${o.id}|${o.status}|$${o.total}|${o.payment_method_title||"N/A"}|${o.date_created?.split("T")[0]}|${o.billing?.first_name||""} ${o.billing?.last_name||""}|${(o.line_items||[]).map(i=>`${i.name} x${i.quantity}`).join(",")}`
    ).join("\n");

    const custText = (Array.isArray(customers)?customers:[]).map(c =>
      `- ID:${c.id}|${c.first_name} ${c.last_name}|${c.email}|Rol:${c.role}|Pedidos:${c.orders_count}|Gastado:$${c.total_spent}`
    ).join("\n");

    const catText = (Array.isArray(categories)?categories:[]).map(c =>
      `- ID:${c.id}|"${c.name}"|${c.count} prods`
    ).join("\n");

    return { prodText, ordText, custText, catText };
  } catch (err) {
    return { prodText:"Error", ordText:"Error", custText:"Error", catText:"Error" };
  }
}

function buildSystemPrompt(ctx, user) {
  const role = user?.role || "invitado";
  const userName = user?.name || "Usuario";

  const data = `TIENDA MJ IMPORTACIONES (mjimportaciones.com.ar):
CATEGORÍAS: ${ctx.catText}
PRODUCTOS: ${ctx.prodText}
PEDIDOS: ${ctx.ordText}
CLIENTES: ${ctx.custText}

PRECIOS: precio en USD se convierte a ARS. El _regular_price es LISTA (ya inflado +20%). Efectivo=Lista×0.80(-20%). Transferencia=Lista×0.90(-10%).`;

  const confirm = `CONFIRMACIÓN: Antes de MODIFICAR datos, mostrá resumen y preguntá "¿Confirmo?". Consultas de info NO necesitan confirmación.`;

  const actions = `ACCIONES (solo tras confirmación):
\`\`\`action
{"type":"UPDATE_PRODUCT","id":ID,"changes":{"price":"X","stock_quantity":N}}
\`\`\`
\`\`\`action
{"type":"UPDATE_ORDER","id":ID,"changes":{"status":"completed"}}
\`\`\`
\`\`\`action
{"type":"CREATE_ORDER","customer_id":ID,"line_items":[{"product_id":ID,"quantity":N,"subtotal":"PRECIO_CUSTOM","total":"PRECIO_CUSTOM"}],"billing":{"first_name":"X","last_name":"X"},"payment_method":"cod","payment_method_title":"Efectivo","status":"processing"}
\`\`\`
NOTA CREATE_ORDER: Usá subtotal y total en line_items para fijar precio custom. Si no se indica precio custom, omití subtotal/total. payment_method: cod=Efectivo, bacs=Transferencia, tarjeta=Tarjeta, mercadopago=MercadoPago. Para consumidor final: customer_id:0.
\`\`\`action
{"type":"CREATE_CUSTOMER","email":"x","first_name":"x","last_name":"x","billing":{"phone":"x"}}
\`\`\`
\`\`\`action
{"type":"CREATE_VARIATION","product_id":ID,"attributes":[{"name":"X","option":"Y"}],"regular_price":"X","stock_quantity":N}
\`\`\`
\`\`\`action
{"type":"UPDATE_VARIATION","product_id":ID,"variation_id":ID,"changes":{"price":"X"}}
\`\`\``;

  const fmt = `FORMATO: Respondé en texto plano SIN markdown. NO uses **, ##, ni backticks en el texto visible. Para listas usá - o números. Para énfasis usá MAYÚSCULAS. Precios con formato $XX.XXX. Sé BREVE y directo.`;

  if (role === "administrador") {
    return `Asistente de MJ Importaciones. Hablás con ${userName} (ADMIN, acceso total).
${data}
${confirm}
${actions}
${fmt}
Mostrá siempre los 3 precios: Lista, Efectivo(-20%), Transferencia(-10%). Español argentino, voseá. No inventes datos.

VENTAS CON PRECIO CUSTOM: Cuando el admin dice "vendí [producto] a [cliente] por $[precio]":
- Buscá el producto en el catálogo por nombre.
- Si el cliente es "consumidor final", usá customer_id:0 y billing con first_name:"Consumidor" last_name:"Final".
- Usá subtotal y total en cada line_item para fijar el precio custom que indicó el admin, SIN importar el precio real del producto.
- Si no mencionó método de pago, preguntalo ANTES de crear el pedido (Efectivo, Transferencia, Tarjeta, MercadoPago).
- Si es venta ya realizada, usá status:"completed".

LINKS POST-PEDIDO: Después de crear CUALQUIER pedido exitosamente, SIEMPRE incluí en tu respuesta estos links para notificar:
- WhatsApp: https://wa.me/542233476498?text= seguido del mensaje URL-encoded con datos del pedido (producto, cantidad, precio, método de pago, cliente)
- Instagram: https://ig.me/m/mj.importamdp`;
  }
  if (role === "revendedor") {
    return `Asistente de MJ Importaciones. Hablás con ${userName} (REVENDEDOR).
${data}
Puede: ver catálogo, crear pedidos a su nombre (customer_id:${user?.woo_id||user?.id}), ver SUS pedidos. NO puede editar productos ni ver otros clientes.
${confirm}
${actions}
${fmt}
Mostrá precio de efectivo como principal. Español argentino, amigable.

PEDIDOS: Antes de crear un pedido, SIEMPRE preguntá el método de pago (Efectivo, Transferencia, Tarjeta, MercadoPago).

LINKS POST-PEDIDO: Después de crear el pedido exitosamente, SIEMPRE incluí en tu respuesta:
- WhatsApp: https://wa.me/542233476498?text= seguido del mensaje URL-encoded con datos del pedido (cliente, producto, cantidad, precio, método de pago)
- Instagram: https://ig.me/m/mj.importamdp`;
  }
  if (role === "cliente") {
    return `ASESOR DE COMPRAS de MJ Importaciones. Hablás con ${userName} (CLIENTE).
${data}
Puede: ver catálogo, crear pedidos (customer_id:${user?.woo_id||user?.id}), asesoramiento.
Guiá: preguntá qué busca, para qué, presupuesto. Recomendá del catálogo real.
Mostrá los 3 precios: Lista(tarjeta), Transferencia(-10%), Efectivo(-20%).
${confirm}
${actions}
${fmt}
Cálido, servicial, honesto.

PEDIDOS: Antes de crear un pedido, SIEMPRE preguntá el método de pago (Efectivo, Transferencia, Tarjeta, MercadoPago).

LINKS POST-PEDIDO: Después de crear el pedido exitosamente, SIEMPRE incluí en tu respuesta:
- WhatsApp: https://wa.me/542233476498?text= seguido del mensaje URL-encoded con datos del pedido (cliente, producto, cantidad, precio total, método de pago)
- Instagram: https://ig.me/m/mj.importamdp`;
  }
  return `Asesor de MJ Importaciones. Hablás con un VISITANTE sin cuenta.
${data}
Puede: ver catálogo, asesoramiento. NO puede comprar. Sugerí crear cuenta.
${fmt}
Mostrá precios lista. Cálido y servicial.`;
}

async function processActions(text) {
  const re = /```action\s*\n([\s\S]*?)\n```/g;
  let m; const results = [];
  while ((m = re.exec(text)) !== null) {
    try {
      const a = JSON.parse(m[1]); let r;
      switch (a.type) {
        case "UPDATE_PRODUCT":
          r = await wooFetch(`products/${a.id}`, "PUT", a.changes);
          results.push({type:"product_update",success:!r.code,name:r.name||`ID ${a.id}`,changes:a.changes,error:r.message}); break;
        case "UPDATE_ORDER":
          r = await wooFetch(`orders/${a.id}`, "PUT", a.changes);
          results.push({type:"order_update",success:!r.code,id:a.id,changes:a.changes,error:r.message}); break;
        case "CREATE_ORDER":
          { const p={...a};delete p.type; r=await wooFetch("orders","POST",p);
          results.push({type:"order_create",success:!r.code,id:r.id,total:r.total,error:r.message}); break; }
        case "CREATE_CUSTOMER":
          { const p={...a};delete p.type; r=await wooFetch("customers","POST",p);
          results.push({type:"customer_create",success:!r.code,name:`${a.first_name} ${a.last_name}`,error:r.message}); break; }
        case "CREATE_VARIATION":
          { const{product_id,...rest}=a;delete rest.type; r=await wooFetch(`products/${product_id}/variations`,"POST",rest);
          results.push({type:"variation_create",success:!r.code,product_id,id:r.id,error:r.message}); break; }
        case "UPDATE_VARIATION":
          { const{product_id,variation_id,changes}=a; r=await wooFetch(`products/${product_id}/variations/${variation_id}`,"PUT",changes);
          results.push({type:"variation_update",success:!r.code,product_id,variation_id,changes,error:r.message}); break; }
        default: results.push({type:"unknown",success:false,error:"Acción no reconocida"});
      }
    } catch(e) { results.push({type:"error",success:false,error:e.message}); }
  }
  return { cleanText: text.replace(re,"").trim(), results };
}

export async function POST(request) {
  try {
    const { messages, user } = await request.json();
    const ctx = await loadStoreContext();

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        system: buildSystemPrompt(ctx, user),
        messages: messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
      }),
    });

    const data = await res.json();
    if (data.error) return NextResponse.json({message:`Error IA: ${data.error.message}`,actions:[]},{status:500});

    const raw = data.content?.map(b=>b.text||"").join("")||"Error.";
    const { cleanText, results } = await processActions(raw);
    return NextResponse.json({ message: cleanText, actions: results });
  } catch (err) {
    return NextResponse.json({message:"Error: "+err.message,actions:[]},{status:500});
  }
}
