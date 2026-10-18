import { lazy, Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { initAudio, playSound } from '../audio';
import { CaptionBar } from './audio/CaptionBar';
import { useNav } from './nav';
import { Credits } from './screens/Credits';
import { Home } from './screens/Home';
import { NewGame } from './screens/NewGame';
import { LoadScreen } from './screens/LoadScreen';
import { SettingsScreen } from './screens/Settings';
import { Splash } from './screens/Splash';
import { useApplySettings } from './useApplySettings';

// three.js e a cena só baixam quando a mesa abre.
const TableView = lazy(() => import('./screens/TableView').then((m) => ({ default: m.TableView })));
const GameScreen = lazy(() => import('./screens/GameScreen').then((m) => ({ default: m.GameScreen })));
const Lab = lazy(() => import('./screens/Lab').then((m) => ({ default: m.Lab })));
const CardGallery = lazy(() => import('./screens/CardGallery').then((m) => ({ default: m.CardGallery })));

export function App() {
  const { t, i18n } = useTranslation();
  const view = useNav((s) => s.view);
  useApplySettings();
  // Áudio: liga no primeiro gesto; clique seco em todo botão (UX_SPEC 6 / ART_DIRECTION 9).
  useEffect(() => {
    const stop = initAudio();
    const click = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target.closest('button') : null;
      if (el && !el.disabled) playSound('uiClick');
    };
    document.addEventListener('click', click, true);
    return () => {
      stop();
      document.removeEventListener('click', click, true);
    };
  }, []);

  useEffect(() => {
    document.title = t('app.documentTitle');
    document.documentElement.lang = i18n.language;
  }, [t, i18n.language]);

  return (
    <>
      <Screen view={view} />
      <CaptionBar />
    </>
  );
}

function Screen({ view }: { view: ReturnType<typeof useNav.getState>['view'] }) {
  switch (view) {
    case 'table':
      return (
        <Suspense fallback={null}>
          <TableView />
        </Suspense>
      );
    case 'game':
      return (
        <Suspense fallback={null}>
          <GameScreen />
        </Suspense>
      );
    case 'cards':
      return (
        <Suspense fallback={null}>
          <CardGallery />
        </Suspense>
      );
    case 'lab':
      return (
        <Suspense fallback={null}>
          <Lab />
        </Suspense>
      );
    case 'credits':
      return <Credits />;
    case 'newGame':
      return <NewGame />;
    case 'settings':
      return <SettingsScreen />;
    case 'load':
      return <LoadScreen />;
    default:
      return (
        <>
          <Home />
          <Splash />
        </>
      );
  }
}
