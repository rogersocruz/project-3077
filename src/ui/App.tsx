import { lazy, Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNav } from './nav';
import { Home } from './screens/Home';
import { NewGame } from './screens/NewGame';

// three.js e a cena só baixam quando a mesa abre.
const TableView = lazy(() => import('./screens/TableView').then((m) => ({ default: m.TableView })));
const GameScreen = lazy(() => import('./screens/GameScreen').then((m) => ({ default: m.GameScreen })));
const CardGallery = lazy(() => import('./screens/CardGallery').then((m) => ({ default: m.CardGallery })));

export function App() {
  const { t, i18n } = useTranslation();
  const view = useNav((s) => s.view);

  useEffect(() => {
    document.title = t('app.documentTitle');
    document.documentElement.lang = i18n.language;
  }, [t, i18n.language]);

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
    case 'newGame':
      return <NewGame />;
    default:
      return <Home />;
  }
}
