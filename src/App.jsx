import { EaEditor } from './components/ea-editor';
import './App.css';

function AppShell() {
  return (
    <div className="app-shell">
      <div className="app-steam-bar" />

      <header className="app-header">
        <div className="app-brand">
          <img className="app-brand-logo" src="/logo.svg" alt="EduCode Studio" width="38" height="40" />
          <div className="app-brand-text">
            <h1 className="app-brand-title">EduCode Studio</h1>
            <span className="app-brand-subtitle">Programación por código</span>
          </div>
        </div>
        <div id="app-header-actions" className="app-header-actions" />
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
