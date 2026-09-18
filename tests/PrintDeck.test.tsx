import { describe, it, expect } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { PrintDeck, chunk } from '../src/print/deck/PrintDeck';
import deck from '../src/modules/m1/deck.s2.json';

afterEach(() => cleanup());

describe('chunk', () => {
  it('splits into groups of the given size, with a shorter final group', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns one group when everything fits', () => {
    expect(chunk([1, 2, 3], 9)).toEqual([[1, 2, 3]]);
  });

  it('returns nothing for an empty input', () => {
    expect(chunk([], 9)).toEqual([]);
  });
});

describe('PrintDeck', () => {
  it('renders exactly one sheet for the 9-card sampler, with every card\'s text', () => {
    const { container } = render(<PrintDeck />);
    const sheets = container.querySelectorAll('.print-deck__sheet');
    expect(sheets).toHaveLength(1);

    const cards = container.querySelectorAll('.card--print');
    expect(cards).toHaveLength(9);
    for (const c of deck.cards) {
      expect(container.textContent).toContain(c.text);
    }
  });

  it('renders every card as non-interactive (a div, not a button) — print mode', () => {
    const { container } = render(<PrintDeck />);
    expect(container.querySelectorAll('.card--print button')).toHaveLength(0);
  });
});
