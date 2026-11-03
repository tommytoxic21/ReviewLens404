/**
 * S1-020: Resolve a Google Maps URL into the identifier
 * required by the SerpApi Google Maps Reviews API.
 *
 * This module does not make network requests.
 */

export interface GoogleMapsIdentifier {
  id: string;
  idType: 'place_id' | 'data_id';
}

export function resolveGoogleMapsUrl(input: string): GoogleMapsIdentifier {
  let url: URL;

  try {
    url = new URL(input.trim());
  } catch {
    throw new Error('Invalid Google Maps URL');
  }

  // Only accept HTTPS URLs from recognized Google Maps hosts.
  if (url.protocol !== 'https:') {
    throw new Error('Google Maps URL must use HTTPS');
  }

  const allowedHosts = [
    'google.com',
    'www.google.com',
    'maps.google.com',
    'maps.app.goo.gl',
  ];

  if (!allowedHosts.includes(url.hostname.toLowerCase())) {
    throw new Error('URL must belong to Google Maps');
  }

  // Shortened links must be resolved separately.
  if (url.hostname.toLowerCase() === 'maps.app.goo.gl') {
    throw new Error('Shortened Google Maps URLs require redirect resolution');
  }

  if (!url.pathname.startsWith('/maps/')) {
    throw new Error('URL is not a supported Google Maps link');
  }

  // Google's documented Maps search URL can contain a Place ID.
  const queryPlaceId = url.searchParams.get('query_place_id');

  if (queryPlaceId) {
    const id = queryPlaceId.trim();

    if (/^ChIJ[A-Za-z0-9_-]+$/.test(id)) {
      return {
        id,
        idType: 'place_id',
      };
    }

    throw new Error('Invalid Google Maps Place ID');
  }

  // Standard Maps place links can embed identifiers
  // in their path, often following a !1s segment.
  if (url.pathname.startsWith('/maps/place/')) {
    let pathname: string;

    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      throw new Error('Invalid URL encoding');
    }

    // Google Maps data IDs contain two hexadecimal components.
    const dataId = pathname.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)(?=!|\/|$)/i);

    if (dataId) {
      return {
        id: dataId[1],
        idType: 'data_id',
      };
    }

    // Some place links embed the Google Place ID instead.
    const placeId = pathname.match(/!1s(ChIJ[A-Za-z0-9_-]+)(?=!|\/|$)/);

    if (placeId) {
      return {
        id: placeId[1],
        idType: 'place_id',
      };
    }
  }

  throw new Error(
    'Could not identify a unique place from this Google Maps URL',
  );
}
