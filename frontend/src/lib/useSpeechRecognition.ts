"use client";

import * as React from "react";

// The Web Speech API isn't in the default TS DOM lib; declare the minimal
// surface we use. Only Chromium ships it (as webkitSpeechRecognition).
interface SpeechRecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionErrorLike {
  error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeechRecognition(opts: {
  onResult: (text: string, isFinal: boolean) => void;
  onError?: (code: string) => void;
}) {
  const { onResult, onError } = opts;
  // Keep the latest callbacks without re-creating the recognition instance.
  const onResultRef = React.useRef(onResult);
  const onErrorRef = React.useRef(onError);
  onResultRef.current = onResult;
  onErrorRef.current = onError;

  const [supported] = React.useState(() => getCtor() !== null);
  const [listening, setListening] = React.useState(false);
  const recognitionRef = React.useRef<SpeechRecognitionLike | null>(null);

  const stop = React.useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = React.useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor || recognitionRef.current) return;

    const rec = new Ctor();
    rec.lang = typeof navigator !== "undefined" ? navigator.language : "en-US";
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        onResultRef.current(result[0].transcript, result.isFinal);
      }
    };
    rec.onerror = (e) => {
      onErrorRef.current?.(e.error);
    };
    rec.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };

    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }, []);

  // Stop any in-flight recognition on unmount.
  React.useEffect(() => () => recognitionRef.current?.stop(), []);

  return { supported, listening, start, stop };
}
