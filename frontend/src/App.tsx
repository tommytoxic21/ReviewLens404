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
import './App.css';

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
          err instanceof Error ? err.message : 'Unable to open this target.',
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
      setError(err instanceof Error ? err.message : 'Unable to load targets.');
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
            err instanceof Error ? err.message : 'Unable to load targets.',
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
      setNotice('Analysis target created successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create target.');
    } finally {
      setSaving(false);
    }
  };

  const ingest = async () => {
    if (!active) return;
    setProcessing(true);
    setError('');
    setNotice('');
    try {
      await targetsApi.ingest(await token(), active.id);
      setNotice('Ingestion request submitted.');
      await openTarget(active.id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not start ingestion.',
      );
    } finally {
      setProcessing(false);
    }
  };

  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR WORKSPACE</p>
          <h1>{active ? active.name : 'Analysis targets'}</h1>
          <p className="muted">
            {active
              ? 'Manage this review source and its ingestion.'
              : 'Organize Google Maps listings for review analysis.'}
          </p>
        </div>
        <div className="actions">
          <button className="button secondary" onClick={() => navigate()}>
            All targets
          </button>
          <button
            className="button primary"
            onClick={() => {
              navigate();
              setShowForm(true);
            }}
          >
            + New target
          </button>
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
      {loading && <p role="status">Loading targets…</p>}
      {!loading && showForm && (
        <section className="panel">
          <h2>Create analysis target</h2>
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
            <label htmlFor="target-source">Google Maps source reference</label>
            <input
              id="target-source"
              value={sourceReference}
              onChange={(event) => setSourceReference(event.target.value)}
              required
              placeholder="Google Maps listing URL or place identifier"
            />
            <p className="hint">
              Paste a reference that identifies the exact listing you want to
              analyze.
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
                {saving ? 'Creating…' : 'Create target'}
              </button>
            </div>
          </form>
        </section>
      )}
      {!loading && !showForm && active && (
        <section className="panel">
          <p className="eyebrow">TARGET DETAILS</p>
          <h2>{active.name}</h2>
          <dl className="details">
            <dt>Platform</dt>
            <dd>
              {active.platform === 'google_maps'
                ? 'Google Maps'
                : active.platform}
            </dd>
            <dt>Source reference</dt>
            <dd className="break-word">{active.sourceReference}</dd>
            <dt>Ingestion status</dt>
            <dd>{active.ingestionStatus ?? 'Not started'}</dd>
          </dl>
          <button
            className="button primary"
            disabled={processing}
            onClick={() => void ingest()}
          >
            {processing ? 'Starting ingestion…' : 'Start ingestion'}
          </button>
        </section>
      )}
      {!loading && !showForm && !active && (
        <section className="panel">
          <h2>Saved targets</h2>
          {targets.length === 0 ? (
            <div className="empty">
              <h3>No targets yet</h3>
              <p>Create your first target to start analyzing reviews.</p>
              <button
                className="button primary"
                onClick={() => setShowForm(true)}
              >
                Create a target
              </button>
            </div>
          ) : (
            <div className="target-list">
              {targets.map((target) => (
                <button
                  key={target.id}
                  className="target-item"
                  onClick={() => navigate(target.id)}
                >
                  <span>
                    <strong>{target.name}</strong>
                    <small>Google Maps · {target.sourceReference}</small>
                  </span>
                  <span aria-hidden="true">→</span>
                </button>
              ))}
            </div>
          )}
        </section>
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
