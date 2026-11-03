import assert from 'node:assert/strict';
import { test } from 'vitest';

import { resolveGoogleMapsUrl } from './resolveGoogleMapsUrl';

// Test 1: Extract a data_id from a Google Maps place URL.
test('extracts data_id from Google Maps URL', () => {
  const url =
    'https://www.google.com/maps/place/Example+Business/' +
    'data=!4m5!3m4!1s0x8644cd7fdc1bf17b:0x1eb1b9a3fe5dab90!8m2';

  const result = resolveGoogleMapsUrl(url);

  assert.deepEqual(result, {
    id: '0x8644cd7fdc1bf17b:0x1eb1b9a3fe5dab90',
    idType: 'data_id',
  });
});

// Test 2: Extract a place_id from a Maps search URL.
test('extracts query_place_id', () => {
  const url =
    'https://www.google.com/maps/search/' +
    '?api=1&query=Example+Business' +
    '&query_place_id=ChIJ1234567890abcdef';

  const result = resolveGoogleMapsUrl(url);

  assert.deepEqual(result, {
    id: 'ChIJ1234567890abcdef',
    idType: 'place_id',
  });
});

// Test 3: Extract a place_id embedded in a place URL.
test('extracts embedded place_id', () => {
  const url =
    'https://www.google.com/maps/place/Example/' +
    'data=!4m5!3m4!1sChIJ1234567890abcdef!8m2';

  const result = resolveGoogleMapsUrl(url);

  assert.deepEqual(result, {
    id: 'ChIJ1234567890abcdef',
    idType: 'place_id',
  });
});

// Test 4: Reject unrelated websites.
test('rejects non-Google Maps URLs', () => {
  assert.throws(
    () => resolveGoogleMapsUrl('https://example.com/maps/place/Example'),
    /URL must belong to Google Maps/,
  );
});

// Test 5: Reject an invalid URL.
test('rejects invalid URL input', () => {
  assert.throws(
    () => resolveGoogleMapsUrl('not-a-url'),
    /Invalid Google Maps URL/,
  );
});

// Test 6: Reject an ambiguous Maps search.
test('rejects search URLs without a place identifier', () => {
  assert.throws(
    () =>
      resolveGoogleMapsUrl(
        'https://www.google.com/maps/search/?api=1&query=coffee',
      ),
    /Could not identify a unique place/,
  );
});

// Test 7: Do not silently accept short links.
test('requires resolution for shortened Maps URLs', () => {
  assert.throws(
    () => resolveGoogleMapsUrl('https://maps.app.goo.gl/example123'),
    /require redirect resolution/,
  );
});

// Test 8: Reject HTTP links.
test('rejects insecure HTTP URLs', () => {
  assert.throws(
    () => resolveGoogleMapsUrl('http://www.google.com/maps/place/Example'),
    /must use HTTPS/,
  );
});
