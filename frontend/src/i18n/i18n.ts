import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enCommon from "./locales/en/common.json";
import enDashboard from "./locales/en/dashboard.json";
import enWorkspace from "./locales/en/workspace.json";
import enLesson from "./locales/en/lesson.json";
import enCards from "./locales/en/cards.json";
import enSettings from "./locales/en/settings.json";
import enInsights from "./locales/en/insights.json";
import enChat from "./locales/en/chat.json";

import hiCommon from "./locales/hi/common.json";
import hiDashboard from "./locales/hi/dashboard.json";
import hiWorkspace from "./locales/hi/workspace.json";
import hiLesson from "./locales/hi/lesson.json";
import hiCards from "./locales/hi/cards.json";
import hiSettings from "./locales/hi/settings.json";
import hiInsights from "./locales/hi/insights.json";
import hiChat from "./locales/hi/chat.json";

import frCommon from "./locales/fr/common.json";
import frDashboard from "./locales/fr/dashboard.json";
import frWorkspace from "./locales/fr/workspace.json";
import frLesson from "./locales/fr/lesson.json";
import frCards from "./locales/fr/cards.json";
import frSettings from "./locales/fr/settings.json";
import frInsights from "./locales/fr/insights.json";
import frChat from "./locales/fr/chat.json";

import esCommon from "./locales/es/common.json";
import esDashboard from "./locales/es/dashboard.json";
import esWorkspace from "./locales/es/workspace.json";
import esLesson from "./locales/es/lesson.json";
import esCards from "./locales/es/cards.json";
import esSettings from "./locales/es/settings.json";
import esInsights from "./locales/es/insights.json";
import esChat from "./locales/es/chat.json";

import itCommon from "./locales/it/common.json";
import itDashboard from "./locales/it/dashboard.json";
import itWorkspace from "./locales/it/workspace.json";
import itLesson from "./locales/it/lesson.json";
import itCards from "./locales/it/cards.json";
import itSettings from "./locales/it/settings.json";
import itInsights from "./locales/it/insights.json";
import itChat from "./locales/it/chat.json";

import ptCommon from "./locales/pt/common.json";
import ptDashboard from "./locales/pt/dashboard.json";
import ptWorkspace from "./locales/pt/workspace.json";
import ptLesson from "./locales/pt/lesson.json";
import ptCards from "./locales/pt/cards.json";
import ptSettings from "./locales/pt/settings.json";
import ptInsights from "./locales/pt/insights.json";
import ptChat from "./locales/pt/chat.json";

import jaCommon from "./locales/ja/common.json";
import jaDashboard from "./locales/ja/dashboard.json";
import jaWorkspace from "./locales/ja/workspace.json";
import jaLesson from "./locales/ja/lesson.json";
import jaCards from "./locales/ja/cards.json";
import jaSettings from "./locales/ja/settings.json";
import jaInsights from "./locales/ja/insights.json";
import jaChat from "./locales/ja/chat.json";

import koCommon from "./locales/ko/common.json";
import koDashboard from "./locales/ko/dashboard.json";
import koWorkspace from "./locales/ko/workspace.json";
import koLesson from "./locales/ko/lesson.json";
import koCards from "./locales/ko/cards.json";
import koSettings from "./locales/ko/settings.json";
import koInsights from "./locales/ko/insights.json";
import koChat from "./locales/ko/chat.json";

import zhCommon from "./locales/zh/common.json";
import zhDashboard from "./locales/zh/dashboard.json";
import zhWorkspace from "./locales/zh/workspace.json";
import zhLesson from "./locales/zh/lesson.json";
import zhCards from "./locales/zh/cards.json";
import zhSettings from "./locales/zh/settings.json";
import zhInsights from "./locales/zh/insights.json";
import zhChat from "./locales/zh/chat.json";

import deCommon from "./locales/de/common.json";
import deDashboard from "./locales/de/dashboard.json";
import deWorkspace from "./locales/de/workspace.json";
import deLesson from "./locales/de/lesson.json";
import deCards from "./locales/de/cards.json";
import deSettings from "./locales/de/settings.json";
import deInsights from "./locales/de/insights.json";
import deChat from "./locales/de/chat.json";

function bundle(common: any, dashboard: any, workspace: any, lesson: any, cards: any, settings: any, insights: any, chat: any) {
  return { common, dashboard, workspace, lesson, cards, settings, insights, chat };
}

i18n.use(initReactI18next).init({
  fallbackLng: "en",
  ns: ["common", "dashboard", "workspace", "lesson", "cards", "settings", "insights", "chat"],
  defaultNS: "common",
  interpolation: { escapeValue: false },
  resources: {
    en: bundle(enCommon, enDashboard, enWorkspace, enLesson, enCards, enSettings, enInsights, enChat),
    hi: bundle(hiCommon, hiDashboard, hiWorkspace, hiLesson, hiCards, hiSettings, hiInsights, hiChat),
    fr: bundle(frCommon, frDashboard, frWorkspace, frLesson, frCards, frSettings, frInsights, frChat),
    es: bundle(esCommon, esDashboard, esWorkspace, esLesson, esCards, esSettings, esInsights, esChat),
    it: bundle(itCommon, itDashboard, itWorkspace, itLesson, itCards, itSettings, itInsights, itChat),
    pt: bundle(ptCommon, ptDashboard, ptWorkspace, ptLesson, ptCards, ptSettings, ptInsights, ptChat),
    ja: bundle(jaCommon, jaDashboard, jaWorkspace, jaLesson, jaCards, jaSettings, jaInsights, jaChat),
    ko: bundle(koCommon, koDashboard, koWorkspace, koLesson, koCards, koSettings, koInsights, koChat),
    zh: bundle(zhCommon, zhDashboard, zhWorkspace, zhLesson, zhCards, zhSettings, zhInsights, zhChat),
    de: bundle(deCommon, deDashboard, deWorkspace, deLesson, deCards, deSettings, deInsights, deChat),
  },
});

export default i18n;
