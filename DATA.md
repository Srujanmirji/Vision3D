# Data and storage
Jobs: id, owner_session, status, stage, progress nullable, provider, error_code, created_at, updated_at, model_id. Models: id, owner_session, name, input_key, glb_key, optional usdz_key, byte_size, created_at. Shares: token_hash, model_id, expires_at, revoked_at.

Local filesystem + SQLite for development; optional Supabase Postgres and private object storage for deployment. Use signed asset URLs for AR and scoped access. Random object keys, no original filenames as paths. Delete temporary files after processing. Set configurable retention (proposed 7 days for anonymous assets, 1 hour for share links), disclose retention and external inference. Ensure deletion revokes access and cleans storage. No secrets in browser or logs.
