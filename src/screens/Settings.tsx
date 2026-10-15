import { useRef, useState } from 'react';
import { useApp } from '../state';
import { exportBackup, importBackup, resetAll } from '../lib/storage';
import { speak, voicesFor } from '../lib/tts';

export function SettingsScreen() {
  const { settings, updateSettings, voices, language, manifest, refresh, reloadLocal, setToast, cards, logs } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [checking, setChecking] = useState(false);
  const langVoices = language ? voicesFor(voices, language.tts) : [];
  const sample = cards[0]?.front ?? '';

  const download = async () => {
    const blob = await exportBackup();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `lang-cards-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const restore = async (file: File) => {
    try {
      const n = await importBackup(await file.text());
      await reloadLocal();
      setToast(`Прогресс восстановлен: ${n} записей`);
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Не удалось прочитать файл');
    }
  };

  return (
    <div className="screen settings">
      <h1>Настройки</h1>

      <section className="panel">
        <h2>Занятия</h2>
        <label className="field">
          <span className="f-label">Новых слов в день</span>
          <span className="stepper">
            <button onClick={() => updateSettings({ newPerDay: Math.max(0, settings.newPerDay - 5) })} aria-label="Меньше">
              −
            </button>
            <output>{settings.newPerDay}</output>
            <button onClick={() => updateSettings({ newPerDay: Math.min(100, settings.newPerDay + 5) })} aria-label="Больше">
              +
            </button>
          </span>
        </label>
        <label className="field column">
          <span className="f-label">
            Цель запоминания <b>{Math.round(settings.retention * 100)}%</b>
          </span>
          <input
            type="range"
            min={0.8}
            max={0.97}
            step={0.01}
            value={settings.retention}
            onChange={(e) => updateSettings({ retention: Number(e.target.value) })}
          />
          <span className="f-help">
            С какой вероятностью ты должен вспомнить слово в момент повторения. Выше — чаще повторения и надёжнее
            память. 90% — хороший баланс.
          </span>
        </label>
      </section>

      <section className="panel">
        <h2>Озвучка</h2>
        <label className="field">
          <span className="f-label">Произносить автоматически</span>
          <input
            type="checkbox"
            className="switch"
            checked={settings.autoplay}
            onChange={(e) => updateSettings({ autoplay: e.target.checked })}
          />
        </label>
        <label className="field column">
          <span className="f-label">
            Скорость <b>{settings.ttsRate.toFixed(1).replace('.', ',')}×</b>
          </span>
          <input
            type="range"
            min={0.5}
            max={1.3}
            step={0.1}
            value={settings.ttsRate}
            onChange={(e) => updateSettings({ ttsRate: Number(e.target.value) })}
          />
        </label>
        {language && (
          <label className="field column">
            <span className="f-label">Голос для языка «{language.name}»</span>
            {langVoices.length ? (
              <select
                value={settings.voices[language.code] ?? ''}
                onChange={(e) => updateSettings({ voices: { ...settings.voices, [language.code]: e.target.value } })}
              >
                <option value="">Системный по умолчанию</option>
                {langVoices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name}
                    {v.localService ? '' : ' (онлайн)'}
                  </option>
                ))}
              </select>
            ) : (
              <span className="f-help">
                Отдельных голосов не найдено, будет использован системный. На Android голоса ставятся в «Настройки →
                Синтез речи → Google».
              </span>
            )}
          </label>
        )}
        {language && sample && (
          <button
            className="btn small"
            onClick={() => speak(sample, language.tts, settings.ttsRate, settings.voices[language.code])}
          >
            Проверить голос
          </button>
        )}
      </section>

      <section className="panel">
        <h2>Оформление</h2>
        <div className="segmented" role="radiogroup" aria-label="Тема">
          {(
            [
              ['system', 'Как в системе'],
              ['light', 'Светлая'],
              ['dark', 'Тёмная'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="radio"
              aria-checked={settings.theme === id}
              className={settings.theme === id ? 'on' : ''}
              onClick={() => updateSettings({ theme: id })}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Прогресс</h2>
        <p className="f-help">
          Прогресс хранится только на этом устройстве ({logs.length} повторений). Сохраняй копию время от времени,
          чтобы не потерять его при очистке браузера или смене телефона.
        </p>
        <div className="row-actions">
          <button className="btn small" onClick={download}>
            Сохранить копию
          </button>
          <button className="btn small" onClick={() => fileRef.current?.click()}>
            Восстановить из файла
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])}
          />
        </div>
        <button
          className="btn small danger"
          onClick={async () => {
            if (!confirm('Удалить весь прогресс и историю повторений? Карточки останутся.')) return;
            await resetAll();
            await reloadLocal();
            setToast('Прогресс сброшен');
          }}
        >
          Сбросить весь прогресс
        </button>
      </section>

      <section className="panel">
        <h2>Карточки</h2>
        <p className="f-help">
          Языков: {manifest?.languages.length ?? 0}, карточек: {manifest?.languages.reduce((a, l) => a + l.total, 0) ?? 0}.
          Новые карточки подтягиваются при каждом открытии приложения.
        </p>
        <button
          className="btn small"
          disabled={checking}
          onClick={async () => {
            setChecking(true);
            await refresh();
            setChecking(false);
            setToast('Карточки актуальны');
          }}
        >
          {checking ? 'Проверяю…' : 'Проверить сейчас'}
        </button>
      </section>
    </div>
  );
}
