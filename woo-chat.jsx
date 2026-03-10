import { useState, useEffect, useRef } from "react";

/*
 * WooChat — Asistente IA para gestionar tu tienda WooCommerce
 * 
 * Arquitectura:
 * 1. El usuario escribe en lenguaje natural ("poneme stock 50 en la remera negra")
 * 2. Claude interpreta el mensaje y decide qué endpoint de WooCommerce llamar
 * 3. La app ejecuta la acción vía API REST de WooCommerce
 * 4. El asistente responde con el resultado
 *
 * En este prototipo, Claude (Sonnet) procesa los mensajes de verdad.
 * Las llamadas a WooCommerce están simuladas (mock) porque no tenemos
 * las credenciales reales. Cuando las conectes, solo hay que reemplazar
 * las funciones mock por fetch reales.
 */

// ─── WooCommerce Mock Store (simula tu tienda) ───
const STORE = {
  products: [
    { id: 1, name: "Remera Oversize Negra", sku: "REM-001", price: "12500", regular_price: "15000", stock_quantity: 23, status: "publish" },
    { id: 2, name: "Jean Cargo Wide Leg", sku: "JEA-002", price: "28900", regular_price: "28900", stock_quantity: 8, status: "publish" },
    { id: 3, name: "Buzo Hoodie Gris", sku: "BUZ-003", price: "19500", regular_price: "22000", stock_quantity: 0, status: "publish" },
    { id: 4, name: "Campera Puffer Beige", sku: "CAM-004", price: "45000", regular_price: "45000", stock_quantity: 15, status: "publish" },
    { id: 5, name: "Pantalón Jogger Negro", sku: "PAN-005", price: "16800", regular_price: "18000", stock_quantity: 31, status: "draft" },
    { id: 6, name: "Gorra Trucker Logo", sku: "GOR-006", price: "8500", regular_price: "8500", stock_quantity: 44, status: "publish" },
  ],
  orders: [
    { id: 1042, status: "processing", total: "41400", billing: { first_name: "Lucía", last_name: "Fernández", phone: "1155667788" }, line_items: [{ name: "Remera Oversize Negra", quantity: 2, price: 12500 }, { name: "Jean Cargo Wide Leg", quantity: 1, price: 28900 }] },
    { id: 1041, status: "completed", total: "19500", billing: { first_name: "Martín", last_name: "García", phone: "1144556677" }, line_items: [{ name: "Buzo Hoodie Gris", quantity: 1, price: 19500 }] },
    { id: 1040, status: "on-hold", total: "53500", billing: { first_name: "Camila", last_name: "López", phone: "1133445566" }, line_items: [{ name: "Campera Puffer Beige", quantity: 1, price: 45000 }, { name: "Gorra Trucker Logo", quantity: 1, price: 8500 }] },
  ],
  customers: [
    { id: 1, first_name: "Lucía", last_name: "Fernández", email: "lucia@mail.com", phone: "1155667788", orders_count: 5, total_spent: "125000" },
    { id: 2, first_name: "Martín", last_name: "García", email: "martin@mail.com", phone: "1144556677", orders_count: 3, total_spent: "67500" },
    { id: 3, first_name: "Camila", last_name: "López", email: "camila@mail.com", phone: "1133445566", orders_count: 8, total_spent: "198000" },
    { id: 4, first_name: "Valentina", last_name: "Martínez", email: "vale@mail.com", phone: "1166778899", orders_count: 12, total_spent: "340000" },
  ],
};

const fmt = (n) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(Number(n));

// ─── SYSTEM PROMPT for Claude ───
const buildSystemPrompt = (store) => `Sos un asistente de gestión de tienda WooCommerce. El usuario te habla en español (Argentina) y vos ejecutás acciones en su tienda.

DATOS ACTUALES DE LA TIENDA:

PRODUCTOS:
${store.products.map(p => `- ID:${p.id} | "${p.name}" | SKU:${p.sku} | Precio:$${p.price} | Precio regular:$${p.regular_price} | Stock:${p.stock_quantity} | Estado:${p.status}`).join("\n")}

PEDIDOS:
${store.orders.map(o => `- Pedido #${o.id} | Estado:${o.status} | Total:$${o.total} | Cliente:${o.billing.first_name} ${o.billing.last_name} | Items: ${o.line_items.map(i => i.name + " x" + i.quantity).join(", ")}`).join("\n")}

CLIENTES:
${store.customers.map(c => `- ID:${c.id} | ${c.first_name} ${c.last_name} | ${c.email} | Pedidos:${c.orders_count} | Gastado:$${c.total_spent}`).join("\n")}

INSTRUCCIONES:
1. Respondé siempre en español argentino, de forma breve y directa.
2. Cuando el usuario pida una ACCIÓN (cambiar precio, stock, crear pedido, etc.), respondé confirmando lo que hiciste.
3. Cuando pida INFORMACIÓN (listar productos, ver stock, etc.), mostrá los datos de forma clara.
4. Si necesitás ejecutar una acción, incluí un bloque JSON con la acción al FINAL de tu mensaje, en este formato exacto:

\`\`\`action
{"type": "UPDATE_PRODUCT", "id": 1, "changes": {"price": "15000", "stock_quantity": 30}}
\`\`\`

\`\`\`action
{"type": "UPDATE_ORDER_STATUS", "id": 1042, "status": "completed"}
\`\`\`

\`\`\`action
{"type": "CREATE_ORDER", "customer_name": "Juan Pérez", "items": [{"product_id": 1, "quantity": 2}]}
\`\`\`

\`\`\`action
{"type": "CREATE_CUSTOMER", "first_name": "Pedro", "last_name": "Gómez", "email": "pedro@mail.com", "phone": "1199887766"}
\`\`\`

5. Podés ejecutar MÚLTIPLES acciones en un mensaje (varios bloques action).
6. Si algo no es claro, preguntá antes de actuar.
7. Sé amigable pero conciso. No expliques de más.
8. Cuando muestres precios, usalos en formato argentino con $.`;

// ─── Process Actions from Claude's response ───
function processActions(text, store) {
  const actionRegex = /```action\s*\n([\s\S]*?)\n```/g;
  let match;
  const actions = [];
  while ((match = actionRegex.exec(text)) !== null) {
    try { actions.push(JSON.parse(match[1])); } catch (e) { /* skip bad JSON */ }
  }

  const updatedStore = { ...store, products: [...store.products], orders: [...store.orders], customers: [...store.customers] };
  const summaries = [];

  for (const action of actions) {
    switch (action.type) {
      case "UPDATE_PRODUCT": {
        const idx = updatedStore.products.findIndex(p => p.id === action.id);
        if (idx !== -1) {
          updatedStore.products[idx] = { ...updatedStore.products[idx], ...action.changes };
          summaries.push({ type: "product_update", name: updatedStore.products[idx].name, changes: action.changes });
        }
        break;
      }
      case "UPDATE_ORDER_STATUS": {
        const idx = updatedStore.orders.findIndex(o => o.id === action.id);
        if (idx !== -1) {
          updatedStore.orders[idx] = { ...updatedStore.orders[idx], status: action.status };
          summaries.push({ type: "order_update", id: action.id, status: action.status });
        }
        break;
      }
      case "CREATE_ORDER": {
        const newId = Math.max(...updatedStore.orders.map(o => o.id)) + 1;
        const items = (action.items || []).map(i => {
          const p = updatedStore.products.find(pr => pr.id === i.product_id);
          return { name: p ? p.name : "Producto", quantity: i.quantity, price: p ? Number(p.price) : 0 };
        });
        const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
        updatedStore.orders.unshift({ id: newId, status: "processing", total: String(total), billing: { first_name: action.customer_name?.split(" ")[0] || "Cliente", last_name: action.customer_name?.split(" ").slice(1).join(" ") || "", phone: "" }, line_items: items });
        summaries.push({ type: "order_create", id: newId, total });
        break;
      }
      case "CREATE_CUSTOMER": {
        const newId = Math.max(...updatedStore.customers.map(c => c.id)) + 1;
        updatedStore.customers.push({ id: newId, first_name: action.first_name, last_name: action.last_name, email: action.email || "", phone: action.phone || "", orders_count: 0, total_spent: "0" });
        summaries.push({ type: "customer_create", name: `${action.first_name} ${action.last_name}` });
        break;
      }
    }
  }
  return { updatedStore, summaries, cleanText: text.replace(actionRegex, "").trim() };
}

// ─── Action Summary Card ───
function ActionCard({ summary }) {
  const icons = {
    product_update: "📦",
    order_update: "📋",
    order_create: "🛒",
    customer_create: "👤",
  };
  const labels = {
    product_update: (s) => {
      const parts = [];
      if (s.changes.price) parts.push(`Precio → $${Number(s.changes.price).toLocaleString("es-AR")}`);
      if (s.changes.stock_quantity !== undefined) parts.push(`Stock → ${s.changes.stock_quantity}`);
      if (s.changes.status) parts.push(`Estado → ${s.changes.status}`);
      if (s.changes.name) parts.push(`Nombre → ${s.changes.name}`);
      return `${s.name}: ${parts.join(" · ")}`;
    },
    order_update: (s) => `Pedido #${s.id} → ${s.status}`,
    order_create: (s) => `Pedido #${s.id} creado · Total: $${Number(s.total).toLocaleString("es-AR")}`,
    customer_create: (s) => `Cliente ${s.name} creado`,
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "rgba(46, 125, 50, 0.08)", borderRadius: 10, marginTop: 8, border: "1px solid rgba(46, 125, 50, 0.15)" }}>
      <span style={{ fontSize: 18 }}>{icons[summary.type]}</span>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#2E7D32", textTransform: "uppercase", letterSpacing: "0.05em" }}>Acción ejecutada</div>
        <div style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A", marginTop: 2 }}>{labels[summary.type]?.(summary)}</div>
      </div>
      <span style={{ marginLeft: "auto", color: "#2E7D32" }}>
        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
      </span>
    </div>
  );
}

// ─── Suggestion Chips ───
function SuggestionChips({ onSelect }) {
  const suggestions = [
    "¿Qué productos tengo sin stock?",
    "Mostrá los pedidos pendientes",
    "Poné el buzo hoodie a $21000",
    "Creá un pedido de 2 gorras para Lucía",
    "Subí el stock de la campera a 25",
    "Listá mis clientes top",
  ];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "8px 0" }}>
      {suggestions.map((s, i) => (
        <button key={i} onClick={() => onSelect(s)} style={{
          padding: "8px 14px", borderRadius: 20, border: "1px solid #D4CFC7",
          background: "transparent", fontSize: 12, fontWeight: 500, cursor: "pointer",
          fontFamily: "inherit", color: "#555", transition: "all .15s",
          whiteSpace: "nowrap"
        }}>{s}</button>
      ))}
    </div>
  );
}

// ─── Typing Indicator ───
function TypingIndicator() {
  return (
    <div style={{ display: "flex", gap: 4, padding: "14px 18px", alignItems: "flex-end" }}>
      <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#1A1A1A", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <svg width="16" height="16" fill="none" stroke="#fff" strokeWidth="2" viewBox="0 0 24 24"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
      </div>
      <div style={{ background: "#F0EDE8", borderRadius: "18px 18px 18px 4px", padding: "14px 18px", display: "flex", gap: 5, alignItems: "center" }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 7, height: 7, borderRadius: "50%", background: "#999",
            animation: `bounce 1.2s ease-in-out ${i * 0.15}s infinite`
          }} />
        ))}
      </div>
    </div>
  );
}

// ─── Main App ───
export default function WooChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [store, setStore] = useState(STORE);
  const [showConfig, setShowConfig] = useState(false);
  const [config, setConfig] = useState({ url: "", ck: "", cs: "" });
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const sendMessage = async (text) => {
    if (!text.trim() || loading) return;
    const userMsg = { role: "user", content: text, ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      // Build conversation history for Claude
      const history = [...messages, userMsg].map(m => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.originalContent || m.content,
      }));

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: buildSystemPrompt(store),
          messages: history,
        }),
      });

      const data = await response.json();
      const rawText = data.content?.map(b => b.text || "").join("") || "Hubo un error al procesar tu mensaje.";
      
      // Process any actions in the response
      const { updatedStore, summaries, cleanText } = processActions(rawText, store);
      setStore(updatedStore);

      const assistantMsg = {
        role: "assistant",
        content: cleanText,
        originalContent: rawText,
        actions: summaries,
        ts: Date.now(),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Error de conexión. Verificá que la app tenga acceso a internet e intentá de nuevo.",
        actions: [],
        ts: Date.now(),
      }]);
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div style={{
      fontFamily: "'DM Sans', sans-serif",
      background: "#FAF9F6",
      height: "100vh",
      maxWidth: 430,
      margin: "0 auto",
      display: "flex",
      flexDirection: "column",
      position: "relative",
      overflow: "hidden",
      color: "#1A1A1A",
    }}>
      {/* Header */}
      <div style={{
        background: "#1A1A1A",
        color: "#fff",
        padding: "14px 18px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
        zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 12,
            background: "linear-gradient(135deg, #2E7D32, #43A047)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="20" height="20" fill="none" stroke="#fff" strokeWidth="2" viewBox="0 0 24 24"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em" }}>WooChat</div>
            <div style={{ fontSize: 11, color: "#8A8A8A", display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4CAF50", display: "inline-block" }} />
              Asistente de tu tienda
            </div>
          </div>
        </div>
        <button onClick={() => setShowConfig(!showConfig)} style={{
          background: "rgba(255,255,255,.1)", border: "none", color: "#fff",
          borderRadius: 8, padding: "7px 12px", fontSize: 11, cursor: "pointer",
          fontFamily: "inherit", fontWeight: 600,
        }}>⚙️</button>
      </div>

      {/* Config Panel */}
      {showConfig && (
        <div style={{
          background: "#fff", padding: "16px 18px", borderBottom: "1px solid #E8E5E0",
          animation: "slideDown .2s ease",
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Configuración WooCommerce</div>
          <input placeholder="https://mitienda.com" value={config.url} onChange={e => setConfig({...config, url: e.target.value})}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #DDD8D0", fontSize: 13, fontFamily: "inherit", marginBottom: 8, boxSizing: "border-box", outline: "none", background: "#FAFAF8" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <input placeholder="Consumer Key" value={config.ck} onChange={e => setConfig({...config, ck: e.target.value})}
              style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid #DDD8D0", fontSize: 13, fontFamily: "inherit", outline: "none", background: "#FAFAF8" }} />
            <input placeholder="Consumer Secret" type="password" value={config.cs} onChange={e => setConfig({...config, cs: e.target.value})}
              style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid #DDD8D0", fontSize: 13, fontFamily: "inherit", outline: "none", background: "#FAFAF8" }} />
          </div>
          <div style={{ fontSize: 11, color: "#999", marginTop: 8, lineHeight: 1.5 }}>
            📍 WooCommerce → Ajustes → Avanzado → REST API → Agregar clave (Lectura/Escritura)
          </div>
          <div style={{ fontSize: 11, color: "#E65100", marginTop: 6, padding: "8px 10px", background: "#FFF3E0", borderRadius: 6 }}>
            ⚡ Modo demo activo — los cambios se simulan localmente
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: "auto", padding: "16px 14px",
        display: "flex", flexDirection: "column", gap: 4,
      }}>
        {messages.length === 0 && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "20px" }}>
            <div style={{
              width: 64, height: 64, borderRadius: 20,
              background: "linear-gradient(135deg, #1A1A1A, #333)",
              display: "flex", alignItems: "center", justifyContent: "center",
              marginBottom: 16, boxShadow: "0 8px 24px rgba(0,0,0,.12)",
            }}>
              <svg width="28" height="28" fill="none" stroke="#fff" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.03em", textAlign: "center" }}>
              Hola, soy tu asistente
            </div>
            <div style={{ fontSize: 14, color: "#888", marginTop: 6, textAlign: "center", lineHeight: 1.5 }}>
              Decime qué necesitás y lo hago en tu tienda WooCommerce
            </div>
            <div style={{ width: "100%", marginTop: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#AAA", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                Probá con alguno de estos:
              </div>
              <SuggestionChips onSelect={(s) => sendMessage(s)} />
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={{
            display: "flex",
            justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            gap: 8,
            padding: "4px 0",
            alignItems: "flex-end",
            animation: "fadeUp .25s ease",
          }}>
            {msg.role === "assistant" && (
              <div style={{
                width: 34, height: 34, borderRadius: "50%", background: "#1A1A1A",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <svg width="16" height="16" fill="none" stroke="#fff" strokeWidth="2" viewBox="0 0 24 24"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
              </div>
            )}
            <div style={{ maxWidth: "78%" }}>
              <div style={{
                padding: "12px 16px",
                borderRadius: msg.role === "user"
                  ? "18px 18px 4px 18px"
                  : "18px 18px 18px 4px",
                background: msg.role === "user" ? "#1A1A1A" : "#F0EDE8",
                color: msg.role === "user" ? "#fff" : "#1A1A1A",
                fontSize: 14,
                lineHeight: 1.55,
                fontWeight: 450,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}>
                {msg.content}
              </div>
              {msg.actions?.map((a, j) => <ActionCard key={j} summary={a} />)}
              <div style={{
                fontSize: 10, color: "#BBB", marginTop: 4,
                textAlign: msg.role === "user" ? "right" : "left",
                padding: "0 4px",
              }}>
                {new Date(msg.ts).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          </div>
        ))}

        {loading && <TypingIndicator />}
      </div>

      {/* Quick actions after messages exist */}
      {messages.length > 0 && !loading && (
        <div style={{ padding: "0 14px 4px", overflowX: "auto", display: "flex", gap: 6 }}>
          {["Ver stock", "Pedidos hoy", "Productos sin stock"].map((s, i) => (
            <button key={i} onClick={() => sendMessage(s)} style={{
              padding: "6px 12px", borderRadius: 16, border: "1px solid #E0DCD6",
              background: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer",
              fontFamily: "inherit", color: "#777", whiteSpace: "nowrap", flexShrink: 0,
            }}>{s}</button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{
        padding: "10px 14px env(safe-area-inset-bottom, 14px)",
        background: "#fff",
        borderTop: "1px solid #E8E5E0",
        display: "flex",
        gap: 10,
        alignItems: "flex-end",
        flexShrink: 0,
      }}>
        <div style={{
          flex: 1, background: "#F5F3EF", borderRadius: 22,
          padding: "10px 16px", display: "flex", alignItems: "center",
          border: "1px solid transparent",
          transition: "border-color .15s",
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribí lo que necesitás..."
            rows={1}
            style={{
              border: "none", outline: "none", flex: 1, fontSize: 14,
              fontFamily: "inherit", background: "transparent", color: "#1A1A1A",
              resize: "none", maxHeight: 100, lineHeight: 1.4,
            }}
          />
        </div>
        <button
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || loading}
          style={{
            width: 44, height: 44, borderRadius: "50%",
            background: input.trim() && !loading ? "#1A1A1A" : "#D4CFC7",
            border: "none", cursor: input.trim() && !loading ? "pointer" : "default",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all .15s", flexShrink: 0,
          }}
        >
          <svg width="20" height="20" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideDown {
          from { opacity: 0; max-height: 0; }
          to { opacity: 1; max-height: 300px; }
        }
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        ::-webkit-scrollbar { display: none; }
        textarea::placeholder { color: #AAA; }
      `}</style>
    </div>
  );
}
