# Video Agent

Production video generation pipeline for short-form ad reels.

## Image And Video Models

Scene images use Nano Banana Pro through `GEMINI_IMAGE_MODEL=gemini-3-pro-image-preview`.
Scene videos use PixVerse V6 through fal.ai, with a slow Ken Burns fallback if the provider is unavailable.

## Music Fallback

Add royalty-free MP3 files to `assets/music/` for music fallback:

- `professional.mp3`
- `warm.mp3`
- `dramatic.mp3`

Set `FALLBACK_MUSIC_DIR=./assets/music/` in `.env`. If Suno is unavailable and no matching fallback MP3 exists, the pipeline uses silence instead of synthetic sine-wave music.
