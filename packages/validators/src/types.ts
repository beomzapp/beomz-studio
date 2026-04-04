export enum FailureReason {
  SHELL_VIOLATION = "SHELL_VIOLATION",
  INVALID_OUTPUT = "INVALID_OUTPUT",
  PREVIEW_FAILED = "PREVIEW_FAILED",
  GENERATION_TIMEOUT = "GENERATION_TIMEOUT",
  ANTHROPIC_ERROR = "ANTHROPIC_ERROR",
  TEMPLATE_NOT_FOUND = "TEMPLATE_NOT_FOUND",
  FALLBACK_USED = "FALLBACK_USED",
}

export interface BuildResult {
  success: boolean;
  failureReason?: FailureReason;
  files: string[];
  warnings: string[];
}

export interface ShellViolation {
  path: string;
  reason: string;
}

export interface PreviewFailure {
  type: "broken_import" | "missing_dependency" | "syntax_error" | "missing_file";
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
