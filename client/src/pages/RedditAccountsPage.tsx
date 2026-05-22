/**
 * Reddit Accounts page — VA-driven signup flow + warmed pool monitoring.
 *
 * Mounted at:
 *   /admin/reddit-accounts (admin role)
 *   /assistant/reddit-accounts (VA role)
 *
 * Same component, both routes. Auth gating happens at tRPC layer.
 *
 * v1 scope (this file): Generate Account → AdsPower flow → Mark Created.
 * Future iterations add tabs for Warming/Warmed/Active/Failed pools.
 */

import { useEffect, useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Copy, Eye, EyeOff, RefreshCw, AlertTriangle, CheckCircle2, X, Trash2, Phone, MailX, RotateCw, Clock, Hourglass, Sparkles, Users, AlertCircle, Play, ChevronRight, ShieldAlert, Mail } from 'lucide-react';
import {
  pingAdsPower,
  getAdsPowerApiKey,
  setAdsPowerCredentials,
  createProfile,
  startBrowser,
  stopBrowser,
  getCookies,
  deleteProfile,
  type FingerprintForAdsPower,
  type ProxyForAdsPower,
} from '@/lib/adsPowerClient';

const HEARTBEAT_INTERVAL_MS = 30_000;

interface ActiveSignup {
  accountId: number;
  emailAlias: string;
  password: string;
  expiresAt: string;
  fingerprint: FingerprintForAdsPower;
  proxyConfig: ProxyForAdsPower;
  profileName: string;
  adspowerProfileId?: string;
  adspowerStarted?: boolean;
}

export default function RedditAccountsPage() {
  const [adsPowerOk, setAdsPowerOk] = useState<boolean | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [active, setActive] = useState<ActiveSignup | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [redditUsername, setRedditUsername] = useState('');
  const [marking, setMarking] = useState(false);
  const [inboxRows, setInboxRows] = useState<any[]>([]);
  // Persistent error from a failed AdsPower setup step. Shown inline in the
  // active card so the user actually sees what went wrong (toasts auto-dismiss
  // and we found the user clicking Generate twice without realizing AdsPower
  // had failed mid-flow). Null when there's no error to display.
  const [setupError, setSetupError] = useState<{ step: string; message: string } | null>(null);
  // Tracks whether AdsPower setup is mid-flight so the Retry button knows
  // when it can fire and we don't accidentally launch two browsers.
  const [setupInFlight, setSetupInFlight] = useState(false);

  // ── tRPC mutations / queries ──
  const generateMutation = trpc.redditAccounts.generate.useMutation();
  const setProfileMutation = trpc.redditAccounts.setAdsPowerProfile.useMutation();
  const markCreatedMutation = trpc.redditAccounts.markCreated.useMutation();
  const cancelMutation = trpc.redditAccounts.cancel.useMutation();
  const heartbeatMutation = trpc.redditAccounts.heartbeat.useMutation();
  const reissueEmailMutation = trpc.redditAccounts.reissueEmail.useMutation();
  const markPhoneBlockedMutation = trpc.redditAccounts.markPhoneBlocked.useMutation();
  const markEmailBlockedMutation = trpc.redditAccounts.markEmailBlocked.useMutation();
  const recoverQuery = trpc.redditAccounts.getActiveForCurrentVa.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  // ── Account list query (all accounts in system) — refetches every 15 sec to pick up status changes
  const listQuery = trpc.redditAccounts.list.useQuery(
    { limit: 100 },
    { refetchInterval: 15_000, refetchOnWindowFocus: true },
  );
  const runSessionNowMutation = trpc.redditAccounts.runSessionNow.useMutation();
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [drilldownAccountId, setDrilldownAccountId] = useState<number | null>(null);
  const sessionsQuery = trpc.redditAccounts.getSessions.useQuery(
    { accountId: drilldownAccountId ?? -1, limit: 20 },
    { enabled: drilldownAccountId !== null, refetchInterval: drilldownAccountId !== null ? 10_000 : false },
  );
  const accountsByStatus = useMemo(() => {
    const all = listQuery.data ?? [];
    const groups: Record<string, typeof all> = {};
    for (const a of all) {
      groups[a.status] = groups[a.status] || [];
      groups[a.status]!.push(a);
    }
    return groups;
  }, [listQuery.data]);
  const filteredAccounts = useMemo(() => {
    if (!listQuery.data) return [];
    if (!statusFilter) return listQuery.data;
    return listQuery.data.filter((a) => a.status === statusFilter);
  }, [listQuery.data, statusFilter]);

  // Live countdown to expiry — refreshes every second while active
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active?.accountId]);
  const remaining = useMemo(() => {
    if (!active?.expiresAt) return null;
    const ms = new Date(active.expiresAt).getTime() - now;
    if (ms <= 0) return { mins: 0, secs: 0, expired: true };
    return { mins: Math.floor(ms / 60000), secs: Math.floor((ms % 60000) / 1000), expired: false };
  }, [active?.expiresAt, now]);

  // Inbox waiting timer (resets on each new active session)
  const [inboxWaitStart, setInboxWaitStart] = useState<number | null>(null);
  useEffect(() => {
    if (active && inboxRows.length === 0) {
      setInboxWaitStart(Date.now());
    } else if (inboxRows.length > 0) {
      setInboxWaitStart(null);
    }
  }, [active?.accountId, inboxRows.length]);
  const inboxWaitSecs = inboxWaitStart && active ? Math.floor((now - inboxWaitStart) / 1000) : 0;

  // Restore active session — RUNS ONCE ON MOUNT ONLY.
  // Critical: do NOT depend on `active` here. If we did, every setActive(null)
  // (e.g., from handleCancel) would immediately re-read localStorage and
  // restore the old session before the persist effect below has a chance to
  // clear localStorage. That race made Cancel/Discard buttons appear to do
  // nothing — the card just refused to clear.
  // The case where backend has a pending row but localStorage is empty is
  // handled separately with the inline Recovery card.
  useEffect(() => {
    const persisted = localStorage.getItem('sbgpt.activeSignup');
    if (persisted) {
      try {
        setActive(JSON.parse(persisted));
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist active session
  useEffect(() => {
    if (active) localStorage.setItem('sbgpt.activeSignup', JSON.stringify(active));
    else localStorage.removeItem('sbgpt.activeSignup');
  }, [active]);

  // AdsPower ping every 30s
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const ok = await pingAdsPower();
      if (!cancelled) setAdsPowerOk(ok);
    };
    check();
    const interval = setInterval(check, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Heartbeat while active
  useEffect(() => {
    if (!active) return;
    const send = async () => {
      try {
        await heartbeatMutation.mutateAsync({ accountId: active.accountId });
      } catch {}
    };
    send();
    const interval = setInterval(send, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [active?.accountId]);

  // SSE inbox subscription while active
  useEffect(() => {
    if (!active) return;
    const url = `/api/admin/inbox/stream?emailAlias=${encodeURIComponent(active.emailAlias)}`;
    const es = new EventSource(url, { withCredentials: true });
    es.addEventListener('email', (ev) => {
      try {
        const row = JSON.parse((ev as MessageEvent).data);
        setInboxRows((prev) => {
          if (prev.some((r) => r.id === row.id)) return prev;
          return [...prev, row].sort((a, b) => b.id - a.id);
        });
      } catch {}
    });
    es.addEventListener('timeout', () => es.close());
    es.onerror = () => {
      // Browser auto-reconnects; this is fine
    };
    return () => es.close();
  }, [active?.emailAlias]);

  /**
   * Run the AdsPower side of an active signup: create the profile + start
   * the browser + report both back to the server. Idempotent: if called when
   * a profile already exists for the active session it just (re)starts the
   * browser. Used by both initial generate and the Retry button.
   *
   * Sets `setupError` on failure instead of rolling back the session — the
   * UI shows the error inline with Retry / Cancel buttons so the user has
   * agency. Auto-rollback (the previous behavior) made the active card
   * "flash and disappear" with no visible reason.
   */
  const runAdsPowerSetup = async (draft: ActiveSignup): Promise<void> => {
    setSetupInFlight(true);
    setSetupError(null);
    try {
      let profileId = draft.adspowerProfileId;

      // Step 1: create profile if not already created
      if (!profileId) {
        const created = await createProfile({
          name: draft.profileName,
          fingerprint: draft.fingerprint,
          proxy: draft.proxyConfig,
        }).catch((err) => {
          throw new Error(`createProfile: ${(err as Error).message}`);
        });
        profileId = created.profileId;
        await setProfileMutation.mutateAsync({
          accountId: draft.accountId,
          adspowerProfileId: profileId,
        });
        setActive((curr) => (curr ? { ...curr, adspowerProfileId: profileId } : curr));
      }

      // Step 2: start the browser
      const { wsEndpoint } = await startBrowser(profileId).catch((err) => {
        throw new Error(`startBrowser: ${(err as Error).message}`);
      });
      await setProfileMutation.mutateAsync({
        accountId: draft.accountId,
        adspowerProfileId: profileId,
        adspowerWsEndpoint: wsEndpoint ?? null,
      });
      setActive((curr) =>
        curr ? { ...curr, adspowerProfileId: profileId, adspowerStarted: true } : curr,
      );
      toast.success('Chrome window opened with proxy + fingerprint. Switch to AdsPower to do the Reddit signup.');
    } catch (err) {
      const msg = (err as Error).message;
      console.error('[adspower-setup]', err);
      // Parse the step name out of "step: rest" — multiline-safe via [\s\S]
      const match = msg.match(/^(\w+):\s*([\s\S]+)$/);
      const step = match?.[1] ?? 'unknown';
      const detail = match?.[2] ?? msg;
      setSetupError({ step, message: detail });
      toast.error(`AdsPower ${step} failed. See the error message in the active card.`, {
        duration: 8000,
      });
    } finally {
      setSetupInFlight(false);
    }
  };

  const handleGenerate = async () => {
    if (adsPowerOk !== true) {
      toast.error('AdsPower is not running. Open the AdsPower app on this PC and try again.');
      return;
    }
    if (active) {
      toast.error('Finish or cancel the current signup first.');
      return;
    }
    setSetupError(null);
    try {
      const result = await generateMutation.mutateAsync();
      const draft: ActiveSignup = {
        accountId: result.accountId,
        emailAlias: result.emailAlias,
        password: result.password,
        expiresAt: result.expiresAt,
        fingerprint: result.fingerprint,
        proxyConfig: result.proxyConfig,
        profileName: result.profileName,
      };
      setActive(draft);
      setRedditUsername('');
      setInboxRows([]);
      toast.info('Allocated proxy + email. Creating AdsPower profile...');
      // AdsPower setup runs in its own try/catch so a failure there doesn't
      // tear down the session — it surfaces an inline error + Retry button.
      await runAdsPowerSetup(draft);
    } catch (err) {
      // This catch only fires if the BACKEND generate mutation itself failed
      // (proxy allocation, email allocation, DB write). In that case there's
      // no active session to preserve. Toast + bail.
      const msg = (err as Error).message;
      console.error('[generate]', err);
      toast.error('Generate failed: ' + msg);
    }
  };

  /**
   * Retry the AdsPower setup for the current active session.
   * Used when the inline error banner shows after a transient AdsPower fail.
   */
  const handleRetryAdsPower = async () => {
    if (!active) return;
    if (setupInFlight) return;
    if (adsPowerOk !== true) {
      toast.error('AdsPower is still not running. Open the AdsPower app + CORS proxy and try again.');
      return;
    }
    await runAdsPowerSetup(active);
  };

  const handleMarkCreated = async () => {
    if (!active?.adspowerProfileId) return;
    setMarking(true);
    try {
      // Cookie capture via AdsPower's v2 endpoint:
      //   GET /api/v2/browser-profile/cookies?profile_id=...
      // Earlier v1 endpoint (POST /api/v1/user/cookie/get) was deprecated by
      // AdsPower around 2026-04-30 — calls returned 404 and we mis-attributed
      // that to a plan-tier gate. Accounts #4 worked (pre-migration); #7-#9
      // saved with NO cookies because we were still hitting v1.
      // Now on v2; warming worker uses these cookies to skip re-login.
      let reddit: any[] = [];
      try {
        const cookies = await getCookies(active.adspowerProfileId);
        reddit = cookies.filter((c) => /reddit\.com|redd\.it|redditmedia/.test(c.domain));
        if (reddit.length > 0) {
          toast.success(`Captured ${reddit.length} Reddit cookies — warming session will resume the same login.`);
        } else {
          toast.warning(`AdsPower returned 0 Reddit cookies (browser may have been closed before capture). Warming worker will re-login with stored password.`);
        }
      } catch (cookieErr) {
        const m = (cookieErr as Error).message;
        // Surface the actual error so we can debug if AdsPower changes the API again.
        toast.warning(`Cookie capture failed: ${m.slice(0, 140)}. Warming worker will re-login with stored password.`);
        console.warn('[markCreated] cookie capture failed (non-fatal):', m);
      }
      await markCreatedMutation.mutateAsync({
        accountId: active.accountId,
        redditUsername: redditUsername.trim(),
        cookies: reddit, // may be empty; backend should accept that
      });
      // Stop & delete the AdsPower profile (handoff complete)
      await stopBrowser(active.adspowerProfileId);
      // Keep profile around 24h in case warming worker needs cookies — DON'T delete yet
      toast.success(`Account #${active.accountId} (${redditUsername}) saved! Now in warming queue.`);
      await listQuery.refetch(); // Pull the saved account into the list immediately
      setActive(null);
    } catch (err) {
      toast.error('Mark Created failed: ' + (err as Error).message);
    } finally {
      setMarking(false);
    }
  };

  /**
   * Cancel current signup — best-effort cleanup on AdsPower + backend.
   * ALWAYS clears local state at the end, even if backend errors. The TTL
   * cleanup cron will reconcile any orphan rows server-side anyway.
   */
  const handleCancel = async (opts?: { silent?: boolean; reason?: string }): Promise<void> => {
    if (!active) return;
    const acct = active;
    // Optimistic clear — we always want the UI to be unblocked
    setActive(null);
    setRedditUsername('');
    setShowPassword(false);
    setInboxRows([]);
    setSetupError(null);
    try {
      if (acct.adspowerProfileId) {
        try { await stopBrowser(acct.adspowerProfileId); } catch {}
        try { await deleteProfile(acct.adspowerProfileId); } catch {}
      }
    } catch {}
    try {
      await cancelMutation.mutateAsync({ accountId: acct.accountId, reason: opts?.reason ?? 'va_cancelled' });
      if (!opts?.silent) toast.info(`Signup #${acct.accountId} cancelled.`);
    } catch (err) {
      // Backend cancel failed (already cancelled, TTL fired, etc.) — non-fatal
      if (!opts?.silent) toast.warning(`Cancelled locally. Backend: ${(err as Error).message}`);
    }
    await listQuery.refetch(); // Pull the now-cancelled row into the list
  };

  /** Cancel current signup, then immediately start a new one. */
  const handleDiscardAndStartNew = async () => {
    await handleCancel({ silent: true, reason: 'va_discard_and_regenerate' });
    // small delay so the previous cancel mutation lands before the next generate's proxy alloc
    await new Promise((r) => setTimeout(r, 300));
    await handleGenerate();
  };

  const handleReissueEmail = async () => {
    if (!active) return;
    try {
      const result = await reissueEmailMutation.mutateAsync({ accountId: active.accountId });
      setActive((curr) => (curr ? { ...curr, emailAlias: result.newEmailAlias } : curr));
      setInboxRows([]); // new alias, new inbox
      toast.success(`New email: ${result.newEmailAlias}. Try the signup again.`);
    } catch (err) {
      toast.error('Reissue failed: ' + (err as Error).message);
    }
  };

  const handleMarkPhoneBlocked = async () => {
    if (!active) return;
    const acct = active;
    setActive(null);
    setInboxRows([]);
    try {
      if (acct.adspowerProfileId) {
        try { await stopBrowser(acct.adspowerProfileId); } catch {}
        try { await deleteProfile(acct.adspowerProfileId); } catch {}
      }
      await markPhoneBlockedMutation.mutateAsync({
        accountId: acct.accountId,
      });
      toast.info(`Marked phone-blocked. Proxy will be retired (Reddit flagged the IP).`);
    } catch (err) {
      toast.error('Failed to mark phone-blocked: ' + (err as Error).message);
    }
  };

  const handleMarkEmailBlocked = async () => {
    if (!active) return;
    const acct = active;
    setActive(null);
    setInboxRows([]);
    try {
      if (acct.adspowerProfileId) {
        try { await stopBrowser(acct.adspowerProfileId); } catch {}
        try { await deleteProfile(acct.adspowerProfileId); } catch {}
      }
      await markEmailBlockedMutation.mutateAsync({
        accountId: acct.accountId,
      });
      toast.info(`Marked email-blocked. Domain rejection counter incremented.`);
    } catch (err) {
      toast.error('Failed to mark email-blocked: ' + (err as Error).message);
    }
  };

  /** Used by the recovery card when there's a server-side pending row but no localStorage. */
  const handleAbandonOrphan = async (orphanAccountId: number) => {
    try {
      await cancelMutation.mutateAsync({ accountId: orphanAccountId, reason: 'va_abandon_orphan' });
      toast.success(`Discarded orphaned signup #${orphanAccountId}.`);
      await recoverQuery.refetch();
    } catch (err) {
      toast.error('Could not discard: ' + (err as Error).message);
    }
  };

  /** Manually trigger a warming session for one account (out-of-band from cron). */
  const handleRunSessionNow = async (accountId: number) => {
    try {
      await runSessionNowMutation.mutateAsync({ accountId });
      toast.success(`Warming session #${accountId} started — runs ~5-12 min headless on Railway. Watch the row's status change in 1-2 min.`);
      await listQuery.refetch();
    } catch (err) {
      toast.error('Run Now failed: ' + (err as Error).message);
    }
  };

  const copy = (val: string, label: string) => {
    navigator.clipboard.writeText(val);
    toast.success(`${label} copied`);
  };

  // ── Render ──
  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Reddit Accounts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            VA-driven signup flow via AdsPower. Routed through our proxies for IP consistency.
          </p>
        </div>
        <Badge
          variant={adsPowerOk === true ? 'default' : adsPowerOk === false ? 'destructive' : 'secondary'}
          className="ml-4"
        >
          {adsPowerOk === null
            ? 'Checking AdsPower...'
            : adsPowerOk
            ? '✓ AdsPower connected'
            : '✗ AdsPower not running'}
        </Badge>
      </div>

      {/* CORS proxy banner — shown when AdsPower badge is red, suggests downloading the proxy .exe */}
      {adsPowerOk === false && getAdsPowerApiKey() && (
        <Card className="p-4 mb-4 border-blue-300 bg-blue-50">
          <h3 className="font-semibold mb-1 text-sm">⚙ One-time setup: AdsPower CORS Proxy</h3>
          <p className="text-sm text-muted-foreground mb-2">
            AdsPower's local API doesn't allow direct calls from this domain. Download our tiny
            proxy binary and run it alongside AdsPower — it adds the missing CORS headers locally.
          </p>
          <ol className="text-sm list-decimal pl-5 space-y-1 mb-2">
            <li><a href="/adspower-cors-proxy.exe" download className="text-blue-700 underline font-medium">Download adspower-cors-proxy.exe</a> (Windows, 6.2 MB)</li>
            <li>Save it anywhere (Desktop is fine), double-click to run</li>
            <li>Windows SmartScreen may warn — click "More info" → "Run anyway"</li>
            <li>A console window opens saying "Listening on http://127.0.0.1:50326"</li>
            <li>Click <strong>Edit</strong> below and change port from <code>50325</code> to <code>50326</code>, then save</li>
            <li>This badge should flip green within 5 seconds</li>
          </ol>
          <p className="text-xs text-muted-foreground">
            Keep the proxy console window open while signing up accounts. Closing it stops the proxy.
            Listens only on 127.0.0.1 — safe.
          </p>
        </Card>
      )}

      {/* AdsPower settings — always visible, either form (editing) or confirmation strip (saved) */}
      {(showSettings || !getAdsPowerApiKey()) ? (
        <Card className="p-6 mb-6 border-orange-300">
          <h3 className="font-semibold mb-2">AdsPower Settings</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Paste your AdsPower API key (get it from AdsPower app → Settings → API → Generate Key).
            Stored only in this browser.
          </p>
          <SettingsForm onClose={() => setShowSettings(false)} />
        </Card>
      ) : (
        <Card className="p-3 mb-6 border-green-300 bg-green-50 flex items-center justify-between">
          <div className="text-sm flex items-center gap-2">
            <span className="text-green-700">✓ AdsPower API key configured</span>
            <span className="text-muted-foreground font-mono text-xs">
              ({(getAdsPowerApiKey() ?? '').slice(0, 8)}…{(getAdsPowerApiKey() ?? '').slice(-4)})
            </span>
            <span className="text-muted-foreground text-xs">
              · port {localStorage.getItem('sbgpt.adspower.port') ?? '50325'}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowSettings(true)}>
            Edit
          </Button>
        </Card>
      )}

      {/* Recovery card — backend has pending row, no localStorage (probably closed tab mid-signup) */}
      {!active && recoverQuery.data && (
        <Card className="p-4 mb-4 border-amber-300 bg-amber-50">
          <div className="flex items-start justify-between gap-4">
            <div className="text-sm">
              <h3 className="font-semibold mb-1">⚠ Pending signup from another session</h3>
              <p className="text-muted-foreground mb-1">
                Account #{recoverQuery.data.id} (<code>{recoverQuery.data.emailAlias}</code>) is in <code>pending</code>{' '}
                state on the backend, but the password and AdsPower context are lost (only kept in browser memory at Generate time).
              </p>
              <p className="text-muted-foreground text-xs">
                You can't resume it. Discard it to free the proxy + email, then click Generate Account fresh.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => handleAbandonOrphan(recoverQuery.data!.id)}>
              <Trash2 className="w-4 h-4 mr-1" /> Discard
            </Button>
          </div>
        </Card>
      )}

      {/* ─── Account Dashboard ─── all accounts in the system, grouped by status ─── */}
      <Card className="mb-6 overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-semibold flex items-center gap-2">
              <Users className="w-4 h-4" /> All Reddit Accounts
              <span className="text-xs text-muted-foreground font-normal">
                ({listQuery.data?.length ?? 0} total)
              </span>
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Refreshes every 15 seconds — accounts here are the ones you've created or that are in flight.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => listQuery.refetch()} disabled={listQuery.isFetching}>
            <RefreshCw className={`w-4 h-4 mr-1 ${listQuery.isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Status filter pills */}
        <div className="px-4 py-3 border-b bg-muted/20 flex flex-wrap gap-2 items-center text-xs">
          {[
            { key: null, label: 'All', icon: Users, count: listQuery.data?.length ?? 0 },
            { key: 'pending', label: 'Pending', icon: Clock, count: accountsByStatus['pending']?.length ?? 0 },
            { key: 'awaiting_verification', label: 'Awaiting first warm', icon: Hourglass, count: accountsByStatus['awaiting_verification']?.length ?? 0 },
            { key: 'warming', label: 'Warming', icon: RefreshCw, count: accountsByStatus['warming']?.length ?? 0 },
            { key: 'warmed', label: 'Warmed', icon: Sparkles, count: accountsByStatus['warmed']?.length ?? 0 },
            { key: 'active', label: 'Active (assigned)', icon: CheckCircle2, count: accountsByStatus['active']?.length ?? 0 },
            { key: 'captcha_blocked', label: 'Captcha blocked', icon: ShieldAlert, count: accountsByStatus['captcha_blocked']?.length ?? 0 },
            { key: 'verification_required', label: 'Verify required', icon: Mail, count: accountsByStatus['verification_required']?.length ?? 0 },
            { key: 'phone_blocked', label: 'Phone blocked', icon: Phone, count: accountsByStatus['phone_blocked']?.length ?? 0 },
            { key: 'email_blocked', label: 'Email blocked', icon: MailX, count: accountsByStatus['email_blocked']?.length ?? 0 },
            { key: 'failed', label: 'Failed', icon: AlertCircle, count: accountsByStatus['failed']?.length ?? 0 },
            { key: 'cancelled', label: 'Cancelled', icon: X, count: accountsByStatus['cancelled']?.length ?? 0 },
          ]
            .filter((p) => p.key === null || p.count > 0) // hide buckets that are empty (less noise)
            .map(({ key, label, icon: Icon, count }) => (
              <button
                key={key ?? 'all'}
                onClick={() => setStatusFilter(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition border ${
                  statusFilter === key
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-muted border-transparent text-muted-foreground'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
                <span
                  className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                    statusFilter === key ? 'bg-primary-foreground/20' : 'bg-muted'
                  }`}
                >
                  {count}
                </span>
              </button>
            ))}
        </div>

        {/* Accounts table */}
        <div className="overflow-x-auto">
          {filteredAccounts.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {listQuery.isLoading ? 'Loading…' : 'No accounts yet. Click Generate Account below to create one.'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2 font-medium">#</th>
                  <th className="px-4 py-2 font-medium">Reddit username</th>
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Warming progress</th>
                  <th className="px-4 py-2 font-medium">Proxy</th>
                  <th className="px-4 py-2 font-medium">Last session</th>
                  <th className="px-4 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAccounts.map((acct) => {
                  const inWarming = acct.status === 'warming' || acct.status === 'warmed' || acct.status === 'active';
                  const target = acct.warmingTargetDays ?? 30;
                  const day = Math.min(acct.dayNumber ?? 0, target);
                  const pct = target > 0 ? Math.round((day / target) * 100) : 0;
                  const fail = ['failed', 'cancelled', 'phone_blocked', 'email_blocked', 'captcha_blocked'].includes(acct.status);
                  const canRunNow = ['awaiting_verification', 'warming'].includes(acct.status);
                  return (
                    <tr key={acct.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-2 font-mono text-xs">#{acct.id}</td>
                      <td className="px-4 py-2 font-medium">{acct.redditUsername || <span className="text-muted-foreground italic">(not set)</span>}</td>
                      <td className="px-4 py-2 font-mono text-xs">{acct.emailAlias}</td>
                      <td className="px-4 py-2">
                        <Badge
                          variant={
                            acct.status === 'warmed' || acct.status === 'active'
                              ? 'default'
                              : fail
                              ? 'destructive'
                              : acct.status === 'warming' || acct.status === 'awaiting_verification'
                              ? 'secondary'
                              : 'outline'
                          }
                          className="text-xs"
                        >
                          {acct.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 min-w-[180px]">
                        {inWarming ? (
                          <div>
                            <div className="h-2 rounded bg-muted overflow-hidden">
                              <div
                                className={`h-full ${
                                  acct.status === 'warmed' || acct.status === 'active' ? 'bg-green-500' : 'bg-blue-500'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              Day {day}/{target} {pct === 100 ? '✓' : `(${pct}%)`}
                            </div>
                          </div>
                        ) : fail ? (
                          <span className="text-xs text-muted-foreground italic">{acct.failureReason ?? 'n/a'}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">
                        {acct.proxyId ? `#${acct.proxyId}` : <span className="text-muted-foreground italic">—</span>}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
                        {acct.lastSessionAt
                          ? new Date(acct.lastSessionAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                          : <span className="italic">never</span>}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1">
                          {canRunNow && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2"
                              onClick={() => handleRunSessionNow(acct.id)}
                              disabled={runSessionNowMutation.isPending}
                              title="Trigger a warming session now (don't wait for cron)"
                            >
                              <Play className="w-3 h-3 mr-1" /> Run now
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => setDrilldownAccountId(acct.id)}
                            title="See session history"
                          >
                            History <ChevronRight className="w-3 h-3 ml-1" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* Active signup card */}
      {active ? (
        <Card className="p-6 mb-6 border-2 border-blue-400">
          {/* Header: id + expiry timer + cancel + discard-and-new */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-semibold">Active Signup #{active.accountId}</h2>
              {remaining && (
                <Badge variant={remaining.expired ? 'destructive' : remaining.mins < 5 ? 'secondary' : 'outline'} className="text-xs">
                  {remaining.expired
                    ? '⚠ Expired'
                    : `Expires in ${remaining.mins}:${String(remaining.secs).padStart(2, '0')}`}
                </Badge>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleDiscardAndStartNew} disabled={generateMutation.isPending}>
                <RotateCw className="w-4 h-4 mr-1" /> Discard & Start New
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleCancel()}>
                <X className="w-4 h-4 mr-1" /> Cancel
              </Button>
            </div>
          </div>

          {/* AdsPower profile name banner — most-prominent visual */}
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md p-3 mb-4 flex items-center justify-between gap-3">
            <div className="text-sm">
              <span className="text-muted-foreground">In AdsPower, open profile:</span>{' '}
              <code className="font-mono font-semibold bg-background px-2 py-0.5 rounded ml-1">{active.profileName}</code>
            </div>
            <Button variant="outline" size="sm" onClick={() => copy(active.profileName, 'Profile name')}>
              <Copy className="w-3 h-3 mr-1" /> Copy
            </Button>
          </div>

          {/* Setup error banner — persistent, won't auto-dismiss like a toast.
              Shown when an AdsPower step fails after the row was created.
              Gives the user agency: see what failed, retry, or cancel. */}
          {setupError && (
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-800 rounded-md p-4 mb-4 space-y-3">
              <div className="flex items-start gap-3">
                <span className="text-red-600 dark:text-red-400 mt-0.5">⚠</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-red-800 dark:text-red-200 text-sm mb-1">
                    AdsPower setup failed at step: <code className="font-mono text-xs">{setupError.step}</code>
                  </div>
                  <div className="text-sm text-red-700 dark:text-red-300 break-words">
                    {setupError.message}
                  </div>
                  <div className="text-xs text-red-600/80 dark:text-red-400/80 mt-2">
                    <strong>Common causes:</strong> AdsPower app closed, CORS proxy console window closed,
                    Base-plan profile quota hit (10 max — delete unused profiles in AdsPower), or a network blip.
                    Fix the issue then click Retry. If you'd rather start fresh, click Cancel and click Generate again.
                  </div>
                </div>
              </div>
              <div className="flex gap-2 ml-7">
                <Button
                  size="sm"
                  onClick={handleRetryAdsPower}
                  disabled={setupInFlight || adsPowerOk !== true}
                >
                  {setupInFlight ? 'Retrying...' : 'Retry AdsPower setup'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleCancel()}>
                  Cancel this signup
                </Button>
              </div>
            </div>
          )}

          {/* Credentials */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <Label className="text-xs uppercase">Email</Label>
              <div className="flex gap-2 mt-1">
                <Input value={active.emailAlias} readOnly className="font-mono" />
                <Button variant="outline" size="icon" onClick={() => copy(active.emailAlias, 'Email')}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-xs uppercase">Password</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={showPassword ? active.password : '•'.repeat(active.password.length)}
                  readOnly
                  className="font-mono"
                />
                <Button variant="outline" size="icon" onClick={() => setShowPassword((v) => !v)}>
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
                <Button variant="outline" size="icon" onClick={() => copy(active.password, 'Password')}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Steps */}
          <div className="bg-muted/30 rounded-md p-4 mb-6 text-sm">
            <p className="font-medium mb-2">Steps:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Switch to AdsPower app — find profile shown above</li>
              <li>Click <strong>Open</strong> next to it (Chrome window will appear)</li>
              <li>Inside that Chrome, navigate to <code>reddit.com/register</code></li>
              <li>Paste email above, solve captcha, paste OTP from inbox panel below, pick a username, paste password, finish wizard</li>
              <li>Once logged in, paste the Reddit username here and click Mark Created</li>
            </ol>
            <p className="mt-3 text-amber-700 dark:text-amber-400 text-xs">
              <AlertTriangle className="w-3 h-3 inline mr-1" />
              <strong>DO NOT enable 2FA</strong> on this account. <strong>DO NOT use phone verification.</strong>
            </p>
          </div>

          {/* Live inbox */}
          <div className="mb-6">
            <Label className="text-xs uppercase">Live Inbox ({active.emailAlias})</Label>
            <div className="border rounded-md p-3 mt-1 max-h-48 overflow-y-auto bg-background">
              {inboxRows.length === 0 ? (
                <div className="text-sm text-muted-foreground italic space-y-1">
                  <p>Waiting for OTP from Reddit{inboxWaitSecs > 0 ? ` (${inboxWaitSecs}s)` : ''}…</p>
                  {inboxWaitSecs > 90 && (
                    <p className="text-amber-700 dark:text-amber-400 text-xs not-italic">
                      ⚠ No email after {inboxWaitSecs}s. Reddit may have refused the email — try{' '}
                      <strong>Email rejected → reissue</strong> below.
                    </p>
                  )}
                </div>
              ) : (
                <ul className="space-y-2">
                  {inboxRows.map((row) => (
                    <li key={row.id} className="border-b pb-2 last:border-0">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{new Date(row.receivedAt).toLocaleTimeString()}</span>
                        <span className="font-mono">{row.fromAddress}</span>
                      </div>
                      <div className="text-sm font-medium mt-0.5">{row.subject}</div>
                      {row.extractedCode && (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground">Code:</span>
                          <code className="bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 rounded font-bold text-lg">
                            {row.extractedCode}
                          </code>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copy(row.extractedCode, 'OTP')}
                          >
                            <Copy className="w-3 h-3 mr-1" /> Copy
                          </Button>
                        </div>
                      )}
                      {row.extractedLink && (
                        <a
                          href={row.extractedLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 text-xs underline mt-1 inline-block"
                        >
                          {row.extractedLink}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Stuck? — escalation buttons for known failure modes */}
          <div className="border-t pt-4 mb-4">
            <p className="text-xs text-muted-foreground mb-2 font-medium uppercase">Stuck?</p>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReissueEmail}
                disabled={reissueEmailMutation.isPending}
              >
                <MailX className="w-4 h-4 mr-1" />
                Email rejected → reissue (new domain)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleMarkPhoneBlocked}
                disabled={markPhoneBlockedMutation.isPending}
              >
                <Phone className="w-4 h-4 mr-1" />
                Phone required → abandon
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleMarkEmailBlocked}
                disabled={markEmailBlockedMutation.isPending}
              >
                <MailX className="w-4 h-4 mr-1" />
                All emails rejected → abandon
              </Button>
            </div>
          </div>

          {/* Mark Created form */}
          <div className="border-t pt-4">
            <Label htmlFor="rusername" className="text-sm">After Reddit signup is complete:</Label>
            <div className="flex gap-2 mt-2">
              <Input
                id="rusername"
                placeholder="Reddit username (e.g. vitalspark_q1)"
                value={redditUsername}
                onChange={(e) => setRedditUsername(e.target.value)}
                disabled={marking}
              />
              <Button
                onClick={handleMarkCreated}
                disabled={!redditUsername.match(/^[A-Za-z0-9_-]{3,20}$/) || marking || !active.adspowerProfileId}
              >
                <CheckCircle2 className="w-4 h-4 mr-1" />
                {marking ? 'Saving...' : 'Mark Created'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {!active.adspowerProfileId
                ? '⏳ Waiting for AdsPower profile to finish creating…'
                : !redditUsername
                ? '3-20 chars, alphanumeric + underscore + hyphen'
                : !redditUsername.match(/^[A-Za-z0-9_-]{3,20}$/)
                ? '⚠ Invalid username — must be 3-20 chars, only A-Z, a-z, 0-9, _, -'
                : 'Ready to save when you click Mark Created.'}
            </p>
          </div>
        </Card>
      ) : (
        <Card className="p-12 mb-6 text-center">
          <h3 className="font-semibold mb-2">No active signup</h3>
          <p className="text-sm text-muted-foreground mb-6">
            Click below to start a new Reddit account creation. The system mints a fresh email + password,
            allocates a clean proxy, opens a Chrome window in AdsPower for you to do the signup.
          </p>
          <Button onClick={handleGenerate} disabled={generateMutation.isPending || adsPowerOk !== true}>
            {generateMutation.isPending ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Generating...
              </>
            ) : (
              <>+ Generate Account</>
            )}
          </Button>
          {!getAdsPowerApiKey() && (
            <p className="text-xs text-amber-600 mt-3">
              Set up AdsPower API key first ({' '}
              <button
                onClick={() => setShowSettings(true)}
                className="text-blue-500 underline"
              >
                Settings
              </button>{' '}
              ).
            </p>
          )}
          {adsPowerOk !== true && getAdsPowerApiKey() && (
            <p className="text-xs text-amber-600 mt-3">
              ⚠ AdsPower app not reachable. Open it on this PC, ensure CORS proxy <code>.exe</code> is running, then refresh.
            </p>
          )}
        </Card>
      )}

      {/* Session history drilldown drawer */}
      {drilldownAccountId !== null && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={() => setDrilldownAccountId(null)}
        >
          <Card
            className="w-full max-w-3xl max-h-[80vh] overflow-y-auto bg-background"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-background z-10">
              <h3 className="font-semibold">
                Session history — Account #{drilldownAccountId}
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setDrilldownAccountId(null)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="p-4">
              {sessionsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : (sessionsQuery.data?.length ?? 0) === 0 ? (
                <div className="text-sm text-muted-foreground">
                  <p>No sessions logged yet.</p>
                  <p className="mt-2">Click <strong>Run now</strong> on this account's row to trigger the first session out-of-band, or wait for the next 6h cron tick.</p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {sessionsQuery.data!.map((s) => {
                    const ok = s.outcome === 'success' || s.outcome === 'login_via_cookies' || s.outcome === 'login_via_password';
                    const attempted = (s.actionsAttempted as any) || {};
                    const completed = (s.actionsCompleted as any) || {};
                    return (
                      <li key={s.id} className={`border rounded-md p-3 ${ok ? 'border-green-300 bg-green-50/30' : 'border-red-300 bg-red-50/30'}`}>
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div>
                            <div className="text-sm font-semibold flex items-center gap-2">
                              Session #{s.sessionNumber} · Day {s.dayNumber}
                              <Badge variant={ok ? 'default' : 'destructive'} className="text-xs">{s.outcome}</Badge>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {new Date(s.startedAt).toLocaleString()} {s.completedAt ? ` → ${new Date(s.completedAt).toLocaleTimeString()}` : ' (in flight)'}{' · '}
                              proxy #{s.proxyId ?? '—'}
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            login: {s.loginSucceeded ? '✓' : '✗'}
                          </div>
                        </div>
                        {Object.keys(attempted).length > 0 && (
                          <div className="text-xs text-muted-foreground mt-2 grid grid-cols-2 sm:grid-cols-5 gap-2">
                            {Object.keys(attempted).map((k) => (
                              <div key={k}>
                                <span className="capitalize">{k}:</span>{' '}
                                <span className={completed[k] === attempted[k] ? 'text-green-700' : 'text-amber-700'}>
                                  {completed[k] ?? 0}/{attempted[k]}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        {s.errorDetail && (
                          <div className="text-xs mt-2 p-2 bg-red-100 dark:bg-red-950/40 rounded font-mono break-words whitespace-pre-wrap">
                            {s.errorDetail}
                          </div>
                        )}
                        {s.screenshotPath && (
                          <div className="text-xs text-muted-foreground mt-2">
                            <code>{s.screenshotPath}</code> (Railway server-side; ssh to view)
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// ── Settings sub-component ──
function SettingsForm({ onClose }: { onClose: () => void }) {
  const [apiKey, setApiKey] = useState(getAdsPowerApiKey() ?? '');
  const [port, setPort] = useState(localStorage.getItem('sbgpt.adspower.port') ?? '50325');

  const save = () => {
    setAdsPowerCredentials(apiKey.trim(), port.trim());
    toast.success('AdsPower credentials saved');
    onClose();
  };

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="apiKey">API Key</Label>
        <Input id="apiKey" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="font-mono" />
      </div>
      <div>
        <Label htmlFor="port">Port (default 50325)</Label>
        <Input id="port" value={port} onChange={(e) => setPort(e.target.value)} className="font-mono w-32" />
      </div>
      <div className="flex gap-2 pt-2">
        <Button onClick={save}>Save</Button>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}
