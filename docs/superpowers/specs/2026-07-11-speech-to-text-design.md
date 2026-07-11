# Speech-to-Text (Voice Dictation) — Design

**Date:** 2026-07-11
**Status:** Approved

## Goal

Let users dictate a message: a mic button in the composer transcribes speech to
text into the message box, which they then edit and send. Frontend-only, using
the browser Web Speech API. No backend, no cost, no deps.

## Non-goals

- No server-side transcription (Whisper).
- No voice/audio message attachments — output is plain text into the composer.
- No language picker (uses the browser default locale).

## Components

### `useSpeechRecognition` hook — `frontend/src/lib/useSpeechRecognition.ts`
- Resolves `window.SpeechRecognition ?? window.webkitSpeechRecognition`.
- Returns `{ supported, listening, start, stop }`.
- Config: `interimResults=true`, `continuous=true`, `lang=navigator.language`.
- Takes `onResult(text: string, isFinal: boolean)` — fires per result chunk;
  the composer appends final chunks to its text.
- Handles `onend` (clears listening), `onerror` (reports code, stops); exposes
  errors via an `onError(code)` callback.
- SSR-safe: `supported=false` when `window` is undefined.

### Composer changes — `frontend/src/components/chat/Composer.tsx`
- Render a **Mic button** (lucide `Mic` / `MicOff`) next to the emoji button,
  only when `supported`.
- Toggle listening on click. While listening: button styled active
  (red/pulse), placeholder shows "Listening…".
- `onResult(text, isFinal)`: when `isFinal`, append `text` (with a leading
  space if the box is non-empty) to `content`, and fire the existing typing
  indicator so the other side sees activity. Interim results may update a
  transient preview but are not required to persist.
- Stop dictation automatically when the message is sent or the conversation
  changes.
- Errors: permission denied / no-speech → toast, stop listening.

## Types

- Minimal ambient typing for the Web Speech API (not in TS DOM lib by default):
  declare `SpeechRecognition`/`webkitSpeechRecognition` on `window` and the
  event/result shapes used, in the hook file.

## Verification

- `tsc --noEmit` + `next build` (compiles, types resolve).
- Live mic requires a real browser (Chrome/Edge) with mic permission — noted as
  a manual check; not automatable in CI.

## Out of scope / future

- Language selection, punctuation commands, push-to-talk hold gesture.
