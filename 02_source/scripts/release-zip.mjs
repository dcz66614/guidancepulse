// Shared deterministic ZIP helpers for the P025 T014 release scripts.
//
// Writer: STORE (no compression), fixed DOS timestamp 1980-01-01
// 00:00:00, entries sorted by path. Output depends only on the entry
// paths + bytes, never on file mtimes, so re-running release:build
// from the same frozen commit produces a byte-identical zip.
//
// Reader: parses the central directory and supports method 0 (STORE)
// and method 8 (DEFLATE, via node:zlib) — git archive emits DEFLATE
// entries, so release:verify needs both to compare source.zip against
// the frozen file list. CRC-32 is verified on every entry.
//
// Adapted from the P023 T014 release scripts (same factory, same
// determinism contract); this module holds no release policy (no
// frozen commit, no paths); release-build.mjs and release-verify.mjs
// own their constants.

import { inflateRawSync } from "node:zlib";

const DOS_DATE_1980_01_01 = 0x0021; // ((1980 - 1980) << 9) | (1 << 5) | 1
const DOS_TIME_MIDNIGHT = 0x0000;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// entries: [{ path, data: Buffer, mode?: number }] (paths use "/"
// separators). `mode` is the full st_mode including file-type bits
// (e.g. 0o100644, 0o100755, 0o40755); it is stored in the central
// directory's external attributes with the Unix creator version, so
// `unzip` restores the executable bit (bin/guidancepulse MUST stay
// +x after extraction). Defaults: 0o100644 for files, 0o40755 for
// directories (path ending in "/").
// Returns the complete .zip file as a Buffer.
export function writeZip(entries) {
  const sorted = [...entries].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const { path, data, mode } of sorted) {
    const isDir = path.endsWith("/");
    const stMode = mode ?? (isDir ? 0o40755 : 0o100644);
    const name = Buffer.from(path, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed to extract
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method: STORE
    local.writeUInt16LE(DOS_TIME_MIDNIGHT, 10);
    local.writeUInt16LE(DOS_DATE_1980_01_01, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); // compressed size == size
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // extra length
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4); // version made by: Unix (3), 2.0
    central.writeUInt16LE(20, 6); // version needed to extract
    central.writeUInt16LE(0, 8); // flags
    central.writeUInt16LE(0, 10); // method: STORE
    central.writeUInt16LE(DOS_TIME_MIDNIGHT, 12);
    central.writeUInt16LE(DOS_DATE_1980_01_01, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk number start
    central.writeUInt16LE(0, 36); // internal attributes
    central.writeUInt32LE(((stMode & 0xffff) << 16) >>> 0, 38); // external attributes: Unix mode (>>> 0: << yields signed int32, writeUInt32LE needs unsigned)
    central.writeUInt32LE(offset, 42); // local header offset
    centralParts.push(central, name);

    offset += 30 + name.length + data.length;
  }
  const centralDir = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4); // disk number
  end.writeUInt16LE(0, 6); // central-dir disk
  end.writeUInt16LE(sorted.length, 8);
  end.writeUInt16LE(sorted.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // comment length
  return Buffer.concat([...localParts, centralDir, end]);
}

// Parses a .zip buffer. Returns [{ path, data: Buffer, mode }] in
// zip order (directory entries — path ending in "/" — map to an
// empty Buffer). `mode` is the Unix st_mode from the central
// directory's external attributes (e.g. 0o100644 / 0o100755 /
// 0o40755), or null when the entry carries no Unix mode (creator
// is not Unix, or the stored mode is 0). Throws on any structural
// problem, unsupported method/flag, size mismatch or CRC mismatch.
export function readZipEntries(buf) {
  // Find the end-of-central-directory record (last 64 KiB + 22 bytes).
  let eocd = -1;
  const scanStart = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= scanStart; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error("zip: end-of-central-directory record not found");
  const totalEntries = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (cdOffset + cdSize > buf.length) {
    throw new Error("zip: central directory extends past end of file");
  }

  const out = [];
  let p = cdOffset;
  for (let n = 0; n < totalEntries; n += 1) {
    if (buf.readUInt32LE(p) !== 0x02014b50) {
      throw new Error(`zip: bad central-directory signature at entry ${n}`);
    }
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const compressedSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    // External attributes (offset 38): high 16 bits hold the Unix
    // st_mode when the version-made-by creator (offset 4, high
    // byte) is Unix (3). R1-P2-02: verify reads the launcher mode
    // from here instead of trusting the filesystem after unzip.
    const madeBy = buf.readUInt16LE(p + 4);
    const extAttr = buf.readUInt32LE(p + 38);
    const storedMode = (extAttr >>> 16) & 0xffff;
    const mode = (madeBy >> 8) === 3 && storedMode !== 0 ? storedMode : null;
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    if (flags & 0x0001) throw new Error(`zip: encrypted entry not supported: ${name}`);
    if (method !== 0 && method !== 8) {
      throw new Error(`zip: unsupported compression method ${method}: ${name}`);
    }
    if (buf.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error(`zip: bad local header for entry: ${name}`);
    }
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compressedSize);
    if (raw.length !== compressedSize) {
      throw new Error(`zip: truncated entry data: ${name}`);
    }
    const data = method === 0 ? Buffer.from(raw) : inflateRawSync(raw);
    if (data.length !== size) {
      throw new Error(`zip: size mismatch for entry: ${name}`);
    }
    if (crc32(data) !== crc) {
      throw new Error(`zip: CRC-32 mismatch for entry: ${name}`);
    }
    if (out.some((e) => e.path === name)) throw new Error(`zip: duplicate entry: ${name}`);
    out.push({ path: name, data, mode });
  }
  return out;
}

// Parses a .zip buffer. Returns Map<path, Buffer> (entry order = zip
// order). Directory entries (path ending in "/") map to an empty
// Buffer. Same validation as readZipEntries; see that function for
// the entry-mode extension (R1-P2-02).
export function readZip(buf) {
  const out = new Map();
  for (const { path, data } of readZipEntries(buf)) out.set(path, data);
  return out;
}
