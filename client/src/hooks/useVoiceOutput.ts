/**
 * useVoiceOutput — TTS playback for legacy text-mode auto-speak
 *
 * Used when the user is in text mode and auto-speak is enabled.
 * NOT used by the Deepgram voice agent (which handles TTS internally).
 *
 * Tries /api/tts (Fish Audio) first. Falls back to browser
 * SpeechSynthesis if the server returns an error.
 *
 * Provides: speak(text), speakSentence(text), stop(), isSpeaking
 */

import { useState, useRef, useCallback } from "react";

type QueueItem = {
  text: string;
  controller: AbortController;
};

// ── Browser SpeechSynthesis fallback ────────────────────────────────────

function browserSpeak(text: string): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!window.speechSynthesis) {
      resolve();
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    // Try to pick a natural-sounding English voice
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(
      (v) =>
        v.lang.startsWith("en") &&
        (v.name.includes("Google") ||
          v.name.includes("Samantha") ||
          v.name.includes("Daniel") ||
          v.name.includes("Natural"))
    );
    if (preferred) utterance.voice = preferred;

    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();

    window.speechSynthesis.speak(utterance);
  });
}

function browserSpeakStop() {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

// ── Hook ────────────────────────────────────────────────────────────────

export function useVoiceOutput() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const queueRef = useRef<QueueItem[]>([]);
  const isPlayingRef = useRef(false);
  const stoppedRef = useRef(false);

  const stop = useCallback(() => {
    stoppedRef.current = true;

    // Stop current audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }

    // Abort current fetch
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    // Abort all queued fetches
    for (const item of queueRef.current) {
      item.controller.abort();
    }
    queueRef.current = [];
    isPlayingRef.current = false;

    // Stop browser TTS fallback
    browserSpeakStop();

    setIsSpeaking(false);
  }, []);

  /** Process the next item in the sentence queue */
  const processQueue = useCallback(async () => {
    if (isPlayingRef.current || stoppedRef.current) return;
    if (queueRef.current.length === 0) {
      setIsSpeaking(false);
      return;
    }

    isPlayingRef.current = true;
    setIsSpeaking(true);

    const item = queueRef.current.shift()!;

    try {
      abortRef.current = item.controller;

      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: item.text }),
        signal: item.controller.signal,
      });

      if (!res.ok || stoppedRef.current) {
        // Server TTS failed — use browser fallback
        if (!stoppedRef.current) {
          await browserSpeak(item.text);
        }
        isPlayingRef.current = false;
        if (!stoppedRef.current) processQueue();
        return;
      }

      const blob = await res.blob();
      if (stoppedRef.current) {
        isPlayingRef.current = false;
        return;
      }

      const url = URL.createObjectURL(blob);

      await new Promise<void>((resolve) => {
        const audio = new Audio(url);
        audioRef.current = audio;

        const cleanup = () => {
          URL.revokeObjectURL(url);
          audioRef.current = null;
          isPlayingRef.current = false;
          resolve();
        };

        audio.onended = cleanup;
        audio.onerror = cleanup;

        audio.play().catch(cleanup);
      });

      if (!stoppedRef.current) {
        // Process next sentence in queue
        processQueue();
      }
    } catch (err: any) {
      isPlayingRef.current = false;
      if (err.name !== "AbortError" && !stoppedRef.current) {
        // Fetch failed — try browser fallback
        try {
          await browserSpeak(item.text);
        } catch {}
        processQueue();
      }
    }
  }, []);

  /**
   * Queue a single sentence for TTS playback.
   * First call starts playback immediately; subsequent calls queue up.
   */
  const speakSentence = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      stoppedRef.current = false;

      const controller = new AbortController();
      queueRef.current.push({ text: text.trim(), controller });

      setIsSpeaking(true);

      // If nothing is currently playing, start processing
      if (!isPlayingRef.current) {
        processQueue();
      }
    },
    [processQueue]
  );

  /**
   * Full-text TTS — speaks the entire text as one request.
   * Falls back to browser SpeechSynthesis if server TTS fails.
   */
  const speak = useCallback(
    async (text: string): Promise<void> => {
      stop();
      stoppedRef.current = false;

      try {
        setIsSpeaking(true);
        const controller = new AbortController();
        abortRef.current = controller;

        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error("TTS request failed");
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);

        return new Promise<void>((resolve) => {
          const audio = new Audio(url);
          audioRef.current = audio;

          audio.onended = () => {
            URL.revokeObjectURL(url);
            audioRef.current = null;
            setIsSpeaking(false);
            resolve();
          };

          audio.onerror = () => {
            URL.revokeObjectURL(url);
            audioRef.current = null;
            setIsSpeaking(false);
            resolve();
          };

          audio.play().catch(() => {
            URL.revokeObjectURL(url);
            audioRef.current = null;
            setIsSpeaking(false);
            resolve();
          });
        });
      } catch (err: any) {
        if (err.name !== "AbortError") {
          console.warn("[TTS] Server TTS failed, using browser fallback");
          // Fall back to browser SpeechSynthesis
          try {
            await browserSpeak(text);
          } catch {}
        }
        setIsSpeaking(false);
      }
    },
    [stop]
  );

  return { speak, speakSentence, stop, isSpeaking };
}
