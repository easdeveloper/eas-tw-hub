(() => {
    'use strict';
    if (EAS.TacticalOperationData) return;
    let running = false;
    const clone = value => JSON.parse(JSON.stringify(value));
    const coordinate = value => EAS.Utils.parseCoordinate(String(value || ''))?.coordinate || null;
    const log = (event, data) => { try { EAS.Logger?.info?.('TACTICAL', event, data); } catch {} };
    const check = signal => {
        if (signal?.aborted) throw new DOMException('Analysis cancelled', 'AbortError');
        if (window.EASRateLimit?.check()) throw new Error('RATE_LIMITED');
    };
    const pause = signal => new Promise((resolve, reject) => {
        check(signal);
        const finish = () => { signal?.removeEventListener('abort', cancel); resolve(); };
        const timer = setTimeout(finish, 150);
        const cancel = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); reject(new DOMException('Analysis cancelled', 'AbortError')); };
        signal?.addEventListener('abort', cancel, { once: true });
    });
    const conflict = (reason, expected, observed) => { const error = new Error(reason); error.evidence = { expected, observed }; throw error; };
    const resolveTarget = async (input, signal) => {
        const expected = typeof input === 'string' ? { coord: input } : input || {};
        const coord = coordinate(expected.coord ?? expected.coords);
        if (!coord) throw new Error('TARGET_COORDINATE_INVALID');
        check(signal);
        const villages = await EAS.PublicMap.getVillages();
        check(signal);
        const matches = villages.filter(v => coordinate(v.coordinate) === coord);
        if (matches.length !== 1) throw new Error('TARGET_NOT_UNIQUE');
        const village = matches[0];
        if (!/^[1-9]\d*$/.test(String(village.id))) throw new Error('TARGET_ID_UNAVAILABLE');
        let playerName = null, ownerEvidence = null;
        const ownerNameValidation = { status: 'not-supplied', suppliedName: expected.playerName || null, targetPlayerId: village.playerId ?? null };
        if (expected.playerName) {
            ownerNameValidation.status = 'unresolved';
            let owner;
            try { owner = await EAS.PublicMap.findPlayerVillages(expected.playerName); }
            catch (error) {
                if (error.name === 'AbortError' || /RATE_LIMITED/.test(error.message)) throw error;
                Object.assign(ownerNameValidation, { status: 'unresolved', errorCode: 'OWNER_NAME_UNRESOLVED', errorMessage: 'PublicMap could not resolve the supplied player name.' });
            }
            check(signal);
            if (owner) {
                const ownerId = owner.player?.id;
                if (Number.isSafeInteger(ownerId) && ownerId > 0 && Number.isSafeInteger(village.playerId) && ownerId !== village.playerId)
                    conflict('TARGET_OWNER_CONFLICT', { playerName: expected.playerName, resolvedPlayerId: ownerId }, { playerId: village.playerId, villageId: village.id });
                if (Number.isSafeInteger(ownerId) && ownerId > 0 && ownerId === village.playerId &&
                    typeof owner.player?.name === 'string' && owner.player.name.toLocaleLowerCase() === String(expected.playerName).trim().toLocaleLowerCase()) {
                    playerName = owner.player.name; ownerEvidence = owner.updatedAt;
                    ownerNameValidation.status = 'validated';
                } else Object.assign(ownerNameValidation, { status: 'unresolved', errorCode: 'OWNER_NAME_UNPROVEN', errorMessage: 'The lookup did not prove the supplied name and owner ID.' });
            }
        }
        if ((expected.villageId ?? expected.id) != null && String(expected.villageId ?? expected.id) !== String(village.id) ||
            expected.playerId != null && String(expected.playerId) !== String(village.playerId) ||
            expected.name != null && expected.name !== village.name) conflict('TARGET_IDENTITY_CONFLICT', { villageId: expected.villageId ?? expected.id ?? null, playerId: expected.playerId ?? null, name: expected.name ?? null, coord }, { villageId: village.id, playerId: village.playerId ?? null, name: village.name, coord });
        return { villageId: String(village.id), coord, name: village.name || null,
            playerId: village.playerId == null ? null : String(village.playerId), playerName,
            ownership: village.playerId === 0 ? 'unowned' : Number.isSafeInteger(village.playerId) && village.playerId > 0 ? 'owned' : 'unknown',
            points: village.points ?? null, continent: village.continent ?? null, ownerNameValidation,
            warnings: ownerNameValidation.status === 'unresolved' ? ['OWNER_NAME_UNRESOLVED'] : [],
            evidence: { source: 'PublicMap', observedAt: Date.now(), ownerEvidence, freshness: 'public-map-cache-policy', ownershipAuthoritativeNow: false } };
    };
    // Stable, bounded messages deliberately omit raw exceptions, URLs, HTML and tokens.
    const diagnostic = (stage, error) => {
        const code = error?.name === 'AbortError' ? 'ABORTED' : /RATE_LIMITED/.test(error?.message) ? (stage === 'MAP_INFO' ? 'MAP_INFO_RATE_LIMITED' : 'RATE_LIMITED') :
            /^[A-Z_]+$/.test(error?.message) ? error.message : `${stage}_FAILED`;
        return { failureStage: stage, errorCode: code, errorMessage: `${stage}: ${code}. No execution action was performed.` };
    };
    const analyzeTarget = async ({ target, sourceVillageIds, groupId, signal, onProgress } = {}) => {
        if (running) throw new Error('ANALYSIS_ALREADY_RUNNING');
        running = true;
        let stage = 'TARGET_RESOLUTION';
        const result = { status: 'collecting', partial: false, reason: null, target: null, sourcesDiscovered: 0, candidates: [], startedAt: Date.now() };
        try {
            result.target = await resolveTarget(target, signal);
            check(signal);
            stage = 'OWN_VILLAGES_REFRESH';
            await EAS.Data.Villages.ensureFresh({ requestedBy: 'tactical-operation-data', reason: 'explicit-analysis' });
            check(signal);
            stage = 'OWN_VILLAGES_READ';
            let villages = EAS.Data.Villages.getAll();
            if (!Array.isArray(villages)) throw new Error('OWN_VILLAGES_READ_FAILED');
            if (sourceVillageIds != null) {
                if (!Array.isArray(sourceVillageIds)) throw new Error('SOURCE_IDS_INVALID');
                const ids = new Set(sourceVillageIds.map(String));
                if ([...ids].some(id => !villages.some(v => String(v.id) === id))) throw new Error('SOURCE_NOT_OWNED');
                villages = villages.filter(v => ids.has(String(v.id)));
            }
            if (groupId != null && String(groupId) !== 'all') {
                stage = 'GROUP_MEMBERSHIP';
                await EAS.Data.Groups.ensureFresh(); check(signal);
                if (!EAS.Data.Groups.getById(groupId)) throw new Error('GROUP_UNAVAILABLE');
                const ids = new Set((await EAS.Data.Groups.ensureMembership(groupId)).map(String));
                check(signal); villages = villages.filter(v => ids.has(String(v.id)));
            }
            result.sourcesDiscovered = villages.length;
            stage = 'TROOPS_REFRESH';
            let troopError = null;
            try { await EAS.Data.Troops.ensureFresh({ requestedBy: 'tactical-operation-data', reason: 'explicit-analysis' }); }
            catch (error) { if (error.name === 'AbortError' || /RATE_LIMITED/.test(error.message)) throw error; troopError = 'TROOPS_REFRESH_FAILED'; result.failures = [diagnostic(stage, error)]; }
            check(signal);
            stage = 'TROOPS_READ';
            const troops = EAS.Data.Troops.getAll(), info = EAS.Troops.getSourceInfo(), metadata = EAS.Data.Troops.getMetadata();
            const units = EAS.Data.Troops.getUnits();
            result.candidates = villages.map(v => {
                const ownHome = troops[String(v.id)]?.ownHome;
                const complete = info.complete === true && units.length > 0 && units.every(u => info.unitOrder?.includes(u) && Number.isSafeInteger(ownHome?.[u]) && ownHome[u] >= 0);
                const fresh = !troopError && info.stale === false && metadata.stale === false && metadata.confidence === 'high';
                const trusted = info.available === true && complete && fresh;
                const candidate = EAS.TacticalOperationPlanner.normalizeCandidate({ source: { id: String(v.id), coord: v.coordinate, name: v.name },
                    ownHome: ownHome || null, evidence: { trusted, complete, fresh, source: info.source, timestamp: info.updatedAtServer || info.updatedAtLocal || null, sourceInfo: clone(info), metadata: clone(metadata) },
                    eligibility: 'unknown', blockingReasons: trusted ? [] : [troopError || 'TROOP_EVIDENCE_UNAVAILABLE'], warnings: ['MAP_INFO_ORIGIN_NOT_PROVEN', ...result.target.warnings] });
                candidate.snob = trusted && Number.isSafeInteger(ownHome?.snob) ? ownHome.snob : null;
                candidate.mapInfo = { status: 'not-collected', sourceId: String(v.id), originProven: false };
                return candidate;
            });
            stage = 'MAP_INFO';
            for (let i = 0; i < result.candidates.length; i++) {
                check(signal);
                const candidate = result.candidates[i];
                try {
                    const times = await EAS.ArrivalPlanner.mapInfo(candidate.source.id, { id: result.target.villageId, coords: result.target.coord }, signal);
                    check(signal);
                    candidate.travelDurations = Object.fromEntries(Object.entries(times).map(([unit, durationMs]) => [unit,
                        { durationMs, trusted: true, evidence: { source: 'ArrivalPlanner.mapInfo/parseMapInfo', sourceId: candidate.source.id, targetId: result.target.villageId, observedAt: Date.now(), originProven: false, cachePolicy: 'arrival-session-cache' } }]));
                    candidate.mapInfo.status = 'success';
                    candidate.eligibility = candidate.blockingReasons.length ? 'blocked' : 'eligible';
                } catch (error) {
                    Object.assign(candidate.mapInfo, diagnostic(stage, error));
                    candidate.mapInfo.status = 'failed'; candidate.blockingReasons.push('MAP_INFO_FAILED'); candidate.eligibility = 'blocked';
                    if (error.name === 'AbortError' || /RATE_LIMITED/.test(error.message)) throw error;
                }
                log('CANDIDATE', { sourceId: candidate.source.id, status: candidate.eligibility, mapInfo: candidate.mapInfo.status });
                try { onProgress?.({ completed: i + 1, total: result.candidates.length, candidate: clone(candidate) }); } catch { /* Consumer diagnostics cannot stop the queue. */ }
                if (i + 1 < result.candidates.length) await pause(signal);
            }
            result.status = 'complete';
        } catch (error) {
            Object.assign(result, diagnostic(stage, error));
            result.conflictEvidence = error.evidence || null;
            result.partial = true; result.status = error.name === 'AbortError' ? 'aborted' : /RATE_LIMITED/.test(error.message) ? 'rate_limited' : 'blocked';
            // Only known adapter codes are exposed; never raw responses or execution tokens.
            result.reason = result.status === 'aborted' ? 'ABORTED' : result.status === 'rate_limited' ? 'RATE_LIMITED' : /^[A-Z_]+$/.test(error.message) ? error.message : 'DATA_COLLECTION_FAILED';
        } finally { running = false; result.finishedAt = Date.now(); }
        result.partial ||= Boolean(result.failures?.length) || result.candidates.some(c => c.mapInfo.status !== 'success');
        if (!result.errorCode) {
            const failure = result.failures?.[0] || result.candidates.find(c => c.mapInfo.errorCode)?.mapInfo;
            if (failure) Object.assign(result, { failureStage: failure.failureStage, errorCode: failure.errorCode, errorMessage: failure.errorMessage });
        }
        result.summary = { completeTroops: result.candidates.filter(c => c.evidence.trusted).length,
            blockedTroops: result.candidates.filter(c => !c.evidence.trusted).length,
            mapInfoSuccess: result.candidates.filter(c => c.mapInfo.status === 'success').length,
            mapInfoFailed: result.candidates.filter(c => c.mapInfo.status === 'failed').length,
            mapInfoPending: result.candidates.filter(c => c.mapInfo.status === 'not-collected').length };
        log('ANALYSIS_RESULT', { status: result.status, partial: result.partial, ...result.summary });
        return result;
    };
    const diagnoseTarget = async options => {
        const result = await analyzeTarget(options);
        return { status: result.status, partial: result.partial, reason: result.reason, failureStage: result.failureStage || null, errorCode: result.errorCode || null, errorMessage: result.errorMessage || null, conflictEvidence: result.conflictEvidence || null, target: result.target, sourcesDiscovered: result.sourcesDiscovered, ...result.summary,
            sources: result.candidates.map(c => ({ id: c.source.id, coord: c.source.coord, snob: c.snob, eligibility: c.eligibility,
                troopEvidence: { trusted: c.evidence.trusted, complete: c.evidence.complete, fresh: c.evidence.fresh, timestamp: c.evidence.timestamp, source: c.evidence.source },
                availableUnitTypes: Object.keys(c.ownHome || {}).filter(u => c.ownHome[u] > 0), travelDurations: c.travelDurations,
                mapInfo: c.mapInfo, blockingReasons: c.blockingReasons, warnings: c.warnings })) };
    };
    EAS.TacticalOperationData = Object.freeze({ analyzeTarget, diagnoseTarget });
})();
