import type {
  PreviewRuntimeContract,
  Project,
  StudioFile,
  TemplateDefinition,
} from "@beomz-studio/contracts";
import { getTemplateDefinition } from "@beomz-studio/templates";

type PreviewAppFileType =
  | "entry"
  | "route"
  | "component"
  | "layout"
  | "style"
  | "data"
  | "config";

interface PreviewAppFile {
  path: string;
  content: string;
  fileType: PreviewAppFileType;
}

interface BuildStudioPreviewHtmlInput {
  files: readonly StudioFile[];
  previewEntryPath?: string | null;
  project: Pick<Project, "id" | "name" | "templateId">;
}

function buildGeneratedPageFilePath(templateId: string, pageId: string): string {
  return `apps/web/src/app/generated/${templateId}/${pageId}.tsx`;
}

function buildInlineRuntimeContract(input: BuildStudioPreviewHtmlInput): PreviewRuntimeContract {
  const template = getTemplateDefinition(input.project.templateId as TemplateDefinition["id"]);

  return {
    entryPath: input.previewEntryPath ?? template.previewEntryPath,
    mode: "preview",
    navigation: template.pages
      .filter((page) => page.inPrimaryNav)
      .map((page) => ({
        auth: page.requiresAuth ? "authenticated" : "public",
        href: page.path,
        id: `${template.id}:${page.id}`,
        label: page.navigationLabel,
      })),
    project: input.project,
    provider: "local",
    routes: template.pages.map((page) => ({
      auth: page.requiresAuth ? "authenticated" : "public",
      filePath: buildGeneratedPageFilePath(template.id, page.id),
      id: `${template.id}:${page.id}`,
      inPrimaryNav: page.inPrimaryNav,
      label: page.navigationLabel,
      path: page.path,
      summary: page.summary,
    })),
    shell: template.shell,
    templateId: template.id,
  };
}

function normalizeGeneratedPath(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

function mapStudioFileType(file: StudioFile): PreviewAppFileType {
  if (/(^|\/)app\.tsx$/i.test(file.path)) {
    return "entry";
  }

  switch (file.kind) {
    case "route":
      return "route";
    case "layout":
      return "layout";
    case "style":
      return "style";
    case "data":
    case "content":
      return "data";
    case "config":
    case "asset-manifest":
      return "config";
    default:
      return "component";
  }
}

function isRunnablePreviewFile(file: StudioFile): boolean {
  return /\.(tsx|ts|jsx|js)$/i.test(file.path);
}

function createSyntheticPreviewEntry(runtime: PreviewRuntimeContract): PreviewAppFile {
  const routeImports = runtime.routes
    .map((route, index) => `import Route${index} from "./${route.filePath}";`)
    .join("\n");

  const routeMap = runtime.routes
    .map((route, index) => `    ${JSON.stringify(route.path)}: Route${index},`)
    .join("\n");

  const runtimeLiteral = JSON.stringify(runtime, null, 2);

  return {
    content: `${routeImports}

const runtime = ${runtimeLiteral};

const routeComponents = {
${routeMap}
};

function MissingRoute({ route }) {
  return (
    <section className="rounded-[24px] border border-white/10 bg-white/[0.04] p-6 text-white/80 shadow-[0_24px_80px_rgba(0,0,0,0.25)]">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-orange-300/80">
        Preview route missing
      </div>
      <h2 className="text-2xl font-semibold text-white">{route.label}</h2>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-white/60">
        The preview shell is live, but this route has not been generated yet. As files update,
        this card will be replaced with the real screen automatically.
      </p>
    </section>
  );
}

function App() {
  const [activePath, setActivePath] = useState(runtime.entryPath);

  const activeRoute = useMemo(() => {
    return runtime.routes.find((route) => route.path === activePath)
      ?? runtime.routes.find((route) => route.path === runtime.entryPath)
      ?? runtime.routes[0];
  }, [activePath]);

  const ActiveRoute = routeComponents[activeRoute.path];
  const shellClass =
    runtime.shell === "website"
      ? "mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 py-8"
      : "grid min-h-screen grid-cols-[260px_minmax(0,1fr)] gap-6 px-6 py-8";

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(249,115,22,0.14),transparent_42%),linear-gradient(160deg,#050816_0%,#0d1630_48%,#050816_100%)] text-white">
      <div className={shellClass}>
        {runtime.shell === "website" ? null : (
          <aside className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
            <div className="mb-6">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-orange-300/80">
                {runtime.shell} shell
              </div>
              <h1 className="mt-2 text-xl font-semibold text-white">{runtime.project.name}</h1>
            </div>
            <nav className="space-y-2">
              {runtime.routes.map((route) => (
                <button
                  key={route.id}
                  type="button"
                  onClick={() => setActivePath(route.path)}
                  className={
                    route.path === activeRoute.path
                      ? "w-full rounded-2xl border border-orange-400/30 bg-orange-400/12 px-4 py-3 text-left"
                      : "w-full rounded-2xl border border-transparent bg-transparent px-4 py-3 text-left hover:border-white/10 hover:bg-white/[0.04]"
                  }
                >
                  <div className="text-sm font-medium text-white">{route.label}</div>
                  <div className="mt-1 text-xs leading-5 text-white/55">{route.summary}</div>
                </button>
              ))}
            </nav>
          </aside>
        )}

        <main className="min-w-0">
          <header className="mb-6 rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-orange-300/80">
              Local studio preview
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold text-white">{activeRoute.label}</h2>
                <p className="mt-1 text-sm text-white/60">{activeRoute.summary}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {runtime.navigation.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActivePath(item.href)}
                    className={
                      item.href === activeRoute.path
                        ? "rounded-full border border-orange-400/30 bg-orange-400/14 px-3 py-1.5 text-xs font-semibold text-orange-100"
                        : "rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-white/65 hover:bg-white/[0.08]"
                    }
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </header>

          <div className="rounded-[32px] border border-white/10 bg-[#081126] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
            {ActiveRoute ? <ActiveRoute /> : <MissingRoute route={activeRoute} />}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
`,
    fileType: "entry",
    path: "App.tsx",
  };
}

function sanitizeJsx(code: string): string {
  return code
    .replace(/window\.lucide\.\[/g, "window.lucide[")
    .replace(/window\?\.lucide/g, "window.lucide")
    .replace(/window\.lucide\?\.\[/g, "window.lucide[")
    .replace(/window\.lucide\?\./g, "window.lucide.")
    .replace(/(\w)\?\.\[/g, "$1[")
    .replace(/(\w)\?\.\(/g, "$1(")
    .replace(/(className=["'][^"']*)\*[^"']*/g, "$1")
    .replace(/\{\s*\$bind\s*\}/g, '{""}')
    .replace(/\{\s*\$([a-zA-Z_]\w*)\s*\}/g, "{$1}")
    .replace(/([\w-]+=)"([^"]*?)(?=>[\s/])/g, '$1"$2"')
    .replace(/([\w-]+=)'([^']*?)(?=>[\s/])/g, "$1'$2'")
    .replace(/(\w)!\.(\w)/g, "$1.$2")
    .replace(/\{\(([^)]+)\s+as\s+\w+(?:<[^>]+>)?\)\}/g, "{$1}")
    .replace(/^\s*interface\s+\w+\s*\{[^}]*\}\s*$/gm, "");
}

function parseNamedImports(namesStr: string): string {
  return namesStr
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => {
      const withoutTypePrefix = name.replace(/^type\s+/, "").trim();
      if (!withoutTypePrefix) {
        return "";
      }

      const [original, alias] = withoutTypePrefix.split(/\s+as\s+/);
      return alias ? `${original.trim()}: ${alias.trim()}` : original.trim();
    })
    .filter(Boolean)
    .join(", ");
}

function resolvePath(importPath: string): string {
  let resolved = importPath
    .replace(/^@\//, "")
    .replace(/^\/+/, "")
    .replace(/^\.\//, "")
    .replace(/^(\.\.\/)+/g, "")
    .replace(/^src\//, "")
    .trim();

  resolved = resolved.replace(/\.(tsx|ts|jsx|js)$/i, "");
  return resolved;
}

function resolveImportPath(fromPath: string, importPath: string): string {
  if (!importPath.startsWith("./") && !importPath.startsWith("../")) {
    return resolvePath(importPath);
  }

  const baseParts = fromPath.replace(/^\/+/, "").split("/").slice(0, -1);
  const importParts = importPath.split("/");
  const output = [...baseParts];

  for (const part of importParts) {
    if (!part || part === ".") {
      continue;
    }

    if (part === "..") {
      output.pop();
      continue;
    }

    output.push(part);
  }

  return resolvePath(output.join("/"));
}

function injectMissingLucideDestructure(code: string): string {
  const commonLucideIcons = [
    "AlertCircle",
    "ArrowLeft",
    "ArrowRight",
    "BarChart",
    "Bell",
    "Calendar",
    "Check",
    "CheckCircle",
    "ChevronDown",
    "ChevronLeft",
    "ChevronRight",
    "ChevronUp",
    "Clock",
    "Copy",
    "CreditCard",
    "Download",
    "Edit",
    "ExternalLink",
    "Eye",
    "Filter",
    "Globe",
    "Grid",
    "Heart",
    "Home",
    "Info",
    "Link",
    "List",
    "Loader",
    "Lock",
    "LogOut",
    "Mail",
    "Menu",
    "MessageCircle",
    "Minus",
    "Monitor",
    "MoreHorizontal",
    "MoreVertical",
    "Phone",
    "PieChart",
    "Plus",
    "RefreshCw",
    "Search",
    "Settings",
    "Share",
    "ShoppingCart",
    "Star",
    "Trash",
    "TrendingDown",
    "TrendingUp",
    "Upload",
    "User",
    "Users",
    "Wallet",
    "X",
    "XCircle",
    "Zap",
  ];

  const needed = commonLucideIcons.filter((icon) => {
    const usedInJsx = new RegExp(`<${icon}(?:\\s|/|>)`).test(code);
    if (!usedInJsx) {
      return false;
    }

    const importedFromLucide = new RegExp(
      `import\\s+\\{[^}]*\\b${icon}\\b[^}]*\\}\\s+from\\s+['"]lucide-react['"]`,
    ).test(code);

    if (importedFromLucide) {
      return false;
    }

    return !new RegExp(`\\b(?:const|let|var|function|class)\\s+${icon}\\b`).test(code);
  });

  if (needed.length === 0) {
    return code;
  }

  return `const { ${needed.join(", ")} } = window.lucide || {};\n${code}`;
}

function transformImports(code: string, filePath = "App.tsx"): string {
  let nextCode = injectMissingLucideDestructure(code);

  nextCode = nextCode.replace(/^[ \t]*import\s+type\s+[^\n]+\n?/gm, "");
  nextCode = nextCode.replace(/^[ \t]*import\s+React\s+from\s+['"]react['"]\s*;?[ \t]*\n?/gm, "");
  nextCode = nextCode.replace(/^[ \t]*import\s+React\s*,\s*\{[^}]*\}\s+from\s+['"]react['"]\s*;?[ \t]*\n?/gm, "");
  nextCode = nextCode.replace(/^[ \t]*import\s+\{[^}]*\}\s+from\s+['"]react['"]\s*;?[ \t]*\n?/gm, "");
  nextCode = nextCode.replace(/^[ \t]*import\s+type\s+\{[^}]*\}\s+from\s+['"]react['"]\s*;?[ \t]*\n?/gm, "");

  nextCode = nextCode.replace(
    /^[ \t]*import\s+\{([^}]+)\}\s+from\s+['"]lucide-react['"]\s*;?[ \t]*\n?/gm,
    (_, namesStr) => `const { ${parseNamedImports(namesStr)} } = window.lucide || {};\n`,
  );
  nextCode = nextCode.replace(
    /^[ \t]*import\s+\*\s+as\s+(\w+)\s+from\s+['"]lucide-react['"]\s*;?[ \t]*\n?/gm,
    (_, namespace) => `const ${namespace} = window.lucide || {};\n`,
  );

  nextCode = nextCode.replace(
    /^[ \t]*import\s+\{([^}]+)\}\s+from\s+['"]react-router-dom['"]\s*;?[ \t]*\n?/gm,
    (_, namesStr) => `const { ${parseNamedImports(namesStr)} } = window.ReactRouterDOM || {};\n`,
  );
  nextCode = nextCode.replace(
    /^[ \t]*import\s+\*\s+as\s+(\w+)\s+from\s+['"]react-router-dom['"]\s*;?[ \t]*\n?/gm,
    (_, namespace) => `const ${namespace} = window.ReactRouterDOM || {};\n`,
  );

  nextCode = nextCode.replace(
    /^[ \t]*import\s+\{([^}]+)\}\s+from\s+['"]framer-motion['"]\s*;?[ \t]*\n?/gm,
    (_, namesStr) => `const { ${parseNamedImports(namesStr)} } = window.framerMotion || {};\n`,
  );

  nextCode = nextCode.replace(
    /^[ \t]*import\s+(\w+)\s+from\s+['"]clsx['"]\s*;?[ \t]*\n?/gm,
    (_, name) => `const ${name} = window.clsx;\n`,
  );
  nextCode = nextCode.replace(
    /^[ \t]*import\s+\{([^}]+)\}\s+from\s+['"]tailwind-merge['"]\s*;?[ \t]*\n?/gm,
    (_, namesStr) => `const { ${parseNamedImports(namesStr)} } = window.tailwindMerge || {};\n`,
  );

  nextCode = nextCode.replace(
    /^[ \t]*import\s+\{\s*createClient\s*\}\s+from\s+['"]@supabase\/supabase-js['"]\s*;?[ \t]*\n?/gm,
    "const { createClient } = window.supabase || {};\n",
  );
  nextCode = nextCode.replace(
    /^[ \t]*import\s+\*\s+as\s+(\w+)\s+from\s+['"]@supabase\/supabase-js['"]\s*;?[ \t]*\n?/gm,
    "const $1 = window.supabase || {};\n",
  );

  nextCode = nextCode.replace(
    /^[ \t]*import\s+(\w+)\s*,\s*\{([^}]+)\}\s+from\s+['"]([./][^'"]+)['"]\s*;?[ \t]*/gm,
    (_, defaultName, namedStr, importPath) => {
      const resolved = resolveImportPath(filePath, importPath);
      const names = parseNamedImports(namedStr);
      return [
        `const __mod_${defaultName} = __getModule(${JSON.stringify(resolved)});`,
        `const ${defaultName} = (__mod_${defaultName}.default ?? __mod_${defaultName});`,
        names ? `const { ${names} } = __mod_${defaultName};` : "",
      ].filter(Boolean).join("\n");
    },
  );
  nextCode = nextCode.replace(
    /^[ \t]*import\s+(\w+)\s+from\s+['"]([./][^'"]+)['"]\s*;?[ \t]*/gm,
    (_, name, importPath) => {
      const resolved = resolveImportPath(filePath, importPath);
      return `const __mod_${name} = __getModule(${JSON.stringify(resolved)}); const ${name} = (__mod_${name}.default ?? __mod_${name});`;
    },
  );
  nextCode = nextCode.replace(
    /^[ \t]*import\s+\{([^}]+)\}\s+from\s+['"]([./][^'"]+)['"]\s*;?[ \t]*/gm,
    (_, namesStr, importPath) => {
      const resolved = resolveImportPath(filePath, importPath);
      const names = parseNamedImports(namesStr);
      return names ? `const { ${names} } = __getModule(${JSON.stringify(resolved)});` : "";
    },
  );
  nextCode = nextCode.replace(
    /^[ \t]*import\s+\*\s+as\s+(\w+)\s+from\s+['"]([./][^'"]+)['"]\s*;?[ \t]*/gm,
    (_, namespace, importPath) => {
      const resolved = resolveImportPath(filePath, importPath);
      return `const ${namespace} = __getModule(${JSON.stringify(resolved)});`;
    },
  );
  nextCode = nextCode.replace(/^[ \t]*import\s+['"]([./][^'"]+)['"]\s*;?[ \t]*\n?/gm, "");

  nextCode = nextCode.replace(
    /^[ \t]*import\s+(\w+)\s*,\s*\{([^}]+)\}\s+from\s+['"]((?:@\/|src\/|apps\/web\/src\/|components\/|lib\/|hooks\/|generated\/|app\/|utils\/|theme(?:\.ts|\.tsx)?|data(?:\.ts|\.tsx)?)[^'"]*)['"]\s*;?[ \t]*/gm,
    (_, defaultName, namedStr, importPath) => {
      const resolved = resolvePath(importPath);
      const names = parseNamedImports(namedStr);
      return [
        `const __mod_${defaultName} = __getModule(${JSON.stringify(resolved)});`,
        `const ${defaultName} = (__mod_${defaultName}.default ?? __mod_${defaultName});`,
        names ? `const { ${names} } = __mod_${defaultName};` : "",
      ].filter(Boolean).join("\n");
    },
  );
  nextCode = nextCode.replace(
    /^[ \t]*import\s+(\w+)\s+from\s+['"]((?:@\/|src\/|apps\/web\/src\/|components\/|lib\/|hooks\/|generated\/|app\/|utils\/|theme(?:\.ts|\.tsx)?|data(?:\.ts|\.tsx)?)[^'"]*)['"]\s*;?[ \t]*/gm,
    (_, name, importPath) => {
      const resolved = resolvePath(importPath);
      return `const __mod_${name} = __getModule(${JSON.stringify(resolved)}); const ${name} = (__mod_${name}.default ?? __mod_${name});`;
    },
  );
  nextCode = nextCode.replace(
    /^[ \t]*import\s+\{([^}]+)\}\s+from\s+['"]((?:@\/|src\/|apps\/web\/src\/|components\/|lib\/|hooks\/|generated\/|app\/|utils\/|theme(?:\.ts|\.tsx)?|data(?:\.ts|\.tsx)?)[^'"]*)['"]\s*;?[ \t]*/gm,
    (_, namesStr, importPath) => {
      const resolved = resolvePath(importPath);
      const names = parseNamedImports(namesStr);
      return names ? `const { ${names} } = __getModule(${JSON.stringify(resolved)});` : "";
    },
  );
  nextCode = nextCode.replace(
    /^[ \t]*import\s+\*\s+as\s+(\w+)\s+from\s+['"]((?:@\/|src\/|apps\/web\/src\/|components\/|lib\/|hooks\/|generated\/|app\/|utils\/|theme(?:\.ts|\.tsx)?|data(?:\.ts|\.tsx)?)[^'"]*)['"]\s*;?[ \t]*/gm,
    (_, namespace, importPath) => {
      const resolved = resolvePath(importPath);
      return `const ${namespace} = __getModule(${JSON.stringify(resolved)});`;
    },
  );

  nextCode = nextCode.replace(
    /^[ \t]*import\s+(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\w+))*\s+from\s+['"][^./][^'"]*['"]\s*;?[ \t]*\n?/gm,
    "",
  );
  nextCode = nextCode.replace(/^[ \t]*import\s+['"][^./][^'"]*['"]\s*;?[ \t]*\n?/gm, "");

  return nextCode;
}

function transformExports(code: string): string {
  const namedExports: string[] = [];
  let nextCode = code;

  nextCode = nextCode.replace(
    /^[ \t]*export\s+type\s+\w+[^\n=]*=\s*\{[\s\S]*?^[ \t]*\};?[ \t]*\n?/gm,
    "",
  );
  nextCode = nextCode.replace(/^[ \t]*export\s+type\s+\{[^}]+\}\s*;?[ \t]*\n?/gm, "");
  nextCode = nextCode.replace(/^[ \t]*export\s+type\s+\w+[^\n=]*=\s*[\s\S]*?;[ \t]*\n?/gm, "");

  const namedPattern = /\bexport\s+(?:(?:const|let|var|class)\s+(\w+)|(?:async\s+)?function\*?\s+(\w+))/g;
  let match: RegExpExecArray | null = null;
  while ((match = namedPattern.exec(nextCode)) !== null) {
    const name = match[1] ?? match[2];
    if (name) {
      namedExports.push(name);
    }
  }

  nextCode = nextCode.replace(/\bexport\s+((?:async\s+)?function\*?|const|let|var|class)\b/g, "$1");
  nextCode = nextCode.replace(
    /export\s+default\s+((?:async\s+)?function\*?|class)\s+(\w+)/g,
    (_, keyword, name) => {
      namedExports.push(`__default__${name}`);
      return `${keyword} ${name}`;
    },
  );
  nextCode = nextCode.replace(
    /^export\s+default\s+([^\n{][^\n]*?)(\s*;?\s*)$/gm,
    (_, expression) => `module.exports.default = ${expression.trim()};`,
  );
  nextCode = nextCode.replace(/export\s+\{([^}]+)\}\s*;?/g, (_, namesStr) =>
    namesStr
      .split(",")
      .map((name: string) => name.trim())
      .filter(Boolean)
      .map((name: string) => {
        const [original, alias] = name.split(/\s+as\s+/);
        const exportedName = (alias ?? original).trim();
        return `module.exports[${JSON.stringify(exportedName)}] = ${original.trim()};`;
      })
      .join("\n"),
  );

  const assignments = namedExports
    .map((name) =>
      name.startsWith("__default__")
        ? `module.exports.default = ${name.replace("__default__", "")};`
        : `module.exports[${JSON.stringify(name)}] = ${name};`,
    )
    .join("\n");

  return assignments ? `${nextCode}\n${assignments}` : nextCode;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function bundlePreviewFiles(files: readonly PreviewAppFile[]): string {
  try {
    const order: PreviewAppFileType[] = [
      "data",
      "config",
      "style",
      "layout",
      "component",
      "route",
      "entry",
    ];
    const sortedFiles = [...files].sort(
      (left, right) => order.indexOf(left.fileType) - order.indexOf(right.fileType),
    );
    const entryFile = sortedFiles.find((file) => /(^|\/)app\.tsx$/i.test(file.path))
      ?? sortedFiles.find((file) => file.fileType === "entry");

    const moduleRegistry: string[] = [];
    for (const file of sortedFiles) {
      if (entryFile && file.path === entryFile.path) {
        continue;
      }

      if (!/\.(tsx|ts|jsx|js)$/i.test(file.path)) {
        continue;
      }

      const transformed = transformExports(transformImports(sanitizeJsx(file.content), file.path));
      const key = resolvePath(file.path);
      moduleRegistry.push(`
  __moduleFactories[${JSON.stringify(key)}] = function(module, exports) {
    ${transformed}
  };`);
    }

    const entryCode = entryFile
      ? transformImports(sanitizeJsx(entryFile.content), entryFile.path)
      : "";

    const aliasBlock = `
(function() {
  Object.keys(__moduleFactories).forEach(function(key) {
    var noExt = key.replace(/\\.(tsx|ts|jsx|js)$/, '');
    var variants = [
      noExt,
      key.replace(/\\.ts$/, '.tsx'),
      key.replace(/\\.tsx$/, '.ts'),
      key.replace(/^src\\//, ''),
      noExt.replace(/^src\\//, ''),
      key.replace(/^apps\\/web\\/src\\//, ''),
      noExt.replace(/^apps\\/web\\/src\\//, ''),
      'src/' + noExt,
      noExt + '.tsx',
      noExt + '.ts'
    ];
    variants.forEach(function(variant) {
      if (variant !== key && !__moduleFactories[variant]) {
        __moduleFactories[variant] = __moduleFactories[key];
      }
    });
  });
})();`;

    return `const __moduleFactories = {};
const __modules = {};
const __moduleLoading = {};
const __missingModules = {};
function __createMissingValue(path, exportName) {
  const label = exportName && exportName !== "default"
    ? path + "#" + exportName
    : path;
  const MissingPreviewDependency = function MissingPreviewDependency() {
    return React.createElement(
      "div",
      {
        style: {
          border: "1px solid rgba(249,115,22,0.28)",
          background: "rgba(249,115,22,0.08)",
          color: "rgba(255,255,255,0.92)",
          borderRadius: "20px",
          padding: "16px",
          fontFamily: '"Geist Sans", system-ui, sans-serif',
          boxShadow: "0 18px 40px rgba(0,0,0,0.2)"
        }
      },
      React.createElement(
        "div",
        {
          style: {
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            fontSize: "11px",
            fontWeight: 700,
            color: "#fdba74",
            marginBottom: "8px"
          }
        },
        "Missing preview dependency"
      ),
      React.createElement(
        "code",
        {
          style: {
            display: "block",
            fontSize: "12px",
            lineHeight: 1.7,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            color: "rgba(255,255,255,0.82)"
          }
        },
        label
      )
    );
  };
  return new Proxy(MissingPreviewDependency, {
    apply: function(_target, _thisArg, args) {
      if (!args || args.length === 0) {
        return undefined;
      }
      return args.flat ? args.flat(Infinity).filter(Boolean).join(" ") : undefined;
    },
    get: function(_target, prop) {
      if (prop === "__esModule") return true;
      if (prop === "default") return MissingPreviewDependency;
      if (prop === "then") return undefined;
      if (prop === "toString") {
        return function() { return "[MissingPreviewDependency " + label + "]"; };
      }
      return __createMissingValue(path, String(prop));
    }
  });
}
function __createMissingModule(path) {
  return new Proxy({}, {
    get: function(_target, prop) {
      if (prop === "__esModule") return true;
      if (prop === "then") return undefined;
      return __createMissingValue(path, prop === "default" ? "default" : String(prop));
    }
  });
}
function __getModule(path) {
  if (__modules[path] !== undefined) return __modules[path];
  const factory = __moduleFactories[path];
  if (typeof factory === "function") {
    if (__moduleLoading[path]) return __modules[path] || {};
    __moduleLoading[path] = true;
    const module = { exports: {} };
    __modules[path] = module.exports;
    try {
      factory(module, module.exports);
      __modules[path] = module.exports;
    } finally {
      delete __moduleLoading[path];
    }
    return __modules[path];
  }
  if (!__missingModules[path]) {
    __missingModules[path] = true;
    console.warn("[Beomz preview] Missing module in inline bundle:", path);
  }
  return __createMissingModule(path);
}
${moduleRegistry.join("\n")}
${aliasBlock}
${entryCode}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Beomz preview] Failed to bundle preview files", error);
    return `<!DOCTYPE html><html><body style="font-family:monospace;padding:20px;color:#f97316;background:#050816;"><h3>Bundle Error</h3><pre>${escapeHtml(message)}</pre></body></html>`;
  }
}

function tightenSpacing(code: string): string {
  return code
    .replace(/\bp-8\b/g, "p-4")
    .replace(/\bp-6\b/g, "p-3")
    .replace(/\bpx-8\b/g, "px-4")
    .replace(/\bpy-8\b/g, "py-4")
    .replace(/\bpy-6\b/g, "py-3")
    .replace(/\bgap-8\b/g, "gap-3")
    .replace(/\bgap-6\b/g, "gap-3")
    .replace(/\bmb-8\b/g, "mb-4")
    .replace(/\bmb-6\b/g, "mb-3")
    .replace(/\bspace-y-8\b/g, "space-y-3")
    .replace(/\bspace-y-6\b/g, "space-y-3");
}

function stripJsxComments(code: string): string {
  return code.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

function nullSafetyGuard(code: string): string {
  return code
    .replace(/(?<!\|\|\s*\[]\))\b([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*)\.map\s*\(/g, "($1 || []).map(")
    .replace(/(?<!\|\|\s*\[]\))\b([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*)\.filter\s*\(/g, "($1 || []).filter(")
    .replace(/(?<!\|\|\s*\[]\))\b([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*)\.forEach\s*\(/g, "($1 || []).forEach(")
    .replace(/(?<!\|\|\s*\[]\))\b([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*)\.reduce\s*\(/g, "($1 || []).reduce(")
    .replace(/(?<!\|\|\s*\[]\))\b([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*)\.find\s*\(/g, "($1 || []).find(")
    .replace(/(?<!\|\|\s*\[]\))\b([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*)\.some\s*\(/g, "($1 || []).some(")
    .replace(/(?<!\|\|\s*\[]\))\b([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*)\.every\s*\(/g, "($1 || []).every(");
}

function cleanBundledCode(code: string): string {
  return nullSafetyGuard(stripJsxComments(tightenSpacing(code)))
    .replace(/^import\s+(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+['"][^'"]*['"]\s*;?\s*$/gm, "")
    .replace(/^import\s+['"][^'"]+['"]\s*;?\s*$/gm, "")
    .replace(/export\s+default\s+(?=function\s|class\s)/g, "")
    .replace(/export\s+default\s+\w+\s*;?\n?/g, "")
    .replace(/export\s+(?=(?:const|let|var|function|class|interface|type|enum|async)\s)/g, "");
}

const PREVIEW_GLOBALS = `
const { useState, useEffect, useMemo, useRef, useCallback, useReducer, useContext, createContext } = React;
window.lucide = new Proxy({}, {
  get: function(_target, prop) {
    if (typeof prop !== "string") return undefined;
    return function LucideProxyIcon(props) {
      return React.createElement(
        "span",
        {
          className: props && props.className ? props.className : "",
          style: Object.assign(
            {
              display: "inline-flex",
              width: (props && props.size) || 16,
              height: (props && props.size) || 16,
              borderRadius: 999,
              background: "rgba(249,115,22,0.18)",
              border: "1px solid rgba(249,115,22,0.35)"
            },
            props && props.style ? props.style : {}
          )
        }
      );
    };
  }
});
window.ReactRouterDOM = {
  useNavigate: function() { return function() {}; },
  useLocation: function() { return { pathname: "/", search: "", hash: "", state: null }; },
  useParams: function() { return {}; },
  useSearchParams: function() { return [new URLSearchParams(), function() {}]; },
  useMatch: function() { return null; },
  useRoutes: function() { return null; },
  Link: function(props) { return React.createElement("a", { href: props.to || "#", onClick: function(e) { e.preventDefault(); }, className: props.className, style: props.style }, props.children); },
  NavLink: function(props) { return React.createElement("a", { href: props.to || "#", onClick: function(e) { e.preventDefault(); }, className: props.className, style: props.style }, props.children); },
  Navigate: function() { return null; },
  Outlet: function() { return null; },
  Route: function() { return null; },
  Routes: function(props) { return props.children || null; },
  BrowserRouter: function(props) { return props.children || null; },
  MemoryRouter: function(props) { return props.children || null; },
  HashRouter: function(props) { return props.children || null; },
  createBrowserRouter: function() { return {}; },
  RouterProvider: function() { return null; }
};
window.framerMotion = {
  AnimatePresence: function(props) { return React.createElement(React.Fragment, null, props.children); },
  motion: new Proxy({}, {
    get: function(_target, prop) {
      var tag = typeof prop === "string" ? prop : "div";
      return function MotionElement(props) {
        var nextProps = Object.assign({}, props);
        delete nextProps.animate;
        delete nextProps.exit;
        delete nextProps.initial;
        delete nextProps.layout;
        delete nextProps.layoutId;
        delete nextProps.transition;
        delete nextProps.whileHover;
        delete nextProps.whileTap;
        return React.createElement(tag, nextProps, props.children);
      };
    }
  })
};
window.clsx = function() {
  return Array.prototype.slice.call(arguments).flat(Infinity).filter(Boolean).join(" ");
};
window.tailwindMerge = {
  twMerge: function() {
    return Array.prototype.slice.call(arguments).flat(Infinity).filter(Boolean).join(" ");
  }
};
function createNoopBuilder() {
  var builder = new Proxy({}, {
    get: function(_target, prop) {
      if (prop === "then") return undefined;
      if (prop === "single" || prop === "maybeSingle") {
        return function() { return Promise.resolve({ data: null, error: null }); };
      }
      if (prop === "select") {
        return function() { return builder; };
      }
      if (prop === "insert" || prop === "update" || prop === "upsert" || prop === "delete" || prop === "eq" || prop === "neq" || prop === "order" || prop === "limit" || prop === "match" || prop === "in" || prop === "contains" || prop === "or" || prop === "range") {
        return function() { return builder; };
      }
      return function() { return builder; };
    }
  });
  return builder;
}
window.supabase = {
  createClient: function() {
    return {
      from: function() { return createNoopBuilder(); },
      schema: function() {
        return {
          from: function() { return createNoopBuilder(); }
        };
      }
    };
  }
};
window.__beomzSchema = "public";
window.__beomzDb = function(schema) {
  return window.supabase.createClient().schema(schema || "public");
};
window.io = function() {
  var noop = function() {};
  return { on: noop, off: noop, emit: noop, connect: noop, disconnect: noop, close: noop };
};
`;

const BABEL_RUNNER = `
(function () {
  function renderError(err) {
    var root = document.getElementById("root");
    if (!root) return;
    root.innerHTML = "";
    var box = document.createElement("div");
    box.style.cssText = "padding:16px;font-family:ui-monospace,Menlo,monospace;font-size:12px;line-height:1.6;color:#fda4af;background:#0f172a;height:100%;overflow:auto;white-space:pre-wrap;word-break:break-word;";
    box.textContent = "Preview Error\\n\\n" + (err && err.message ? err.message : String(err)) + (err && err.stack ? "\\n\\n--- stack ---\\n" + err.stack : "");
    root.appendChild(box);
  }
  class PreviewErrorBoundary extends React.Component {
    constructor(props) {
      super(props);
      this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(err) {
      return { hasError: true, error: err };
    }
    render() {
      if (this.state.hasError) {
        return React.createElement("div", {
          style: {
            padding: "16px",
            fontFamily: "ui-monospace, Menlo, monospace",
            fontSize: "12px",
            lineHeight: 1.6,
            color: "#fda4af",
            background: "#0f172a",
            minHeight: "100vh",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word"
          }
        }, "Preview Error\\n\\n" + (this.state.error && this.state.error.message ? this.state.error.message : String(this.state.error)));
      }
      return this.props.children;
    }
  }
  try {
    var src = document.getElementById("__app_src__").textContent;
    var result = Babel.transform(src, { presets: ["react", "typescript"], filename: "App.tsx" });
    eval(result.code);
    if (typeof App !== "function") {
      throw new Error("App component not found in inline preview bundle.");
    }
    ReactDOM.createRoot(document.getElementById("root")).render(
      React.createElement(PreviewErrorBoundary, null, React.createElement(App))
    );
  } catch (err) {
    renderError(err);
  }
})();
`;

export function buildStudioPreviewHtml(input: BuildStudioPreviewHtmlInput): string {
  const runtime = buildInlineRuntimeContract(input);
  const previewFiles: PreviewAppFile[] = input.files
    .filter(isRunnablePreviewFile)
    .map((file) => ({
      content: file.content,
      fileType: mapStudioFileType(file),
      path: normalizeGeneratedPath(file.path),
    }));

  previewFiles.push(createSyntheticPreviewEntry(runtime));

  const rawCode = bundlePreviewFiles(previewFiles);
  if (/^\s*<!DOCTYPE html>|^\s*<html/i.test(rawCode)) {
    return rawCode;
  }

  const safeCode = cleanBundledCode(rawCode).replace(/<\/script>/gi, "<\\/script>");
  const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "https://beomz-studioapi-production.up.railway.app")
    .replace(/\/$/, "");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
    <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <style>
      * { box-sizing: border-box; }
      html, body, #root {
        width: 100%;
        min-height: 100%;
        margin: 0;
        background: #050816;
        color: white;
        font-family: "Geist Sans", system-ui, sans-serif;
        -webkit-font-smoothing: antialiased;
      }
      body { overflow: auto; }
      ::-webkit-scrollbar { width: 10px; height: 10px; }
      ::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.08);
        border-radius: 999px;
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script>
      window.__BEOMZ_API_BASE__ = ${JSON.stringify(apiBaseUrl)};
      ${PREVIEW_GLOBALS}
    </script>
    <script id="__app_src__" type="text/plain">${safeCode}</script>
    <script>${BABEL_RUNNER}</script>
  </body>
</html>`;
}
