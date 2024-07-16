1. Grab your stalwart access token (Developer Tools > Storage > Session Storage > `webadmin_state`)
2. Get your cloudflare API_KEY
3. Get your cloudflare zone ids for all domains managed by stalwart
4. Fill .env
5. Run `npm run dev`
6. Export all records for each zone on cloudflare! (Just as a backup)
7. Check what changes would be done (missing records will be added, misconfigured will be updated)
8. Click "Sync Records"
