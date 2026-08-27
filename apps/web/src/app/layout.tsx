import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'DeliveryOS',
    template: '%s | DeliveryOS',
  },
  description: 'Plataforma de despacho y seguimiento de última milla para restaurantes con flota propia.',
  keywords: ['delivery', 'restaurante', 'despacho', 'tracking', 'última milla', 'Perú'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        {children}
        <Toaster
          position="top-right"
          richColors
          closeButton
          toastOptions={{
            duration: 4000,
          }}
        />
      </body>
    </html>
  );
}
