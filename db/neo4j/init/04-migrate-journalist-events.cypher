// Migration: collapse legacy event_type/sub_type variants into the single
// canonical "Journalist Killing" value used by the frontend dropdown.
//
// Historical state:
//   - The fej001 ingest tool used to write event_type="Killing", sub_type="Journalist".
//   - The hand-written seed (03-journalists.cypher) writes both as "Journalist Killing".
// The frontend's "Journalist Killing" view only matches the latter, so any rows
// with the old values become invisible. This script normalises everything.
//
// Idempotent: safe to re-run.
MATCH (e:Event)
WHERE e.sub_type = "Journalist" OR e.event_type = "Killing"
SET e.event_type = "Journalist Killing",
    e.sub_type   = "Journalist Killing";
