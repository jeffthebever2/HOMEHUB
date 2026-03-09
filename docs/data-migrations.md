# Data Migrations

## Supabase SQL

Run in Supabase SQL Editor when needed:

```sql
ALTER TABLE chores ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Daily';
ALTER TABLE chores ADD COLUMN IF NOT EXISTS day_of_week INTEGER;
ALTER TABLE chores ADD COLUMN IF NOT EXISTS completed_by_name TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS selected_calendars TEXT[] DEFAULT ARRAY['primary'];
```

## Notes

- Chores are evaluated from timestamps; do not reintroduce scheduled reset routes.
- Treat Tracker currently uses the existing Firebase RTDB schema and is normalized behind the household domain.
- If user settings expand to store additional structured config, document the migration here instead of burying it in README notes.
