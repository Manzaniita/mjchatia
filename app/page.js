"use client";
import { useState, useEffect, useRef } from "react";

// ═══════════════════════════════════════════════
// SIMPLE TEXT FORMATTER - converts **bold** and basic markdown to styled spans
// ═══════════════════════════════════════════════
function FormattedText({ text }) {
  if (!text) return null;

  const lines = text.split("\n");

  return (
    <div>
      {lines.map((line, li) => {
        // Empty line = spacer
        if (line.trim() === "") return <div key={li} style={{ height: 8 }} />;

        // Parse inline formatting
        const parts = [];
        let remaining = line;
        let key = 0;

        while (remaining.length > 0) {
          // Bold: **text**
          const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
          if (boldMatch) {
            const idx = remaining.indexOf(boldMatch[0]);
            if (idx > 0) parts.push(<span key={key++}>{remaining.slice(0, idx)}</span>);
            parts.push(<strong key={key++} style={{ fontWeight: 700 }}>{boldMatch[1]}</strong>);
            remaining = remaining.slice(idx + boldMatch[0].length);
            continue;
          }

          // Italic: *text*
          const italicMatch = remaining.match(/\*(.+?)\*/);
          if (italicMatch) {
            const idx = remaining.indexOf(italicMatch[0]);
            if (idx > 0) parts.push(<span key={key++}>{remaining.slice(0, idx)}</span>);
            parts.push(<em key={key++}>{italicMatch[1]}</em>);
            remaining = remaining.slice(idx + italicMatch[0].length);
            continue;
          }

          // Inline code: `text`
          const codeMatch = remaining.match(/`(.+?)`/);
          if (codeMatch) {
            const idx = remaining.indexOf(codeMatch[0]);
            if (idx > 0) parts.push(<span key={key++}>{remaining.slice(0, idx)}</span>);
            parts.push(
              <code key={key++} style={{
                background: "rgba(0,0,0,0.06)", padding: "1px 5px",
                borderRadius: 4, fontSize: "0.9em", fontFamily: "monospace",
              }}>{codeMatch[1]}</code>
            );
            remaining = remaining.slice(idx + codeMatch[0].length);
            continue;
          }

          // No more matches
          parts.push(<span key={key++}>{remaining}</span>);
          break;
        }

        // Detect list items
        const trimmed = line.trimStart();
        const isBullet = /^[-•]\s/.test(trimmed);
        const isNumbered = /^\d+[.)]\s/.test(trimmed);

        if (isBullet || isNumbered) {
          return (
            <div key={li} style={{ display: "flex", gap: 6, paddingLeft: 4, marginTop: 2, marginBottom: 2 }}>
              <span style={{ color: "#2E7D32", fontWeight: 700, flexShrink: 0, width: 14, textAlign: "center" }}>
                {isBullet ? "•" : trimmed.match(/^\d+/)?.[0] + "."}
              </span>
              <span>{isBullet ? parts.slice(0).map((p, i) => {
                // Remove the leading "- " from the first text part
                if (i === 0 && typeof p.props?.children === "string") {
                  return <span key={p.key}>{p.props.children.replace(/^[-•]\s*/, "")}</span>;
                }
                return p;
              }) : parts.map((p, i) => {
                if (i === 0 && typeof p.props?.children === "string") {
                  return <span key={p.key}>{p.props.children.replace(/^\d+[.)]\s*/, "")}</span>;
                }
                return p;
              })}</span>
            </div>
          );
        }

        return <div key={li} style={{ marginTop: 1, marginBottom: 1 }}>{parts}</div>;
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════
// ACTION CARD
// ═══════════════════════════════════════════════
function ActionCard({ action }) {
  const icons = { product_update:"📦", order_update:"📋", order_create:"🛒", customer_create:"👤", variation_create:"🏷️", variation_update:"🏷️", error:"❌" };
  const ok = action.success !== false;

  let label = "";
  if (action.type === "product_update") {
    const parts = [];
    const c = action.changes || {};
    if (c.price) parts.push(`Precio → $${Number(c.price).toLocaleString("es-AR")}`);
    if (c.regular_price) parts.push(`Regular → $${Number(c.regular_price).toLocaleString("es-AR")}`);
    if (c.sale_price) parts.push(`Oferta → $${Number(c.sale_price).toLocaleString("es-AR")}`);
    if (c.stock_quantity !== undefined) parts.push(`Stock → ${c.stock_quantity}`);
    if (c.status) parts.push(`Estado → ${c.status}`);
    label = `${action.name}: ${parts.join(" · ")}`;
  } else if (action.type === "order_update") {
    label = `Pedido #${action.id} → ${action.changes?.status || "actualizado"}`;
  } else if (action.type === "order_create") {
    label = `Pedido #${action.id || "?"} creado${action.total ? ` · $${Number(action.total).toLocaleString("es-AR")}` : ""}`;
  } else if (action.type === "customer_create") {
    label = `Cliente ${action.name} creado`;
  } else if (action.type === "variation_create") {
    label = `Variación creada (ID: ${action.id})`;
  } else if (action.type === "variation_update") {
    label = `Variación ${action.variation_id} actualizada`;
  } else {
    label = action.error || "Acción desconocida";
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
      background: ok ? "rgba(46,125,50,0.08)" : "rgba(198,40,40,0.08)",
      borderRadius: 10, marginTop: 8,
      border: `1px solid ${ok ? "rgba(46,125,50,0.15)" : "rgba(198,40,40,0.15)"}`,
    }}>
      <span style={{ fontSize: 18 }}>{icons[action.type] || "⚙️"}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: ok ? "#2E7D32" : "#C62828", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {ok ? "✓ Ejecutado en WooCommerce" : "✗ Error"}
        </div>
        <div style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A", marginTop: 2, wordBreak: "break-word" }}>{label}</div>
        {!ok && action.error && <div style={{ fontSize: 11, color: "#C62828", marginTop: 2 }}>{action.error}</div>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// TYPING INDICATOR
// ═══════════════════════════════════════════════
function TypingIndicator() {
  return (
    <div style={{ display: "flex", gap: 4, padding: "14px 18px", alignItems: "flex-end" }}>
      <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#1A1A1A", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <svg width="14" height="14" fill="none" stroke="#4CAF50" strokeWidth="2" viewBox="0 0 24 24"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
      </div>
      <div style={{ background: "#F0EDE8", borderRadius: "18px 18px 18px 4px", padding: "14px 18px", display: "flex", gap: 5, alignItems: "center" }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "#999", animation: `bounce 1.2s ease-in-out ${i * 0.15}s infinite` }} />
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// ROLE CONFIG
// ═══════════════════════════════════════════════
const ROLES = {
  administrador: { bg: "#E8EAF6", text: "#283593", label: "👑 Admin", dot: "#283593" },
  revendedor: { bg: "#FFF3E0", text: "#E65100", label: "🏪 Revendedor", dot: "#E65100" },
  cliente: { bg: "#E8F5E9", text: "#2E7D32", label: "🛒 Cliente", dot: "#2E7D32" },
  invitado: { bg: "#F5F5F5", text: "#757575", label: "👤 Invitado", dot: "#757575" },
};

// ═══════════════════════════════════════════════
// AUTH SCREEN
// ═══════════════════════════════════════════════
function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("welcome");
  const [form, setForm] = useState({ email: "", password: "", first_name: "", last_name: "", phone: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const up = (k, v) => { setForm(f => ({ ...f, [k]: v })); setError(""); };

  const submit = async (action) => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...form }),
      });
      const data = await res.json();
      if (data.success) onAuth(data.user);
      else setError(data.error || "Error desconocido");
    } catch (e) { setError("Error de conexión"); }
    setLoading(false);
  };

  const inp = {
    width: "100%", padding: "14px 16px", borderRadius: 12,
    border: "1px solid #DDD8D0", fontSize: 15, fontFamily: "'DM Sans',sans-serif",
    outline: "none", background: "#FAFAF8", boxSizing: "border-box",
  };

  const btn = (primary) => ({
    width: "100%", padding: "14px", borderRadius: 12, border: primary ? "none" : "1px solid #DDD8D0",
    fontSize: 15, fontWeight: 700, cursor: loading ? "wait" : "pointer",
    fontFamily: "'DM Sans',sans-serif",
    background: primary ? "#1A1A1A" : "transparent",
    color: primary ? "#fff" : "#1A1A1A",
    opacity: loading ? 0.6 : 1,
  });

  return (
    <div style={{
      fontFamily: "'DM Sans',sans-serif", background: "#FAF9F6", height: "100dvh",
      maxWidth: 430, margin: "0 auto", display: "flex", flexDirection: "column",
      justifyContent: "center", padding: "40px 24px", color: "#1A1A1A",
    }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{
          width: 72, height: 72, borderRadius: 22, margin: "0 auto 16px",
          background: "linear-gradient(135deg, #1A1A1A, #333)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 8px 30px rgba(0,0,0,.15)",
        }}>
          <svg width="32" height="32" fill="none" stroke="#4CAF50" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em" }}>WooChat</div>
        <div style={{ fontSize: 14, color: "#888", marginTop: 4 }}>MJ Importaciones</div>
      </div>

      {mode === "welcome" && (
        <div style={{ animation: "fadeUp .3s ease" }}>
          <div style={{ textAlign: "center", marginBottom: 24, fontSize: 14, color: "#888", lineHeight: 1.5 }}>
            Iniciá sesión o creá una cuenta nueva
          </div>
          <button onClick={() => setMode("login")} style={btn(true)}>Iniciar sesión</button>
          <div style={{ height: 10 }} />
          <button onClick={() => setMode("register")} style={btn(false)}>Crear cuenta nueva</button>
          <div style={{ height: 10 }} />
          <button onClick={() => submit("guest")} style={{ ...btn(false), border: "none", fontSize: 13, color: "#999" }}>
            Continuar sin cuenta →
          </button>
        </div>
      )}

      {mode === "login" && (
        <div style={{ animation: "fadeUp .3s ease" }}>
          <div style={{ marginBottom: 12 }}>
            <input style={inp} placeholder="Email" type="email" value={form.email} onChange={e => up("email", e.target.value)} autoComplete="email" />
          </div>
          <div style={{ marginBottom: 20 }}>
            <input style={inp} placeholder="Contraseña (opcional si creaste cuenta por chat)" type="password" value={form.password} onChange={e => up("password", e.target.value)} />
          </div>
          {error && <div style={{ color: "#C62828", fontSize: 13, textAlign: "center", marginBottom: 12, padding: "8px 12px", background: "#FFEBEE", borderRadius: 8 }}>{error}</div>}
          <button onClick={() => submit("login")} style={btn(true)} disabled={loading}>
            {loading ? "Verificando..." : "Entrar"}
          </button>
          <button onClick={() => { setMode("welcome"); setError(""); }} style={{ ...btn(false), marginTop: 10, border: "none", fontSize: 13, color: "#999" }}>← Volver</button>
        </div>
      )}

      {mode === "register" && (
        <div style={{ animation: "fadeUp .3s ease" }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <input style={inp} placeholder="Nombre" value={form.first_name} onChange={e => up("first_name", e.target.value)} />
            <input style={inp} placeholder="Apellido" value={form.last_name} onChange={e => up("last_name", e.target.value)} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <input style={inp} placeholder="Email" type="email" value={form.email} onChange={e => up("email", e.target.value)} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <input style={inp} placeholder="Contraseña" type="password" value={form.password} onChange={e => up("password", e.target.value)} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <input style={inp} placeholder="Teléfono (opcional)" type="tel" value={form.phone} onChange={e => up("phone", e.target.value)} />
          </div>
          {error && <div style={{ color: "#C62828", fontSize: 13, textAlign: "center", marginBottom: 12, padding: "8px 12px", background: "#FFEBEE", borderRadius: 8 }}>{error}</div>}
          <button onClick={() => submit("register")} style={btn(true)} disabled={loading}>
            {loading ? "Creando..." : "Crear cuenta"}
          </button>
          <button onClick={() => { setMode("welcome"); setError(""); }} style={{ ...btn(false), marginTop: 10, border: "none", fontSize: 13, color: "#999" }}>← Volver</button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// MAIN CHAT
// ═══════════════════════════════════════════════
export default function Home() {
  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const send = async (text) => {
    if (!text.trim() || loading) return;
    const userMsg = { role: "user", content: text, ts: Date.now() };
    const all = [...messages, userMsg];
    setMessages(all); setInput(""); setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: all.map(m => ({ role: m.role, content: m.content })),
          user,
        }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.message, actions: data.actions || [], ts: Date.now() }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: "Error de conexión. Intentá de nuevo.", actions: [], ts: Date.now() }]);
    }
    setLoading(false);
  };

  const onKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } };

  if (!user) return <AuthScreen onAuth={setUser} />;

  const rs = ROLES[user.role] || ROLES.invitado;

  const tips = {
    administrador: ["Productos sin stock", "Últimos pedidos", "Resumen de ventas", "Stock bajo", "Clientes top"],
    revendedor: ["Ver catálogo", "Hacer un pedido", "Mis pedidos", "Novedades"],
    cliente: ["Ayuda para elegir", "Ver productos", "Hacer un pedido", "Mis pedidos"],
    invitado: ["Ver catálogo", "Necesito ayuda", "Productos populares"],
  };

  const chips = {
    administrador: ["Stock", "Pedidos", "Clientes", "Precios"],
    revendedor: ["Catálogo", "Mis pedidos", "Nuevo pedido"],
    cliente: ["Productos", "Mis pedidos", "Ayuda"],
    invitado: ["Catálogo", "Ayuda"],
  };

  return (
    <div style={{
      fontFamily: "'DM Sans',sans-serif", background: "#FAF9F6", height: "100dvh",
      maxWidth: 430, margin: "0 auto", display: "flex", flexDirection: "column",
      overflow: "hidden", color: "#1A1A1A",
    }}>
      {/* Header */}
      <div style={{
        background: "#1A1A1A", color: "#fff", padding: "12px 16px",
        display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "linear-gradient(135deg, #2E7D32, #43A047)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="18" height="18" fill="none" stroke="#fff" strokeWidth="2" viewBox="0 0 24 24"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>WooChat</div>
            <div style={{ fontSize: 10, color: "#8A8A8A", display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: rs.dot }} />
              {user.name} · {rs.label}
            </div>
          </div>
        </div>
        <button onClick={() => { setUser(null); setMessages([]); }} style={{
          background: "rgba(255,255,255,.08)", border: "none", color: "#888",
          borderRadius: 8, padding: "6px 12px", fontSize: 11, cursor: "pointer",
          fontFamily: "inherit", fontWeight: 600,
        }}>Salir</button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
        {messages.length === 0 && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: 16 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 16,
              background: "linear-gradient(135deg, #1A1A1A, #333)",
              display: "flex", alignItems: "center", justifyContent: "center",
              marginBottom: 12, boxShadow: "0 6px 20px rgba(0,0,0,.12)",
            }}>
              <svg width="24" height="24" fill="none" stroke="#4CAF50" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.03em" }}>
              Hola{user.first_name ? `, ${user.first_name}` : ""}! 👋
            </div>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px",
              borderRadius: 20, fontSize: 11, fontWeight: 600, background: rs.bg, color: rs.text, marginTop: 6,
            }}>{rs.label}</div>
            <div style={{ fontSize: 13, color: "#888", marginTop: 8, textAlign: "center", lineHeight: 1.5 }}>
              {user.role === "administrador" && "Acceso completo a tu tienda. ¿Qué necesitás?"}
              {user.role === "revendedor" && "Catálogo con precios especiales y pedidos."}
              {user.role === "cliente" && "Te ayudo a encontrar lo que necesitás."}
              {user.role === "invitado" && "Puedo mostrarte el catálogo y asesorarte."}
            </div>
            <div style={{ width: "100%", marginTop: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#BBB", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                Sugerencias:
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {(tips[user.role] || tips.invitado).map((s, i) => (
                  <button key={i} onClick={() => send(s)} style={{
                    padding: "8px 14px", borderRadius: 20, border: "1px solid #D4CFC7",
                    background: "transparent", fontSize: 12, fontWeight: 500, cursor: "pointer",
                    fontFamily: "inherit", color: "#555", whiteSpace: "nowrap",
                  }}>{s}</button>
                ))}
              </div>
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
                width: 32, height: 32, borderRadius: "50%", background: "#1A1A1A",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <svg width="14" height="14" fill="none" stroke="#4CAF50" strokeWidth="2" viewBox="0 0 24 24"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
              </div>
            )}
            <div style={{ maxWidth: "80%" }}>
              <div style={{
                padding: "12px 16px",
                borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                background: msg.role === "user" ? "#1A1A1A" : "#F0EDE8",
                color: msg.role === "user" ? "#fff" : "#1A1A1A",
                fontSize: 14, lineHeight: 1.6, fontWeight: 450,
              }}>
                {msg.role === "assistant"
                  ? <FormattedText text={msg.content} />
                  : <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{msg.content}</span>
                }
              </div>
              {msg.actions?.map((a, j) => <ActionCard key={j} action={a} />)}
              <div style={{
                fontSize: 10, color: "#CCC", marginTop: 3,
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
          {(chips[user.role] || chips.invitado).map((s, i) => (
            <button key={i} onClick={() => send(s)} style={{
              padding: "5px 12px", borderRadius: 16, border: "1px solid #E0DCD6",
              background: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer",
              fontFamily: "inherit", color: "#777", whiteSpace: "nowrap", flexShrink: 0,
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
        <div style={{ flex: 1, background: "#F5F3EF", borderRadius: 22, padding: "10px 16px", display: "flex", alignItems: "center" }}>
          <textarea
            value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKey}
            placeholder={user.role === "administrador" ? "Ej: Poné stock 50 en la remera..." : "Escribí lo que necesitás..."}
            rows={1}
            style={{
              border: "none", outline: "none", flex: 1, fontSize: 14,
              fontFamily: "inherit", background: "transparent",
              color: "#1A1A1A", resize: "none", maxHeight: 100, lineHeight: 1.4,
            }}
          />
        </div>
        <button
          onClick={() => send(input)} disabled={!input.trim() || loading}
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
