/**
 * Configurações (UX_SPEC 3): Vídeo · Áudio · Jogabilidade · Controles · Acessibilidade. Usado
 * como tela (menu) e como modal (pausa da partida). Cada opção grava em settings/ na hora; o
 * efeito de cada uma está anotado em settings/index.ts.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type ColorMode,
  DEFAULT_KEYS,
  type KeyMap,
  keyConflicts,
  type Quality,
  QUALITY_PRESETS,
  type RenderSettings,
  useSettings,
} from '../../settings';
import { detectQuality } from '../../render3d/autoQuality';
import hud from '../hud/Hud.module.css';
import { keyName } from './keyName';
import { setFullscreen } from '../useApplySettings';
import styles from './Settings.module.css';

type Tab = 'video' | 'audio' | 'gameplay' | 'controls' | 'accessibility';
const TABS: readonly Tab[] = ['video', 'audio', 'gameplay', 'controls', 'accessibility'];

function Row({ label, children, note }: { label: string; children: React.ReactNode; note?: string }) {
  return (
    <div className={styles.row}>
      <span className={styles.label}>
        {label}
        {note && <span className={hud.muted}> · {note}</span>}
      </span>
      <span className={styles.control}>{children}</span>
    </div>
  );
}

function Toggle({
  on,
  set,
  id,
  disabled,
}: {
  on: boolean;
  set: (v: boolean) => void;
  id: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="checkbox"
      className={styles.toggle}
      checked={on}
      disabled={disabled}
      onChange={(e) => set(e.target.checked)}
      data-testid={`set-${id}`}
    />
  );
}

function Select<T extends string | number>({
  value,
  options,
  label,
  set,
  id,
}: {
  value: T;
  options: readonly T[];
  label: (v: T) => string;
  set: (v: T) => void;
  id: string;
}) {
  return (
    <select
      className={styles.select}
      value={String(value)}
      onChange={(e) => {
        const raw = e.target.value;
        const hit = options.find((o) => String(o) === raw);
        if (hit !== undefined) set(hit);
      }}
      data-testid={`set-${id}`}
    >
      {options.map((o) => (
        <option key={String(o)} value={String(o)}>
          {label(o)}
        </option>
      ))}
    </select>
  );
}

function Slider({
  value,
  min,
  max,
  step,
  set,
  id,
  pct = true,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  set: (v: number) => void;
  id: string;
  pct?: boolean;
}) {
  return (
    <span className={styles.slider}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => set(Number(e.target.value))}
        data-testid={`set-${id}`}
      />
      <span className={styles.value}>{pct ? `${Math.round(value * 100)}%` : value.toFixed(1)}</span>
    </span>
  );
}

/** Predefinição atual, ou "custom" se algum ajuste saiu dela. */
function presetOf(r: RenderSettings): Quality | 'custom' {
  const hit = (Object.keys(QUALITY_PRESETS) as Quality[]).find((q) =>
    Object.entries(QUALITY_PRESETS[q]).every(([k, v]) => r[k as keyof RenderSettings] === v),
  );
  return hit ?? 'custom';
}

function Video() {
  const { t } = useTranslation();
  const r = useSettings((s) => s.render);
  const setRender = useSettings((s) => s.setRender);
  const setPost = useSettings((s) => s.setPost);
  const [detecting, setDetecting] = useState(false);
  const preset = presetOf(r);
  return (
    <>
      <Row label={t('settings.video.display')}>
        <Select
          value={r.fullscreen ? 'full' : 'window'}
          options={['window', 'full'] as const}
          label={(v) => t(`settings.video.display_${v}`)}
          set={(v) => void setFullscreen(v === 'full')}
          id="display"
        />
      </Row>
      <Row label={t('settings.video.resolution')} note={t('settings.desktopOnly')}>
        <select className={styles.select} disabled>
          <option>{t('settings.video.resolutionAuto')}</option>
        </select>
      </Row>
      <Row label={t('settings.video.renderScale')}>
        <Slider
          value={r.renderScale}
          min={0.5}
          max={1.5}
          step={0.1}
          set={(v) => setRender({ renderScale: v })}
          id="renderScale"
        />
      </Row>
      <Row label={t('settings.video.fpsLimit')}>
        <Select
          value={r.fpsLimit}
          options={[30, 60, 120, 144, 0] as const}
          label={(v) => (v === 0 ? t('settings.video.unlimited') : String(v))}
          set={(v) => setRender({ fpsLimit: v })}
          id="fpsLimit"
        />
      </Row>
      <Row label={t('settings.video.vsync')} note={t('settings.desktopOnly')}>
        <Toggle on disabled set={() => undefined} id="vsync" />
      </Row>
      <Row label={t('settings.video.preset')}>
        <Select
          value={preset}
          options={['low', 'medium', 'high', 'ultra', 'custom'] as const}
          label={(v) => t(`settings.video.q_${v}`)}
          set={(v) => v !== 'custom' && setRender(QUALITY_PRESETS[v])}
          id="preset"
        />
        <button
          type="button"
          className={hud.btn}
          disabled={detecting}
          onClick={async () => {
            setDetecting(true);
            await detectQuality();
            setDetecting(false);
          }}
          data-testid="set-detect"
        >
          {detecting ? t('settings.video.detecting') : t('settings.video.detect')}
        </button>
      </Row>
      <Row label={t('settings.video.shadows')}>
        <Toggle on={r.shadows} set={(v) => setRender({ shadows: v })} id="shadows" />
      </Row>
      <Row label={t('settings.video.antialias')}>
        <Select
          value={r.antialias}
          options={['off', 'fxaa', 'smaa'] as const}
          label={(v) => t(`settings.video.aa_${v}`)}
          set={(v) => setRender({ antialias: v })}
          id="antialias"
        />
      </Row>
      <Row label={t('settings.video.bloom')}>
        <Toggle on={r.post.bloom} set={(v) => setPost({ bloom: v })} id="bloom" />
      </Row>
      <Row label={t('settings.video.dof')}>
        <Toggle on={r.post.tiltShift} set={(v) => setPost({ tiltShift: v })} id="dof" />
      </Row>
      <Row label={t('settings.video.props')}>
        <Toggle on={r.props} set={(v) => setRender({ props: v })} id="props" />
      </Row>
      <Row label={t('settings.video.particles')}>
        <Select
          value={r.particles}
          options={['low', 'normal', 'high'] as const}
          label={(v) => t(`settings.video.p_${v}`)}
          set={(v) => setRender({ particles: v })}
          id="particles"
        />
      </Row>
      <Row label={t('settings.video.adaptive')}>
        <Toggle on={r.adaptiveQuality} set={(v) => setRender({ adaptiveQuality: v })} id="adaptive" />
      </Row>
      <Row label={t('settings.video.uiScale')}>
        <Slider
          value={r.uiScale}
          min={0.8}
          max={1.5}
          step={0.05}
          set={(v) => setRender({ uiScale: v })}
          id="uiScale"
        />
      </Row>
      <Row label={t('settings.video.showFps')}>
        <Toggle on={r.showFps} set={(v) => setRender({ showFps: v })} id="showFps" />
      </Row>
    </>
  );
}

const CHANNELS = ['master', 'music', 'sfx', 'ui', 'ambient', 'voice'] as const;

function Audio() {
  const { t } = useTranslation();
  const a = useSettings((s) => s.audio);
  const setAudio = useSettings((s) => s.setAudio);
  return (
    <>
      {CHANNELS.map((c) => (
        <Row key={c} label={t(`settings.audio.${c}`)}>
          <Slider
            value={a[c]}
            min={0}
            max={1}
            step={0.05}
            set={(v) => setAudio({ [c]: v })}
            id={`vol-${c}`}
          />
        </Row>
      ))}
      <Row label={t('settings.audio.muteOnBlur')}>
        <Toggle on={a.muteOnBlur} set={(v) => setAudio({ muteOnBlur: v })} id="muteOnBlur" />
      </Row>
    </>
  );
}

function Gameplay() {
  const { t } = useTranslation();
  const g = useSettings((s) => s.gameplay);
  const set = useSettings((s) => s.setGameplay);
  return (
    <>
      <Row label={t('settings.gameplay.animationSpeed')}>
        <Select
          value={g.animationSpeed}
          options={[0.5, 1, 2, 'instant'] as const}
          label={(v) => (v === 'instant' ? t('hud.speedInstant') : `${String(v).replace('.', ',')}×`)}
          set={(v) => set({ animationSpeed: v })}
          id="animationSpeed"
        />
      </Row>
      <Row label={t('settings.gameplay.aiSpeed')}>
        <Select
          value={g.aiSpeed}
          options={['slow', 'normal', 'fast'] as const}
          label={(v) => t(`settings.gameplay.ai_${v}`)}
          set={(v) => set({ aiSpeed: v })}
          id="aiSpeed"
        />
      </Row>
      {(
        [
          ['confirmIrreversible', g.confirmIrreversible],
          ['autoAdvance', g.autoAdvance],
          ['undo', g.undo],
          ['hints', g.hints],
          ['combatPreview', g.combatPreview],
          ['privacyScreen', g.privacyScreen],
        ] as const
      ).map(([k, on]) => (
        <Row key={k} label={t(`settings.gameplay.${k}`)}>
          <Toggle on={on} set={(v) => set({ [k]: v })} id={k} />
        </Row>
      ))}
      <Row label={t('settings.gameplay.autosave')}>
        <Select
          value={g.autosave}
          options={['turn', 'round', 'off'] as const}
          label={(v) => t(`settings.gameplay.autosave_${v}`)}
          set={(v) => set({ autosave: v })}
          id="autosave"
        />
      </Row>
      <Row label={t('settings.gameplay.language')}>
        <Select
          value={g.language}
          options={['pt-BR', 'en'] as const}
          label={(v) => t(`settings.gameplay.lang_${v}`)}
          set={(v) => set({ language: v })}
          id="language"
        />
      </Row>
    </>
  );
}

function KeyButton({ action, index }: { action: keyof KeyMap; index: number }) {
  const { t } = useTranslation();
  const keys = useSettings((s) => s.render.keys);
  const setKey = useSettings((s) => s.setKey);
  const [listening, setListening] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  useEffect(() => {
    if (!listening) return;
    const down = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setListening(false);
      if (e.code === 'Escape' && action !== 'pause') return;
      const others = keyConflicts(keys, e.code, action);
      setConflict(others.length ? others.map((k) => t(`settings.keys.${k}`)).join(', ') : null);
      setKey(action, index, e.code);
    };
    window.addEventListener('keydown', down, { capture: true });
    return () => window.removeEventListener('keydown', down, { capture: true });
  }, [listening, action, index, keys, setKey, t]);
  const code = keys[action][index];
  return (
    <span className={styles.keyCell}>
      <button
        type="button"
        className={`${hud.btn} ${styles.key} ${listening ? hud.btnOn : ''}`}
        onClick={() => setListening(true)}
        data-testid={`key-${action}-${index}`}
      >
        {listening ? t('settings.keys.press') : code ? keyName(code) : '—'}
      </button>
      {conflict && <span className={hud.danger}>{t('settings.keys.conflict', { list: conflict })}</span>}
    </span>
  );
}

function Controls() {
  const { t } = useTranslation();
  const c = useSettings((s) => s.controls);
  const set = useSettings((s) => s.setControls);
  const invertOrbit = useSettings((s) => s.render.invertOrbit);
  const setRender = useSettings((s) => s.setRender);
  const resetKeys = useSettings((s) => s.resetKeys);
  const actions = (Object.keys(DEFAULT_KEYS) as (keyof KeyMap)[]).filter((k) => k !== 'focusPlayer');
  return (
    <>
      {(['orbitSpeed', 'zoomSpeed', 'panSpeed'] as const).map((k) => (
        <Row key={k} label={t(`settings.controls.${k}`)}>
          <Slider value={c[k]} min={0.5} max={2} step={0.1} set={(v) => set({ [k]: v })} id={k} pct={false} />
        </Row>
      ))}
      <Row label={t('settings.controls.invertX')}>
        <Toggle on={invertOrbit} set={(v) => setRender({ invertOrbit: v })} id="invertX" />
      </Row>
      <Row label={t('settings.controls.invertY')}>
        <Toggle on={c.invertY} set={(v) => set({ invertY: v })} id="invertY" />
      </Row>
      <Row label={t('settings.controls.edgePan')}>
        <Toggle on={c.edgePan} set={(v) => set({ edgePan: v })} id="edgePan" />
      </Row>
      <h3 className={styles.sub}>{t('settings.keys.title')}</h3>
      {actions.map((a) => (
        <Row key={a} label={t(`settings.keys.${a}`)}>
          <KeyButton action={a} index={0} />
          <KeyButton action={a} index={1} />
        </Row>
      ))}
      <button type="button" className={hud.btn} onClick={resetKeys} data-testid="keys-reset">
        {t('settings.keys.reset')}
      </button>
    </>
  );
}

function Accessibility() {
  const { t } = useTranslation();
  const a = useSettings((s) => s.accessibility);
  const set = useSettings((s) => s.setAccessibility);
  return (
    <>
      <Row label={t('settings.a11y.colorMode')}>
        <Select
          value={a.colorMode}
          options={['normal', 'deuteranopia', 'protanopia', 'tritanopia'] as const}
          label={(v: ColorMode) => t(`settings.a11y.cm_${v}`)}
          set={(v) => set({ colorMode: v })}
          id="colorMode"
        />
      </Row>
      <Row label={t('settings.a11y.highContrast')}>
        <Toggle on={a.highContrast} set={(v) => set({ highContrast: v })} id="highContrast" />
      </Row>
      <Row label={t('settings.a11y.textScale')}>
        <Slider
          value={a.textScale}
          min={0.85}
          max={1.5}
          step={0.05}
          set={(v) => set({ textScale: v })}
          id="textScale"
        />
      </Row>
      <Row label={t('settings.a11y.reduceMotion')}>
        <Select
          value={a.reduceMotion}
          options={['system', 'on', 'off'] as const}
          label={(v) => t(`settings.a11y.rm_${v}`)}
          set={(v) => set({ reduceMotion: v })}
          id="reduceMotion"
        />
      </Row>
      {(
        [
          ['cameraShake', a.cameraShake],
          ['captions', a.captions],
          ['unlimitedTime', a.unlimitedTime],
        ] as const
      ).map(([k, on]) => (
        <Row key={k} label={t(`settings.a11y.${k}`)}>
          <Toggle on={on} set={(v) => set({ [k]: v })} id={k} />
        </Row>
      ))}
    </>
  );
}

export function SettingsPanel() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('video');
  const reset = useSettings((s) => s.reset);
  return (
    <div className={styles.panel} data-testid="settings">
      <div className={styles.tabs} role="tablist">
        {TABS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className={`${hud.btn} ${tab === k ? hud.btnOn : ''}`}
            onClick={() => setTab(k)}
            data-testid={`settings-tab-${k}`}
          >
            {t(`settings.tab.${k}`)}
          </button>
        ))}
      </div>
      <div className={`${hud.paper} ${styles.body}`} role="tabpanel">
        {tab === 'video' && <Video />}
        {tab === 'audio' && <Audio />}
        {tab === 'gameplay' && <Gameplay />}
        {tab === 'controls' && <Controls />}
        {tab === 'accessibility' && <Accessibility />}
      </div>
      <button type="button" className={hud.btn} onClick={reset} data-testid="settings-reset">
        {t('settings.reset')}
      </button>
    </div>
  );
}
