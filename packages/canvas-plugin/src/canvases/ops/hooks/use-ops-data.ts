// Ops Monitor - React hook wrapper around data loaders
// The pure data loading lives in ../data-loaders.ts

import { useState, useEffect, useCallback } from "react";
import type {
  OpsConfig,
  InboxAgentSummary,
  TicketInfo,
  RepoGitStatus,
  IdeaItem,
  ActionItem,
  TmuxSession,
  ReviewStatus,
  SummaryCounts,
} from "../types";
import { DEFAULT_AGENTS } from "../types";
import {
  getDefaultTeamPath,
  readInbox,
  readTickets,
  readAllGitStatuses,
  readIdeas,
  readActions,
  readTmuxSessions,
  readReviewStatus,
  enrichWithActiveSessions,
} from "../data-loaders";
import { join } from "path";

// ── The hook ────────────────────────────────────────────────────────

export interface OpsData {
  inboxData: InboxAgentSummary[];
  ticketData: TicketInfo[];
  gitStatuses: RepoGitStatus[];
  ideas: IdeaItem[];
  actions: ActionItem[];
  tmuxSessions: TmuxSession[];
  reviewStatus: ReviewStatus;
  counts: SummaryCounts;
  lastRefresh: Date;
  refresh: () => void;
}

export function useOpsData(config?: OpsConfig): OpsData {
  const teamPath = getDefaultTeamPath();
  const inboxPath = config?.inboxPath || join(teamPath, "shared/messages/inbox");
  const ticketsPath = config?.ticketsPath || join(teamPath, "shared/tickets");
  const agents = config?.agents || DEFAULT_AGENTS;

  const [inboxData, setInboxData] = useState<InboxAgentSummary[]>([]);
  const [ticketData, setTicketData] = useState<TicketInfo[]>([]);
  const [gitStatuses, setGitStatuses] = useState<RepoGitStatus[]>([]);
  const [ideas, setIdeas] = useState<IdeaItem[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [tmuxSessions, setTmuxSessions] = useState<TmuxSession[]>([]);
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>({
    lastActionPlanDate: "",
    lastActionPlanDaysAgo: -1,
    agentReflections: [],
    agentActivity: [],
    newReflectionsSinceLastPlan: 0,
    reviewDue: false,
  });
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const refresh = useCallback(() => {
    setInboxData(readInbox(inboxPath, agents));
    setTicketData(readTickets(ticketsPath));
    setGitStatuses(readAllGitStatuses(teamPath));
    setIdeas(readIdeas(teamPath, agents));
    setActions(readActions(teamPath, agents));
    const sessions = readTmuxSessions();
    const review = readReviewStatus(teamPath, agents);
    enrichWithActiveSessions(review.agentActivity, sessions);
    setTmuxSessions(sessions);
    setReviewStatus(review);
    setLastRefresh(new Date());
  }, [inboxPath, ticketsPath, agents, teamPath]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, [refresh]);

  // Compute counts from loaded data
  const flatMessages = inboxData.flatMap((s) => s.messages);
  const counts: SummaryCounts = {
    inbox: flatMessages.length,
    ticketsOpen: ticketData.length,
    ideas: ideas.length,
    actionsOpen: actions.filter((a) => a.status === "open").length,
    gitClean: gitStatuses.filter((g) => !g.dirty).length,
    gitTotal: gitStatuses.length,
  };

  return {
    inboxData,
    ticketData,
    gitStatuses,
    ideas,
    actions,
    tmuxSessions,
    reviewStatus,
    counts,
    lastRefresh,
    refresh,
  };
}
