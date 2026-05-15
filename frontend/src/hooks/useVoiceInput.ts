import { useCallback, useRef, useState } from "react";
import { useAudioRecorder } from "./useAudioRecorder";

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useVoiceInput() {
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef("");
  const onTextRef = useRef<(text: string) => void>(() => {});
  const recorder = useAudioRecorder();

  const stop = useCallback(async () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }
    if (recorder.recording) {
      const text = await recorder.stopRecording();
      if (text) onTextRef.current(text);
    }
  }, [recorder]);

  const start = useCallback(async (onText: (text: string) => void, language = "en-US") => {
    onTextRef.current = onText;
    transcriptRef.current = "";
    const Ctor = recognitionCtor();
    if (!Ctor) {
      await recorder.startRecording();
      return;
    }
    try {
      const recognition = new Ctor();
      recognition.lang = language;
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.onresult = (event) => {
        let text = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          text += event.results[i][0].transcript;
        }
        transcriptRef.current = text.trim();
      };
      recognition.onerror = () => {
        setListening(false);
        setTranscribing(false);
        recognitionRef.current = null;
      };
      recognition.onend = () => {
        setListening(false);
        setTranscribing(false);
        recognitionRef.current = null;
        if (transcriptRef.current) onTextRef.current(transcriptRef.current);
      };
      recognitionRef.current = recognition;
      setListening(true);
      setTranscribing(false);
      recognition.start();
    } catch {
      setListening(false);
      await recorder.startRecording();
    }
  }, [recorder]);

  const toggle = useCallback(async (onText: (text: string) => void, language?: string) => {
    if (listening || recorder.recording) {
      await stop();
    } else {
      await start(onText, language);
    }
  }, [listening, recorder.recording, start, stop]);

  return {
    listening: listening || recorder.recording,
    transcribing: transcribing || recorder.transcribing,
    start,
    stop,
    toggle,
    supported: Boolean(recognitionCtor()) || Boolean(navigator.mediaDevices?.getUserMedia),
  };
}
