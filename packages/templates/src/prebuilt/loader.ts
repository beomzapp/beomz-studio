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
import { manifest as stopwatchManifest } from "../stopwatch/manifest.js";
import { files as stopwatchFiles } from "../stopwatch/files.js";
import { manifest as worldClockManifest } from "../world-clock/manifest.js";
import { files as worldClockFiles } from "../world-clock/files.js";
import { manifest as intervalTimerManifest } from "../interval-timer/manifest.js";
import { files as intervalTimerFiles } from "../interval-timer/files.js";
import { manifest as unitConverterManifest } from "../unit-converter/manifest.js";
import { files as unitConverterFiles } from "../unit-converter/files.js";
import { manifest as currencyConverterManifest } from "../currency-converter/manifest.js";
import { files as currencyConverterFiles } from "../currency-converter/files.js";
import { manifest as weightTrackerManifest } from "../weight-tracker/manifest.js";
import { files as weightTrackerFiles } from "../weight-tracker/files.js";
import { manifest as sleepTrackerManifest } from "../sleep-tracker/manifest.js";
import { files as sleepTrackerFiles } from "../sleep-tracker/files.js";
import { manifest as readingListManifest } from "../reading-list/manifest.js";
import { files as readingListFiles } from "../reading-list/files.js";
import { manifest as jobBoardManifest } from "../job-board/manifest.js";
import { files as jobBoardFiles } from "../job-board/files.js";
import { manifest as productCatalogManifest } from "../product-catalog/manifest.js";
import { files as productCatalogFiles } from "../product-catalog/files.js";
import { manifest as bookingSystemManifest } from "../booking-system/manifest.js";
import { files as bookingSystemFiles } from "../booking-system/files.js";
import { manifest as mealPlannerManifest } from "../meal-planner/manifest.js";
import { files as mealPlannerFiles } from "../meal-planner/files.js";
import { manifest as goalTrackerManifest } from "../goal-tracker/manifest.js";
import { files as goalTrackerFiles } from "../goal-tracker/files.js";
import { manifest as personalCrmManifest } from "../personal-crm/manifest.js";
import { files as personalCrmFiles } from "../personal-crm/files.js";
import { manifest as studyPlannerManifest } from "../study-planner/manifest.js";
import { files as studyPlannerFiles } from "../study-planner/files.js";
import { manifest as moodJournalManifest } from "../mood-journal/manifest.js";
import { files as moodJournalFiles } from "../mood-journal/files.js";
import { manifest as travelPlannerManifest } from "../travel-planner/manifest.js";
import { files as travelPlannerFiles } from "../travel-planner/files.js";
import { manifest as petCareTrackerManifest } from "../pet-care-tracker/manifest.js";
import { files as petCareTrackerFiles } from "../pet-care-tracker/files.js";
import { manifest as subscriptionTrackerManifest } from "../subscription-tracker/manifest.js";
import { files as subscriptionTrackerFiles } from "../subscription-tracker/files.js";
import { manifest as waterIntakeManifest } from "../water-intake/manifest.js";
import { files as waterIntakeFiles } from "../water-intake/files.js";

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
  { manifest: stopwatchManifest, files: stopwatchFiles },
  { manifest: worldClockManifest, files: worldClockFiles },
  { manifest: intervalTimerManifest, files: intervalTimerFiles },
  { manifest: unitConverterManifest, files: unitConverterFiles },
  { manifest: currencyConverterManifest, files: currencyConverterFiles },
  { manifest: weightTrackerManifest, files: weightTrackerFiles },
  { manifest: sleepTrackerManifest, files: sleepTrackerFiles },
  { manifest: readingListManifest, files: readingListFiles },
  { manifest: jobBoardManifest, files: jobBoardFiles },
  { manifest: productCatalogManifest, files: productCatalogFiles },
  { manifest: bookingSystemManifest, files: bookingSystemFiles },
  { manifest: mealPlannerManifest, files: mealPlannerFiles },
  { manifest: goalTrackerManifest, files: goalTrackerFiles },
  { manifest: personalCrmManifest, files: personalCrmFiles },
  { manifest: studyPlannerManifest, files: studyPlannerFiles },
  { manifest: moodJournalManifest, files: moodJournalFiles },
  { manifest: travelPlannerManifest, files: travelPlannerFiles },
  { manifest: petCareTrackerManifest, files: petCareTrackerFiles },
  { manifest: subscriptionTrackerManifest, files: subscriptionTrackerFiles },
  { manifest: waterIntakeManifest, files: waterIntakeFiles },
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
