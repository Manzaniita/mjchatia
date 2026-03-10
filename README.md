# WooChat v2 — MJ Importaciones

Asistente IA con roles para gestionar tu tienda WooCommerce por chat.

## Roles

| Rol | Puede hacer |
|-----|------------|
| **Administrador** | Todo: editar productos/precios/stock, gestionar pedidos, clientes, variaciones |
| **Revendedor** | Ver catálogo con precios especiales, crear pedidos a su nombre, ver sus pedidos |
| **Cliente** | Recibir asesoramiento, ver catálogo con precios regulares, crear pedidos |
| **Invitado** | Ver catálogo, recibir asesoramiento (no puede comprar) |

## Configuración en Vercel

Settings → Environment Variables:

| Variable | Valor | Descripción |
|----------|-------|-------------|
| `WOO_URL` | `https://mjimportaciones.com.ar` | URL de tu tienda |
| `WOO_CK` | `ck_xxx...` | Consumer Key de WooCommerce |
| `WOO_CS` | `cs_xxx...` | Consumer Secret de WooCommerce |
| `ANTHROPIC_API_KEY` | `sk-ant-xxx...` | API key de Anthropic |
| `WP_ADMIN_USER` | tu usuario admin | Para verificar roles de WordPress |
| `WP_ADMIN_PASS` | tu contraseña o Application Password | Para la API de WordPress |

### Application Password (para WP_ADMIN_PASS)

Para que el login funcione con verificación de roles, necesitás crear una Application Password en WordPress:

1. Ir a WordPress → Usuarios → Tu perfil
2. Buscar la sección "Application Passwords" (Contraseñas de aplicación)
3. Poner nombre "WooChat" → Generar
4. Copiar la contraseña generada y usarla como `WP_ADMIN_PASS`

## Instalar como app

**iPhone**: Safari → Compartir → Agregar a Inicio
**Android**: Chrome → Menú → Instalar app
