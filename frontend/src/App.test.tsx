
import type { ReactNode } from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import App from './App';
import { targetsApi } from './targetsApi';
import type { AnalysisTarget } from './targetsApi';

const authState = vi.hoisted(() => ({
  signedIn: false,
  getToken: async () => 'test-token',
}));

vi.mock('@clerk/clerk-react', () => ({
  SignedIn: ({ children }: { children: ReactNode }) =>
    authState.signedIn ? <>{children}</> : null,
  SignedOut: ({ children }: { children: ReactNode }) =>
    authState.signedIn ? null : <>{children}</>,
  SignInButton: ({ children }: { children?: ReactNode }) => <>{children}</>,
  UserButton: () => null,
  useAuth: () => ({ getToken: authState.getToken }),
}));

vi.mock('./targetsApi', () => ({
  targetsApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    ingest: vi.fn(),
    ask: vi.fn(),
  },
}));

function makeTarget(
  overrides: Partial<AnalysisTarget> = {},
): AnalysisTarget & { reviews: NonNullable<AnalysisTarget['reviews']> } {
  return {
    id: 'target-1',
    name: 'Joe’s Pizza',
    platform: 'google',
    sourceReference: 'https://www.google.com/maps/place/example',
    reviews: [],
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  authState.signedIn = false;
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/');
});

describe('App', () => {
  it('shows the sign-in action when signed out', () => {
    render(<App />);
    expect(
      screen.getByRole('button', { name: /sign in/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/understand your reviews/i)).toBeInTheDocument();
  });

  it('shows persisted review metrics and sends questions for the selected place', async () => {
    authState.signedIn = true;
    window.history.replaceState({}, '', '/targets/active-1');
    const target = makeTarget({
      id: 'active-1',
      ingestionStatus: 'succeeded',
      rejectedCount: 3,
      reviews: [
        {
          id: 'r1',
          reviewText: 'Great food',
          rating: 5,
          reviewerName: 'Sam',
          reviewedAt: null,
          reviewUrl: null,
        },
        {
          id: 'r2',
          reviewText: 'Long wait',
          rating: 4,
          reviewerName: 'Alex',
          reviewedAt: null,
          reviewUrl: null,
        },
      ],
    });
    vi.mocked(targetsApi.list).mockResolvedValue([target]);
    vi.mocked(targetsApi.get).mockResolvedValue(target);
    vi.mocked(targetsApi.ask).mockResolvedValue('Customers like the food.');

    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Customer Reviews' }),
    ).toBeInTheDocument();
    expect(screen.getByText('4.5')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getAllByText('Imported').length).toBeGreaterThan(0);
    expect(screen.getByText('Great food')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'How is the service?' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ask ReviewLens' }));

    await waitFor(() => {
      expect(targetsApi.ask).toHaveBeenCalledWith(
        'test-token',
        'active-1',
        'How is the service?',
      );
    });
    expect(
      await screen.findByText('Customers like the food.'),
    ).toBeInTheDocument();
  });

  it('shows saved places after loading and opens the selected place', async () => {
    authState.signedIn = true;
    vi.mocked(targetsApi.list).mockResolvedValue([makeTarget()]);
    vi.mocked(targetsApi.get).mockResolvedValue(makeTarget());

    render(<App />);

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open Joe’s Pizza dashboard',
      }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Joe’s Pizza' }),
    ).toBeInTheDocument();
    expect(targetsApi.get).toHaveBeenCalledWith('test-token', 'target-1');
  });

  it('shows a useful empty state when there are no saved places', async () => {
    authState.signedIn = true;
    vi.mocked(targetsApi.list).mockResolvedValue([]);

    render(<App />);

    expect(
      await screen.findByText('Your collection starts here'),
    ).toBeInTheDocument();
  });

  it('displays an error when loading the saved places fails', async () => {
    authState.signedIn = true;
    vi.mocked(targetsApi.list).mockRejectedValue(
      new Error('Places are unavailable.'),
    );

    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Places are unavailable.',
    );
  });

  it('displays an error when a linked place cannot be opened', async () => {
    authState.signedIn = true;
    window.history.replaceState({}, '', '/targets/missing');
    vi.mocked(targetsApi.list).mockResolvedValue([]);
    vi.mocked(targetsApi.get).mockRejectedValue(new Error('Place not found.'));

    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Place not found.',
    );
  });

  it('validates required place fields before saving', async () => {
    authState.signedIn = true;
    vi.mocked(targetsApi.list).mockResolvedValue([]);

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: '+ Add place' }));
    fireEvent.change(screen.getByLabelText('Business or location name'), {
      target: { value: '   ' },
    });
    fireEvent.change(screen.getByLabelText('Google Maps source URL'), {
      target: { value: 'https://maps.google.com/example' },
    });
    fireEvent.submit(
      screen.getByRole('button', { name: 'Save place' }).closest('form')!,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter a business name and Google Maps reference.',
    );
    expect(targetsApi.create).not.toHaveBeenCalled();
  });

  it('saves a place, opens its dashboard, and reports success', async () => {
    authState.signedIn = true;
    const target = makeTarget({ id: 'new-place' });
    vi.mocked(targetsApi.list).mockResolvedValue([]);
    vi.mocked(targetsApi.create).mockResolvedValue(target);
    vi.mocked(targetsApi.get).mockResolvedValue(target);

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: '+ Add place' }));
    fireEvent.change(screen.getByLabelText('Business or location name'), {
      target: { value: '  Joe’s Pizza  ' },
    });
    fireEvent.change(screen.getByLabelText('Google Maps source URL'), {
      target: { value: '  https://maps.google.com/example  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save place' }));

    expect(
      await screen.findByRole('heading', { name: 'Joe’s Pizza' }),
    ).toBeInTheDocument();
    expect(targetsApi.create).toHaveBeenCalledWith('test-token', {
      name: 'Joe’s Pizza',
      platform: 'google_maps',
      sourceReference: 'https://maps.google.com/example',
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Place saved successfully.',
    );
  });

  it('shows the save error and keeps the form available when saving fails', async () => {
    authState.signedIn = true;
    vi.mocked(targetsApi.list).mockResolvedValue([]);
    vi.mocked(targetsApi.create).mockRejectedValue(
      new Error('Could not save this place.'),
    );

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: '+ Add place' }));
    fireEvent.change(screen.getByLabelText('Business or location name'), {
      target: { value: 'Joe’s Pizza' },
    });
    fireEvent.change(screen.getByLabelText('Google Maps source URL'), {
      target: { value: 'https://maps.google.com/example' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save place' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save this place.',
    );
    expect(screen.getByRole('button', { name: 'Save place' })).toBeEnabled();
  });

  it('refreshes the selected place after successful review ingestion', async () => {
    authState.signedIn = true;
    window.history.replaceState({}, '', '/targets/target-1');
    const beforeImport = makeTarget({ ingestionStatus: 'not-started' });
    const afterImport = makeTarget({
      ingestionStatus: 'succeeded',
      reviews: [
        {
          id: 'review-1',
          reviewText: 'Excellent pizza.',
          rating: 5,
          reviewerName: 'Sam',
          reviewedAt: null,
          reviewUrl: null,
        },
      ],
    });
    vi.mocked(targetsApi.list).mockResolvedValue([beforeImport]);
    vi.mocked(targetsApi.get)
      .mockResolvedValueOnce(beforeImport)
      .mockResolvedValueOnce(afterImport);
    vi.mocked(targetsApi.ingest).mockResolvedValue({
      attempt: { status: 'succeeded', errorMessage: null, rejectedCount: 0 },
    });

    render(<App />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Import reviews' }),
    );

    expect(await screen.findByText('Excellent pizza.')).toBeInTheDocument();
    expect(
      await screen.findByText('Review ingestion completed successfully.'),
    ).toBeInTheDocument();
    expect(targetsApi.ingest).toHaveBeenCalledWith('test-token', 'target-1');
    expect(targetsApi.get).toHaveBeenCalledTimes(2);
  });

  it('shows an error when review ingestion fails', async () => {
    authState.signedIn = true;
    window.history.replaceState({}, '', '/targets/target-1');
    vi.mocked(targetsApi.list).mockResolvedValue([makeTarget()]);
    vi.mocked(targetsApi.get).mockResolvedValue(makeTarget());
    vi.mocked(targetsApi.ingest).mockRejectedValue(
      new Error('Review provider unavailable.'),
    );

    render(<App />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Import reviews' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Review provider unavailable.',
    );
    expect(
      screen.getByRole('button', { name: 'Import reviews' }),
    ).toBeEnabled();
  });

  it('uses the refresh fallback when ingestion and refresh reject non-Errors', async () => {
    authState.signedIn = true;
    window.history.replaceState({}, '', '/targets/target-1');
    const target = makeTarget();
    vi.mocked(targetsApi.list).mockResolvedValue([target]);
    vi.mocked(targetsApi.get)
      .mockResolvedValueOnce(target)
      .mockRejectedValueOnce('Refresh failed.');
    vi.mocked(targetsApi.ingest).mockRejectedValue(
      new Error('Review provider unavailable.'),
    );

    render(<App />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Import reviews' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Review provider unavailable. Unable to refresh this place.',
    );
    expect(
      screen.getByRole('button', { name: 'Import reviews' }),
    ).toBeEnabled();
  });
});
