# Bass Trainer

A minimal local web app for structured bass practice sessions.

## Quick Start

```bash
docker-compose up
```

Then open: [http://localhost:5173](http://localhost:5173)

## Audio Files

Drop your MP3s into the `audio/` folder before starting:

```
audio/
  rhythm/
    rhythm1.mp3
    rhythm2.mp3
    rhythm3.mp3
    rhythm4.mp3
  improv/
    funk_Am.mp3
    blues_G.mp3
    rock_D.mp3
```

See `audio/README.md` for details. Audio is optional — the app works without it.

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | /programs | List programs |
| GET | /programs/30 | Get 30-min program |
| POST | /session/start | Start a session |
| GET | /health | Health check |

## Stack

- **Backend**: Python + FastAPI
- **Frontend**: React + Vite
- **Docker**: docker-compose
