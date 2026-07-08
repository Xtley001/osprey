/**
 * Developers — how to access Osprey programmatically.
 *
 * Answers the "how do people use the API / SDK?" question directly in-product:
 * install the typed SDK, or hit the REST + WebSocket endpoints. Endpoint list
 * mirrors packages/server/src/routes and the client in packages/sdk.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Code2, Terminal, KeyRound, Radio, Copy, Check, ExternalLink, Bird, ArrowLeft } from 'lucide-react';
import { toast } from '../components/shared/Toast';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { PageHeader } from '../components/ui';

// Public header — /docs renders outside the app shell, so it carries its own
// nav back to the marketing site and into the app.
const DocsNav: React.FC = () => (
  <header style={{
    position: 'sticky', top: 0, zIndex: 50,
    backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
    background: 'rgba(7,8,11,0.72)', borderBottom: '1px solid var(--c-800)',
  }}>
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', gap: 16 }}>
      <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
        <Bird size={22} color="var(--accent)" />
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 19, color: 'var(--w-000)', letterSpacing: '-0.02em' }}>OSPREY</span>
      </Link>
      <nav style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
        <Link to="/" className="btn btn-ghost btn-sm" style={{ border: 'none' }}><ArrowLeft size={14} /> Home</Link>
        <Link to="/app" className="btn btn-primary btn-sm">Launch App</Link>
      </nav>
    </div>
  </header>
);

const SDK_INSTALL = `npm install @osprey/sdk`;

const SDK_USAGE = `import { Osprey } from '@osprey/sdk';

const osprey = new Osprey({
  baseUrl: 'https://api.osprey.example',
  apiKey:  process.env.OSPREY_API_KEY, // only needed for config/engine control
});

// Public reads — no key required
const rates  = await osprey.rates.list();   // FundingRate[]
const regime = await osprey.regime.get();    // RegimeState

// Authenticated — engine + config control
const config = await osprey.config.get();
await osprey.config.update({ maxPositions: 8 });
await osprey.engine.arm();
await osprey.engine.enable();

// Live rate stream (WebSocket) — returns an unsubscribe fn
const stop = osprey.stream((event) => {
  console.log('rate update', event);
});`;

const CURL_RATES = `curl https://api.osprey.example/v1/rates`;

const CURL_CONFIG = `curl -X PUT https://api.osprey.example/v1/config \\
  -H "X-API-Key: $OSPREY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "maxPositions": 8 }'`;

interface Endpoint {
  method: 'GET' | 'POST' | 'PUT' | 'WS';
  path: string;
  auth: boolean;
  desc: string;
}

const ENDPOINTS: Endpoint[] = [
  { method: 'GET',  path: '/v1/health',         auth: false, desc: 'Liveness probe.' },
  { method: 'GET',  path: '/v1/rates',          auth: false, desc: 'All funding rates with heat, trend, persistence.' },
  { method: 'GET',  path: '/v1/regime',         auth: false, desc: 'Current market regime (HOT / NEUTRAL / COLD).' },
  { method: 'GET',  path: '/v1/config',         auth: true,  desc: 'Read the active harvest engine config.' },
  { method: 'PUT',  path: '/v1/config',         auth: true,  desc: 'Update engine config (partial patch).' },
  { method: 'GET',  path: '/v1/engine/status',  auth: true,  desc: 'Engine armed / running state + counters.' },
  { method: 'POST', path: '/v1/engine/arm',     auth: true,  desc: 'Arm the engine (required before enable).' },
  { method: 'POST', path: '/v1/engine/enable',  auth: true,  desc: 'Start the auto-trader cycle.' },
  { method: 'POST', path: '/v1/engine/disable', auth: true,  desc: 'Stop the auto-trader.' },
  { method: 'WS',   path: '/v1/stream',         auth: false, desc: 'WebSocket stream of live rate updates.' },
];

const METHOD_COLORS: Record<Endpoint['method'], string> = {
  GET:  'var(--accent-green)',
  POST: 'var(--accent-yellow)',
  PUT:  'var(--accent-blue)',
  WS:   'var(--accent-purple)',
};

const CodeBlock: React.FC<{ code: string; label?: string }> = ({ code, label }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Copy failed — select and copy manually');
    }
  };
  return (
    <div style={{ position: 'relative', marginBottom: 'var(--sp-3)' }}>
      {label && (
        <p style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</p>
      )}
      <div style={{ position: 'relative' }}>
        <pre style={{
          background: 'var(--bg-page)', border: '1px solid var(--glass-border)',
          borderRadius: 'var(--r-md)', padding: 'var(--sp-4)', paddingRight: 44,
          overflowX: 'auto', margin: 0,
          fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.6, color: 'var(--text-primary)',
        }}>
          <code>{code}</code>
        </pre>
        <button
          onClick={copy}
          aria-label="Copy code"
          title="Copy"
          style={{
            position: 'absolute', top: 8, right: 8,
            background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)',
            borderRadius: 'var(--r-sm)', padding: 5, cursor: 'pointer',
            color: copied ? 'var(--accent-green)' : 'var(--text-muted)', display: 'flex',
          }}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>
    </div>
  );
};

const SectionTitle: React.FC<{ icon: React.ReactNode; title: string; sub?: string }> = ({ icon, title, sub }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--sp-3)' }}>
    <span style={{ color: 'var(--hl-teal)', display: 'flex' }}>{icon}</span>
    <div>
      <p style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15 }}>{title}</p>
      {sub && <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{sub}</p>}
    </div>
  </div>
);

const Developers: React.FC = () => {
  const { isMobile } = useBreakpoint();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--grad-ambient)' }}>
      <DocsNav />
      <div className="fade-in" style={{ paddingTop: 'var(--sp-6)', paddingBottom: 'var(--sp-10)', paddingLeft: 24, paddingRight: 24, maxWidth: 860, margin: '0 auto' }}>
      <PageHeader
        title={<><Code2 size={20} color="var(--accent)" /> Developers</>}
        subtitle={
          <>Access Osprey programmatically — read live funding intelligence or drive the harvest engine from your own code.
          Use the typed <strong style={{ color: 'var(--text-primary)' }}>@osprey/sdk</strong> client, or call the REST + WebSocket API directly.</>
        }
      />

      {/* SDK */}
      <div className="glass-card" style={{ padding: 'var(--sp-5)', marginBottom: 'var(--sp-4)' }}>
        <SectionTitle icon={<Terminal size={16} />} title="TypeScript SDK" sub="The fastest way in — fully typed, thin wrapper over the API." />
        <CodeBlock code={SDK_INSTALL} label="Install" />
        <CodeBlock code={SDK_USAGE} label="Usage" />
      </div>

      {/* Auth */}
      <div className="glass-card" style={{ padding: 'var(--sp-5)', marginBottom: 'var(--sp-4)' }}>
        <SectionTitle icon={<KeyRound size={16} />} title="Authentication" sub="Public reads are open. Config + engine control need an API key." />
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 'var(--sp-3)' }}>
          Pass your key in the <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--hl-teal)' }}>X-API-Key</code> header on
          authenticated endpoints. Rate + regime reads and the stream require no key.
        </p>
        <div style={{ background: 'rgba(245,197,66,0.06)', border: '1px solid rgba(245,197,66,0.2)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)', fontSize: 11, color: 'var(--accent-yellow)' }}>
          Keep API keys server-side. The engine-control endpoints can place live orders — never ship a key in a browser bundle.
        </div>
      </div>

      {/* Endpoints */}
      <div className="glass-card" style={{ padding: 'var(--sp-5)', marginBottom: 'var(--sp-4)' }}>
        <SectionTitle icon={<Radio size={16} />} title="REST + WebSocket endpoints" sub="Base URL is your Osprey server deployment." />
        <div style={{ overflowX: 'auto', border: '1px solid var(--glass-border)', borderRadius: 'var(--r-md)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? 480 : undefined }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                {['Method', 'Path', 'Auth', 'Description'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ENDPOINTS.map(ep => (
                <tr key={ep.method + ep.path} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: METHOD_COLORS[ep.method] }}>{ep.method}</span>
                  </td>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{ep.path}</td>
                  <td style={{ padding: '8px 12px' }}>
                    {ep.auth
                      ? <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent-yellow)' }}>API key</span>
                      : <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>public</span>}
                  </td>
                  <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-secondary)' }}>{ep.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* curl */}
      <div className="glass-card" style={{ padding: 'var(--sp-5)', marginBottom: 'var(--sp-4)' }}>
        <SectionTitle icon={<Terminal size={16} />} title="cURL examples" />
        <CodeBlock code={CURL_RATES} label="Read rates (public)" />
        <CodeBlock code={CURL_CONFIG} label="Update config (authenticated)" />
      </div>

      {/* Links */}
      <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
        <a href="https://github.com/Xtley001/osprey" target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 14px', textDecoration: 'none' }}>
          <ExternalLink size={13} /> SDK reference & examples
        </a>
        <a href="https://app.hyperliquid.xyz" target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 14px', textDecoration: 'none' }}>
          <ExternalLink size={13} /> Hyperliquid docs
        </a>
      </div>
      <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 'var(--sp-3)' }}>
        SDK package: <code style={{ fontFamily: 'var(--font-mono)' }}>@osprey/sdk</code> · API surface defined in <code style={{ fontFamily: 'var(--font-mono)' }}>packages/server</code>.
      </p>
      </div>
    </div>
  );
};

export default Developers;
