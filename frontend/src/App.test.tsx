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
    const target = {
      id: 'active-1',
      name: 'Joe’s Pizza',
      platform: 'google',
      sourceReference: 'https://www.google.com/maps/place/example',
      ingestionStatus: 'succeeded',
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
    };
    vi.mocked(targetsApi.list).mockResolvedValue([target]);
    vi.mocked(targetsApi.get).mockResolvedValue(target);
    vi.mocked(targetsApi.ask).mockResolvedValue('Customers like the food.');

    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Customer Reviews' }),
    ).toBeInTheDocument();
    expect(screen.getByText('4.5')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
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
});
