import assert from 'node:assert/strict';
import { test } from 'vitest';

import { expandGoogleMapsShortUrl } from './expandGoogleMapsShortUrl';
import { resolveGoogleMapsUrl } from './resolveGoogleMapsUrl';

const expandedUrl =
  'https://www.google.com/maps/place/The+Grove+Station/' +
  'data=!4m5!3m4!1s0x89c250b211a2252f:0x390414e5814d7dd2!8m2';

test('expands a shortened Google Maps link', async () => {
  const mockFetch: typeof fetch = async () =>
    new Response(null, {
      status: 302,
      headers: { location: expandedUrl },
    });

  const result = await expandGoogleMapsShortUrl(
    'https://maps.app.goo.gl/example123',
    mockFetch,
  );

  assert.equal(result, expandedUrl);

  const identifier = resolveGoogleMapsUrl(result);

  assert.deepEqual(identifier, {
    id: '0x89c250b211a2252f:0x390414e5814d7dd2',
    idType: 'data_id',
  });
});

test('passes full Google Maps URLs through', async () => {
  const result = await expandGoogleMapsShortUrl(expandedUrl);
  assert.equal(result, expandedUrl);
});

test('rejects redirects to unrelated domains', async () => {
  const mockFetch: typeof fetch = async () =>
    new Response(null, {
      status: 302,
      headers: { location: 'https://example.com/private' },
    });

  await assert.rejects(
    expandGoogleMapsShortUrl('https://maps.app.goo.gl/example123', mockFetch),
    /Unsafe Google Maps redirect/,
  );
});

test('rejects redirects outside Google Maps paths', async () => {
  const mockFetch: typeof fetch = async () =>
    new Response(null, {
      status: 302,
      headers: { location: 'https://www.google.com/search?q=test' },
    });

  await assert.rejects(
    expandGoogleMapsShortUrl('https://maps.app.goo.gl/example123', mockFetch),
    /not a Google Maps place URL/,
  );
});

test('rejects unsuccessful short-link responses', async () => {
  const mockFetch: typeof fetch = async () =>
    new Response('Not found', { status: 404 });

  await assert.rejects(
    expandGoogleMapsShortUrl('https://maps.app.goo.gl/example123', mockFetch),
    /did not redirect/,
  );
});

test('rejects unsupported input hosts', async () => {
  await assert.rejects(
    expandGoogleMapsShortUrl('https://example.com'),
    /Unsafe Google Maps redirect/,
  );
});

test('expands legacy goo.gl/maps sharing links', async () => {
  const mockFetch: typeof fetch = async () =>
    new Response(null, {
      status: 302,
      headers: { location: expandedUrl },
    });

  const result = await expandGoogleMapsShortUrl(
    'https://goo.gl/maps/Example123',
    mockFetch,
  );

  assert.equal(result, expandedUrl);

  assert.deepEqual(resolveGoogleMapsUrl(result), {
    id: '0x89c250b211a2252f:0x390414e5814d7dd2',
    idType: 'data_id',
  });
});

test('rejects unrelated goo.gl short links', async () => {
  await assert.rejects(
    expandGoogleMapsShortUrl('https://goo.gl/NotGoogleMaps'),
    /Invalid Google Maps short URL/,
  );
});
