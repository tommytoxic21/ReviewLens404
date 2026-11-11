import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import SavedPlaces from './SavedPlaces';
import type { AnalysisTarget } from '../targetsApi';

afterEach(() => cleanup());

const places: AnalysisTarget[] = [
  {
    id: 'joe',
    name: "Joe's Pizza",
    platform: 'google_maps',
    sourceReference: 'https://www.google.com/maps/place/joes-pizza',
  },
  {
    id: 'cafe',
    name: 'Riverside Café',
    platform: 'google',
    sourceReference: 'https://maps.google.com/?q=riverside',
  },
];

describe('SavedPlaces', () => {
  it('shows each saved place and the total count', () => {
    render(<SavedPlaces targets={places} onOpen={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByText('2 places saved')).toBeInTheDocument();
    expect(screen.getByText("Joe's Pizza")).toBeInTheDocument();
    expect(screen.getByText('Riverside Café')).toBeInTheDocument();
    expect(screen.getAllByText('Google Maps')).toHaveLength(2);
  });

  it('filters places by name and allows clearing a search with no results', () => {
    render(<SavedPlaces targets={places} onOpen={vi.fn()} onAdd={vi.fn()} />);
    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Search saved places' }),
      {
        target: { value: 'riverside' },
      },
    );
    expect(screen.getByText('Riverside Café')).toBeInTheDocument();
    expect(screen.queryByText("Joe's Pizza")).not.toBeInTheDocument();
    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Search saved places' }),
      {
        target: { value: 'not-a-place' },
      },
    );
    expect(screen.getByText('No matching places')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByText("Joe's Pizza")).toBeInTheDocument();
  });

  it('opens the exact selected place', () => {
    const onOpen = vi.fn();
    render(<SavedPlaces targets={places} onOpen={onOpen} onAdd={vi.fn()} />);
    fireEvent.click(
      screen.getByRole('button', { name: "Open Joe's Pizza dashboard" }),
    );
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledWith('joe');
  });

  it('switches between card and list layouts', () => {
    render(<SavedPlaces targets={places} onOpen={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Card view' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'List view' }));
    expect(screen.getByRole('button', { name: 'List view' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Card view' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('shows the add-place action for an empty collection', () => {
    const onAdd = vi.fn();
    render(<SavedPlaces targets={[]} onOpen={vi.fn()} onAdd={onAdd} />);
    expect(screen.getByText('Your collection starts here')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /add your first place/i }),
    );
    expect(onAdd).toHaveBeenCalledOnce();
  });
});
