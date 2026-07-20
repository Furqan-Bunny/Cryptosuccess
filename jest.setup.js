// jsdom does not define TextEncoder/TextDecoder, which viem (used by the merkle /
// anchoring code) relies on. Polyfill from Node's util. Only set if missing.
const { TextEncoder, TextDecoder } = require('util');
if (typeof global.TextEncoder === 'undefined') global.TextEncoder = TextEncoder;
if (typeof global.TextDecoder === 'undefined') global.TextDecoder = TextDecoder;

require('@testing-library/jest-dom');
