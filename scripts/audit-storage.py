"""Read-only inventory of storage call sites and generated userscript bytes."""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
paths = [ROOT / 'index.js', ROOT / 'eas-tw-loader.user.js']
paths += sorted(p for folder in ('core', 'services', 'modules') for p in (ROOT / folder).rglob('*.js'))
calls, keys = [], {}
for path in paths:
    source = path.read_text(encoding='utf-8')
    relative = path.relative_to(ROOT).as_posix()
    for line_no, line in enumerate(source.splitlines(), 1):
        if re.search(r'(?:localStorage|sessionStorage|GM_getValue|GM_setValue|GM_deleteValue|EAS\.Storage)', line):
            calls.append({'file': relative, 'line': line_no, 'kind': 'GM' if 'GM_' in line else 'sessionStorage' if 'sessionStorage' in line else 'localStorage/EAS.Storage', 'source': line})
    declared = re.findall(r"\b[A-Z_]*(?:KEY|PREFIX)[A-Z_]*\s*=\s*['\"`]([^'\"`\n]+)['\"`]", source)
    declared += re.findall(r"(?:\bkey\s*=|=>)\s*['\"`]((?:eas[_-]|runtime\.|farm\.mass\.|villages\.|troops\.|groups\.)[^'\"`\n]+)['\"`]", source)
    literal_calls = re.findall(r"(?:getItem|setItem|removeItem|GM_getValue|GM_setValue|GM_deleteValue|Storage\.(?:get|set|remove))(?:\?\.)?\(\s*['\"`]([^'\"`\n]+)['\"`]", source)
    for key in declared + literal_calls:
        keys.setdefault(key, set()).add(relative)

def classify(key):
    if key in ('eas_tw_market_balance_history', 'eas_tw_market_target_history'):
        return 'seguranca/reconciliacao: leitor usa para deduplicacao de transportes'
    if any(word in key for word in ('consumed', 'authorization', 'attempt', 'preparation_context', 'place_target', 'scheduler', 'drafts', 'target_')):
        return 'seguranca/reconciliacao (inclui estado ativo)'
    if 'execution' in key and not any(word in key for word in ('summary', 'window')):
        return 'estado ativo'
    if any(word in key for word in ('archive', 'summary', 'history')):
        return 'resultado temporario; legado protegido ate revisao'
    if any(word in key for word in ('log', 'diagnostic', 'debug', 'runtime.usage', 'navigation_count')):
        return 'log/diagnostico'
    if any(word in key for word in ('cache', 'analysis', 'villages.', 'troops.', 'groups.')):
        return 'cache'
    return 'estado ativo/configuracao; sem limpeza automatica'

inventory = {'scope': 'Source call sites, constants and literal key families; dynamic identifiers remain explicitly listed by call site.',
             'callSites': calls, 'keyFamilies': [{'key': k, 'classification': classify(k), 'files': sorted(v)} for k,v in sorted(keys.items())]}
output = ROOT / 'local-test'
(output / 'storage-audit.json').write_text(json.dumps(inventory, ensure_ascii=False, indent=2), encoding='utf-8')
lines = ['# Inventario de armazenamento', '', 'Gerado por `scripts/audit-storage.py`. Classificacao conservadora: familias dinamicas e configuracoes nunca autorizam limpeza por nome. Todas as chamadas estao no JSON local `local-test/storage-audit.json`.', '', '| Chave/familia | Classe | Produtores e consumidores |', '|---|---|---|']
lines += [f"| `{row['key']}` | {row['classification']} | {', '.join(row['files'])} |" for row in inventory['keyFamilies']]
(ROOT / 'docs/storage-audit-inventory.md').write_text('\n'.join(lines)+'\n', encoding='utf-8')

target = output / 'eas-tw-local.user.js'
if target.exists():
    js = [(p, p.read_text(encoding='utf-8').encode('utf-8')) for p in paths if p.name != 'eas-tw-loader.user.js']
    css = sum(len(p.read_text(encoding='utf-8').encode('utf-8')) for p in (ROOT / 'css').rglob('*.css'))
    prelude = sum(len((ROOT / name).read_text(encoding='utf-8').encode('utf-8')) for name in ('core/loader-diagnostics.js', 'core/logger.js', 'core/rate-limit.js', 'core/image-trace.js'))
    counts = {folder: sum(len(data) for p,data in js if p.relative_to(ROOT).parts[0] == folder) for folder in ('core', 'services', 'modules')}
    size = {'totalGeneratedBytes': target.stat().st_size, 'sourceJsBytes': sum(len(data) for _,data in js), 'sourceCssBytes': css,
            'sourceBreakdownBytes': counts, 'indexBytes': len((ROOT/'index.js').read_text(encoding='utf-8').encode('utf-8')),
            'knownDuplicatedPreludeSourceBytes': prelude, 'externalBundledDependencyBytes': 0,
            'note': 'Prelude contains four diagnostics/guards both outside and inside factories. Generated overhead includes escaped CSS, loader, factories, hashes and metadata. No third-party vendored JS is embedded; test-deps is outside build.',
            'loaderSourceBytes': len((ROOT/'eas-tw-loader.user.js').read_text(encoding='utf-8').encode('utf-8')),
            'identicalSourceFiles': []}
    hashes = {}
    for p,data in js: hashes.setdefault(hashlib.sha256(data).hexdigest(), []).append(p.relative_to(ROOT).as_posix())
    size['identicalSourceFiles'] = [v for v in hashes.values() if len(v)>1]
    size['identicalSourceRedundancyBytes'] = sum(len((ROOT/v[0]).read_text(encoding='utf-8').encode('utf-8'))*(len(v)-1) for v in size['identicalSourceFiles'])
    size['generatedOverheadBytes'] = size['totalGeneratedBytes']-size['sourceJsBytes']-css-prelude-size['loaderSourceBytes']
    (output/'userscript-size-audit.json').write_text(json.dumps(size, indent=2), encoding='utf-8')
    print(json.dumps({'storageCallSites': len(calls), 'literalKeyFamilies': len(keys), **size}, indent=2))
