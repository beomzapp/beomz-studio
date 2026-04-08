"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.persistBuildState = persistBuildState;
const contracts_1 = require("@beomz-studio/contracts");
const studio_db_1 = require("@beomz-studio/studio-db");
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function readBuilderTraceMetadata(metadata) {
    const candidate = metadata.builderTrace;
    if (!isRecord(candidate)) {
        return (0, contracts_1.createEmptyBuilderV3TraceMetadata)();
    }
    const events = Array.isArray(candidate.events) ? candidate.events : [];
    return {
        events,
        lastEventId: typeof candidate.lastEventId === "string" && candidate.lastEventId.length > 0
            ? candidate.lastEventId
            : null,
        previewReady: candidate.previewReady === true,
        fallbackReason: typeof candidate.fallbackReason === "string" ? candidate.fallbackReason : null,
        fallbackUsed: candidate.fallbackUsed === true,
    };
}
async function persistBuildState(input) {
    const db = (0, studio_db_1.createStudioDbClient)();
    if (input.projectPatch) {
        await db.updateProject(input.projectId, {
            name: input.projectPatch.name,
            status: input.projectPatch.status,
            template: input.projectPatch.template,
        });
    }
    if (!input.generationPatch) {
        return;
    }
    const currentGeneration = await db.findGenerationById(input.buildId);
    if (!currentGeneration) {
        throw new Error(`Build ${input.buildId} does not exist in the studio database.`);
    }
    const currentMetadata = isRecord(currentGeneration.metadata) ? currentGeneration.metadata : {};
    const mergedMetadata = input.generationPatch.metadata
        ? {
            ...currentMetadata,
            ...input.generationPatch.metadata,
        }
        : { ...currentMetadata };
    if (input.generationPatch.builderTracePatch) {
        const currentTrace = readBuilderTraceMetadata(currentMetadata);
        const appendedEvents = input.generationPatch.builderTracePatch.appendEvents ?? [];
        const lastAppendedEvent = appendedEvents.at(-1);
        mergedMetadata.builderTrace = {
            events: [...currentTrace.events, ...appendedEvents],
            lastEventId: lastAppendedEvent?.id
                ?? currentTrace.lastEventId,
            previewReady: input.generationPatch.builderTracePatch.previewReady ?? currentTrace.previewReady,
            fallbackReason: input.generationPatch.builderTracePatch.fallbackReason ?? currentTrace.fallbackReason,
            fallbackUsed: input.generationPatch.builderTracePatch.fallbackUsed ?? currentTrace.fallbackUsed,
        };
    }
    await db.updateGeneration(input.buildId, {
        completed_at: input.generationPatch.completedAt
            ?? ((input.generationPatch.status === "completed" || input.generationPatch.status === "failed")
                ? new Date().toISOString()
                : undefined),
        error: input.generationPatch.error,
        files: input.generationPatch.files,
        metadata: mergedMetadata,
        output_paths: input.generationPatch.outputPaths,
        preview_entry_path: input.generationPatch.previewEntryPath,
        status: input.generationPatch.status,
        summary: input.generationPatch.summary,
        template_id: input.generationPatch.templateId,
        warnings: input.generationPatch.warnings,
    });
}
