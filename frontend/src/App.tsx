import { useCallback, useEffect, useState } from 'react';
import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
  useAuth,
} from '@clerk/clerk-react';
import { targetsApi } from './targetsApi';
import type { AnalysisTarget } from './targetsApi';
import SavedPlaces from './components/SavedPlaces';
import ReviewsList from './components/ReviewsList';
import './App.css';
import ReviewQA from './components/ReviewQA';

function Workspace() {
  const { getToken } = useAuth();
  const [targets, setTargets] = useState<AnalysisTarget[]>([]);
  const [active, setActive] = useState<AnalysisTarget | null>(null);
  const [name, setName] = useState('');
  const [sourceReference, setSourceReference] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showForm, setShowForm] = useState(false);

  const token = useCallback(async () => {
    const value = await getToken();
    if (!value)
      throw new Error('Your session has expired. Please sign in again.');
    return value;
  }, [getToken]);

  const openTarget = useCallback(
    async (id: string) => {
      setError('');
      setLoading(true);
      try {
        const result = await targetsApi.get(await token(), id);
        setActive(result);
      } catch (err) {
        setActive(null);
        setError(
          err instanceof Error ? err.message : 'Unable to open this place.',
        );
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const results = await targetsApi.list(await token());
      setTargets(results);
      const id = decodeURIComponent(
        window.location.pathname.match(/^\/targets\/([^/]+)$/)?.[1] ?? '',
      );
      if (id) await openTarget(id);
      else setActive(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to load your places.',
      );
    } finally {
      setLoading(false);
    }
  }, [token, openTarget]);

  useEffect(() => {
    let cancelled = false;

    async function loadTargets() {
      try {
        const results = await targetsApi.list(await token());

        if (cancelled) return;

        setTargets(results);

        const id = decodeURIComponent(
          window.location.pathname.match(/^\/targets\/([^/]+)$/)?.[1] ?? '',
        );

        if (id) {
          await openTarget(id);
        } else {
          setActive(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Unable to load your places.',
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadTargets();

    return () => {
      cancelled = true;
    };
  }, [token, openTarget]);
  useEffect(() => {
    const onPopState = () => {
      void refresh();
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [refresh]);

  const navigate = (id?: string) => {
    window.history.pushState(
      {},
      '',
      id ? `/targets/${encodeURIComponent(id)}` : '/',
    );
    setNotice('');
    setShowForm(false);
    if (id) void openTarget(id);
    else {
      setActive(null);
      setError('');
    }
  };

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!name.trim() || !sourceReference.trim()) {
      setError('Enter a business name and Google Maps reference.');
      return;
    }
    setSaving(true);
    try {
      const created = await targetsApi.create(await token(), {
        name: name.trim(),
        platform: 'google_maps',
        sourceReference: sourceReference.trim(),
      });
      setTargets((current) => [created, ...current]);
      setName('');
      setSourceReference('');
      setShowForm(false);
      navigate(created.id);
      setNotice('Place saved successfully.');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not save this place.',
      );
    } finally {
      setSaving(false);
    }
  };

  const ingest = async () => {
    if (!active) return;
    const targetId = active.id;
    setProcessing(true);
    setError('');
    setNotice('');
    try {
      await targetsApi.ingest(await token(), targetId);
      setNotice('Review ingestion completed successfully.');
      await openTarget(targetId);
    } catch (err) {
      const ingestionError =
        err instanceof Error ? err.message : 'Could not start ingestion.';
      setError(ingestionError);
      try {
        const refreshed = await targetsApi.get(await token(), targetId);
        setActive((current) =>
          current?.id === targetId ? refreshed : current,
        );
      } catch (refreshError) {
        const refreshMessage =
          refreshError instanceof Error
            ? refreshError.message
            : 'Unable to refresh this place.';
        setError(`${ingestionError} ${refreshMessage}`);
      }
    } finally {
      setProcessing(false);
    }
  };

  const reviewCount = active?.reviews?.length ?? 0;
  const rejectedCount = active?.rejectedCount ?? 0;
  const averageRating = reviewCount
    ? (
        (active?.reviews ?? []).reduce(
          (sum, review) => sum + review.rating,
          0,
        ) / reviewCount
      ).toFixed(1)
    : null;
  const importStatus = processing
    ? 'processing'
    : (active?.ingestionStatus ?? 'not-started');
  const importLabel =
    importStatus === 'succeeded'
      ? 'Imported'
      : importStatus === 'failed'
        ? 'Import failed'
        : importStatus === 'processing'
          ? 'Importing…'
          : 'Not imported';

  return (
    <main className="page">
      {active && !showForm && (
        <nav className="dashboard-breadcrumb" aria-label="Breadcrumb">
          <button type="button" onClick={() => navigate()}>
            My Places
          </button>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{active.name}</span>
        </nav>
      )}
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {active && !showForm ? 'REVIEW DASHBOARD' : 'MY PLACES'}
          </p>
          <h1>
            {active && !showForm
              ? active.name
              : showForm
                ? 'Add a Place'
                : 'My Places'}
          </h1>
          <p className="muted">
            {active && !showForm
              ? 'Understand what customers are saying, one review at a time.'
              : showForm
                ? 'Save a business to start exploring its reviews.'
                : 'All your saved businesses, ready to explore.'}
          </p>
        </div>
        <div className="actions">
          {active && !showForm ? (
            <>
              <button
                type="button"
                className="button secondary"
                onClick={() => navigate()}
              >
                My places
              </button>
              <button
                type="button"
                className="button primary"
                disabled={processing}
                onClick={() => void ingest()}
              >
                {processing ? 'Importing reviews…' : 'Import reviews'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="button secondary"
                onClick={() => navigate()}
              >
                My places
              </button>
              {!showForm && (
                <button
                  type="button"
                  className="button primary"
                  onClick={() => {
                    navigate();
                    setShowForm(true);
                  }}
                >
                  + Add place
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {error && (
        <div role="alert" className="alert error">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="alert success">
          {notice}
        </div>
      )}
      {loading && <p role="status">Loading your places…</p>}
      {!loading && showForm && (
        <section className="panel">
          <h2>Add a place</h2>
          <form onSubmit={(event) => void create(event)}>
            <label htmlFor="target-name">Business or location name</label>
            <input
              id="target-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={200}
              placeholder="Example: Local Coffee Shop"
            />
            <label htmlFor="target-platform">Review platform</label>
            <input id="target-platform" value="Google Maps" readOnly />
            <label htmlFor="target-source">Google Maps source URL</label>
            <input
              id="target-source"
              type="url"
              value={sourceReference}
              onChange={(event) => setSourceReference(event.target.value)}
              required
              placeholder="https://www.google.com/maps/place/..."
            />
            <p className="hint">
              Paste the public listing URL. ReviewLens uses this saved URL as
              the source for ingestion.
            </p>
            <div className="actions">
              <button
                className="button secondary"
                type="button"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </button>
              <button
                className="button primary"
                disabled={saving}
                type="submit"
              >
                {saving ? 'Saving…' : 'Save place'}
              </button>
            </div>
          </form>
        </section>
      )}
      {!loading && !showForm && active && (
        <div className="review-dashboard">
          <section className="dashboard-overview" aria-label="Review overview">
            <div className="dashboard-source-row">
              <span className="dashboard-platform">Google Maps reviews</span>
              <span
                className={`dashboard-status dashboard-status--${importStatus}`}
              >
                <span aria-hidden="true" className="dashboard-status-dot" />
                {importLabel}
              </span>
              <a href={active.sourceReference} target="_blank" rel="noreferrer">
                View source <span aria-hidden="true">↗</span>
              </a>
            </div>
            {active.ingestionError && (
              <p className="dashboard-ingestion-error" role="alert">
                Last import: {active.ingestionError}
              </p>
            )}
            <div className="dashboard-metrics">
              <div className="dashboard-metric">
                <span
                  className="dashboard-metric-icon dashboard-metric-icon--rating"
                  aria-hidden="true"
                >
                  ★
                </span>
                <div>
                  <p className="dashboard-metric-label">Average rating</p>
                  <p className="dashboard-metric-value">
                    {averageRating ?? '—'}{' '}
                    <span>{averageRating ? '/ 5' : 'No ratings yet'}</span>
                  </p>
                </div>
              </div>
              <div className="dashboard-metric">
                <span className="dashboard-metric-icon" aria-hidden="true">
                  ▤
                </span>
                <div>
                  <p className="dashboard-metric-label">Imported reviews</p>
                  <p className="dashboard-metric-value">
                    {reviewCount.toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="dashboard-metric">
                <span className="dashboard-metric-icon" aria-hidden="true">
                  ▤
                </span>
                <div>
                  <p className="dashboard-metric-label">Rejected reviews</p>
                  <p className="dashboard-metric-value">
                    {rejectedCount.toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="dashboard-metric">
                <span
                  className="dashboard-metric-icon dashboard-metric-icon--status"
                  aria-hidden="true"
                >
                  ↻
                </span>
                <div>
                  <p className="dashboard-metric-label">Last import status</p>
                  <p className="dashboard-metric-value dashboard-metric-value--status">
                    {importLabel}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <ReviewQA
            key={active.id}
            targetName={active.name}
            onAsk={async (question) =>
              targetsApi.ask(await token(), active.id, question)
            }
          />

          <ReviewsList
            key={active.id}
            placeName={active.name}
            reviews={active.reviews ?? []}
          />
        </div>
      )}
      {!loading && !showForm && !active && (
        <SavedPlaces
          targets={targets}
          onOpen={(id) => navigate(id)}
          onAdd={() => setShowForm(true)}
        />
      )}
    </main>
  );
}

export default function App() {
  return (
    <>
      <header className="topbar">
        <div className="brand">
          Review<span>Lens</span>
        </div>
        <div className="account">
          <SignedOut>
            <SignInButton>
              <button className="button primary">Sign in</button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <UserButton />
          </SignedIn>
        </div>
      </header>
      <SignedOut>
        <main className="welcome">
          <p className="eyebrow">REVIEW INTELLIGENCE</p>
          <h1>Understand your reviews.</h1>
          <p>
            Bring your Google Maps reviews together and prepare them for
            meaningful analysis.
          </p>
          <SignInButton>
            <button className="button primary">Get started</button>
          </SignInButton>
        </main>
      </SignedOut>
      <SignedIn>
        <Workspace />
      </SignedIn>
    </>
  );
}
