import { describe, test, expect } from 'vitest';
import { inflateRawSync } from 'node:zlib';
import { crc32, createZip } from '../scripts/lib/zip.mjs';

/**
 * Parse the archive well enough to prove a real unzip tool would accept it.
 * Walks local file headers rather than trusting the central directory, so a
 * mismatch between the two shows up as a failure.
 */
function readEntries(zip) {
  const entries = [];
  let offset = 0;

  while (zip.readUInt32LE(offset) === 0x04034b50) {
    const compressedSize = zip.readUInt32LE(offset + 18);
    const uncompressedSize = zip.readUInt32LE(offset + 22);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);

    const name = zip.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    const dataStart = offset + 30 + nameLength + extraLength;
    const data = inflateRawSync(zip.subarray(dataStart, dataStart + compressedSize));

    entries.push({
      name,
      data,
      declaredCrc: zip.readUInt32LE(offset + 14),
      declaredSize: uncompressedSize,
    });
    offset = dataStart + compressedSize;
  }

  return { entries, endOfEntries: offset };
}

describe('crc32', () => {
  test('matches the canonical "123456789" check value', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
  });

  test('is 0 for empty input', () => {
    expect(crc32(Buffer.alloc(0))).toBe(0);
  });

  test('differs for inputs that differ by one bit', () => {
    expect(crc32(Buffer.from('a'))).not.toBe(crc32(Buffer.from('b')));
  });

  test('stays within the unsigned 32-bit range', () => {
    const value = crc32(Buffer.from('cust*m Tab'));
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(0xffffffff);
  });
});

describe('createZip', () => {
  const sample = [
    { name: 'manifest.json', data: Buffer.from('{"manifest_version":3}', 'utf8') },
    { name: 'icons/icon16.png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
    { name: 'newtab.js', data: Buffer.from('x'.repeat(4096), 'utf8') },
  ];

  test('round-trips every entry byte-for-byte', () => {
    const { entries } = readEntries(createZip(sample));

    expect(entries.map((e) => e.name)).toEqual([
      'manifest.json',
      'icons/icon16.png',
      'newtab.js',
    ]);
    for (const [i, entry] of entries.entries()) {
      expect(entry.data.equals(sample[i].data), `${entry.name} payload`).toBe(true);
    }
  });

  test('records a correct CRC and size for each entry', () => {
    const { entries } = readEntries(createZip(sample));

    for (const [i, entry] of entries.entries()) {
      expect(entry.declaredCrc, `${entry.name} crc`).toBe(crc32(sample[i].data));
      expect(entry.declaredSize, `${entry.name} size`).toBe(sample[i].data.length);
    }
  });

  test('ends with a well-formed end-of-central-directory record', () => {
    const zip = createZip(sample);
    const end = zip.length - 22;

    expect(zip.readUInt32LE(end)).toBe(0x06054b50);
    expect(zip.readUInt16LE(end + 8)).toBe(sample.length); // entries on this disk
    expect(zip.readUInt16LE(end + 10)).toBe(sample.length); // entries total
  });

  test('the central directory offset points at the first central header', () => {
    const zip = createZip(sample);
    const end = zip.length - 22;
    const centralOffset = zip.readUInt32LE(end + 16);

    expect(zip.readUInt32LE(centralOffset)).toBe(0x02014b50);
    // It also has to be exactly where the local entries stopped.
    expect(readEntries(zip).endOfEntries).toBe(centralOffset);
  });

  test('normalises Windows path separators to forward slashes', () => {
    const { entries } = readEntries(
      createZip([{ name: 'icons\\icon16.png', data: Buffer.from('x') }])
    );
    expect(entries[0].name).toBe('icons/icon16.png');
  });

  test('is reproducible: the same input yields identical bytes', () => {
    expect(createZip(sample).equals(createZip(sample))).toBe(true);
  });

  test('actually compresses repetitive content', () => {
    const large = [{ name: 'a.txt', data: Buffer.from('ab'.repeat(20000), 'utf8') }];
    expect(createZip(large).length).toBeLessThan(large[0].data.length / 10);
  });

  test('handles an empty archive', () => {
    const zip = createZip([]);
    expect(zip).toHaveLength(22);
    expect(zip.readUInt32LE(0)).toBe(0x06054b50);
  });

  test('handles a zero-byte entry', () => {
    const { entries } = readEntries(
      createZip([{ name: 'empty.txt', data: Buffer.alloc(0) }])
    );
    expect(entries[0].declaredSize).toBe(0);
    expect(entries[0].data).toHaveLength(0);
  });

  test('preserves UTF-8 file names', () => {
    const { entries } = readEntries(
      createZip([{ name: '_locales/de/messages.json', data: Buffer.from('{}') }])
    );
    expect(entries[0].name).toBe('_locales/de/messages.json');
  });
});
