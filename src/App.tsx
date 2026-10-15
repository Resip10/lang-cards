import { useEffect, useState } from 'react';
import { AppProvider, useApp } from './state';
import { Home, useQueue } from './screens/Home';
import { Study } from './screens/Study';
import { Browse } from './screens/Browse';
import { Stats } from './screens/Stats';
import { SettingsScreen } from './screens/Settings';
import { Icon } from './components/Icon';
import type { IconName } from './components/Icon';
import type { QueueItem } from './lib/srs';

type Tab = 'home' | 'browse' | 'stats' | 'settings';

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Учить', icon: 'learn' },
  { id: 'browse', label: 'Карточки', icon: 'cards' },
  { id: 'stats', label: 'Статистика', icon: 'stats' },
  { id: 'settings', label: 'Настройки', icon: 'settings' },
];

function Shell() {
  const { ready, error, language, settings, toast, refresh } = useApp();
  const [tab, setTab] = useState<Tab>('home');
  const [session, setSession] = useState<QueueItem[] | null>(null);
  const more = useQueue(settings.mode, 10);

  useEffect(() => {
    const dark =
      settings.theme === 'dark' || (settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = settings.theme === 'system' ? '' : settings.theme;
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = dark ? '#131b2e' : '#1d3fa3';
    document.head.appendChild(meta);
  }, [settings.theme]);

  // Android back button closes the study session instead of leaving the app.
  useEffect(() => {
    if (!session) return;
    history.pushState({ study: true }, '');
    const onPop = () => setSession(null);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [session]);

  if (!ready) return <div className="splash" aria-busy="true" />;

  if (!language) {
    return (
      <div className="screen empty-state">
        <h1>Карточек пока нет</h1>
        <p>{error ?? 'Пришли Claude фото или список слов, и они появятся здесь.'}</p>
        <button className="btn primary" onClick={() => refresh()}>
          Проверить снова
        </button>
      </div>
    );
  }

  if (session) {
    return (
      <Study
        key={session.length + (session[0]?.card.id ?? '')}
        items={session}
        onExit={() => {
          if (history.state?.study) history.back();
          else setSession(null);
        }}
        onMore={() => more().items}
      />
    );
  }

  return (
    <div className="app">
      <main>
        {tab === 'home' && <Home onStart={setSession} />}
        {tab === 'browse' && <Browse />}
        {tab === 'stats' && <Stats />}
        {tab === 'settings' && <SettingsScreen />}
      </main>
      <nav className="tabbar" aria-label="Разделы">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} aria-current={tab === t.id} onClick={() => setTab(t.id)}>
            <Icon name={t.icon} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
