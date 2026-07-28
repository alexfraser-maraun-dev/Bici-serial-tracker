'use client';

import { signOut, useSession } from 'next-auth/react';
import Image from 'next/image';
import Link from 'next/link';
import { LogOut, Settings, List, QrCode, ShieldAlert } from 'lucide-react';

export default function Navigation() {
  const { data: session } = useSession();

  if (!session) return null;

  return (
    <header style={{ 
      backgroundColor: 'var(--surface)', 
      borderBottom: '1px solid var(--border)',
      padding: '1rem',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }}>
      <div className="flex items-center gap-6">
        <Link href="/" className="flex items-center gap-3" style={{ textDecoration: 'none', color: 'inherit' }}>
          <Image src="/logo.svg" alt="Bici Logo" width={32} height={32} />
          <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Bici Serial Tracker</h1>
        </Link>
        <nav className="flex gap-4">
          <Link href="/" className="flex items-center gap-2 text-muted hover:text-text">
            <List size={18} /> Collections
          </Link>
          <Link href="/unmatched" className="flex items-center gap-2 text-muted hover:text-text">
            <ShieldAlert size={18} /> Unmatched
          </Link>
          <Link href="/config" className="flex items-center gap-2 text-muted hover:text-text">
            <Settings size={18} /> Mapping Config
          </Link>
          <Link href="/how-to" className="flex items-center gap-2 text-muted hover:text-text">
            <QrCode size={18} /> How To
          </Link>
        </nav>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted">{session.user?.email}</span>
        <button onClick={() => signOut()} className="btn btn-outline" style={{ padding: '0.25rem 0.5rem' }}>
          <LogOut size={16} className="mr-2" /> Sign Out
        </button>
      </div>
    </header>
  );
}
