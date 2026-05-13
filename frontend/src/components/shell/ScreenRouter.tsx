import { AnimatePresence, motion } from "motion/react";
import { useAuraStore } from "../../store/useAuraStore";
import { DashboardScreen } from "../../screens/DashboardScreen";
import { WorkspaceCreateScreen } from "../../screens/WorkspaceCreateScreen";
import { GoalScreen } from "../../screens/GoalScreen";
import { PlanScreen } from "../../screens/PlanScreen";
import { LessonScreen } from "../../screens/LessonScreen";
import { InsightsScreen } from "../../screens/InsightsScreen";
import { WorkspaceOverviewScreen } from "../../screens/WorkspaceOverviewScreen";

const SCREENS: Record<string, React.ComponentType> = {
  dashboard: DashboardScreen,
  workspace_create: WorkspaceCreateScreen,
  goal: GoalScreen,
  plan: PlanScreen,
  lesson: LessonScreen,
  insights: InsightsScreen,
  workspace_overview: WorkspaceOverviewScreen,
};

export function ScreenRouter() {
  const screen = useAuraStore((s) => s.screen);
  const Component = SCREENS[screen] ?? DashboardScreen;

  return (
    <main style={{ flex: 1, overflow: "hidden", position: "relative" }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={screen}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ type: "spring", stiffness: 400, damping: 35, mass: 0.8 }}
          style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}
        >
          <Component />
        </motion.div>
      </AnimatePresence>
    </main>
  );
}
