import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, LogOut } from "lucide-react";
import { auth } from "@/lib/auth";
import { useLang } from "@/lib/i18n";
import type { Neighborhood } from "@/lib/adapters";

const K = {
  ink:     '#14201d',
  teal:    '#1D9E75',
  amarillo:'#ffc928',
  coral:   '#D85A30',
  line:    'rgba(255,255,255,0.12)',
  muted:   'rgba(255,255,255,0.65)',
  serif:   "'Fraunces', Georgia, serif" as const,
}

type NavbarProps = {
  mlsBarrio?: Neighborhood | null;
  mlsTotal?: number;
  onBack?: () => void;
};

export function Navbar({ mlsBarrio, mlsTotal, onBack }: NavbarProps = {}) {
  const user    = typeof window !== "undefined" ? auth.get() : null;
  const navigate = useNavigate();
  const { lang, toggle } = useLang();

  const initials = (user?.name ?? "U")
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const linkStyle: React.CSSProperties = {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: 600,
    textDecoration: 'none',
    letterSpacing: '.3px',
  };

  return (
    <header style={{
      position: 'absolute', inset: '0 0 auto 0', zIndex: 30,
      background: K.ink,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 24px', height: 52, gap: 16,
      borderBottom: `1px solid ${K.line}`,
    }}>
      {/* LOGO */}
      <Link to="/" style={{ textDecoration: 'none', flexShrink: 0 }}>
        <span style={{ fontFamily: K.serif, fontWeight: 900, fontSize: '1.15rem', color: '#fff', letterSpacing: '-0.5px' }}>
          Medellín <span style={{ color: K.teal }}>Social</span><span style={{ color: K.amarillo }}>.</span>
        </span>
      </Link>

      {/* RIGHT */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexShrink: 0 }}>

        {/* MLS breadcrumb */}
        {mlsBarrio ? (
          <button
            onClick={onBack}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'none', border: `1px solid ${K.line}`,
              borderRadius: 8, padding: '6px 14px',
              color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <ArrowLeft size={14} />
            <span>{mlsBarrio.nombre}</span>
            {mlsTotal != null && mlsTotal > 0 && (
              <span style={{
                background: K.teal, color: '#fff',
                borderRadius: 999, padding: '1px 8px',
                fontSize: 11, fontWeight: 700,
              }}>
                {mlsTotal}
              </span>
            )}
          </button>
        ) : (
          <>
            <Link to="/simulador" style={linkStyle}>Simulador 💰</Link>
            <Link to="/comparador" style={linkStyle}>Comparador</Link>
          </>
        )}

        {/* Language pill */}
        <div style={{ display: 'flex', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 999, overflow: 'hidden' }}>
          {(['es', 'en'] as const).map(l => (
            <button
              key={l}
              onClick={toggle}
              style={{
                border: 'none',
                background: lang === l ? K.amarillo : 'transparent',
                color: lang === l ? K.ink : '#fff',
                padding: '4px 10px', fontWeight: 700,
                cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
              }}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Avatar */}
        <Link to="/perfil" title="Perfil" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: `linear-gradient(135deg, ${K.teal}, #085041)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 800, color: '#fff', overflow: 'hidden', flexShrink: 0,
          }}>
            {user?.avatar
              ? <img src={user.avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : initials}
          </div>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', fontWeight: 600, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.name ?? "Invitado"}
          </span>
        </Link>

        {/* Logout */}
        <button
          onClick={() => { auth.clear(); navigate({ to: "/login" }); }}
          title="Salir"
          style={{
            background: 'none', border: 'none',
            color: 'rgba(255,255,255,0.55)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', padding: 0,
          }}
          onMouseEnter={e => (e.currentTarget.style.color = K.coral)}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.55)')}
        >
          <LogOut size={15} />
        </button>
      </div>
    </header>
  );
}

export function ProfileChipMobile() {
  return null;
}
