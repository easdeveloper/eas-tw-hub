(() => {
    'use strict';
    if (EAS.IncomingParser) return;
    const incomplete = reasonCode => { const error = Error('INCOMING_INCOMPLETE_PAGE'); error.reasonCode = reasonCode; throw error; };
    const units = ['spear', 'sword', 'axe', 'archer', 'spy', 'light', 'marcher', 'heavy', 'ram', 'catapult', 'knight', 'snob'];
    const id = value => /^\d+$/.test(String(value || '')) ? String(value).replace(/^0+(?=\d)/, '') : null;
    const coordinate = text => {
        const matches = [...String(text).matchAll(/\((\d{1,3})\|(\d{1,3})\)/g)];
        return matches.length === 1 ? `${+matches[0][1]}|${+matches[0][2]}` : null;
    };
    const own = (row, selector) => [...row.querySelectorAll(selector)].filter(node => node.closest('tr') === row);
    const linkData = (row, screen, key, base) => {
        const links = own(row, 'a[href]').map(node => ({ node, url: new URL(node.getAttribute('href'), base) }))
            .filter(({ url }) => url.origin === new URL(base).origin && url.searchParams.get('screen') === screen);
        if (links.length !== 1) throw Error('INCOMING_VILLAGE_OR_PLAYER_AMBIGUOUS');
        const { node, url } = links[0], identity = id(url.searchParams.get(key));
        if (!identity) throw Error('INCOMING_ID_MISSING');
        return { id: identity, name: node.textContent.trim().slice(0, 200), coords: coordinate(node.textContent) };
    };
    const parseRow = (row, base = location.href) => {
        const canonical = own(row, 'input[name^="command_ids["]').map(node => id(/^command_ids\[(\d+)\]$/.exec(node.name)?.[1]));
        if (canonical.length !== 1 || !canonical[0]) throw Error('INCOMING_CANONICAL_ID_MISSING');
        const commandId = canonical[0];
        const types = own(row, '[data-command-type]').map(node => node.dataset.commandType);
        if (types.some(type => type !== 'attack')) incomplete('COMMAND_TYPE_CONFLICT');
        const evidence = [...own(row, '.quickedit[data-id]').map(node => id(node.dataset.id)),
            ...own(row, '[data-command-id]').map(node => id(node.dataset.commandId))];
        const commands = own(row, 'a[href*="info_command"]').map(node => new URL(node.getAttribute('href'), base));
        if (!commands.length || commands.some(url => url.origin !== new URL(base).origin || url.searchParams.get('screen') !== 'info_command' || url.searchParams.get('type') !== 'other')) throw Error('INCOMING_OWNERSHIP_MISMATCH');
        evidence.push(...commands.map(url => id(url.searchParams.get('id'))));
        if (evidence.some(value => value !== commandId)) throw Error('INCOMING_ID_CONFLICT');
        const target = linkData(row, 'overview', 'village', base), source = linkData(row, 'info_village', 'id', base), attacker = linkData(row, 'info_player', 'id', base);
        if (!target.coords || !source.coords) throw Error('INCOMING_COORDINATES_MISSING');
        const cells = [...row.cells];
        const distanceCell = cells[cells.indexOf(own(row, 'a[href*="info_player"]')[0]?.closest('td')) + 1];
        const distance = Number(distanceCell?.textContent.trim().replace(',', '.'));
        if (!Number.isFinite(distance) || distance <= 0) throw Error('INCOMING_DISTANCE_MISSING');
        const dates = cells.map(cell => cell.textContent.trim().replace(/(\d{1,2}:\d{2}:\d{2})[:.]\s*(\d{3})/, '$1:$2')).flatMap(text => {
            try { return [{ value: +EAS.MassSnipeExecution.getLandingTime(EAS.MassSnipeExecution.parseArrival(text)), text }]; } catch { return []; }
        });
        if (dates.length !== 1) throw Error('INCOMING_ARRIVAL_AMBIGUOUS');
        const images = own(row, '[data-command-id] img[src]');
        const assets = images.map(node => ({ path: new URL(node.getAttribute('src'), base).pathname, title: node.closest('[data-command-id]').getAttribute('data-icon-hint') || node.closest('[data-command-id]').getAttribute('data-title') || '' }));
        const sizes = assets.flatMap(asset => { const match = /\/command\/attack_(small|medium|large)\.(?:webp|png)/.exec(asset.path); return match ? [{ key: match[1], title: asset.title.slice(0, 150), source: 'game' }] : []; });
        const detectedUnits = [...new Set(assets.flatMap(asset => { const match = /\/unit\/tiny\/([a-z]+)\.(?:webp|png)/.exec(asset.path); return match && units.includes(match[1]) ? [match[1]] : []; }))];
        const watchCell = cells.at(-1), watchText = watchCell?.textContent.trim() || '';
        const countdown = /^(\d+):([0-5]\d):([0-5]\d)$/.exec(watchText);
        const watchtower = { state: detectedUnits.length ? 'detected' : /^N\/?A$/i.test(watchText) ? 'not-applicable' : countdown ? 'pending' : /em andamento|in progress/i.test(watchText) ? 'watching' : 'unknown',
            units: detectedUnits, marker: Boolean(own(row, '.commandicon-wt').length), text: watchText.slice(0, 100),
            countdownMs: countdown ? (+countdown[1] * 3600 + +countdown[2] * 60 + +countdown[3]) * 1000 : null };
        return { commandId, commandType: types[0] || null, source, target, attacker, distance, arrivalAt: dates[0].value, arrivalText: dates[0].text,
            name: own(row, '.quickedit-label')[0]?.textContent.trim().slice(0, 200) || '', attackSize: sizes[0] || null, watchtower };
    };
    const parse = (doc, base = location.href) => {
        const page = new URL(base);
        if (page.searchParams.get('screen') !== 'overview_villages' || page.searchParams.get('mode') !== 'incomings' || page.searchParams.get('subtype') !== 'attacks') throw Error('INCOMING_PAGE_MISMATCH');
        if (doc.querySelector('#login_form, form[action*="login"]')) incomplete('LOGIN_PAGE');
        if (doc.querySelector('.error_box')) incomplete('GAME_ERROR');
        // A navigation widget is not itself evidence of missing command pages.
        // Inspect destinations, including relative ?page=N links; unrelated menus
        // must not invalidate an otherwise complete incoming snapshot.
        const currentPage = page.searchParams.get('page') || '0';
        if (currentPage !== '0' && currentPage !== '-1') incomplete('PARTIAL_PAGE_SELECTED');
        for (const node of doc.querySelectorAll('a[href]')) {
            let link; try { link = new URL(node.getAttribute('href'), base); } catch { continue; }
            if (link.origin !== page.origin || link.pathname !== page.pathname || !link.searchParams.has('page')) continue;
            const relevant = ['screen', 'mode', 'subtype'].every(key => !link.searchParams.has(key) || link.searchParams.get(key) === page.searchParams.get(key));
            // BR143 sort headers carry page= too. Only exempt structural table
            // headers with sorting parameters; explicit paging controls win even
            // when their URLs preserve the current sort order.
            const pagingControl = node.closest('.paged-nav, .pagination, [class*="paged-nav-item"]')
                || node.relList.contains('next') || node.relList.contains('prev');
            const sortHeader = node.closest('th, thead, [role="columnheader"]')
                && (link.searchParams.get('order') || link.searchParams.get('dir'));
            if (sortHeader && !pagingControl) continue;
            if (relevant && link.searchParams.get('page') !== currentPage) incomplete('INCOMING_PAGINATION');
        }
        for (const control of doc.querySelectorAll('.paged-nav select option[value]')) {
            if (control.value !== currentPage) incomplete('INCOMING_PAGINATION_CONTROL');
        }
        const inputs = [...doc.querySelectorAll('input[name^="command_ids["]')];
        if (!inputs.length) {
            // BR143 empty attacks overview retains forms, tables and navigation,
            // but no command rows. Counts are layout-dependent, not identifiers.
            const navigation = [...doc.querySelectorAll('a[href]')].some(node => {
                const url = new URL(node.getAttribute('href'), base);
                return url.origin === page.origin && url.searchParams.get('screen') === 'overview_villages'
                    && url.searchParams.get('mode') === 'incomings' && url.searchParams.get('subtype') === 'attacks';
            });
            const orphan = doc.querySelector('[data-command-id], .quickedit[data-id], a[href*="info_command"], input[name^="id_"]');
            if (page.searchParams.get('type') !== 'unignored' || !doc.querySelector('form')
                || !doc.querySelector('table') || !navigation || orphan) incomplete(orphan ? 'ORPHAN_COMMAND_MARKERS' : 'EMPTY_STRUCTURE_MISSING');
            return [];
        }
        const entries = new Map();
        for (const row of new Set(inputs.map(input => input.closest('tr')))) {
            if (!row) throw Error('INCOMING_ROW_MISSING');
            let entry;
            try { entry = parseRow(row, base); } catch (error) { incomplete(error.reasonCode || 'COMMAND_ROW_INVALID'); }
            const previous = entries.get(entry.commandId);
            if (previous && JSON.stringify(previous) !== JSON.stringify(entry)) throw Error('INCOMING_DUPLICATE_CONFLICT');
            entries.set(entry.commandId, entry);
        }
        return [...entries.values()];
    };
    EAS.IncomingParser = { parse, parseRow, coordinate, units };
})();
