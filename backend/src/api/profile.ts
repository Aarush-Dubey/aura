import express from "express";
import { loadProfile, saveProfile } from "../db/store.js";

const router = express.Router();

router.get("/profile", (_req, res) => {
  res.json(loadProfile());
});

router.post("/profile/update", (req, res) => {
  const profile = loadProfile();
  const explicit = req.body?.explicitPreferences ?? req.body ?? {};
  const updated = { ...profile, ...explicit };
  saveProfile(updated);
  res.json(updated);
});

export default router;
