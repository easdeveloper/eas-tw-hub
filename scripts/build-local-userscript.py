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
    digest = hashlib.sha256((Path(__file__).read_text(encoding='utf-8') + loader + json.dumps(files, sort_keys=True, ensure_ascii=True)).encode()).hexdigest()[:16]
    build_id = 'local-' + digest
    loader = loader.replace('// @name         EAS TW Hub Loader', '// @name         EAS TW Hub LOCAL validation')
    header_end = loader.index('// ==/UserScript==') + len('// ==/UserScript==')
    # Static factories run in the page realm, with no eval/Function or JS blobs.
    import re
    header = loader[:header_end]
    header = re.sub(r'^// @grant.*\n', '', header, flags=re.M)
    header = header.replace('// ==/UserScript==', '// @grant        none\n// @inject-into  page\n// ==/UserScript==')
    setup = '\n;(() => {\nif (window.EASLocalBuild) return;\nconst factories = {\n'
    for path, content in files.items():
        if path.endswith('.js'):
            setup += json.dumps(path) + ': function(EAS, EASLoader) {\n// EAS_SOURCE_BEGIN ' + path + '\n' + content + '\n// EAS_SOURCE_END ' + path + '\n},\n'
    setup += '};\nconst pending = new Map();\n'
    setup += 'window.EASLocalBuild = { id: ' + json.dumps(build_id) + ', assetHashes: ' + json.dumps({k: hashlib.sha256(v.encode('utf-8')).hexdigest() for k,v in files.items()}, sort_keys=True) + ', files: ' + json.dumps({k:v for k,v in files.items() if k.endswith('.css')}, ensure_ascii=True) + ''',
execute(asset, { reason = 'direct-embedded-request' } = {}) {
    if (pending.has(asset)) { window.__EASLoaderTrace?.('deduplicated', { asset, reason: 'factory-already-requested' }); return pending.get(asset); }
    const promise = Promise.resolve().then(() => {
        if (!Object.prototype.hasOwnProperty.call(factories, asset)) throw new Error(`Local build asset missing: ${asset}`);
        window.__EASLoaderTrace?.('factory-executed', { asset, reason, transport: 'embedded-static-function' });
        return factories[asset](window.EAS, window.EASLoader);
    }).then(value => {
        window.__EASLoaderTrace?.('script-loaded', { asset, reason, transport: 'embedded-static-function' });
        return value;
    }, error => {
        window.__EASLoaderTrace?.('script-error', { asset, reason, message: String(error?.message || error), transport: 'embedded-static-function' });
        throw error;
    });
    pending.set(asset, promise);
    return promise;
}
};
})();
'''
    output = ROOT / 'local-test'
    output.mkdir(exist_ok=True)
    target = output / 'eas-tw-local.user.js'
    prelude = '\n'.join(files[name] for name in ['core/loader-diagnostics.js', 'core/logger.js', 'core/rate-limit.js', 'core/image-trace.js'])
    target.write_text(header + setup + prelude + '\n' + loader[header_end:], encoding='utf-8')
    info = {'buildId': build_id, 'source': 'local-embedded', 'assets': len(files), 'sha256': hashlib.sha256(target.read_bytes()).hexdigest()}
    (output / 'build-info.json').write_text(json.dumps(info, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'file': str(target), **info}, indent=2))

if __name__ == '__main__':
    build()
