"""Read-only handoff check. Run from the source root; never restores or executes project code."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / 'docs/handoff-inventory.json').read_text())
if Path.cwd().resolve() != Path(manifest['source_root']).resolve() or root != Path.cwd().resolve():
    print('WRONG WORKSPACE. Expected:', manifest['source_root'])
    print('Actual:', Path.cwd().resolve())
    sys.exit(2)
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
changes = []
if head != manifest['head']:
    changes.append('HEAD changed (inspect; do not reset)')
for name, expected in manifest['files'].items():
    path = root / name
    if not path.resolve().is_relative_to(root) or path.is_symlink():
        changes.append('UNEXPECTED LINK/PATH: ' + name)
    elif not path.is_file():
        changes.append('MISSING: ' + name)
    elif hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        changes.append('CHANGED: ' + name)
paths = subprocess.check_output(['git', 'ls-files', '-co', '--exclude-standard', '-z'], cwd=root).decode().split('\0')
for name in sorted(set(paths) - set(manifest['files'])):
    if name and name != 'docs/handoff-inventory.json' and (name.split('/')[0] in manifest['source_directories'] or name in manifest['root_files']):
        path = root / name
        if path.is_file() and not path.is_symlink() and not path.name.startswith('.env'):
            changes.append('ADDED SINCE HANDOFF: ' + name)
print('Root:', root)
print('HEAD:', head)
print('Files checked:', len(manifest['files']))
if changes:
    print('\n'.join(changes))
    print('Review differences before editing. This is not an instruction to restore files.')
    sys.exit(1)
print('MATCH: source matches handoff inventory. This does not certify security or test results.')
