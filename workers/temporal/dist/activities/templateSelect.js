"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.templateSelect = templateSelect;
const templateSelection_js_1 = require("../shared/templateSelection.js");
async function templateSelect(input) {
    return (0, templateSelection_js_1.selectInitialBuildTemplate)(input);
}
