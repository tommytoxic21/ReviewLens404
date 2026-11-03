import type { ReactNode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

vi.mock('@clerk/clerk-react', () => ({
  SignedIn: () => null,
  SignedOut: ({ children }: { children: ReactNode }) => <>{children}</>,
  SignInButton: ({ children }: { children?: ReactNode }) => <>{children}</>,
  UserButton: () => null,
  useAuth: () => ({ getToken: async () => 'test-token' }),
}));

describe('App', () => {
  it('shows the sign-in action when signed out', () => {
    render(<App />);
    expect(
      screen.getByRole('button', { name: /sign in/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/understand your reviews/i)).toBeInTheDocument();
  });
});
