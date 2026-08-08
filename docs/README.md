# Documentation index

## Product and architecture

- [Product vision and requirements](PROJECT.md)
- [Architecture](architecture/ARCHITECTURE.md)
- [Repository structure](architecture/REPOSITORY_STRUCTURE.md)
- [Security policy](../SECURITY.md)
- [Data and privacy baseline](privacy/DATA_POLICY.md)
- [Processor and residency matrix](privacy/PROCESSOR_AND_RESIDENCY_MATRIX.md)
- [Testing strategy](TESTING.md)

## Delivery

- [Roadmap](planning/ROADMAP.md)
- [Master action plan](planning/MASTER_ACTION_PLAN.md)
- [Current milestone](planning/CURRENT_MILESTONE.md)
- [Backlog](planning/BACKLOG.md)
- [Definition of Done](planning/DEFINITION_OF_DONE.md)
- [Requirements coverage matrix](planning/REQUIREMENTS_COVERAGE.md)
- [Development runbook](runbooks/DEVELOPMENT.md)
- [A1 recovery and DLQ runbook](runbooks/A1_RECOVERY.md)
- [B1.1 preferences recovery runbook](runbooks/B1_PREFERENCES_RECOVERY.md)
- [B1.2 one-off events recovery runbook](runbooks/B1_EVENTS_RECOVERY.md)
- [B2 reminder delivery recovery runbook](runbooks/B2_REMINDERS_RECOVERY.md)
- [B3 task recovery runbook](runbooks/B3_TASKS_RECOVERY.md)
- [Pre-pilot operational gates](runbooks/PRE_PILOT_OPERATIONS.md)

## Agents and decisions

- [Agent manual](agents/README.md)
- [Orchestration](agents/ORCHESTRATION.md)
- [Task template](agents/TASK_TEMPLATE.md)
- [Handoff protocol](agents/HANDOFF.md)
- [Architecture decisions](decisions/README.md)

## Maintenance rule

Keep durable product truth in these documents, short mandatory rules in `AGENTS.md`, and implementation details next to code. Do not copy the same rule into many files unless the local `AGENTS.md` must enforce it in that scope.
