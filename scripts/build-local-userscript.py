"""Create a persistent userscript containing this checkout; no remote code fallback."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def build():
    paths = [ROOT / 'index.js']
    for folder, extension in [('core', '*.js'), ('services', '*.js'), ('modules', '*.js'), ('css', '*.css')]:
        paths.extend(sorted((ROOT / folder).rglob(extension)))
    files = {path.relative_to(ROOT).as_posix(): path.read_text(encoding='utf-8') for path in paths}
    loader = (ROOT / 'eas-tw-loader.user.js').read_text(encoding='utf-8')
    digest = hashlib.sha256((loader + json.dumps(files, sort_keys=True, ensure_ascii=True)).encode()).hexdigest()[:16]
    build_id = 'local-' + digest
    loader = loader.replace('// @name         EAS TW Hub Loader', '// @name         EAS TW Hub LOCAL validation')
    header_end = loader.index('// ==/UserScript==') + len('// ==/UserScript==')
    setup = '\n;(() => { const root = typeof unsafeWindow === "undefined" ? window : unsafeWindow; root.EASLocalBuild = ' + json.dumps({'id': build_id, 'files': files}, ensure_ascii=True) + '; })();\n'
    output = ROOT / 'local-test'
    output.mkdir(exist_ok=True)
    target = output / 'eas-tw-local.user.js'
    target.write_text(loader[:header_end] + setup + loader[header_end:], encoding='utf-8')
    info = {'buildId': build_id, 'source': 'local-embedded', 'assets': len(files), 'sha256': hashlib.sha256(target.read_bytes()).hexdigest()}
    (output / 'build-info.json').write_text(json.dumps(info, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'file': str(target), **info}, indent=2))

if __name__ == '__main__':
    build()
