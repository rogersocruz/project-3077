/**
 * Editor de todos os números de balance.json (UX_SPEC 2.18). Árvore genérica do JSON:
 * número vira campo numérico, booleano vira caixa, texto fica só para leitura. Itens
 * marcados em `provisional` levam o selo PROV; o que mudou do arquivo fica destacado.
 */
import { useTranslation } from 'react-i18next';
import hud from '../hud/Hud.module.css';
import { DEFAULT_BALANCE, getAt, type Path, useLab } from './labStore';
import styles from './Lab.module.css';

const HIDDEN = new Set(['_meta', 'provisional']);

function provisionalPaths(draft: unknown): Set<string> {
  const list = (draft as { provisional?: unknown }).provisional;
  return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
}

function Leaf({ path, value, prov }: { path: Path; value: unknown; prov: boolean }) {
  const { t } = useTranslation();
  const setValue = useLab((s) => s.setValue);
  const original = getAt(DEFAULT_BALANCE, path);
  const changed = JSON.stringify(original) !== JSON.stringify(value);
  const name = String(path[path.length - 1]);
  const id = `bal-${path.join('-')}`;
  let input;
  if (typeof value === 'number') {
    input = (
      <input
        id={id}
        className={styles.num}
        type="number"
        step="any"
        value={value}
        onChange={(e) => {
          const n = e.target.valueAsNumber;
          if (Number.isFinite(n)) setValue(path, n);
        }}
        data-testid={id}
      />
    );
  } else if (typeof value === 'boolean') {
    input = (
      <input id={id} type="checkbox" checked={value} onChange={(e) => setValue(path, e.target.checked)} />
    );
  } else {
    input = <span className={styles.text}>{String(value)}</span>;
  }
  return (
    <div className={`${styles.leaf} ${changed ? styles.changed : ''}`}>
      <label htmlFor={id} className={styles.key}>
        {name}
        {prov && (
          <span className={styles.prov} title={t('lab.provisionalHint')}>
            {t('lab.provisional')}
          </span>
        )}
      </label>
      {input}
      {changed && (
        <span className={styles.was} title={t('lab.original')}>
          {JSON.stringify(original)}
        </span>
      )}
    </div>
  );
}

function Node({ path, value, prov }: { path: Path; value: unknown; prov: Set<string> }) {
  const { t } = useTranslation();
  const dotted = path.filter((p) => typeof p === 'string').join('.');
  if (value !== null && typeof value === 'object') {
    const entries = Array.isArray(value)
      ? value.map((v, i) => [i, v] as const)
      : Object.entries(value).filter(([k]) => path.length > 0 || !HIDDEN.has(k));
    const body = entries.map(([k, v]) => <Node key={k} path={[...path, k]} value={v} prov={prov} />);
    if (path.length === 0) return <>{body}</>;
    const name = String(path[path.length - 1]);
    return (
      <details className={styles.group} open={path.length === 1}>
        <summary className={styles.groupHead}>
          {name}
          {prov.has(dotted) && <span className={styles.prov}>{t('lab.provisional')}</span>}
        </summary>
        <div className={Array.isArray(value) ? styles.row : styles.groupBody}>{body}</div>
      </details>
    );
  }
  // Folha dentro de lista: herda o selo do pai.
  const parentDotted = path
    .slice(0, -1)
    .filter((p) => typeof p === 'string')
    .join('.');
  return <Leaf path={path} value={value} prov={prov.has(dotted) || prov.has(parentDotted)} />;
}

export function BalanceEditor() {
  const { t } = useTranslation();
  const draft = useLab((s) => s.draft);
  const restore = useLab((s) => s.restore);
  const prov = provisionalPaths(draft);

  const exportFile = () => {
    const blob = new Blob([JSON.stringify(draft, null, 2) + '\n'], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'balance.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section className={`${hud.plate} ${styles.editor}`} aria-label={t('lab.balance')}>
      <header className={styles.panelHead}>
        <h2 className={styles.h2}>{t('lab.balance')}</h2>
        <div className={styles.buttons}>
          <button type="button" className={hud.btn} onClick={restore} data-testid="lab-restore">
            {t('lab.restore')}
          </button>
          <button type="button" className={hud.btn} onClick={exportFile} data-testid="lab-export">
            {t('lab.export')}
          </button>
        </div>
      </header>
      <p className={styles.note}>{t('lab.balanceNote')}</p>
      <div className={styles.tree}>
        <Node path={[]} value={draft} prov={prov} />
      </div>
    </section>
  );
}
