import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import DateNav from '../src/components/DateNav.js';

const DEFAULT_USER_AGENT = window.navigator.userAgent;

describe('DateNav', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-12T09:30:00.000Z'));
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: DEFAULT_USER_AGENT,
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: DEFAULT_USER_AGENT,
    });
  });

  it('shifts the selected date backward, today and forward from the segmented controls', () => {
    const onChange = vi.fn();

    render(
      React.createElement(DateNav, {
        value: '2026-03-12',
        onChange,
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: /-1j/i }));
    fireEvent.click(screen.getByRole('button', { name: /Auj\./i }));
    fireEvent.click(screen.getByRole('button', { name: /\+1j/i }));

    expect(onChange).toHaveBeenNthCalledWith(1, '2026-03-11');
    expect(onChange).toHaveBeenNthCalledWith(2, '2026-03-12');
    expect(onChange).toHaveBeenNthCalledWith(3, '2026-03-13');
  });

  it('uses the Android text fallback and restores the previous value on invalid blur', () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Version/4.0 Chrome/122 Mobile Safari/537.36',
    });

    const onChange = vi.fn();

    render(
      React.createElement(DateNav, {
        value: '2026-03-12',
        onChange,
      }),
    );

    const input = screen.getByPlaceholderText(/YYYY-MM-DD/i);
    expect(input).toHaveAttribute('type', 'text');

    fireEvent.change(input, { target: { value: 'bad-date' } });
    fireEvent.blur(input, { target: { value: 'bad-date' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('2026-03-12');
  });
});
