# Inventario de armazenamento

Gerado por `scripts/audit-storage.py`. Classificacao conservadora: familias dinamicas e configuracoes nunca autorizam limpeza por nome. Todas as chamadas estao no JSON local `local-test/storage-audit.json`.

| Chave/familia | Classe | Produtores e consumidores |
|---|---|---|
| `eas-tw-hub:` | estado ativo/configuracao; sem limpeza automatica | core/storage.js |
| `eas-tw-hub:farm.mass.execution` | estado ativo | index.js |
| `eas_data_navigation_count` | log/diagnostico | core/game-data.js |
| `eas_image_trace_navigation_count` | log/diagnostico | core/image-trace.js |
| `eas_tactical_preparation_context` | seguranca/reconciliacao (inclui estado ativo) | index.js, services/tactical-operation-scheduler-adapter.js |
| `eas_tw_arrival_consumed:${mission.world}:${mission.playerId}:${mission.id}:${mission.attemptId}` | seguranca/reconciliacao (inclui estado ativo) | services/arrival-execution.js |
| `eas_tw_attack_preparation_context` | seguranca/reconciliacao (inclui estado ativo) | services/attack-preparation.js |
| `eas_tw_attack_preparation_logs` | log/diagnostico | services/attack-preparation.js |
| `eas_tw_attack_timezone_japan` | estado ativo/configuracao; sem limpeza automatica | modules/attack.js, modules/fakes.js, modules/support.js |
| `eas_tw_diagnostics_v1` | log/diagnostico | core/logger.js |
| `eas_tw_fake_anti_snipe_execution` | estado ativo | services/fakes-execution.js |
| `eas_tw_fake_nt_execution` | estado ativo | services/fakes-execution.js |
| `eas_tw_fakes_execution` | estado ativo | core/logger.js, core/rate-limit.js, eas-tw-loader.user.js, index.js, services/fakes-execution.js |
| `eas_tw_fakes_execution_summary` | resultado temporario; legado protegido ate revisao | services/fakes-execution.js |
| `eas_tw_incoming_v1:${scope()}` | estado ativo/configuracao; sem limpeza automatica | services/incoming-store.js |
| `eas_tw_incoming_v1:${scope}` | estado ativo/configuracao; sem limpeza automatica | index.js |
| `eas_tw_market_balance_auxiliary` | estado ativo/configuracao; sem limpeza automatica | services/market-balance-execution.js |
| `eas_tw_market_balance_config` | estado ativo/configuracao; sem limpeza automatica | modules/market-balance.js |
| `eas_tw_market_balance_execution` | estado ativo | index.js, services/market-balance-execution.js |
| `eas_tw_market_balance_history` | seguranca/reconciliacao: leitor usa para deduplicacao de transportes | services/market-balance-execution.js |
| `eas_tw_market_cache` | cache | core/storage.js, services/market-engine.js |
| `eas_tw_market_execution_window` | estado ativo/configuracao; sem limpeza automatica | services/market-offers-execution.js |
| `eas_tw_market_offers_analysis` | cache | modules/market-smart-offers.js |
| `eas_tw_market_offers_archive:` | resultado temporario; legado protegido ate revisao | services/market-offers-execution.js |
| `eas_tw_market_offers_config` | estado ativo/configuracao; sem limpeza automatica | modules/market-smart-offers.js, services/market-offers-execution.js |
| `eas_tw_market_offers_debug` | log/diagnostico | core/ui.js, services/market-offers-execution.js |
| `eas_tw_market_offers_debug_log` | log/diagnostico | services/market-offers-execution.js |
| `eas_tw_market_offers_execution` | estado ativo | index.js, services/market-offers-execution.js |
| `eas_tw_market_offers_history` | resultado temporario; legado protegido ate revisao | modules/market-smart-offers.js, services/market-offers-execution.js |
| `eas_tw_market_target_execution_window` | seguranca/reconciliacao (inclui estado ativo) | services/market-target-execution.js |
| `eas_tw_market_target_history` | seguranca/reconciliacao: leitor usa para deduplicacao de transportes | services/market-target-execution.js |
| `eas_tw_market_target_supply_config` | seguranca/reconciliacao (inclui estado ativo) | modules/market-target-supply.js |
| `eas_tw_market_target_supply_execution` | seguranca/reconciliacao (inclui estado ativo) | index.js, services/market-target-execution.js |
| `eas_tw_perf_debug` | log/diagnostico | core/utils.js |
| `eas_tw_place_target_` | seguranca/reconciliacao (inclui estado ativo) | services/place.js |
| `eas_tw_scheduled_mission_last_sync` | estado ativo/configuracao; sem limpeza automatica | services/scheduled-mission-execution.js |
| `eas_tw_scheduled_mission_tab_context` | estado ativo/configuracao; sem limpeza automatica | index.js, services/scheduled-mission-execution.js |
| `eas_tw_scheduler` | seguranca/reconciliacao (inclui estado ativo) | eas-tw-loader.user.js, services/mission-scheduler.js |
| `eas_tw_scheduler_v2` | seguranca/reconciliacao (inclui estado ativo) | eas-tw-loader.user.js, services/mission-scheduler.js |
| `eas_tw_support_config` | estado ativo/configuracao; sem limpeza automatica | modules/support.js |
| `eas_tw_support_execution` | estado ativo | services/support-execution.js |
| `eas_tw_support_planner` | estado ativo/configuracao; sem limpeza automatica | modules/support.js |
| `eas_tw_tactical_consumed:${contextKey()}:${unit.executionId}:${unit.executionUnitId}` | seguranca/reconciliacao (inclui estado ativo) | services/tactical-operation-scheduler-adapter.js |
| `eas_tw_tactical_consumed:${scope}:${execution.executionId}:${unit.executionUnitId}` | seguranca/reconciliacao (inclui estado ativo) | core/storage.js |
| `eas_tw_tactical_consumed:${scope}:${executionId}:${unit.executionUnitId}` | seguranca/reconciliacao (inclui estado ativo) | services/tactical-operation-scheduler-adapter.js |
| `eas_tw_tactical_operation_drafts_v1` | seguranca/reconciliacao (inclui estado ativo) | services/tactical-operation-drafts.js |
| `eas_tw_tactical_preflight_diagnostics_v1` | log/diagnostico | services/tactical-operation-scheduler-adapter.js |
| `eas_tw_tactical_scheduler_v1` | seguranca/reconciliacao (inclui estado ativo) | index.js, services/tactical-operation-scheduler-adapter.js |
| `eas_tw_tactical_tick_diagnostic_v1` | log/diagnostico | services/tactical-operation-scheduler-adapter.js |
| `eas_tw_target_` | seguranca/reconciliacao (inclui estado ativo) | services/place.js |
| `eas_tw_world_rules` | estado ativo/configuracao; sem limpeza automatica | core/world-rules.js |
| `farm.mass.execution` | estado ativo | services/mass-farm-execution.js |
| `farm.mass.history` | resultado temporario; legado protegido ate revisao | services/mass-farm-execution.js |
| `floating-panel` | estado ativo/configuracao; sem limpeza automatica | core/floating-panel.js |
| `groups.state` | cache | core/groups.js |
| `modules.attack` | estado ativo/configuracao; sem limpeza automatica | modules/attack.js |
| `runtime.logs` | log/diagnostico | core/observability.js |
| `runtime.usage` | log/diagnostico | core/observability.js |
| `troop-counter.settings` | estado ativo/configuracao; sem limpeza automatica | modules/troop-counter.js |
| `troops.available` | cache | core/troops.js, core/villages.js |
| `villages.list` | cache | core/villages.js |
| `villages.state` | cache | core/villages.js |
