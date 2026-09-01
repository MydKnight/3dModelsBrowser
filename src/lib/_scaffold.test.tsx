// Infra-check only -- proves Vitest + @testing-library/preact are wired
// correctly before build-order steps 3-7 write real logic against them.
// Delete this file once step 4/5's real specs exist (docs/astro-rewrite-spec.md
// -> Build order).
import { render, screen } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';

function Hello({ name }: { name: string }) {
  return <p>Hello, {name}!</p>;
}

describe('scaffold infra check', () => {
  it('renders a Preact component via Testing Library', () => {
    render(<Hello name="Astro" />);
    expect(screen.getByText('Hello, Astro!')).toBeInTheDocument();
  });
});
