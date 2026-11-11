import { useState } from 'react';
import type { AnalysisTarget } from '../targetsApi';
import './SavedPlaces.css';

interface SavedPlacesProps {
  targets: AnalysisTarget[];
  onOpen: (id: string) => void;
  onAdd: () => void;
}

function sourceLabel(reference: string): string {
  try {
    const host = new URL(reference).hostname.replace(/^www\./, '');
    return host || 'Saved Google Maps URL';
  } catch {
    return 'Saved Google Maps URL';
  }
}

function platformLabel(platform: string): string {
  return platform === 'google' || platform === 'google_maps'
    ? 'Google Maps'
    : platform;
}

export default function SavedPlaces({
  targets,
  onOpen,
  onAdd,
}: SavedPlacesProps) {
  const [query, setQuery] = useState('');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const filtered = targets.filter((target) =>
    `${target.name} ${target.sourceReference}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );

  return (
    <section className="saved-places" aria-label="Saved places">
      <header className="saved-places__header">
        <div>
          <p className="eyebrow">YOUR COLLECTION</p>
          <h2>Saved Places</h2>
          <p className="muted">
            Open a place to import reviews, explore ratings, and ask ReviewLens.
          </p>
        </div>
        <span className="saved-places__total">
          {targets.length} {targets.length === 1 ? 'place' : 'places'} saved
        </span>
      </header>

      {targets.length === 0 ? (
        <div className="saved-places__empty">
          <div className="saved-places__empty-icon" aria-hidden="true">
            ✦
          </div>
          <h3>Your collection starts here</h3>
          <p>
            Save a business from Google Maps to start exploring its reviews.
          </p>
          <button type="button" className="button primary" onClick={onAdd}>
            + Add your first place
          </button>
        </div>
      ) : (
        <>
          <div className="saved-places__toolbar">
            <div className="saved-places__search">
              <label
                className="saved-places__sr-only"
                htmlFor="saved-places-search"
              >
                Search saved places
              </label>
              <span className="saved-places__search-icon" aria-hidden="true">
                ⌕
              </span>
              <input
                id="saved-places-search"
                type="search"
                placeholder="Search your saved places..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div
              className="saved-places__view-switch"
              role="group"
              aria-label="Display layout"
            >
              <button
                type="button"
                aria-label="Card view"
                aria-pressed={layout === 'grid'}
                onClick={() => setLayout('grid')}
              >
                ▦
              </button>
              <button
                type="button"
                aria-label="List view"
                aria-pressed={layout === 'list'}
                onClick={() => setLayout('list')}
              >
                ☰
              </button>
            </div>
          </div>
          <p className="saved-places__results" role="status">
            Showing {filtered.length} of {targets.length}{' '}
            {targets.length === 1 ? 'place' : 'places'}
          </p>
          {filtered.length === 0 ? (
            <div className="saved-places__no-results">
              <h3>No matching places</h3>
              <p>Try a different business name or search term.</p>
              <button
                type="button"
                className="button secondary"
                onClick={() => setQuery('')}
              >
                Clear search
              </button>
            </div>
          ) : (
            <div
              className={`saved-places__items saved-places__items--${layout}`}
            >
              {filtered.map((target, index) => (
                <button
                  key={target.id}
                  type="button"
                  className="saved-place-card"
                  aria-label={`Open ${target.name} dashboard`}
                  onClick={() => onOpen(target.id)}
                >
                  <span className="saved-place-card__heading">
                    <span
                      className={`saved-place-card__avatar saved-place-card__avatar--${index % 4}`}
                      aria-hidden="true"
                    >
                      {target.name.trim().charAt(0).toUpperCase() || 'P'}
                    </span>
                    <span className="saved-place-card__name-group">
                      <strong className="saved-place-card__name">
                        {target.name}
                      </strong>
                      <span className="saved-place-card__platform">
                        {platformLabel(target.platform)}
                      </span>
                    </span>
                  </span>
                  <span className="saved-place-card__source">
                    <span className="saved-place-card__source-label">
                      REVIEW SOURCE
                    </span>
                    <span
                      className="saved-place-card__source-value"
                      title={target.sourceReference}
                    >
                      {sourceLabel(target.sourceReference)}
                    </span>
                  </span>
                  <span className="saved-place-card__footer">
                    <span>Open dashboard</span>
                    <span
                      className="saved-place-card__arrow"
                      aria-hidden="true"
                    >
                      →
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
