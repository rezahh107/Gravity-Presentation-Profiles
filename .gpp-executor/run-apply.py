import base64, zlib
from pathlib import Path

raw_parts = []
for path in sorted(Path('.gpp-executor/apply').glob('chunk-*')):
    payload = path.read_text().strip()
    payload += '=' * (-len(payload) % 4)
    raw_parts.append(base64.b64decode(payload, validate=True))

raw = b''.join(raw_parts)
decoder = zlib.decompressobj(16 + zlib.MAX_WBITS)
script = decoder.decompress(raw)
script += decoder.flush()
Path('/tmp/apply_entry_vnext.py').write_bytes(script)
print(f'RECOVERED_EXECUTOR_BYTES={len(script)} EOF={decoder.eof}')
