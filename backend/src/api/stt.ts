import { Router } from "express";
import { execFile } from "child_process";
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "fs";
import { devLog } from "../dev/logs.js";

const router = Router();

router.post("/stt/transcribe", async (req, res, next) => {
  try {
    const audioBase64 = String(req.body?.audio ?? "");
    if (!audioBase64) return res.status(400).json({ error: "audio (base64) is required" });

    const audioBuffer = Buffer.from(audioBase64, "base64");
    const tmpFile = `/tmp/aura-stt-${Date.now()}.wav`;

    writeFileSync(tmpFile, audioBuffer);

    const whisperPath = process.env.WHISPER_PATH || "whisper";

    try {
      const text = await new Promise<string>((resolve, reject) => {
        execFile(
          whisperPath,
          [tmpFile, "--model", "base.en", "--output_format", "txt", "--output_dir", "/tmp"],
          { timeout: 30000 },
          (err, stdout) => {
            if (err) return reject(err);
            const txtFile = tmpFile.replace(".wav", ".txt");
            if (existsSync(txtFile)) {
              const content = readFileSync(txtFile, "utf-8").trim();
              try { unlinkSync(txtFile); } catch {}
              resolve(content);
            } else {
              resolve(stdout.trim());
            }
          }
        );
      });
      res.json({ text });
    } catch {
      devLog("warn", "stt", "Whisper CLI not available, using Web Speech API on client side");
      res.json({ text: "", fallback: "web-speech-api" });
    } finally {
      try { unlinkSync(tmpFile); } catch {}
    }
  } catch (err) {
    next(err);
  }
});

router.get("/stt/status", (_req, res) => {
  res.json({ engine: "whisper-cli-or-web-speech-api" });
});

export default router;
