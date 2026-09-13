export interface ChangelogSections {
  new: string[];
  improved: string[];
  fixed: string[];
}

export interface ChangelogRelease {
  tagName: string;
  title: string;
  publishedAt: string | null;
  htmlUrl: string;
  sections: ChangelogSections;
  fallbackText?: string;
}

export type ChangelogLoadResult = { ok: true; releases: ChangelogRelease[] } | { ok: false };

const RELEASES_URL = "https://api.github.com/repos/Miigget/book_your_miggets/releases?per_page=30";
const USER_AGENT = "Book Your Miggets";
const FETCH_TIMEOUT_MS = 8_000;
const FOR_USERS_HEADING = "## For users (EN)";
const FOR_DEVELOPERS_PREFIX = "## For developers";
const SECTION_HEADINGS = {
  "### New": "new",
  "### Improved": "improved",
  "### Fixed": "fixed",
} as const;

function isSectionHeading(line: string): line is keyof typeof SECTION_HEADINGS {
  return line === "### New" || line === "### Improved" || line === "### Fixed";
}

function emptySections(): ChangelogSections {
  return { new: [], improved: [], fixed: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function stripDevelopers(body: string): string {
  const lines = body.split(/\r?\n/);
  const cut = lines.findIndex((line) => line.startsWith(FOR_DEVELOPERS_PREFIX));
  if (cut === -1) return body;
  return lines.slice(0, cut).join("\n").trimEnd();
}

function parseUserSection(userSection: string): { sections: ChangelogSections; leftover: string[] } {
  const sections = emptySections();
  const leftover: string[] = [];
  let current: keyof ChangelogSections | null = null;

  for (const rawLine of userSection.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (trimmed === "") continue;

    if (isSectionHeading(trimmed)) {
      current = SECTION_HEADINGS[trimmed];
      continue;
    }

    if (current && trimmed.startsWith("- ")) {
      sections[current].push(trimmed.slice(2).trim());
      continue;
    }

    leftover.push(rawLine);
  }

  return { sections, leftover };
}

export function parseReleaseNotes(
  body: string | null | undefined,
): Pick<ChangelogRelease, "sections" | "fallbackText"> {
  if (body == null || body.trim() === "") {
    return { sections: emptySections() };
  }

  const withoutDevelopers = stripDevelopers(body);
  const lines = withoutDevelopers.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === FOR_USERS_HEADING);

  if (start === -1) {
    const fallbackText = withoutDevelopers.trim();
    return fallbackText === "" ? { sections: emptySections() } : { sections: emptySections(), fallbackText };
  }

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) {
      end = i;
      break;
    }
  }

  const userSection = lines.slice(start + 1, end).join("\n");
  const { sections, leftover } = parseUserSection(userSection);
  const fallbackText = leftover.join("\n").trim();
  return fallbackText === "" ? { sections } : { sections, fallbackText };
}

function mapRelease(item: unknown): ChangelogRelease | null {
  if (!isRecord(item)) return null;
  if (item.draft === true || item.prerelease === true) return null;

  const tagName = stringOrNull(item.tag_name)?.trim();
  const htmlUrl = stringOrNull(item.html_url)?.trim();
  if (!tagName || !htmlUrl) return null;

  const name = stringOrNull(item.name)?.trim();
  const publishedAt = stringOrNull(item.published_at);
  const notes = parseReleaseNotes(stringOrNull(item.body));

  return {
    tagName,
    title: name && name.length > 0 ? name : tagName,
    publishedAt,
    htmlUrl,
    sections: notes.sections,
    ...(notes.fallbackText !== undefined ? { fallbackText: notes.fallbackText } : {}),
  };
}

export async function loadChangelogReleases(): Promise<ChangelogLoadResult> {
  try {
    const response = await fetch(RELEASES_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": USER_AGENT,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error("GitHub releases fetch failed", response.status);
      return { ok: false };
    }

    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) {
      console.error("GitHub releases JSON is not an array");
      return { ok: false };
    }

    const releases: ChangelogRelease[] = [];
    for (const item of payload) {
      const mapped = mapRelease(item);
      if (mapped) releases.push(mapped);
    }
    return { ok: true, releases };
  } catch (err) {
    console.error("GitHub releases loader failed", err);
    return { ok: false };
  }
}
