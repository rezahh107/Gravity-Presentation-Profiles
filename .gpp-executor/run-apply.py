import base64, gzip
from pathlib import Path

raw_parts = []
for path in sorted(Path('.gpp-executor/apply').glob('chunk-*')):
    payload = path.read_text().strip()
    payload += '=' * (-len(payload) % 4)
    raw_parts.append(base64.b64decode(payload, validate=True))

raw = b''.join(raw_parts)
Path('/tmp/apply_entry_vnext.py').write_bytes(gzip.decompress(raw))
