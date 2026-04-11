import type {
  StudioFile,
  TemplateDefinition,
  TemplatePage,
} from "@beomz-studio/contracts";

import {
  buildGeneratedPageComponentName,
  buildGeneratedPageFilePath,
} from "../shared/paths.js";
import { buildGeneratedScaffoldFiles } from "../shared/generatedSurface.js";
import type {
  FallbackScaffoldActivityInput,
  GeneratedBuildDraft,
} from "../shared/types.js";

function serialize(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function buildMarketingPageBody(
  page: TemplatePage,
  componentName: string,
  projectName: string,
  promptSummary: string,
): string {
  if (page.kind === "pricing") {
    return `export default function ${componentName}() {
  const tiers = ${serialize([
    { name: "Starter", price: "$29", description: "Launch fast with the core experience." },
    { name: "Growth", price: "$79", description: "Scale messaging, conversion, and support flows." },
    { name: "Premium", price: "$149", description: "Ship a polished launch surface for the full GTM motion." },
  ])};
  const projectTitle = ${serialize(projectName)};

  return (
    <div className="space-y-8 text-white">
      <section className="rounded-3xl border border-white/10 bg-zinc-900 p-8">
        <p className="text-sm uppercase tracking-[0.28em] text-orange-300">Pricing</p>
        <h1 className="mt-4 text-4xl font-semibold">{projectTitle}</h1>
        <p className="mt-4 max-w-3xl text-base text-zinc-300">
          Clear packaging for teams that want to move from evaluation to purchase without friction.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {tiers.map((tier) => (
          <article key={tier.name} className="rounded-3xl border border-white/10 bg-black/30 p-6">
            <p className="text-sm uppercase tracking-[0.24em] text-orange-200">{tier.name}</p>
            <p className="mt-4 text-4xl font-semibold">{tier.price}</p>
            <p className="mt-3 text-sm leading-6 text-zinc-300">{tier.description}</p>
            <button className="mt-6 rounded-full bg-orange-500 px-4 py-2 text-sm font-medium text-black">
              Choose {tier.name}
            </button>
          </article>
        ))}
      </section>
    </div>
  );
}
`;
  }

  if (page.kind === "contact") {
    return `export default function ${componentName}() {
  const contactChannels = ${serialize([
    { label: "Sales", detail: "sales@beomz-studio.local" },
    { label: "Support", detail: "support@beomz-studio.local" },
    { label: "Partnerships", detail: "partners@beomz-studio.local" },
  ])};
  const promptSummary = ${serialize(promptSummary)};

  return (
    <div className="grid gap-6 text-white lg:grid-cols-[1.2fr_0.8fr]">
      <section className="rounded-3xl border border-white/10 bg-zinc-900 p-8">
        <p className="text-sm uppercase tracking-[0.28em] text-orange-300">Contact</p>
        <h1 className="mt-4 text-4xl font-semibold">Talk to the team</h1>
        <p className="mt-4 max-w-2xl text-base text-zinc-300">{promptSummary}</p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm text-zinc-300">Name</span>
            <input className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm" placeholder="Your name" />
          </label>
          <label className="space-y-2">
            <span className="text-sm text-zinc-300">Email</span>
            <input className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm" placeholder="you@company.com" />
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm text-zinc-300">What are you trying to launch?</span>
            <textarea className="min-h-36 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm" placeholder="Tell us about the launch, audience, and timeline." />
          </label>
        </div>

        <button className="mt-6 rounded-full bg-orange-500 px-5 py-3 text-sm font-medium text-black">
          Send request
        </button>
      </section>

      <aside className="rounded-3xl border border-white/10 bg-black/30 p-8">
        <h2 className="text-lg font-semibold">Fastest paths</h2>
        <div className="mt-6 space-y-4">
          {contactChannels.map((channel) => (
            <div key={channel.label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm uppercase tracking-[0.22em] text-zinc-400">{channel.label}</p>
              <p className="mt-2 text-sm text-white">{channel.detail}</p>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
`;
  }

  return `export default function ${componentName}() {
  const highlights = ${serialize([
    "Clear value proposition",
    "Focused CTA path",
    "Proof-driven launch story",
  ])};
  const projectTitle = ${serialize(projectName)};
  const promptSummary = ${serialize(promptSummary)};

  return (
    <div className="space-y-8 text-white">
      <section className="rounded-[2rem] border border-white/10 bg-zinc-900 p-8">
        <p className="text-sm uppercase tracking-[0.28em] text-orange-300">Marketing Website</p>
        <h1 className="mt-4 max-w-4xl text-4xl font-semibold">{projectTitle}</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-300">{promptSummary}</p>

        <div className="mt-6 flex flex-wrap gap-3">
          {highlights.map((highlight) => (
            <span key={highlight} className="rounded-full border border-orange-400/30 bg-orange-500/10 px-4 py-2 text-sm text-orange-100">
              {highlight}
            </span>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {highlights.map((highlight) => (
          <article key={highlight} className="rounded-3xl border border-white/10 bg-black/30 p-6">
            <p className="text-sm uppercase tracking-[0.24em] text-zinc-400">Why it matters</p>
            <h2 className="mt-3 text-xl font-semibold">{highlight}</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-300">
              A fallback scaffold that keeps the preview presentable while the full generation pipeline is still being tuned.
            </p>
          </article>
        ))}
      </section>
    </div>
  );
}
`;
}

function buildDashboardPageBody(
  page: TemplatePage,
  componentName: string,
  projectName: string,
): string {
  if (page.kind === "customers") {
    return `export default function ${componentName}() {
  const customers = ${serialize([
    { name: "Acme Labs", stage: "Onboarding", owner: "Jules" },
    { name: "Northstar Finance", stage: "Healthy", owner: "Mina" },
    { name: "Orbit Commerce", stage: "Expansion", owner: "Theo" },
  ])};
  const projectTitle = ${serialize(projectName)};

  return (
    <div className="space-y-6 text-white">
      <section className="rounded-3xl border border-white/10 bg-zinc-900 p-8">
        <p className="text-sm uppercase tracking-[0.28em] text-orange-300">Customers</p>
        <h1 className="mt-4 text-4xl font-semibold">{projectTitle}</h1>
        <p className="mt-4 text-base text-zinc-300">
          A pragmatic customer view with lifecycle state, owner visibility, and quick follow-up context.
        </p>
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-black/30">
        <table className="min-w-full divide-y divide-white/10 text-left text-sm">
          <thead className="bg-white/5 text-zinc-400">
            <tr>
              <th className="px-6 py-4 font-medium">Account</th>
              <th className="px-6 py-4 font-medium">Stage</th>
              <th className="px-6 py-4 font-medium">Owner</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {customers.map((customer) => (
              <tr key={customer.name}>
                <td className="px-6 py-4">{customer.name}</td>
                <td className="px-6 py-4 text-zinc-300">{customer.stage}</td>
                <td className="px-6 py-4 text-zinc-300">{customer.owner}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
`;
  }

  if (page.kind === "settings") {
    return `export default function ${componentName}() {
  const sections = ${serialize([
    "Workspace preferences",
    "Billing and invoices",
    "Roles and permissions",
  ])};
  const projectTitle = ${serialize(projectName)};

  return (
    <div className="space-y-6 text-white">
      <section className="rounded-3xl border border-white/10 bg-zinc-900 p-8">
        <p className="text-sm uppercase tracking-[0.28em] text-orange-300">Settings</p>
        <h1 className="mt-4 text-4xl font-semibold">{projectTitle}</h1>
        <p className="mt-4 text-base text-zinc-300">
          Keep the dashboard credible with settings blocks that reflect account, billing, and governance needs.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {sections.map((section) => (
          <article key={section} className="rounded-3xl border border-white/10 bg-black/30 p-6">
            <p className="text-sm uppercase tracking-[0.24em] text-zinc-400">Section</p>
            <h2 className="mt-3 text-xl font-semibold">{section}</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-300">
              Add account-level controls here without changing the platform shell or route registry.
            </p>
          </article>
        ))}
      </section>
    </div>
  );
}
`;
  }

  return `export default function ${componentName}() {
  const metrics = ${serialize([
    { label: "MRR", value: "$48.2K" },
    { label: "Active customers", value: "126" },
    { label: "Weekly expansion", value: "+12%" },
  ])};
  const activity = ${serialize([
    "New enterprise demo booked",
    "Renewal at-risk account flagged",
    "Usage spike detected on Growth plan",
  ])};
  const projectTitle = ${serialize(projectName)};

  return (
    <div className="space-y-6 text-white">
      <section className="rounded-3xl border border-white/10 bg-zinc-900 p-8">
        <p className="text-sm uppercase tracking-[0.28em] text-orange-300">Dashboard Overview</p>
        <h1 className="mt-4 text-4xl font-semibold">{projectTitle}</h1>
        <p className="mt-4 max-w-3xl text-base text-zinc-300">
          A fallback SaaS dashboard surface with metrics, momentum, and a useful next-action rhythm.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {metrics.map((metric) => (
          <article key={metric.label} className="rounded-3xl border border-white/10 bg-black/30 p-6">
            <p className="text-sm uppercase tracking-[0.22em] text-zinc-400">{metric.label}</p>
            <p className="mt-4 text-3xl font-semibold">{metric.value}</p>
          </article>
        ))}
      </section>

      <section className="rounded-3xl border border-white/10 bg-black/30 p-6">
        <h2 className="text-xl font-semibold">Recent activity</h2>
        <div className="mt-4 space-y-3">
          {activity.map((item) => (
            <div key={item} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-300">
              {item}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
`;
}

function buildWorkspacePageBody(
  page: TemplatePage,
  componentName: string,
  projectName: string,
): string {
  if (page.kind === "board") {
    return `export default function ${componentName}() {
  const columns = ${serialize([
    { title: "To Do", items: ["Define project scope", "Gather requirements"] },
    { title: "In Progress", items: ["Build core features", "Design key screens"] },
    { title: "Done", items: ["Set up project structure", "Create initial wireframes"] },
  ])};
  const projectTitle = ${serialize(projectName)};

  return (
    <div className="space-y-6 text-white">
      <section className="rounded-3xl border border-white/10 bg-zinc-900 p-8">
        <p className="text-sm uppercase tracking-[0.28em] text-orange-300">Board</p>
        <h1 className="mt-4 text-4xl font-semibold">{projectTitle}</h1>
        <p className="mt-4 max-w-3xl text-base text-zinc-300">
          A team board scaffold that makes status, ownership, and flow visible right away.
        </p>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        {columns.map((column) => (
          <article key={column.title} className="rounded-3xl border border-white/10 bg-black/30 p-6">
            <h2 className="text-xl font-semibold">{column.title}</h2>
            <div className="mt-4 space-y-3">
              {column.items.map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-300">
                  {item}
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
`;
  }

  if (page.kind === "settings") {
    return `export default function ${componentName}() {
  const settingsGroups = ${serialize([
    "Team members and roles",
    "Workflow stages",
    "Notification defaults",
  ])};
  const projectTitle = ${serialize(projectName)};

  return (
    <div className="space-y-6 text-white">
      <section className="rounded-3xl border border-white/10 bg-zinc-900 p-8">
        <p className="text-sm uppercase tracking-[0.28em] text-orange-300">Workspace Settings</p>
        <h1 className="mt-4 text-4xl font-semibold">{projectTitle}</h1>
        <p className="mt-4 text-base text-zinc-300">
          Team settings that feel operational from day one, without asking the kernel to change shape.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {settingsGroups.map((group) => (
          <article key={group} className="rounded-3xl border border-white/10 bg-black/30 p-6">
            <p className="text-sm uppercase tracking-[0.22em] text-zinc-400">Settings group</p>
            <h2 className="mt-3 text-xl font-semibold">{group}</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-300">
              Each section is intentionally scaffolded so the workspace never falls back to a blank preview.
            </p>
          </article>
        ))}
      </section>
    </div>
  );
}
`;
  }

  return `export default function ${componentName}() {
  const tasks = ${serialize([
    { title: "Add new item", owner: "Alex", due: "Today" },
    { title: "Review progress", owner: "Sam", due: "Tomorrow" },
    { title: "Update settings", owner: "Jordan", due: "This week" },
  ])};
  const projectTitle = ${serialize(projectName)};

  return (
    <div className="space-y-6 text-white">
      <section className="rounded-3xl border border-white/10 bg-zinc-900 p-8">
        <p className="text-sm uppercase tracking-[0.28em] text-orange-300">Tasks</p>
        <h1 className="mt-4 text-4xl font-semibold">{projectTitle}</h1>
        <p className="mt-4 max-w-3xl text-base text-zinc-300">
          A practical task workspace that can stand in as a non-empty preview when model generation is unavailable.
        </p>
      </section>

      <section className="space-y-3">
        {tasks.map((task) => (
          <article key={task.title} className="rounded-3xl border border-white/10 bg-black/30 p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">{task.title}</h2>
                <p className="mt-2 text-sm text-zinc-400">Owner: {task.owner}</p>
              </div>
              <span className="rounded-full border border-orange-400/30 bg-orange-500/10 px-4 py-2 text-sm text-orange-100">
                {task.due}
              </span>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
`;
}

function buildPageContent(
  template: TemplateDefinition,
  page: TemplatePage,
  projectName: string,
  promptSummary: string,
): string {
  const componentName = buildGeneratedPageComponentName(template.id, page.id);

  if (template.shell === "website") {
    return buildMarketingPageBody(page, componentName, projectName, promptSummary);
  }

  if (template.shell === "dashboard") {
    return buildDashboardPageBody(page, componentName, projectName);
  }

  return buildWorkspacePageBody(page, componentName, projectName);
}

function createRouteFile(
  template: TemplateDefinition,
  page: TemplatePage,
  projectName: string,
  promptSummary: string,
): StudioFile {
  return {
    content: buildPageContent(template, page, projectName, promptSummary),
    kind: "route",
    language: "tsx",
    locked: false,
    path: buildGeneratedPageFilePath(template.id, page.id),
    source: "platform",
  };
}

export async function createFallbackScaffold(
  input: FallbackScaffoldActivityInput,
): Promise<GeneratedBuildDraft> {
  const scaffoldFiles = buildGeneratedScaffoldFiles({
    project: input.project,
    template: input.template,
  });

  return {
    files: [
      ...scaffoldFiles,
      ...input.template.pages.map((page) =>
        createRouteFile(
          input.template,
          page,
          input.project.name,
          input.plan.intentSummary,
        )),
    ],
    previewEntryPath: input.template.previewEntryPath,
    source: "platform",
    summary: `Fallback scaffold for ${input.template.name}`,
    warnings: [
      `Fallback scaffold used because model generation failed: ${input.reason}`,
    ],
  };
}
