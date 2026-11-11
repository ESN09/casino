import { useEffect, type ReactElement } from 'react';
import { useApp, type Route } from './state/app';
import { AgeGate, BottomNav, SessionReminder, Toasts, TopBar } from './ui/components/Shell';
import { ConfettiLayer } from './ui/components/Confetti';
import { Lobby } from './ui/screens/Lobby';
import { Slots } from './ui/screens/Slots';
import { Blackjack } from './ui/screens/Blackjack';
import { Cases } from './ui/screens/Cases';
import { Collection } from './ui/screens/Collection';
import { Daily } from './ui/screens/Daily';
import { Settings } from './ui/screens/Settings';

const SCREENS: Record<Route, () => ReactElement | null> = {
  lobby: Lobby, slots: Slots, blackjack: Blackjack, cases: Cases, collection: Collection, daily: Daily, profile: Settings,
};

export function App() {
  const profile = useApp((s) => s.profile);
  const route = useApp((s) => s.route);
  const refresh = useApp((s) => s.refresh);

  useEffect(() => { void refresh(); }, [refresh]);

  if (!profile) return <div className="boot"><span className="brand-mark">MJ</span></div>;
  if (!profile.ageConfirmed) return <AgeGate />;

  const Screen = SCREENS[route] ?? Lobby;
  return (
    <div className="app">
      <div className="bg-fx" aria-hidden />
      <TopBar />
      <main key={route} className="main">
        <Screen />
      </main>
      <BottomNav />
      <Toasts />
      <ConfettiLayer />
      <SessionReminder />
    </div>
  );
}
