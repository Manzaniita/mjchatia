# WooChat — Asistente IA para MJ Importaciones

Chat con inteligencia artificial que gestiona tu tienda WooCommerce. Escribís lo que necesitás en lenguaje natural y el asistente lo ejecuta automáticamente.

## Qué puede hacer

- ✅ Listar productos, precios y stock
- ✅ Cambiar precios de productos
- ✅ Actualizar stock
- ✅ Cambiar estado de pedidos
- ✅ Crear pedidos nuevos
- ✅ Crear clientes
- ✅ Consultar pedidos y clientes
- ✅ Funciona como PWA (se instala en iPhone y Android)

## Configuración

### 1. Variables de entorno en Vercel

Andá a tu proyecto en Vercel → Settings → Environment Variables y agregá:

| Variable | Valor |
|----------|-------|
| `WOO_URL` | `https://mjimportaciones.com.ar` |
| `WOO_CK` | tu Consumer Key de WooCommerce |
| `WOO_CS` | tu Consumer Secret de WooCommerce |
| `ANTHROPIC_API_KEY` | tu API key de Anthropic |

### 2. API Key de Anthropic

1. Ir a https://console.anthropic.com
2. Crear cuenta o iniciar sesión
3. Ir a API Keys → Create Key
4. Copiar la key y pegarla en Vercel como `ANTHROPIC_API_KEY`

### 3. Deploy

Cada push a `main` en GitHub se deploya automáticamente en Vercel.

## Instalar como app en el celular

### iPhone
1. Abrí la URL en Safari
2. Tocá el botón de Compartir (cuadrado con flecha)
3. "Agregar a Inicio"

### Android
1. Abrí la URL en Chrome
2. Tocá los 3 puntos → "Instalar app" o "Agregar a pantalla de inicio"

## Estructura del proyecto

```
app/
  layout.js          → Layout raíz
  page.js            → Chat UI (cliente)
  globals.css        → Estilos globales
  api/
    chat/route.js    → Endpoint que habla con Claude y ejecuta acciones en WooCommerce
    woo/route.js     → Proxy a la API de WooCommerce (mantiene credentials seguras)
public/
  manifest.json      → PWA manifest
```
