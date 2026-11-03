import { ClerkProvider } from '@clerk/clerk-react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error(
    'VITE_CLERK_PUBLISHABLE_KEY is required to start ReviewLens.',
  );
}

export function Root() {
  return (
    <StrictMode>
      <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
        <App />
      </ClerkProvider>
    </StrictMode>
  );
}

createRoot(document.getElementById('root')!).render(<Root />);
