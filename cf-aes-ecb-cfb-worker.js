const BLOCK_SIZE = 16;

export default {
  async fetch(request) {
    if (request.method !== 'POST') {
      return json({ ok: true, usage: { action: 'encrypt|decrypt', mode: 'ECB|CFB', key: '16/24/32 bytes', iv: 'required for CFB', text: 'plaintext or Base64 ciphertext' } });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: 'Invalid JSON' }, 400);
    }

    const { action, mode, key, iv = '', text } = body || {};
    const aesMode = String(mode || '').toUpperCase();
    if (!['encrypt', 'decrypt'].includes(action)) return json({ ok: false, error: 'action must be encrypt or decrypt' }, 400);
    if (!['ECB', 'CFB'].includes(aesMode)) return json({ ok: false, error: 'mode must be ECB or CFB' }, 400);
    if (typeof key !== 'string' || typeof text !== 'string') return json({ ok: false, error: 'key and text must be strings' }, 400);
    if (aesMode === 'CFB' && typeof iv !== 'string') return json({ ok: false, error: 'CFB requires iv' }, 400);

    try {
      const result = action === 'encrypt' ? aesEncrypt(text, key, iv, aesMode) : aesDecrypt(text, key, iv, aesMode);
      return json({ ok: true, result });
    } catch (err) {
      return json({ ok: false, error: err?.message || 'Crypto error' }, 400);
    }
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

function utf8Bytes(str) { return new TextEncoder().encode(str); }
function utf8String(bytes) { return new TextDecoder().decode(bytes); }
function keyBytes(key) {
  const bytes = utf8Bytes(key);
  if (![16, 24, 32].includes(bytes.length)) throw new Error('key length must be 16, 24, or 32 bytes');
  return bytes;
}
function ivBytes(iv) {
  const bytes = utf8Bytes(iv);
  if (bytes.length !== 16) throw new Error('iv length must be 16 bytes');
  return bytes;
}

const SBOX = [99,124,119,123,242,107,111,197,48,1,103,43,254,215,171,118,202,130,201,125,250,89,71,240,173,212,162,175,156,164,114,192,183,253,147,38,54,63,247,204,52,165,229,241,113,216,49,21,4,199,35,195,24,150,5,154,7,18,128,226,235,39,178,117,9,131,44,26,27,110,90,160,82,59,214,179,41,227,47,132,83,209,0,237,32,252,177,91,106,203,190,57,74,76,88,207,208,239,170,251,67,77,51,133,69,249,2,127,80,60,159,168,81,163,64,143,146,157,56,245,188,182,218,33,16,255,243,210,205,12,19,236,95,151,68,23,196,167,126,61,100,93,25,115,96,129,79,220,34,42,144,136,70,238,184,20,222,94,11,219,224,50,58,10,73,6,36,92,194,211,172,98,145,149,228,121,231,200,55,109,141,213,78,169,108,86,244,234,101,122,174,8,186,120,37,46,28,166,180,198,232,221,116,31,75,189,139,138,112,62,181,102,72,3,246,14,97,53,87,185,134,193,29,158,225,248,152,17,105,217,142,148,155,30,135,233,206,85,40,223,140,161,137,13,191,230,66,104,65,153,45,15,176,84,187,22];
const INV_SBOX = (() => { const a = new Uint8Array(256); for (let i = 0; i < 256; i++) a[SBOX[i]] = i; return a; })();
const RCON = [0x00000000,0x01000000,0x02000000,0x04000000,0x08000000,0x10000000,0x20000000,0x40000000,0x80000000,0x1b000000,0x36000000];

function rotWord(w) { return ((w << 8) | (w >>> 24)) >>> 0; }
function subWord(w) { return ((SBOX[(w >>> 24) & 255] << 24) | (SBOX[(w >>> 16) & 255] << 16) | (SBOX[(w >>> 8) & 255] << 8) | SBOX[w & 255]) >>> 0; }
function invSubWord(w) { return ((INV_SBOX[(w >>> 24) & 255] << 24) | (INV_SBOX[(w >>> 16) & 255] << 16) | (INV_SBOX[(w >>> 8) & 255] << 8) | INV_SBOX[w & 255]) >>> 0; }

function expandKey(key) {
  const bytes = keyBytes(key);
  const Nk = bytes.length / 4;
  const Nr = Nk + 6;
  const words = new Uint32Array(4 * (Nr + 1));
  for (let i = 0; i < Nk; i++) words[i] = (bytes[4*i] << 24) | (bytes[4*i+1] << 16) | (bytes[4*i+2] << 8) | bytes[4*i+3];
  for (let i = Nk; i < words.length; i++) {
    let temp = words[i - 1];
    if (i % Nk === 0) temp = subWord(rotWord(temp)) ^ RCON[i / Nk];
    else if (Nk > 6 && i % Nk === 4) temp = subWord(temp);
    words[i] = (words[i - Nk] ^ temp) >>> 0;
  }
  return { words, Nr };
}

function addRoundKey(state, words, round) {
  for (let c = 0; c < 4; c++) {
    const w = words[round * 4 + c];
    state[4*c] ^= (w >>> 24) & 255;
    state[4*c+1] ^= (w >>> 16) & 255;
    state[4*c+2] ^= (w >>> 8) & 255;
    state[4*c+3] ^= w & 255;
  }
}
function subBytes(s) { for (let i = 0; i < 16; i++) s[i] = SBOX[s[i]]; }
function invSubBytes(s) { for (let i = 0; i < 16; i++) s[i] = INV_SBOX[s[i]]; }

function shiftRows(s) { const t = s.slice(); s[1]=t[5]; s[5]=t[9]; s[9]=t[13]; s[13]=t[1]; s[2]=t[10]; s[6]=t[14]; s[10]=t[2]; s[14]=t[6]; s[3]=t[15]; s[7]=t[3]; s[11]=t[7]; s[15]=t[11]; }
function invShiftRows(s) { const t = s.slice(); s[1]=t[13]; s[5]=t[1]; s[9]=t[5]; s[13]=t[9]; s[2]=t[10]; s[6]=t[14]; s[10]=t[2]; s[14]=t[6]; s[3]=t[7]; s[7]=t[11]; s[11]=t[15]; s[15]=t[3]; }

function xtime(a) { return ((a << 1) ^ (((a >> 7) & 1) * 0x1b)) & 255; }
function mul(a, b) { let r = 0; while (b) { if (b & 1) r ^= a; a = xtime(a); b >>>= 1; } return r; }

function mixColumns(s) {
  for (let c = 0; c < 4; c++) {
    const i = 4 * c, a0 = s[i], a1 = s[i+1], a2 = s[i+2], a3 = s[i+3];
    s[i]   = (mul(a0,2) ^ mul(a1,3) ^ a2 ^ a3) & 255;
    s[i+1] = (a0 ^ mul(a1,2) ^ mul(a2,3) ^ a3) & 255;
    s[i+2] = (a0 ^ a1 ^ mul(a2,2) ^ mul(a3,3)) & 255;
    s[i+3] = (mul(a0,3) ^ a1 ^ a2 ^ mul(a3,2)) & 255;
  }
}
function invMixColumns(s) {
  for (let c = 0; c < 4; c++) {
    const i = 4 * c, a0 = s[i], a1 = s[i+1], a2 = s[i+2], a3 = s[i+3];
    s[i]   = (mul(a0,14) ^ mul(a1,11) ^ mul(a2,13) ^ mul(a3,9)) & 255;
    s[i+1] = (mul(a0,9) ^ mul(a1,14) ^ mul(a2,11) ^ mul(a3,13)) & 255;
    s[i+2] = (mul(a0,13) ^ mul(a1,9) ^ mul(a2,14) ^ mul(a3,11)) & 255;
    s[i+3] = (mul(a0,11) ^ mul(a1,13) ^ mul(a2,9) ^ mul(a3,14)) & 255;
  }
}

function encryptBlock(block, schedule) {
  const s = Uint8Array.from(block);
  addRoundKey(s, schedule.words, 0);
  for (let r = 1; r < schedule.Nr; r++) { subBytes(s); shiftRows(s); mixColumns(s); addRoundKey(s, schedule.words, r); }
  subBytes(s); shiftRows(s); addRoundKey(s, schedule.words, schedule.Nr);
  return s;
}

function decryptBlock(block, schedule) {
  const s = Uint8Array.from(block);
  addRoundKey(s, schedule.words, schedule.Nr);
  for (let r = schedule.Nr - 1; r >= 1; r--) { invShiftRows(s); invSubBytes(s); addRoundKey(s, schedule.words, r); invMixColumns(s); }
  invShiftRows(s); invSubBytes(s); addRoundKey(s, schedule.words, 0);
  return s;
}

function padPkcs7(bytes) {
  const pad = BLOCK_SIZE - (bytes.length % BLOCK_SIZE || BLOCK_SIZE);
  const out = new Uint8Array(bytes.length + pad);
  out.set(bytes); out.fill(pad, bytes.length); return out;
}
function unpadPkcs7(bytes) {
  const pad = bytes[bytes.length - 1];
  if (pad < 1 || pad > BLOCK_SIZE) throw new Error('Invalid PKCS7 padding');
  for (let i = bytes.length - pad; i < bytes.length; i++) if (bytes[i] !== pad) throw new Error('Invalid PKCS7 padding');
  return bytes.slice(0, bytes.length - pad);
}
function xorBlock(a, b) { const out = new Uint8Array(16); for (let i = 0; i < 16; i++) out[i] = a[i] ^ b[i]; return out; }
function toBase64(bytes) { let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(bin); }
function fromBase64(text) { const bin = atob(text); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }

function aesEncrypt(text, key, iv, mode) {
  const schedule = expandKey(key);
  const input = padPkcs7(utf8Bytes(text));
  const out = [];
  if (mode === 'ECB') {
    for (let i = 0; i < input.length; i += 16) out.push(...encryptBlock(input.slice(i, i + 16), schedule));
    return toBase64(Uint8Array.from(out));
  }
  let prev = ivBytes(iv);
  for (let i = 0; i < input.length; i += 16) {
    const block = xorBlock(input.slice(i, i + 16), prev);
    const enc = encryptBlock(block, schedule);
    out.push(...enc); prev = enc;
  }
  return toBase64(Uint8Array.from(out));
}

function aesDecrypt(text, key, iv, mode) {
  const schedule = expandKey(key);
  const input = fromBase64(text);
  if (input.length % 16 !== 0) throw new Error('Ciphertext length must be multiple of 16 bytes');
  const out = [];
  if (mode === 'ECB') {
    for (let i = 0; i < input.length; i += 16) out.push(...decryptBlock(input.slice(i, i + 16), schedule));
    return utf8String(unpadPkcs7(Uint8Array.from(out)));
  }
  let prev = ivBytes(iv);
  for (let i = 0; i < input.length; i += 16) {
    const c = input.slice(i, i + 16);
    const p = xorBlock(decryptBlock(c, schedule), prev);
    out.push(...p); prev = c;
  }
  return utf8String(unpadPkcs7(Uint8Array.from(out)));
}
