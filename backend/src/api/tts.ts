import { Router } from "express";
import { execFile } from "child_process";
import { devLog } from "../dev/logs.js";
import { getRequestLanguage } from "../i18n/language.js";
import { getKokoroVoice, getMacosSayVoice } from "./voiceMap.js";

let kokoroInstance: any = null;
let kokoroLoading = false;
let kokoroFailed = false;

async function getKokoro() {
  if (kokoroInstance) return kokoroInstance;
  if (kokoroFailed) return null;
  if (kokoroLoading) {
    await new Promise((r) => setTimeout(r, 500));
    return kokoroInstance;
  }
  kokoroLoading = true;
  try {
    devLog("info", "tts", "Loading Kokoro TTS model (first use, ~330MB download)...");
    const { KokoroTTS } = await import("kokoro-js");
    kokoroInstance = await KokoroTTS.from_pretrained(
      "onnx-community/Kokoro-82M-v1.0-ONNX",
      { dtype: "q8" as any }
    );
    devLog("info", "tts", "Kokoro TTS loaded");
    return kokoroInstance;
  } catch (err) {
    devLog("error", "tts", "Kokoro failed to load, falling back to macOS say", { err: String(err) });
    kokoroFailed = true;
    return null;
  } finally {
    kokoroLoading = false;
  }
}

function macosSay(text: string, voice: string = "Samantha"): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const outFile = `/tmp/aura-tts-${Date.now()}.aiff`;
    execFile("say", ["-v", voice, "-o", outFile, text], (err) => {
      if (err) return reject(err);
      import("fs").then(({ readFileSync, unlinkSync }) => {
        try {
          const buf = readFileSync(outFile);
          unlinkSync(outFile);
          resolve(buf);
        } catch (e) {
          reject(e);
        }
      });
    });
  });
}

const router = Router();

router.post("/tts/speak", async (req, res, next) => {
  try {
    const text = String(req.body?.text ?? "").trim();
    if (!text) return res.status(400).json({ error: "text is required" });

    const language = getRequestLanguage(req);
    const kokoroVoice = getKokoroVoice(language);
    const kokoro = kokoroVoice ? await getKokoro() : null;

    if (kokoro && kokoroVoice) {
      try {
        const audio = await kokoro.generate(text, { voice: kokoroVoice });
        const wav = audio.toWav();
        res.setHeader("Content-Type", "audio/wav");
        return res.send(Buffer.from(wav));
      } catch (err) {
        devLog("warn", "tts", "Kokoro voice unavailable, falling back to macOS say", {
          language,
          voice: kokoroVoice,
          err: String(err),
        });
      }
    }

    const macVoice = getMacosSayVoice(language);
    const buf = await macosSay(text, macVoice);
    res.setHeader("Content-Type", "audio/aiff");
    res.send(buf);
  } catch (err) {
    next(err);
  }
});

router.get("/tts/status", async (_req, res) => {
  res.json({
    engine: kokoroInstance ? "kokoro" : kokoroFailed ? "macos-say" : "not-loaded",
    loading: kokoroLoading,
  });
});

export async function warmKokoro(): Promise<{ engine: string; ready: boolean }> {
  const kokoro = await getKokoro();
  return {
    engine: kokoro ? "kokoro" : kokoroFailed ? "macos-say" : "not-loaded",
    ready: kokoro !== null || kokoroFailed,
  };
}

export default router;
