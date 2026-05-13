import { useState, useRef, useCallback } from "react";
import { API_BASE } from "../api/client";

export function useAudioRecorder() {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setRecording(false);
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<string> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        setRecording(false);
        resolve("");
        return;
      }
      recorder.onstop = async () => {
        setRecording(false);
        setTranscribing(true);
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        recorder.stream.getTracks().forEach((t) => t.stop());

        try {
          const arrayBuf = await blob.arrayBuffer();
          const base64 = btoa(
            new Uint8Array(arrayBuf).reduce((data, byte) => data + String.fromCharCode(byte), "")
          );
          const res = await fetch(`${API_BASE}/stt/transcribe`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audio: base64 }),
          });
          const data = await res.json();

          if (data.fallback === "web-speech-api" || !data.text) {
            setTranscribing(false);
            resolve("");
            return;
          }
          setTranscribing(false);
          resolve(data.text);
        } catch {
          setTranscribing(false);
          resolve("");
        }
      };
      recorder.stop();
    });
  }, []);

  return { recording, transcribing, startRecording, stopRecording };
}
