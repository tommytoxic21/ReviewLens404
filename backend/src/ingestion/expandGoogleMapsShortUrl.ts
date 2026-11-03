/**
 * S1-020: Expand shortened Google Maps sharing links.
 *
 * Supports:
 * - maps.app.goo.gl/<token>
 * - goo.gl/maps/<token>
 *
 * Only follows redirects between approved Google Maps hosts.
 * Never follows redirects to arbitrary websites.
 */

const ALLOWED_HOSTS = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  'www.google.com',
  'google.com',
  'maps.google.com',
]);

function isShortGoogleMapsUrl(url: URL): boolean {
  if (url.hostname === 'maps.app.goo.gl') {
    return /^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname);
  }

  if (url.hostname === 'goo.gl') {
    return /^\/maps\/[A-Za-z0-9_-]+\/?$/.test(url.pathname);
  }

  return false;
}

function validateDestination(url: URL): void {
  if (
    url.protocol !== 'https:' ||
    !ALLOWED_HOSTS.has(url.hostname.toLowerCase()) ||
    url.port !== '' ||
    url.username !== '' ||
    url.password !== ''
  ) {
    throw new Error('Unsafe Google Maps redirect');
  }

  if (url.hostname === 'maps.app.goo.gl' || url.hostname === 'goo.gl') {
    if (!isShortGoogleMapsUrl(url)) {
      throw new Error('Invalid Google Maps short URL');
    }

    return;
  }

  if (!url.pathname.startsWith('/maps/')) {
    throw new Error('Redirect is not a Google Maps place URL');
  }
}

export async function expandGoogleMapsShortUrl(
  input: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  let current: URL;

  try {
    current = new URL(input.trim());
  } catch {
    throw new Error('Invalid Google Maps URL');
  }

  validateDestination(current);

  if (!isShortGoogleMapsUrl(current)) {
    return current.toString();
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    let response: Response;

    try {
      response = await fetchImpl(current.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new Error('Could not expand Google Maps short URL');
    }

    if (![301, 302, 303, 307, 308].includes(response.status)) {
      throw new Error('Google Maps short URL did not redirect');
    }

    const location = response.headers.get('location');

    if (!location) {
      throw new Error('Google Maps redirect is missing its destination');
    }

    let next: URL;

    try {
      next = new URL(location, current);
    } catch {
      throw new Error('Invalid Google Maps redirect destination');
    }

    validateDestination(next);

    if (!isShortGoogleMapsUrl(next)) {
      return next.toString();
    }

    current = next;
  }

  throw new Error('Too many Google Maps redirects');
}
