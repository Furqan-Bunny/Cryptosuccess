import { keccak256, toBytes, concat, type Hex } from 'viem';
import {
  hashLeaf,
  computeMerkleRoot,
  computeMerkleProof,
  verifyMerkleProof,
} from '../../src/lib/merkle';
import { canonicalizeLeaf, LeafFields } from '../../src/lib/track-record-leaf';

const leaves = (n: number): Hex[] =>
  Array.from({ length: n }, (_, i) => hashLeaf(`leaf-${i}`));

// Independent sorted-pair reference so we're not testing the impl against itself.
function pair(a: Hex, b: Hex): Hex {
  const [lo, hi] = a.toLowerCase() <= b.toLowerCase() ? [a, b] : [b, a];
  return keccak256(concat([lo, hi]));
}

describe('merkle root', () => {
  it('single leaf → root is the leaf', () => {
    const l = leaves(1);
    expect(computeMerkleRoot(l)).toBe(l[0]);
  });

  it('two leaves → sorted-pair hash', () => {
    const l = leaves(2);
    expect(computeMerkleRoot(l)).toBe(pair(l[0], l[1]));
  });

  it('odd count duplicates the last node', () => {
    const l = leaves(3);
    const expected = pair(pair(l[0], l[1]), pair(l[2], l[2]));
    expect(computeMerkleRoot(l)).toBe(expected);
  });

  it('throws on empty set', () => {
    expect(() => computeMerkleRoot([])).toThrow();
  });
});

describe('merkle proofs', () => {
  for (const n of [1, 2, 3, 4, 5, 8, 9, 16, 17]) {
    it(`every leaf verifies for n=${n}`, () => {
      const l = leaves(n);
      const root = computeMerkleRoot(l);
      for (let i = 0; i < n; i++) {
        const proof = computeMerkleProof(l, i);
        expect(verifyMerkleProof(l[i], proof, root)).toBe(true);
      }
    });
  }

  it('rejects a tampered leaf', () => {
    const l = leaves(8);
    const root = computeMerkleRoot(l);
    const proof = computeMerkleProof(l, 3);
    expect(verifyMerkleProof(hashLeaf('forged'), proof, root)).toBe(false);
  });

  it('rejects a valid leaf against the wrong root', () => {
    const a = leaves(8);
    const b = leaves(9).slice(1); // different set
    const proof = computeMerkleProof(a, 2);
    expect(verifyMerkleProof(a[2], proof, computeMerkleRoot(b))).toBe(false);
  });

  it('index out of range throws', () => {
    expect(() => computeMerkleProof(leaves(4), 4)).toThrow();
  });
});

describe('canonical leaf hashing', () => {
  const base: LeafFields = {
    id: '11111111-1111-1111-1111-111111111111',
    userId: '22222222-2222-2222-2222-222222222222',
    symbol: 'BTC',
    action: 'BUY',
    confidence: '72',
    entryPrice: '42123.55000000',
    targetPrice: '44000.00000000',
    stopLoss: '41000.00000000',
    outcome: 'hit_target',
    profitLossPercent: '4.45000000',
    createdAt: '2026-06-01T00:00:00.000Z',
    evaluatedAt: '2026-06-02T00:00:00.000Z',
  };

  it('is deterministic and float-free (same fields → same hash)', () => {
    expect(hashLeaf(canonicalizeLeaf(base))).toBe(hashLeaf(canonicalizeLeaf({ ...base })));
  });

  it('any field change changes the hash', () => {
    const h0 = hashLeaf(canonicalizeLeaf(base));
    expect(hashLeaf(canonicalizeLeaf({ ...base, outcome: 'hit_stop' }))).not.toBe(h0);
    expect(hashLeaf(canonicalizeLeaf({ ...base, entryPrice: '42123.55000001' }))).not.toBe(h0);
  });

  it('handles null numerics/timestamps deterministically', () => {
    const withNulls: LeafFields = {
      ...base,
      confidence: null,
      profitLossPercent: null,
      evaluatedAt: null,
    };
    expect(canonicalizeLeaf(withNulls)).toContain('"profitLossPercent":null');
    expect(hashLeaf(canonicalizeLeaf(withNulls))).toBe(hashLeaf(canonicalizeLeaf({ ...withNulls })));
  });
});
