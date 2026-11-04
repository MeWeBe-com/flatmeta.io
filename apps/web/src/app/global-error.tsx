'use client';

/** Last resort when the root layout itself fails (it replaces the whole document, so styles are inline). */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0B1020', color: '#E8ECF8', fontFamily: 'system-ui, sans-serif', textAlign: 'center', padding: 24 }}>
        <div>
          <h1 style={{ fontSize: 22 }}>FlatMeta hit a snag</h1>
          <p style={{ opacity: 0.7 }}>Reload to try again.{error.digest ? ` (ref ${error.digest})` : ''}</p>
          <button onClick={reset} style={{ marginTop: 12, padding: '10px 18px', borderRadius: 999, border: 0, background: '#2DE2C4', color: '#0B1020', fontWeight: 700, cursor: 'pointer' }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
