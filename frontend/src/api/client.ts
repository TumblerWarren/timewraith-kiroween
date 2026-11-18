import type {
  Contribution,
  GeneratedDescription,
  CreateInvestigation,
  FlowStep,
  FixBranch,
  GitHubPreview,
  Health,
  Investigation,
  InvestigationSummary,
  LoginMethod,
  Publish,
  ReplayEventMsg,
  Retest,
  SetupStatus,
} from "./types";

/**
 * The backend client. All calls go to `VITE_TW_API_BASE` (default `/api/v1`, which the Vite dev and preview
 * servers proxy to the backend on 127.0.0.1:8787). Errors carry the backend's `{error: {code, message}}`.
 */
export class ApiError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export interface Api {
  health(): Promise<Health>;
  flow(): Promise<readonly FlowStep[]>;
  list(): Promise<readonly InvestigationSummary[]>;
  get(id: string): Promise<Investigation>;
  create(body: CreateInvestigation): Promise<InvestigationSummary>;
  approvePlan(id: string): Promise<InvestigationSummary>;
  cancel(id: string): Promise<InvestigationSummary>;
  deleteCase(id: string): Promise<{ deleted: string }>;
  decideFix(id: string, bugId: string, accept: boolean): Promise<InvestigationSummary>;
  makeBranch(id: string, bugId: string): Promise<FixBranch>;
  branchPatchUrl(id: string, bugId: string): string;
  githubPreview(id: string, bugId: string): Promise<GitHubPreview>;
  prepareContribution(id: string, bugId: string): Promise<Contribution>;
  generateDescription(id: string, bugId: string): Promise<GeneratedDescription>;
  githubPush(id: string, bugId: string, confirmBranch: string, acknowledgeDuplicates: boolean): Promise<Publish>;
  githubPullRequest(id: string, bugId: string, title: string, body: string, confirmBranch: string, acknowledgeDuplicates: boolean): Promise<Publish>;
  githubUpdate(id: string, bugId: string, title: string, body: string, confirmBranch: string): Promise<Publish>;
  retest(id: string, bugId: string, ref: string): Promise<Retest>;
  patchUrl(id: string, bugId: string): string;
  setup(): Promise<SetupStatus>;
  startDocker(): Promise<SetupStatus>;
  startCrew(): Promise<SetupStatus>;
  startLogin(method?: LoginMethod): Promise<SetupStatus>;
  cancelLogin(): Promise<SetupStatus>;
  logout(): Promise<SetupStatus>;
  deleteCrew(): Promise<SetupStatus>;
  githubStart(): Promise<SetupStatus>;
  githubLogin(): Promise<SetupStatus>;
  githubCancel(): Promise<SetupStatus>;
  githubLogout(): Promise<SetupStatus>;
  /** Subscribe to the event stream; returns an unsubscribe function. */
  events(id: string, onEvent: (e: ReplayEventMsg) => void, onEnd: () => void): () => void;
}

const enc = encodeURIComponent;

export function createApi(base: string = import.meta.env.VITE_TW_API_BASE ?? "/api/v1"): Api {
  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      // Every POST carries X-TimeWraith: the backend refuses local actions without it (a cross-site form cannot send it).
      const headers: Record<string, string> = {};
      if (init?.method === "POST") headers["X-TimeWraith"] = "1";
      if (init?.body) headers["Content-Type"] = "application/json";
      res = await fetch(`${base}${path}`, { ...init, headers });
    } catch {
      throw new ApiError("offline", "The TimeWraith backend is not reachable.");
    }
    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!res.ok) {
      const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
      throw new ApiError(err?.code ?? `http_${res.status}`, err?.message ?? `The backend answered ${res.status}.`);
    }
    return data as T;
  }
  const post = <T>(path: string, body?: unknown) =>
    call<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
  const bugPath = (id: string, bugId: string) => `/investigations/${enc(id)}/bugs/${enc(bugId)}`;

  return {
    health: () => call<Health>("/health"),
    flow: () => call<readonly FlowStep[]>("/flow"),
    list: () => call<readonly InvestigationSummary[]>("/investigations"),
    get: (id) => call<Investigation>(`/investigations/${enc(id)}`),
    create: (body) => post<InvestigationSummary>("/investigations", body),
    approvePlan: (id) => post<InvestigationSummary>(`/investigations/${enc(id)}/approve-plan`),
    cancel: (id) => post<InvestigationSummary>(`/investigations/${enc(id)}/cancel`),
    deleteCase: (id) => post<{ deleted: string }>(`/investigations/${enc(id)}/delete`),
    decideFix: (id, bugId, accept) =>
      post<InvestigationSummary>(`/investigations/${enc(id)}/bugs/${enc(bugId)}/fix/${accept ? "accept" : "reject"}`),
    retest: (id, bugId, ref) => post<Retest>(`/investigations/${enc(id)}/bugs/${enc(bugId)}/retest`, { ref }),
    makeBranch: (id, bugId) => post<FixBranch>(`${bugPath(id, bugId)}/branch`),
    branchPatchUrl: (id, bugId) => `${base}${bugPath(id, bugId)}/branch.patch`,
    githubPreview: (id, bugId) => call<GitHubPreview>(`${bugPath(id, bugId)}/github`),
    prepareContribution: (id, bugId) => post<Contribution>(`${bugPath(id, bugId)}/contribution`),
    generateDescription: (id, bugId) => post<GeneratedDescription>(`${bugPath(id, bugId)}/contribution/description`),
    githubPush: (id, bugId, confirmBranch, acknowledgeDuplicates) => post<Publish>(`${bugPath(id, bugId)}/github/push`, {
      confirm_branch: confirmBranch, acknowledge_duplicates: acknowledgeDuplicates,
    }),
    githubPullRequest: (id, bugId, title, body, confirmBranch, acknowledgeDuplicates) =>
      post<Publish>(`${bugPath(id, bugId)}/github/pull-request`, { title, body, confirm_branch: confirmBranch, acknowledge_duplicates: acknowledgeDuplicates }),
    githubUpdate: (id, bugId, title, body, confirmBranch) =>
      post<Publish>(`${bugPath(id, bugId)}/github/update`, { title, body, confirm_branch: confirmBranch }),
    patchUrl: (id, bugId) => `${base}/investigations/${enc(id)}/bugs/${enc(bugId)}/patch`,
    setup: () => call<SetupStatus>("/system/setup"),
    startDocker: () => post<SetupStatus>("/system/docker/start"),
    startCrew: () => post<SetupStatus>("/system/crew/start"),
    startLogin: (method = "builder_id") => post<SetupStatus>("/system/crew/login", { method }),
    cancelLogin: () => post<SetupStatus>("/system/crew/login/cancel"),
    logout: () => post<SetupStatus>("/system/crew/logout"),
    deleteCrew: () => post<SetupStatus>("/system/crew/delete"),
    githubStart: () => post<SetupStatus>("/system/github/start"),
    githubLogin: () => post<SetupStatus>("/system/github/login"),
    githubCancel: () => post<SetupStatus>("/system/github/login/cancel"),
    githubLogout: () => post<SetupStatus>("/system/github/logout"),
    events(id, onEvent, onEnd) {
      if (typeof EventSource === "undefined") return () => undefined;
      const source = new EventSource(`${base}/investigations/${enc(id)}/events`);
      source.addEventListener("replay", (e) => {
        try {
          onEvent(JSON.parse((e as MessageEvent<string>).data) as ReplayEventMsg);
        } catch {
          /* a malformed event is skipped */
        }
      });
      source.addEventListener("end", () => {
        source.close();
        onEnd();
      });
      return () => source.close();
    },
  };
}
