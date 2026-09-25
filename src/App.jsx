import { EaEditor } from './components/ea-editor';
import './App.css';

function BrandIcon() {
  return (
    <svg className="app-brand-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <path d="M9 3v4M12 3v4M15 3v4M9 17v4M12 17v4M15 17v4M3 9h4M3 12h4M3 15h4M17 9h4M17 12h4M17 15h4" />
    </svg>
  );
}

function AppShell() {
  return (
    <div className="app-shell">
      <div className="app-steam-bar" />

      <header className="app-header">
        <div className="app-brand">
          <div className="app-brand-badge">
            <BrandIcon />
          </div>
          <div>
            <h1 className="app-brand-title">Editor + Monitor Serial</h1>
            <span className="app-brand-subtitle">Componentes aislados de componentes/ea-components</span>
          </div>
        </div>
      </header>

      <main className="app-main">
        <div className="app-view">
          <div className="app-card">
            <EaEditor />
          </div>
        </div>
      </main>
    </div>
  );
}

export function App() {
  return <AppShell />;
}

export default App;
