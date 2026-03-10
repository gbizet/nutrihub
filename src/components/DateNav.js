import React from 'react';
import styles from '../pages/dashboard.module.css';

const toIso = (date) => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const parseIso = (value) => {
  const [y, m, d] = `${value || ''}`.split('-').map((chunk) => Number.parseInt(chunk, 10));
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
};

const isValidIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(`${value || ''}`);

const isAndroidWebView = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Android/i.test(ua) && (/\bwv\b/i.test(ua) || /Version\/[\d.]+/i.test(ua));
};

export default function DateNav({ value, onChange }) {
  const useTextFallback = isAndroidWebView();
  const shiftDays = (delta) => {
    const next = parseIso(value);
    next.setDate(next.getDate() + delta);
    onChange(toIso(next));
  };

  const setToday = () => onChange(toIso(new Date()));
  const handleInput = (event) => {
    const nextValue = `${event.target.value || ''}`.trim();
    if (!useTextFallback || isValidIsoDate(nextValue) || nextValue === '') {
      onChange(nextValue);
    }
  };
  const handleBlur = (event) => {
    const nextValue = `${event.target.value || ''}`.trim();
    if (isValidIsoDate(nextValue)) {
      onChange(nextValue);
      return;
    }
    onChange(value);
  };

  return (
    <div className={styles.dateNav}>
      <input
        className={styles.input}
        type={useTextFallback ? 'text' : 'date'}
        inputMode={useTextFallback ? 'numeric' : undefined}
        pattern={useTextFallback ? '\\d{4}-\\d{2}-\\d{2}' : undefined}
        placeholder={useTextFallback ? 'YYYY-MM-DD' : undefined}
        value={value}
        onInput={handleInput}
        onChange={handleInput}
        onBlur={useTextFallback ? handleBlur : undefined}
      />
      <button className={styles.tinyButton} type="button" onClick={() => shiftDays(-1)}>-1j</button>
      <button className={styles.tinyButton} type="button" onClick={setToday}>Auj.</button>
      <button className={styles.tinyButton} type="button" onClick={() => shiftDays(1)}>+1j</button>
    </div>
  );
}
