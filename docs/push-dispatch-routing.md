# Scheduled push delivery

The shared minute job previously called test-web-push, whose legacy admin_review handler interpreted admin-presence event keys as document IDs. Presence notices reached the inbox but queue dispatch failed.

Route private.test_push_tick to app-web-push. Keep collection, retries, cleanup, credentials lookup and scheduling unchanged. The current dispatcher validates presence task versions, preserves existing document/account/custom reminders, and logs sanitized queue IDs and error codes without subscription URLs or keys.

Verification: active cron, current URL in database, service-role presence task lookup, five existing routing/authentication tests. No test push or presence approval performed.
