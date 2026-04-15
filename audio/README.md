# Audio Files

Place your MP3 files in the correct subdirectory.

## Rhythm tracks → `audio/rhythm/`

Expected filenames (from programs.json):

- `rhythm1.mp3`
- `rhythm2.mp3`
- `rhythm3.mp3`
- `rhythm4.mp3`

## Improv backing tracks → `audio/improv/`

Expected filenames (from programs.json):

- `funk_Am.mp3`
- `blues_G.mp3`
- `rock_D.mp3`

## Notes

- Any royalty-free drum loop or backing track will work.
- Files are served as static assets from the frontend container.
- The app will silently skip audio if a file is missing — the timer still runs.
