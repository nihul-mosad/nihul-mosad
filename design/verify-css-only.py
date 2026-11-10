#!/usr/bin/env python3
"""Verify the CSS candidate against its reviewed main baseline, without network access."""
import re
import subprocess
from pathlib import Path

BASE = 'bf023ad9dcc3145c8d50aeb6043f242e2153fb9e'
root = Path(__file__).resolve().parents[1]
def git(*args):
    return subprocess.check_output(['git', '-C', str(root), *args])
base = git('show', BASE + ':index.html')
current = (root / 'index.html').read_bytes()
pattern = rb'<style id="aura-css-only">.*?</style>\n'
assert len(re.findall(pattern, current, re.S)) == 1, 'Expected exactly one design layer'
assert re.sub(pattern, b'', current, flags=re.S) == base, 'Changes outside the CSS layer'
allowed = {'index.html', 'design/verify-css-only.py', 'design/CSS-ONLY-INTEGRATION-REPORT.md'}
changed = set(git('diff', '--name-only', BASE, '--').decode().splitlines())
assert changed <= allowed, 'Unexpected changed files: ' + repr(changed - allowed)
print('PASS: original HTML, JavaScript and original CSS are byte-for-byte unchanged.')
print('PASS: only the isolated CSS layer and review documentation differ from ' + BASE)
