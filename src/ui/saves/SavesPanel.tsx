/**
 * Salvar/carregar (UX_SPEC 9): automático + 10 espaços manuais, exportar e importar arquivo.
 * Carregar refaz a partida pelo log; save de outra versão das regras abre com aviso.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { deleteSave, exportSave, listSaves, parseSave, type SaveFile, writeSave } from '../../save';
import { seatFaction } from '../../render3d/model';
import { FactionBadge } from '../components/Bits';
import type { FactionKey } from '../theme/tokens';
import { useSession } from '../game/session';
import { useUi } from '../game/uiStore';
import hud from '../hud/Hud.module.css';
import { openSave } from './open';
import styles from './Saves.module.css';

export function SavesPanel({ mode }: { mode: 'save' | 'load' }) {
  const { t } = useTranslation();
  const [version, setVersion] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const canSave = useSession((s) => s.state !== null);
  const rows = listSaves();
  void version;
  const refresh = () => setVersion((v) => v + 1);

  const download = (save: SaveFile) => {
    const blob = new Blob([exportSave(save)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `projeto-3077-save-${save.savedAt}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    const save = parseSave(await file.text());
    if (!save) {
      setMsg(t('saves.invalid'));
      return;
    }
    // Importado vai para o primeiro espaço livre (ou o 10).
    const free = rows.find((r) => r.slot !== 'auto' && !r.save)?.slot ?? 10;
    writeSave(free, save);
    setMsg(t('saves.imported', { slot: free }));
    refresh();
  };

  return (
    <div className={styles.panel} data-testid="saves">
      <ul className={styles.list}>
        {rows.map(({ slot, save }) => (
          <li key={String(slot)} className={`${hud.paper} ${styles.slot}`} data-testid={`slot-${slot}`}>
            <span className={styles.slotName}>
              {slot === 'auto' ? t('saves.auto') : t('saves.slot', { n: slot })}
            </span>
            {save ? (
              <span className={styles.info}>
                <span className={styles.factions}>
                  {save.summary.factions.map((f, i) => (
                    <FactionBadge key={i} faction={(f || seatFaction(i)) as FactionKey} size={14} />
                  ))}
                </span>
                {t('saves.summary', { round: save.summary.round, n: save.log.length })}
                <span className={hud.muted}>
                  {' '}
                  · {t('saves.when', { date: new Date(save.savedAt).toLocaleString() })}
                </span>
              </span>
            ) : (
              <span className={hud.muted}>{t('saves.empty')}</span>
            )}
            <span className={styles.actions}>
              {mode === 'save' && slot !== 'auto' && (
                <button
                  type="button"
                  className={`${hud.btn} ${hud.btnPrimary}`}
                  disabled={!canSave}
                  onClick={() => {
                    const ok = useSession.getState().saveTo(slot);
                    setMsg(ok ? t('saves.saved', { slot }) : t('saves.failed'));
                    refresh();
                  }}
                  data-testid={`save-${slot}`}
                >
                  {save ? t('saves.overwrite') : t('saves.save')}
                </button>
              )}
              {save && mode === 'load' && (
                <button
                  type="button"
                  className={`${hud.btn} ${hud.btnPrimary}`}
                  onClick={() => {
                    useUi.getState().open(null);
                    openSave(slot);
                  }}
                  data-testid={`load-${slot}`}
                >
                  {t('saves.load')}
                </button>
              )}
              {save && (
                <button
                  type="button"
                  className={hud.btn}
                  onClick={() => download(save)}
                  data-testid={`export-${slot}`}
                >
                  {t('saves.export')}
                </button>
              )}
              {save && slot !== 'auto' && (
                <button
                  type="button"
                  className={hud.btn}
                  onClick={() => {
                    deleteSave(slot);
                    refresh();
                  }}
                >
                  {t('saves.delete')}
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      <label className={`${hud.btn} ${styles.import}`}>
        {t('saves.import')}
        <input
          type="file"
          accept="application/json,.json"
          onChange={(e) => void importFile(e.target.files?.[0])}
          data-testid="save-import"
        />
      </label>
      {msg && (
        <p className={hud.muted} role="status" data-testid="saves-msg">
          {msg}
        </p>
      )}
    </div>
  );
}
