'use client';

import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';

interface Props {
  className?: string;
  title?: string;
  showLabel?: boolean;
}

/**
 * Cierre de sesión real: termina la sesión de Supabase Auth (no solo
 * borra cookies) y vuelve a /login.
 */
export default function LogoutButton({ className, title = 'Cerrar Sesión', showLabel = false }: Props) {
  const router = useRouter();

  const handleClick = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      /* continuar al login de todas formas */
    }
    router.push('/login');
    router.refresh();
  };

  return (
    <button type="button" onClick={handleClick} className={className} title={title}>
      <LogOut size={16} />
      {showLabel && <span>Cerrar Sesión</span>}
    </button>
  );
}
