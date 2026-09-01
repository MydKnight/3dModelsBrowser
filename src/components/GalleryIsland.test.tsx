/** @jsxImportSource preact */
// docs/astro-rewrite-spec.md -- Testing: filter island component behaviour.
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FilterIndex } from '../lib/filter-engine';
import GalleryIsland from './GalleryIsland';

const index: FilterIndex = {
  tags: ['elf', 'mage', 'undead'],
  subs: ['Loot Studios', 'Rescale'],
  rels: ['Molten Hearts'],
  models: [
    { id: 'a', n: 'Aaa Elf', nl: 'aaa elf', t: [0, 1], s: 0, r: 0, th: 'a.webp' },
    { id: 'b', n: 'Bbb Elf', nl: 'bbb elf', t: [0], s: 0, r: null, th: 'b.webp' },
    { id: 'c', n: 'Ccc Undead', nl: 'ccc undead', t: [2], s: 1, r: null, th: 'c.webp' },
  ],
};

const cardNames = () =>
  screen.queryAllByRole('link').map((a) => a.querySelector('.card-name')?.textContent ?? '');

afterEach(() => {
  cleanup();
  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
});

describe('GalleryIsland', () => {
  it('renders every model and a count', () => {
    render(<GalleryIsland index={index} history={{ replaceState: vi.fn() }} initialSearch="" />);
    expect(screen.getByRole('status')).toHaveTextContent('3 of 3 models');
    expect(cardNames()).toEqual(['Aaa Elf', 'Bbb Elf', 'Ccc Undead']);
  });

  it('toggling a tag filters the grid and updates counts', () => {
    render(<GalleryIsland index={index} history={{ replaceState: vi.fn() }} initialSearch="" />);
    fireEvent.click(screen.getByRole('button', { name: /^elf/ }));
    expect(cardNames()).toEqual(['Aaa Elf', 'Bbb Elf']);
    expect(screen.getByRole('button', { name: /^undead/ })).toBeDisabled(); // 0 results
  });

  it('AND/OR toggle changes multi-tag semantics', () => {
    render(<GalleryIsland index={index} history={{ replaceState: vi.fn() }} initialSearch="" />);
    fireEvent.click(screen.getByRole('button', { name: /^elf/ }));
    fireEvent.click(screen.getByRole('button', { name: 'OR' }));
    fireEvent.click(screen.getByRole('button', { name: /^undead/ }));
    expect(cardNames()).toEqual(['Aaa Elf', 'Bbb Elf', 'Ccc Undead']);
  });

  it('search box filters by name', () => {
    render(<GalleryIsland index={index} history={{ replaceState: vi.fn() }} initialSearch="" />);
    fireEvent.input(screen.getByLabelText('Search by name'), { target: { value: 'undead' } });
    expect(cardNames()).toEqual(['Ccc Undead']);
  });

  it('shows an empty state when nothing matches', () => {
    render(<GalleryIsland index={index} history={{ replaceState: vi.fn() }} initialSearch="" />);
    fireEvent.input(screen.getByLabelText('Search by name'), { target: { value: 'zzzzz' } });
    expect(cardNames()).toEqual([]);
    expect(screen.getByText('No models match these filters.')).toBeInTheDocument();
  });

  it('subscription checkbox filters', () => {
    render(<GalleryIsland index={index} history={{ replaceState: vi.fn() }} initialSearch="" />);
    fireEvent.click(screen.getByLabelText(/Rescale/));
    expect(cardNames()).toEqual(['Ccc Undead']);
  });

  it('clear-all appears only when filtered and resets', () => {
    render(<GalleryIsland index={index} history={{ replaceState: vi.fn() }} initialSearch="" />);
    expect(screen.queryByRole('button', { name: /clear all/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^elf/ }));
    fireEvent.click(screen.getByRole('button', { name: /clear all/i }));
    expect(cardNames()).toEqual(['Aaa Elf', 'Bbb Elf', 'Ccc Undead']);
  });

  it('hydrates initial filter state from the query string', () => {
    render(
      <GalleryIsland
        index={index}
        history={{ replaceState: vi.fn() }}
        initialSearch="?subs=Rescale"
      />
    );
    expect(cardNames()).toEqual(['Ccc Undead']);
  });

  it('pushes the query string to history (debounced) on change', () => {
    vi.useFakeTimers();
    const replaceState = vi.fn();
    render(<GalleryIsland index={index} history={{ replaceState }} initialSearch="" />);
    fireEvent.click(screen.getByRole('button', { name: /^mage/ }));
    vi.advanceTimersByTime(250);
    expect(replaceState).toHaveBeenCalledWith(null, '', '?tags=mage');
    vi.useRealTimers();
  });
});
