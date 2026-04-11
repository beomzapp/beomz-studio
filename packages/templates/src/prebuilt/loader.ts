import type { PrebuiltTemplate } from "@beomz-studio/contracts";

import { manifest as basicCalculatorManifest } from "../basic-calculator/manifest.js";
import { files as basicCalculatorFiles } from "../basic-calculator/files.js";
import { manifest as tipCalculatorManifest } from "../tip-calculator/manifest.js";
import { files as tipCalculatorFiles } from "../tip-calculator/files.js";
import { manifest as countdownTimerManifest } from "../countdown-timer/manifest.js";
import { files as countdownTimerFiles } from "../countdown-timer/files.js";
import { manifest as todoListManifest } from "../todo-list/manifest.js";
import { files as todoListFiles } from "../todo-list/files.js";
import { manifest as budgetPlannerManifest } from "../budget-planner/manifest.js";
import { files as budgetPlannerFiles } from "../budget-planner/files.js";
import { manifest as kanbanBoardManifest } from "../kanban-board/manifest.js";
import { files as kanbanBoardFiles } from "../kanban-board/files.js";
import { manifest as workoutTrackerManifest } from "../workout-tracker/manifest.js";
import { files as workoutTrackerFiles } from "../workout-tracker/files.js";
import { manifest as flashcardAppManifest } from "../flashcard-app/manifest.js";
import { files as flashcardAppFiles } from "../flashcard-app/files.js";
import { manifest as saasDashboardTemplateManifest } from "../saas-dashboard-template/manifest.js";
import { files as saasDashboardTemplateFiles } from "../saas-dashboard-template/files.js";
import { manifest as triviaGameManifest } from "../trivia-game/manifest.js";
import { files as triviaGameFiles } from "../trivia-game/files.js";
import { manifest as pomodoroTimerManifest } from "../pomodoro-timer/manifest.js";
import { files as pomodoroTimerFiles } from "../pomodoro-timer/files.js";
import { manifest as habitTrackerManifest } from "../habit-tracker/manifest.js";
import { files as habitTrackerFiles } from "../habit-tracker/files.js";
import { manifest as expenseTrackerManifest } from "../expense-tracker/manifest.js";
import { files as expenseTrackerFiles } from "../expense-tracker/files.js";
import { manifest as invoiceGeneratorManifest } from "../invoice-generator/manifest.js";
import { files as invoiceGeneratorFiles } from "../invoice-generator/files.js";
import { manifest as recipeManagerManifest } from "../recipe-manager/manifest.js";
import { files as recipeManagerFiles } from "../recipe-manager/files.js";
import { manifest as memoryGameManifest } from "../memory-game/manifest.js";
import { files as memoryGameFiles } from "../memory-game/files.js";
import { manifest as wordScrambleManifest } from "../word-scramble/manifest.js";
import { files as wordScrambleFiles } from "../word-scramble/files.js";
import { manifest as colorPickerManifest } from "../color-picker/manifest.js";
import { files as colorPickerFiles } from "../color-picker/files.js";
import { manifest as diceRollerManifest } from "../dice-roller/manifest.js";
import { files as diceRollerFiles } from "../dice-roller/files.js";
import { manifest as randomGeneratorManifest } from "../random-generator/manifest.js";
import { files as randomGeneratorFiles } from "../random-generator/files.js";

export const PREBUILT_REGISTRY: readonly PrebuiltTemplate[] = [
  { manifest: basicCalculatorManifest, files: basicCalculatorFiles },
  { manifest: tipCalculatorManifest, files: tipCalculatorFiles },
  { manifest: countdownTimerManifest, files: countdownTimerFiles },
  { manifest: todoListManifest, files: todoListFiles },
  { manifest: budgetPlannerManifest, files: budgetPlannerFiles },
  { manifest: kanbanBoardManifest, files: kanbanBoardFiles },
  { manifest: workoutTrackerManifest, files: workoutTrackerFiles },
  { manifest: flashcardAppManifest, files: flashcardAppFiles },
  { manifest: saasDashboardTemplateManifest, files: saasDashboardTemplateFiles },
  { manifest: triviaGameManifest, files: triviaGameFiles },
  { manifest: pomodoroTimerManifest, files: pomodoroTimerFiles },
  { manifest: habitTrackerManifest, files: habitTrackerFiles },
  { manifest: expenseTrackerManifest, files: expenseTrackerFiles },
  { manifest: invoiceGeneratorManifest, files: invoiceGeneratorFiles },
  { manifest: recipeManagerManifest, files: recipeManagerFiles },
  { manifest: memoryGameManifest, files: memoryGameFiles },
  { manifest: wordScrambleManifest, files: wordScrambleFiles },
  { manifest: colorPickerManifest, files: colorPickerFiles },
  { manifest: diceRollerManifest, files: diceRollerFiles },
  { manifest: randomGeneratorManifest, files: randomGeneratorFiles },
];

export const prebuiltById = new Map<string, PrebuiltTemplate>(
  PREBUILT_REGISTRY.map((t) => [t.manifest.id, t]),
);

export const tagIndex = new Map<string, Set<string>>();

for (const template of PREBUILT_REGISTRY) {
  for (const tag of template.manifest.tags) {
    const lower = tag.toLowerCase();
    let ids = tagIndex.get(lower);
    if (!ids) {
      ids = new Set();
      tagIndex.set(lower, ids);
    }
    ids.add(template.manifest.id);
  }
}
