# Roadmap

Le fasi sono sequenziali come gate di prodotto. È ammesso preparare una piccola interfaccia per una fase successiva solo quando serve alla vertical slice corrente.

Il flusso utente, le checklist di evidenza e il routing delle task agli agenti sono
nel [master action plan](MASTER_ACTION_PLAN.md). Le sezioni future di quel piano
restano una planning horizon e non autorizzano implementazione anticipata.

## Phase A — Foundation

Stato: completata il 2026-08-08. L'infrastruttura reminder prima chiamata A2 è
stata accorpata alla prima vertical slice reminder della Phase B (ADR-0008).

Repository, Worker, D1 EU, migrations, Telegram webhook, Queue, logging, identità, authorization e idempotenza.

Uscita: una vertical slice riceve un update Telegram fittizio, lo deduplica, lo accoda, mappa/crea l'utente interno, esegue un comando deterministico minimo e produce una risposta osservabile senza AI.

## Phase B — Core Product

Eventi, reminder, task, turni, consuntivi, liste e report base. Introdurre recurrence soltanto quando un caso della fase la richiede.

## Phase C — AI Layer

ActionProposal, adapter OpenRouter, OAuth PKCE, credenziali cifrate, router, estrazione testo e budget. L'intera Phase B deve restare utilizzabile in modalità `NO_AI`.

## Phase D — Voice + Vision

Download Telegram, STT, media transitori, import vision e preview obbligatoria per batch.

## Phase E — Planner

Calcolo finestre libere, vincoli, allocazione deterministica, spiegazione AI opzionale, preview/apply.

## Phase F — Multiuser Sharing

Spazi, membership, ruoli, liste ed eventi condivisi. I dati privati non migrano o diventano visibili implicitamente.

## Phase G — Mini App

Impostazioni, AI, privacy, calendario, export e cancellazione account. Sessioni firmate e brevi, parametri Telegram verificati.

## Phase H — Google Calendar

OAuth least-privilege, sync `EXPORT_ONLY`, retry e conflict logging. Two-way sync resta fuori scope.

## Phase I — Beta Hardening

Security/privacy review, load test, rate limit, benchmark, restore test e runbook incidenti.

## Lavoro futuro

Email, travel mode, home assets, document scanner permanente, location-aware, tempi di viaggio, natural language search storico, payroll assist, health mode, habit tracker e altri canali non entrano nel core prima della beta.
