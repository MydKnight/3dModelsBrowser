// docs/astro-rewrite-spec.md -- Testing: thumbnail path resolution (D6),
// covers scripts/lib/thumbnail-paths.cjs only; the sharp calls in
// make-thumbnails.mjs are exempt, same as the NAS scan.
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  resolveSourceImagePath,
  thumbnailPathFor,
  detailImagePathFor,
} from './thumbnail-paths.cjs';

const legacyImagesDir = path.join('C:', 'repo', 'public', 'images');

describe('resolveSourceImagePath', () => {
  it('returns a raw filesystem path as-is', () => {
    const raw = '\\\\192.168.254.200\\data\\3D Files\\Loot Studios\\Boar\\FN2011AC15.png';
    expect(resolveSourceImagePath({ image: raw }, { legacyImagesDir })).toBe(raw);
  });

  it('resolves a legacy /images/ web path to the file already on disk', () => {
    const result = resolveSourceImagePath(
      { image: '/images/model-boar-f3c95a53-FN2011AC15.png' },
      { legacyImagesDir }
    );
    expect(result).toBe(path.join(legacyImagesDir, 'model-boar-f3c95a53-FN2011AC15.png'));
  });

  it('returns null for a model with no image', () => {
    expect(resolveSourceImagePath({}, { legacyImagesDir })).toBeNull();
    expect(resolveSourceImagePath({ image: '' }, { legacyImagesDir })).toBeNull();
    expect(resolveSourceImagePath({ image: null }, { legacyImagesDir })).toBeNull();
  });

  it('returns null for a remote http(s) image (no local file to read)', () => {
    expect(
      resolveSourceImagePath({ image: 'https://example.com/x.png' }, { legacyImagesDir })
    ).toBeNull();
    expect(
      resolveSourceImagePath({ image: 'http://example.com/x.png' }, { legacyImagesDir })
    ).toBeNull();
  });

  it('returns null when model itself is missing', () => {
    expect(resolveSourceImagePath(undefined, { legacyImagesDir })).toBeNull();
  });
});

describe('thumbnailPathFor / detailImagePathFor', () => {
  it('builds the grid thumbnail path from the model id', () => {
    expect(thumbnailPathFor('boar---mounted-boss-f3c95a53', '/pub/thumbnails')).toBe(
      path.join('/pub/thumbnails', 'boar---mounted-boss-f3c95a53.webp')
    );
  });

  it('builds the detail image path from the model id', () => {
    expect(detailImagePathFor('boar---mounted-boss-f3c95a53', '/pub/detail')).toBe(
      path.join('/pub/detail', 'boar---mounted-boss-f3c95a53.webp')
    );
  });

  it('keeps thumbnail and detail dirs separate for the same id', () => {
    const id = 'same-id';
    expect(thumbnailPathFor(id, '/pub/thumbnails')).not.toBe(
      detailImagePathFor(id, '/pub/detail')
    );
  });
});
