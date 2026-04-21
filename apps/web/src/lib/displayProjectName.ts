/** Placeholder DB/template names — show a friendly label until the user or AI names the app. */
const PLACEHOLDER_NAMES = new Set(["untitled project", "interactive tool"]);

export function displayProjectName(name: string): string {
  const key = name.trim().toLowerCase();
  if (PLACEHOLDER_NAMES.has(key)) return "New project";
  return name;
}
