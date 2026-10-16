// Minimal, dependency-light keccak256 Merkle tree used to anchor the daily
// track record and to verify inclusion trustlessly in the browser.
//
// Design: **sorted-pair** hashing (OpenZeppelin MerkleProof style). Because each
// internal node hashes its two children in sorted order, a proof is just the list
// of sibling hashes — no left/right flags — and verification is order-independent.
// Odd levels duplicate the last node (hash it with itself). keccak256 comes from
// viem so leaf hashing matches EVM tooling exactly.

import { keccak256, toBytes, concat, type Hex } from 'viem';

// keccak256 of the UTF-8 bytes of the canonical leaf string.
export function hashLeaf(canonical: string): Hex {
  return keccak256(toBytes(canonical));
}

function hashPair(a: Hex, b: Hex): Hex {
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  const [lo, hi] = al <= bl ? [a, b] : [b, a];
  return keccak256(concat([lo, hi]));
}

// Root of the tree. Single leaf → that leaf. Throws on an empty set (callers must
// never anchor an empty day).
export function computeMerkleRoot(leaves: Hex[]): Hex {
  if (leaves.length === 0) throw new Error('merkle: empty leaf set');
  let level = [...leaves];
  while (level.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i];
      const b = i + 1 < level.length ? level[i + 1] : level[i]; // duplicate last if odd
      next.push(hashPair(a, b));
    }
    level = next;
  }
  return level[0];
}

// Sibling path proving `leaves[index]` is in the tree.
export function computeMerkleProof(leaves: Hex[], index: number): Hex[] {
  if (index < 0 || index >= leaves.length) throw new Error('merkle: index out of range');
  const proof: Hex[] = [];
  let idx = index;
  let level = [...leaves];
  while (level.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i];
      const b = i + 1 < level.length ? level[i + 1] : level[i];
      if (i === idx) proof.push(b);        // node is the left child → sibling is right
      else if (i + 1 === idx) proof.push(a); // node is the right child → sibling is left
      next.push(hashPair(a, b));
    }
    idx = Math.floor(idx / 2);
    level = next;
  }
  return proof;
}

// Fold the leaf up through the sibling path and compare to the root.
export function verifyMerkleProof(leaf: Hex, proof: Hex[], root: Hex): boolean {
  let computed = leaf;
  for (const sibling of proof) computed = hashPair(computed, sibling);
  return computed.toLowerCase() === root.toLowerCase();
}

/**
 * True when a day's stored leaves are exactly the tree that was anchored:
 * `expectedCount` rows (the anchor's leaf_count), sorted by leaf_index, with
 * indices 0..n-1 and no gaps. A proof rebuilt from anything less would not match
 * the on-chain root.
 */
export function isCompleteLeafSet(
  leaves: ReadonlyArray<{ leaf_index: number }>,
  expectedCount: number | null | undefined
): boolean {
  if (typeof expectedCount !== 'number' || !Number.isInteger(expectedCount) || expectedCount <= 0) return false;
  if (leaves.length !== expectedCount) return false;
  return leaves.every((l, i) => l.leaf_index === i);
}
