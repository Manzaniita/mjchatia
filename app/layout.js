import "./globals.css";

export const metadata = {
  title: "WooChat — MJ Importaciones",
  description: "Asistente IA para gestionar tu tienda",
  manifest: "/manifest.json",
  themeColor: "#1A1A1A",
};

export const viewport = {
  width: "device-width", initialScale: 1, maximumScale: 1,
  userScalable: false, viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body>{children}</body>
    </html>
  );
}
