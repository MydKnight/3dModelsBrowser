// docs/astro-rewrite-spec.md -- Testing: thumbnail path resolution (D6),
// covers scripts/lib/thumbnail-paths.cjs only; the sharp calls in
// make-thumbnails.mjs are exempt, same as the NAS scan.
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { thumbnailPathFor, detailImagePathFor } from './thumbnail-paths.cjs';

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
