import base64, gzip
from pathlib import Path
parts = [Path(p).read_text().strip() for p in sorted(Path('.gpp-executor/apply').glob('chunk-*'))]
# Each transport chunk was uploaded independently; decode separately so padding/boundary corruption is detectable.
raw = b''.join(base64.b64decode(p, validate=True) for p in parts)
Path('/tmp/apply_entry_vnext.py').write_bytes(gzip.decompress(raw))
