import React, { useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Home, AlertTriangle } from 'lucide-react';

function NotFoundPage() {
  const location = useLocation();

  useEffect(() => {
    console.error('404 Error: User attempted to access non-existent route:', location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center" style={{ maxWidth: '500px', padding: '2rem' }}>
        <AlertTriangle 
          size={80} 
          style={{ 
            color: 'hsl(var(--primary))', 
            marginBottom: '1.5rem',
            display: 'inline-block'
          }} 
        />
        <h1 style={{ 
          fontSize: '6rem', 
          fontWeight: 700, 
          marginBottom: '1rem',
          color: 'hsl(var(--foreground))'
        }}>
          404
        </h1>
        <h2 style={{ 
          fontSize: '1.75rem', 
          fontWeight: 600, 
          marginBottom: '1rem',
          color: 'hsl(var(--foreground))'
        }}>
          Oops! Page not found
        </h2>
        <p className="text-muted" style={{ 
          fontSize: '1.1rem', 
          marginBottom: '2rem',
          lineHeight: '1.6'
        }}>
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link to="/chat">
          <button className="modal-action-btn primary" style={{ 
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <Home size={18} />
            Return to Chat
          </button>
        </Link>
        <div style={{ marginTop: '1.5rem' }}>
          <p className="text-muted" style={{ fontSize: '0.9rem' }}>
            Route attempted: <code style={{
              backgroundColor: 'hsl(var(--muted))',
              padding: '0.25rem 0.5rem',
              borderRadius: '4px',
              fontSize: '0.85rem'
            }}>{location.pathname}</code>
          </p>
        </div>
      </div>
    </div>
  );
}

export default NotFoundPage;

