(() => {
    'use strict';
    EAS.Modules ||= {};
    const TYPE_LABELS = { available: 'Disponível', own: 'Todas as suas próprias', home: 'Nas aldeias', support: 'Apoios', outside: 'Fora', inTransit: 'Em trânsito' };
    const UNIT_LABELS = { spear: 'Lanceiro', sword: 'Espadachim', axe: 'Machado', archer: 'Arqueiro', spy: 'Explorador', light: 'Cavalaria leve', marcher: 'Arqueiro a cavalo', heavy: 'Cavalaria pesada', ram: 'Aríete', catapult: 'Catapulta', knight: 'Paladino', snob: 'Nobre', militia: 'Milícia' };
    const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const buildExport = ({ groupName, typeLabel, aggregate, generatedAt = new Date() }) => [
        `Grupo,${csvCell(groupName)}`,
        `Tipo,${csvCell(typeLabel)}`,
        `Data/hora,${csvCell(generatedAt.toLocaleString('pt-BR'))}`,
        `Aldeias,${aggregate.villageCount}`,
        '',
        'Unidade,Total',
        ...aggregate.units.map((unit) => `${csvCell(UNIT_LABELS[unit] || unit)},${aggregate.totals[unit] || 0}`)
    ].join('\r\n');
    const download = (text, filename = 'contador-de-tropas.csv') => { const url = URL.createObjectURL(new Blob(['\uFEFF', text], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0); };
    const createSelect = (options) => { const select = document.createElement('select'); select.className = 'eas-input'; options.forEach(({ value, label, disabled = false }) => { const option = new Option(label, value); option.disabled = disabled; select.add(option); }); return select; };

    EAS.Modules.TroopCounter = {
        TYPE_LABELS, UNIT_LABELS, buildExport,
        open: async () => {
            EAS.Usage?.track?.('troops.counter.open');
            await EAS.Data.Villages.ensureFresh();
            const metadata = EAS.Data.Troops.getMetadata();
            if (metadata.stale || !metadata.count) await EAS.Data.Troops.ensureFresh();
            const win = EAS.UI.createWindow({ id: 'eas-troop-counter', title: '🪖 Contador de Tropas', width: 760, className: 'troop-counter-window' });
            const root = document.createElement('div'); root.className = 'troop-counter';
            const groups = EAS.Data.VillageGroups.getAll();
            const groupSelect = createSelect([{ value: 'all', label: 'Todos' }, ...groups.map((group) => ({ value: group.id, label: group.name }))]);
            const supported = new Set(EAS.Data.Troops.getSupportedTypes());
            const typeSelect = createSelect(Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label, disabled: !supported.has(value) })));
            if (!supported.has('available')) typeSelect.value = [...supported][0] || 'available';
            const filters = document.createElement('div'); filters.className = 'troop-counter-filters';
            filters.append(EAS.UI.createField({ label: 'Grupo', input: groupSelect }), EAS.UI.createField({ label: 'Tipo', input: typeSelect }));
            const content = document.createElement('div'); const footer = document.createElement('div'); footer.className = 'troop-counter-footer'; const status = document.createElement('div');
            root.append(filters, content, footer, status); win.body.appendChild(root);
            let lastAggregate = null;
            const render = () => {
                lastAggregate = EAS.Data.Troops.aggregate({ groupId: groupSelect.value, type: typeSelect.value });
                const units = lastAggregate.units;
                content.innerHTML = lastAggregate.supported ? `<div class="eas-table-wrapper"><table class="eas-table troop-counter-table"><thead><tr>${units.map((unit) => `<th title="${EAS.Utils.escapeHtml(UNIT_LABELS[unit] || unit)}"><img src="/graphic/unit/unit_${unit}.png" alt="${EAS.Utils.escapeHtml(UNIT_LABELS[unit] || unit)}"></th>`).join('')}</tr></thead><tbody><tr>${units.map((unit) => `<td>${EAS.Utils.formatNumber(lastAggregate.totals[unit] || 0)}</td>`).join('')}</tr></tbody></table></div>` : `<div class="eas-status eas-status--info">O snapshot atual não contém a dimensão “${EAS.Utils.escapeHtml(TYPE_LABELS[typeSelect.value])}”. Atualize os dados em uma visão de tropas que forneça essa linha.</div>`;
                footer.innerHTML = `<strong>Total de ${lastAggregate.villageCount} aldeias</strong><button class="eas-button" data-export>Exportar</button>`;
                footer.querySelector('[data-export]').onclick = () => { const groupName = groupSelect.options[groupSelect.selectedIndex]?.text || 'Todos'; download(buildExport({ groupName, typeLabel: TYPE_LABELS[typeSelect.value], aggregate: lastAggregate })); };
                status.innerHTML = `<small>Fonte: ${EAS.Utils.escapeHtml(lastAggregate.source)} · cache ${Math.round(lastAggregate.metadata.ageMs / 1000)}s</small>`;
            };
            groupSelect.onchange = render; typeSelect.onchange = render; render();
            return win;
        }
    };
})();
