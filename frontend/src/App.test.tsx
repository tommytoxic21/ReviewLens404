import type { ReactNode } from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  act,
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
  it('switches review data and Q&A requests to the selected target', async () => {
    authState.signedIn = true;
    window.history.replaceState({}, '', '/targets/target-a');

    const targetA = makeTarget({
      id: 'target-a',
      name: 'Battery Store',
      ingestionStatus: 'succeeded',
      reviews: [
        {
          id: 'review-a',
          reviewText: 'Battery life lasts all day.',
          rating: 5,
          reviewerName: null,
          reviewedAt: null,
          reviewUrl: null,
        },
      ],
    });
    const targetB = makeTarget({
      id: 'target-b',
      name: 'Service Desk',
      ingestionStatus: 'succeeded',
      reviews: [
        {
          id: 'review-b',
          reviewText: 'Customer service needs improvement.',
          rating: 2,
          reviewerName: null,
          reviewedAt: null,
          reviewUrl: null,
        },
      ],
    });

    vi.mocked(targetsApi.list).mockResolvedValue([targetA, targetB]);
    vi.mocked(targetsApi.get).mockImplementation(async (_token, id) => {
      if (id === 'target-a') return targetA;
      if (id === 'target-b') return targetB;
      throw new Error('Place not found.');
    });
    vi.mocked(targetsApi.ask).mockResolvedValue('Customer service is mixed.');

    render(<App />);

    expect(
      await screen.findByText('Battery life lasts all day.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Battery Store' }),
    ).toBeInTheDocument();
    expect(screen.getByText('5.0')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Active place' }), {
      target: { value: 'target-b' },
    });

    expect(
      await screen.findByText('Customer service needs improvement.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Service Desk' }),
    ).toBeInTheDocument();
    expect(screen.getByText('2.0')).toBeInTheDocument();
    expect(
      screen.queryByText('Battery life lasts all day.'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Active place' })).toHaveValue(
      'target-b',
    );
    expect(window.location.pathname).toBe('/targets/target-b');
    expect(targetsApi.get).toHaveBeenCalledWith('test-token', 'target-b');

    fireEvent.click(
      screen.getByRole('button', { name: 'How is the service?' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ask ReviewLens' }));

    await waitFor(() => {
      expect(targetsApi.ask).toHaveBeenCalledWith(
        'test-token',
        'target-b',
        'How is the service?',
      );
    });
  });

  it('S2-019: ignores an outdated target response after a newer target loads', async () => {
    authState.signedIn = true;
    window.history.replaceState({}, '', '/targets/target-a');

    const targetA = makeTarget({
      id: 'target-a',
      name: 'Battery Store',
      ingestionStatus: 'succeeded',
      reviews: [
        {
          id: 'review-a',
          reviewText: 'Battery life lasts all day.',
          rating: 5,
          reviewerName: null,
          reviewedAt: null,
          reviewUrl: null,
        },
      ],
    });

    const targetB = makeTarget({
      id: 'target-b',
      name: 'Service Desk',
      ingestionStatus: 'succeeded',
      reviews: [
        {
          id: 'review-b',
          reviewText: 'Customer service needs improvement.',
          rating: 2,
          reviewerName: null,
          reviewedAt: null,
          reviewUrl: null,
        },
      ],
    });

    let resolveTargetA: (
      target: ReturnType<typeof makeTarget>,
    ) => void = () => {};
    const delayedTargetA = new Promise<ReturnType<typeof makeTarget>>(
      (resolve) => {
        resolveTargetA = resolve;
      },
    );

    vi.mocked(targetsApi.list).mockResolvedValue([targetA, targetB]);
    vi.mocked(targetsApi.get).mockImplementation(async (_token, id) => {
      if (id === 'target-a') return delayedTargetA;
      if (id === 'target-b') return targetB;
      throw new Error('Place not found.');
    });

    render(<App />);

    await waitFor(() => {
      expect(targetsApi.get).toHaveBeenCalledWith('test-token', 'target-a');
    });

    act(() => {
      window.history.pushState({}, '', '/targets/target-b');
      window.dispatchEvent(new Event('popstate'));
    });

    expect(
      await screen.findByText('Customer service needs improvement.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Service Desk' }),
    ).toBeInTheDocument();

    await act(async () => {
      resolveTargetA(targetA);
    });

    expect(
      screen.queryByText('Battery life lasts all day.'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Customer service needs improvement.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Service Desk' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Active place' })).toHaveValue(
      'target-b',
    );
    expect(window.location.pathname).toBe('/targets/target-b');
  });

  it('S2-019: reports a saved-place refresh failure after browser navigation', async () => {
    authState.signedIn = true;

    vi.mocked(targetsApi.list)
      .mockResolvedValueOnce([makeTarget()])
      .mockRejectedValueOnce(new Error('Unable to refresh saved places.'));

    render(<App />);

    expect(
      await screen.findByRole('button', {
        name: 'Open Joe’s Pizza dashboard',
      }),
    ).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('popstate'));
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to refresh saved places.',
    );
    expect(targetsApi.list).toHaveBeenCalledTimes(2);
  });

  it('S2-019: does not display an old Q&A answer after switching targets', async () => {
    authState.signedIn = true;
    window.history.replaceState({}, '', '/targets/target-a');

    const targetA = makeTarget({
      id: 'target-a',
      name: 'Battery Store',
      ingestionStatus: 'succeeded',
      reviews: [
        {
          id: 'review-a',
          reviewText: 'Battery life lasts all day.',
          rating: 5,
          reviewerName: null,
          reviewedAt: null,
          reviewUrl: null,
        },
      ],
    });

    const targetB = makeTarget({
      id: 'target-b',
      name: 'Service Desk',
      ingestionStatus: 'succeeded',
      reviews: [
        {
          id: 'review-b',
          reviewText: 'Customer service needs improvement.',
          rating: 2,
          reviewerName: null,
          reviewedAt: null,
          reviewUrl: null,
        },
      ],
    });

    let resolveOldAnswer: (answer: string) => void = () => {};
    const delayedOldAnswer = new Promise<string>((resolve) => {
      resolveOldAnswer = resolve;
    });

    vi.mocked(targetsApi.list).mockResolvedValue([targetA, targetB]);
    vi.mocked(targetsApi.get).mockImplementation(async (_token, id) => {
      if (id === 'target-a') return targetA;
      if (id === 'target-b') return targetB;
      throw new Error('Place not found.');
    });

    vi.mocked(targetsApi.ask).mockImplementation(async (_token, id) => {
      if (id === 'target-a') return delayedOldAnswer;
      if (id === 'target-b') return 'Service Desk answer only.';
      throw new Error('Unexpected target.');
    });

    render(<App />);

    expect(
      await screen.findByText('Battery life lasts all day.'),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'How is the service?' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ask ReviewLens' }));

    await waitFor(() => {
      expect(targetsApi.ask).toHaveBeenCalledWith(
        'test-token',
        'target-a',
        'How is the service?',
      );
    });

    fireEvent.change(screen.getByRole('combobox', { name: 'Active place' }), {
      target: { value: 'target-b' },
    });

    expect(
      await screen.findByText('Customer service needs improvement.'),
    ).toBeInTheDocument();

    expect(
      screen.queryByText('Battery life lasts all day.'),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'How is the service?' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ask ReviewLens' }));

    expect(
      await screen.findByText('Service Desk answer only.'),
    ).toBeInTheDocument();

    await act(async () => {
      resolveOldAnswer('Battery Store answer only.');
    });

    expect(
      screen.queryByText('Battery Store answer only.'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Service Desk answer only.')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Service Desk' }),
    ).toBeInTheDocument();
    expect(targetsApi.ask).toHaveBeenCalledWith(
      'test-token',
      'target-b',
      'How is the service?',
    );
  });

  it('shows the sign-in action when signed out', () => {
    render(<App />);
    expect(
      screen.getByRole('button', { name: /sign in/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/understand your reviews/i)).toBeInTheDocument();
  });

  it.each([
    ['succeeded', 'Imported'],
    ['failed', 'Import failed'],
  ])(
    'uses persisted reviews for Q&A when the last import %s',
    async (ingestionStatus, importLabel) => {
      authState.signedIn = true;
      window.history.replaceState({}, '', '/targets/active-1');
      const target = makeTarget({
        id: 'active-1',
        ingestionStatus,
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
      expect(screen.getAllByText(importLabel).length).toBeGreaterThan(0);
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
    },
  );

  it.each([undefined, 'failed', 'processing', 'succeeded'])(
    'withholds Q&A for an empty dataset regardless of ingestion status (%s)',
    async (ingestionStatus) => {
      authState.signedIn = true;
      window.history.replaceState({}, '', '/targets/target-1');
      const target = makeTarget({ ingestionStatus });
      vi.mocked(targetsApi.list).mockResolvedValue([target]);
      vi.mocked(targetsApi.get).mockResolvedValue(target);

      render(<App />);

      const emptyState = await screen.findByRole('region', {
        name: 'ReviewLens unavailable',
      });
      expect(emptyState).toHaveTextContent(/No reviews have been ingested/);
      expect(emptyState).toHaveTextContent(/complete ingestion before asking/);
      expect(screen.queryByLabelText(/your question/i)).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Ask ReviewLens' }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Import reviews' }),
      ).toBeEnabled();
      expect(targetsApi.ask).not.toHaveBeenCalled();
    },
  );

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
    expect(
      await screen.findByRole('region', { name: 'ReviewLens unavailable' }),
    ).toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Import reviews' }),
    );

    expect(await screen.findByText('Excellent pizza.')).toBeInTheDocument();
    expect(
      await screen.findByText('Review ingestion completed successfully.'),
    ).toBeInTheDocument();
    expect(targetsApi.ingest).toHaveBeenCalledWith('test-token', 'target-1');
    expect(targetsApi.get).toHaveBeenCalledTimes(2);
    expect(
      screen.queryByRole('region', { name: 'ReviewLens unavailable' }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText(/your question/i)).toBeEnabled();
  });

  it('explains when another import finds no additional reviews', async () => {
    authState.signedIn = true;
    window.history.replaceState({}, '', '/targets/target-1');
    const current = makeTarget({ ingestionStatus: 'succeeded' });
    vi.mocked(targetsApi.list).mockResolvedValue([current]);
    vi.mocked(targetsApi.get).mockResolvedValue(current);
    vi.mocked(targetsApi.ingest).mockResolvedValue({
      attempt: {
        status: 'succeeded',
        errorMessage: null,
        rejectedCount: 0,
        savedCount: 0,
      },
    });

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Import reviews' }));
    expect(
      await screen.findByText('No additional reviews were available to import.'),
    ).toBeInTheDocument();
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
    expect(
      screen.getByRole('region', { name: 'ReviewLens unavailable' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/your question/i)).not.toBeInTheDocument();
    expect(targetsApi.ask).not.toHaveBeenCalled();
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
