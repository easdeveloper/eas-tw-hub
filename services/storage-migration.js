// Compatibility entry point. The former lossless V2 archive migration is retired.
(() => {
    const lifecycle = EAS.Storage?.lifecycle;
    EAS.StorageMigration = {
        inspect: () => ({ records: lifecycle?.inspectLegacy?.() || [], policy: 'External backup and explicit authorization required; no V2 archives.' }),
        run: options => lifecycle?.cleanLegacy?.(options) || [{ status: 'BLOCKED', reason: 'LIFECYCLE_UNAVAILABLE' }],
        backupForRecovery: () => lifecycle?.backupLegacy?.()
    };
})();
