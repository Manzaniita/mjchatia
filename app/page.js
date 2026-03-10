"use client";
import { useState, useEffect, useRef } from "react";

// ─── Action Card ───
function ActionCard({ action }) {
  const icons = { product_update: "📦", order_update: "📋", order_create: "🛒", customer_create: "👤", error: "❌" };
  const isOk = action.success !== false;

  let label = "";
  if (action.type === "product_update") {
    const parts = [];
    if (action.changes?.price) parts.push(`Precio → $${Number(action.changes.price).toLocaleString("es-AR")}`);
    if (action.changes?.stock_quantity !== undefined) parts.push(`Stock → ${action.changes.stock_quantity}`);
    if (action.changes?.status) parts.push(`Estado → ${action.changes.status}`);
    label = `${action.name}: ${parts.join(" · ")}`;
  } else if (action.type === "order_update") {
    label = `Pedido #${action.id} → ${action.changes?.status || "actualizado"}`;
  } else if (action.type === "order_create") {
    label = `Pedido #${action.id || "?"} creado${action.total ? ` · $${Number(action.total).toLocaleString("es-AR")}` : ""}`;
  } else if (action.type === "customer_create") {
    label = `Cliente ${action.name} creado`;
  } else {
    label = action.error || "Acción desconocida";
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
      background: isOk ? "rgba(46,125,50,0.08)" : "rgba(198,40,40,0.08)",
      borderRadius: 10, marginTop: 8,
      border: `1px solid ${isOk ? "rgba(46,125,50,0.15)" : "rgba(198,40,40,0.15)"}`,
    }}>
      <span style={{ fontSize: 18 }}>{icons[action.type] || "⚙️"}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: isOk ? "#2E7D32" : "#C62828", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {isOk ? "Acción ejecutada en WooCommerce" : "Error"}
        </div>
        <div style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A", marginTop: 2 }}>{label}</div>
        {!isOk && action.error && <div style={{ fontSize: 11, color: "#C62828", marginTop: 2 }}>{action.error}</div>}
      </div>
      {isOk && (
        <span style={{ color: "#2E7D32", flexShrink: 0 }}>
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
        </span>
      )}
    </div>
  );
}

// ─── Typing dots ───
function TypingIndicator() {
  return (
    <div style={{ display: "flex", gap: 4, padding: "14px 18px", alignItems: "flex-end" }}>
      <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#1A1A1A", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <svg width="16" height="16" fill="none" stroke="#fff" strokeWidth="2" viewBox="0 0 24 24"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
      </div>
      <div style={{ background: "#F0EDE8", borderRadius: "18px 18px 18px 4px", padding: "14px 18px", display: "flex", gap: 5, alignItems: "center" }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "#999", animation: `bounce 1.2s ease-in-out ${i * 0.15}s infinite` }} />
        ))}
      </div>
    </div>
  );
}

// ─── Suggestion Chips ───
function Chips({ items, onSelect }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "8px 0" }}>
      {items.map((s, i) => (
        <button key={i} onClick={() => onSelect(s)} style={{
          padding: "8px 14px", borderRadius: 20, border: "1px solid #D4CFC7",
          background: "transparent", fontSize: 12, fontWeight: 500, cursor: "pointer",
          fontFamily: "'DM Sans', sans-serif", color: "#555", transition: "all .15s", whiteSpace: "nowrap",
        }}>{s}</button>
      ))}
    </div>
  );
}

// ─── Main Page ───
export default function Home() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const send = async (text) => {
    if (!text.trim() || loading) return;
    const userMsg = { role: "user", content: text, ts: Date.now() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, {
        role: "assistant",
        content: data.message,
        actions: data.actions || [],
        ts: Date.now(),
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Error de conexión. Verificá tu internet e intentá de nuevo.",
        actions: [],
        ts: Date.now(),
      }]);
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  const starters = [
    "¿Qué productos tengo sin stock?",
    "Mostrá los pedidos pendientes",
    "¿Cuáles son mis productos más caros?",
    "Listá los últimos pedidos",
    "¿Cuántos clientes tengo?",
    "Mostrá productos con stock bajo",
  ];

  const quickActions = ["Ver stock", "Últimos pedidos", "Sin stock", "Clientes"];

  return (
    <div style={{
      fontFamily: "'DM Sans', sans-serif", background: "#FAF9F6", height: "100dvh",
      maxWidth: 430, margin: "0 auto", display: "flex", flexDirection: "column",
      position: "relative", overflow: "hidden", color: "#1A1A1A",
    }}>
      {/* Header */}
      <div style={{
        background: "#1A1A1A", color: "#fff", padding: "14px 18px",
        display: "flex", alignItems: "center", gap: 12, flexShrink: 0, zIndex: 10,
      }}>
        <div style={{
          width: 38, height: 38, borderRadius: 12,
          background: "linear-gradient(135deg, #2E7D32, #43A047)",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <svg width="20" height="20" fill="none" stroke="#fff" strokeWidth="2" viewBox="0 0 24 24"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em" }}>WooChat</div>
          <div style={{ fontSize: 11, color: "#8A8A8A", display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4CAF50", display: "inline-block" }} />
            MJ Importaciones
          </div>
        </div>
      </div>

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
              Decime qué necesitás y lo hago<br />directo en MJ Importaciones
            </div>
            <div style={{ width: "100%", marginTop: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#AAA", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                Probá con alguno de estos:
              </div>
              <Chips items={starters} onSelect={send} />
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={{
            display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            gap: 8, padding: "4px 0", alignItems: "flex-end", animation: "fadeUp .25s ease",
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
                borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                background: msg.role === "user" ? "#1A1A1A" : "#F0EDE8",
                color: msg.role === "user" ? "#fff" : "#1A1A1A",
                fontSize: 14, lineHeight: 1.55, fontWeight: 450,
                whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}>
                {msg.content}
              </div>
              {msg.actions?.map((a, j) => <ActionCard key={j} action={a} />)}
              <div style={{
                fontSize: 10, color: "#BBB", marginTop: 4,
                textAlign: msg.role === "user" ? "right" : "left", padding: "0 4px",
              }}>
                {new Date(msg.ts).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          </div>
        ))}

        {loading && <TypingIndicator />}
      </div>

      {/* Quick chips */}
      {messages.length > 0 && !loading && (
        <div style={{ padding: "0 14px 4px", overflowX: "auto", display: "flex", gap: 6, flexShrink: 0 }}>
          {quickActions.map((s, i) => (
            <button key={i} onClick={() => send(s)} style={{
              padding: "6px 12px", borderRadius: 16, border: "1px solid #E0DCD6",
              background: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif", color: "#777", whiteSpace: "nowrap", flexShrink: 0,
            }}>{s}</button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{
        padding: "10px 14px calc(env(safe-area-inset-bottom, 10px) + 10px)",
        background: "#fff", borderTop: "1px solid #E8E5E0",
        display: "flex", gap: 10, alignItems: "flex-end", flexShrink: 0,
      }}>
        <div style={{
          flex: 1, background: "#F5F3EF", borderRadius: 22,
          padding: "10px 16px", display: "flex", alignItems: "center",
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
              fontFamily: "'DM Sans', sans-serif", background: "transparent",
              color: "#1A1A1A", resize: "none", maxHeight: 100, lineHeight: 1.4,
            }}
          />
        </div>
        <button
          onClick={() => send(input)}
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
    </div>
  );
}
