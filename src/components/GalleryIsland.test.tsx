/** @jsxImportSource preact */
// docs/filter-redesign-spec.md -- filter island component behaviour.
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FilterIndex } from '../lib/filter-engine';
import GalleryIsland from './GalleryIsland';

const index: FilterIndex = {
  tags: ['elf', 'mage', 'undead'],
  tagGroups: [
    { key: 'race', label: 'Race', tagIds: [0, 2] },
    { key: 'class', label: 'Class', tagIds: [1] },
  ],
  subs: ['Loot Studios', 'Rescale'],
  rels: ['Molten Hearts'],
  models: [
    { id: 'a', n: 'Aaa Elf', nl: 'aaa elf', t: [0, 1], s: 0, r: 0, th: 'a.webp' },
    { id: 'b', n: 'Bbb Elf', nl: 'bbb elf', t: [0], s: 0, r: null, th: 'b.webp' },
    { id: 'c', n: 'Ccc Undead', nl: 'ccc undead', t: [2], s: 1, r: null, th: 'c.webp' },
  ],
};

const mount = (props: Partial<Parameters<typeof GalleryIsland>[0]> = {}) =>
  render(
    <GalleryIsland index={index} history={{ replaceState: vi.fn() }} initialSearch="" {...props} />
  );

const cardNames = () =>
  screen.queryAllByRole('link').map((a) => a.querySelector('.card-name')?.textContent ?? '');

const openDrawer = () => fireEvent.click(screen.getByRole('button', { name: /^Filters/ }));
const openGroup = (label: string) => {
  const summary = screen.getAllByText(label).find((el) => el.closest('summary'));
  fireEvent.click(summary!.closest('summary')!);
};

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
    mount();
    expect(screen.getByRole('status')).toHaveTextContent('3 of 3 models');
    expect(cardNames()).toEqual(['Aaa Elf', 'Bbb Elf', 'Ccc Undead']);
  });

  it('toggling a tag in the drawer filters the grid and disables zero-count tags', () => {
    mount();
    openDrawer();
    openGroup('Class');
    fireEvent.click(screen.getByRole('checkbox', { name: /^mage/ }));
    expect(cardNames()).toEqual(['Aaa Elf']); // only Aaa is mage-tagged
    openGroup('Race');
    // adding undead (a fresh group) would intersect to 0 -> disabled;
    // adding elf would keep Aaa -> still enabled
    expect(screen.getByRole('checkbox', { name: /^undead/ })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /^elf/ })).not.toBeDisabled();
  });

  it('tags in the same group OR together', () => {
    mount();
    openDrawer();
    openGroup('Race');
    fireEvent.click(screen.getByRole('checkbox', { name: /^elf/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /^undead/ }));
    expect(cardNames()).toEqual(['Aaa Elf', 'Bbb Elf', 'Ccc Undead']);
  });

  it('search box filters by name', () => {
    mount();
    fireEvent.input(screen.getByLabelText('Search by name'), { target: { value: 'undead' } });
    expect(cardNames()).toEqual(['Ccc Undead']);
  });

  it('shows an empty state when nothing matches', () => {
    mount();
    fireEvent.input(screen.getByLabelText('Search by name'), { target: { value: 'zzzzz' } });
    expect(cardNames()).toEqual([]);
    expect(screen.getByText('No models match these filters.')).toBeInTheDocument();
  });

  it('subscription checkbox filters', () => {
    mount();
    openDrawer();
    fireEvent.click(screen.getByRole('checkbox', { name: /Rescale/ }));
    expect(cardNames()).toEqual(['Ccc Undead']);
  });

  it('an active filter shows a chip that removes just that filter', () => {
    mount();
    openDrawer();
    openGroup('Race');
    fireEvent.click(screen.getByRole('checkbox', { name: /^elf/ }));
    const chip = screen.getByRole('button', { name: 'Remove Race: elf' });
    expect(chip).toBeInTheDocument();
    fireEvent.click(chip);
    expect(cardNames()).toEqual(['Aaa Elf', 'Bbb Elf', 'Ccc Undead']);
  });

  it('Clear all chip appears only when filtered and resets', () => {
    mount();
    expect(screen.queryByRole('button', { name: /clear all/i })).toBeNull();
    openDrawer();
    openGroup('Race');
    fireEvent.click(screen.getByRole('checkbox', { name: /^elf/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' })); // the chip-bar pill
    expect(cardNames()).toEqual(['Aaa Elf', 'Bbb Elf', 'Ccc Undead']);
  });

  it('the drawer opens from the Filters button and closes on Escape and backdrop', () => {
    mount();
    const dialogHidden = () => screen.getByRole('dialog', { hidden: true }).closest('.drawer-root');
    expect(dialogHidden()).toHaveAttribute('hidden');
    openDrawer();
    expect(dialogHidden()).not.toHaveAttribute('hidden');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(dialogHidden()).toHaveAttribute('hidden');
    openDrawer();
    fireEvent.click(document.querySelector('.drawer-backdrop')!);
    expect(dialogHidden()).toHaveAttribute('hidden');
  });

  it('hydrates initial filter state from the query string', () => {
    mount({ initialSearch: '?subs=Rescale' });
    expect(cardNames()).toEqual(['Ccc Undead']);
  });

  it('pushes the query string to history (debounced) on change', () => {
    vi.useFakeTimers();
    const replaceState = vi.fn();
    mount({ history: { replaceState } });
    openDrawer();
    openGroup('Class');
    fireEvent.click(screen.getByRole('checkbox', { name: /^mage/ }));
    vi.advanceTimersByTime(250);
    expect(replaceState).toHaveBeenCalledWith(null, '', '?tags=mage');
    vi.useRealTimers();
  });
});
