'use client';

import { useCallback, useEffect, useState } from 'react';
import * as api from '@/lib/api';

const TEAMS = [
  'Collections', 'Product', 'Engineering', 'Compliance', 'Risk',
  'Security', 'CS', 'CS Head', 'CS Ops', 'CEO Office', 'PR', 'Ops',
];

interface LarkBot {
  id: number;
  team_name: string;
  webhook_url: string;
  description: string;
  is_active: boolean;
  created_at: string;
}

function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname;
    if (path.length > 20) {
      return `${u.origin}${path.slice(0, 16)}...${path.slice(-4)}`;
    }
    return url;
  } catch {
    return url.length > 40 ? `${url.slice(0, 36)}...` : url;
  }
}

export default function SettingsPage() {
  const [crawlStatus, setCrawlStatus] = useState<string | null>(null);

  // Lark Bots state
  const [bots, setBots] = useState<LarkBot[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formTeam, setFormTeam] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formError, setFormError] = useState('');
  const [testingId, setTestingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editUrl, setEditUrl] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [toast, setToast] = useState<{ message: string; ok: boolean } | null>(null);

  const loadBots = useCallback(async () => {
    try {
      const data = await api.getLarkBots();
      setBots(data);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => { loadBots(); }, [loadBots]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleCrawl = async (platform: string) => {
    try {
      setCrawlStatus(`Starting ${platform} crawl...`);
      const result = await api.triggerCrawl(platform, 24);
      setCrawlStatus(result.message || 'Crawl started');
    } catch {
      setCrawlStatus('Failed to start crawl. Is the backend running?');
    }
  };

  const handleAddBot = async () => {
    setFormError('');
    if (!formTeam) { setFormError('Select a team'); return; }
    if (!formUrl.trim()) { setFormError('Webhook URL is required'); return; }
    try {
      await api.createLarkBot({ team_name: formTeam, webhook_url: formUrl, description: formDesc });
      setShowForm(false);
      setFormTeam(''); setFormUrl(''); setFormDesc('');
      await loadBots();
      setToast({ message: `Bot for ${formTeam} created`, ok: true });
    } catch (e: any) {
      setFormError(e.message || 'Failed to create bot');
    }
  };

  const handleToggle = async (bot: LarkBot) => {
    try {
      await api.updateLarkBot(bot.id, { is_active: !bot.is_active });
      await loadBots();
    } catch {
      setToast({ message: 'Failed to update bot', ok: false });
    }
  };

  const handleDelete = async (bot: LarkBot) => {
    try {
      await api.deleteLarkBot(bot.id);
      await loadBots();
      setToast({ message: `Bot for ${bot.team_name} deleted`, ok: true });
    } catch {
      setToast({ message: 'Failed to delete bot', ok: false });
    }
  };

  const handleTest = async (bot: LarkBot) => {
    setTestingId(bot.id);
    try {
      const result = await api.testLarkBot(bot.id);
      setToast({ message: result.message, ok: result.ok });
    } catch {
      setToast({ message: 'Test request failed', ok: false });
    } finally {
      setTestingId(null);
    }
  };

  const startEdit = (bot: LarkBot) => {
    setEditingId(bot.id);
    setEditUrl(bot.webhook_url);
    setEditDesc(bot.description);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditUrl('');
    setEditDesc('');
  };

  const saveEdit = async (bot: LarkBot) => {
    if (!editUrl.trim()) {
      setToast({ message: 'Webhook URL is required', ok: false });
      return;
    }
    try {
      await api.updateLarkBot(bot.id, { webhook_url: editUrl, description: editDesc });
      setEditingId(null);
      await loadBots();
      setToast({ message: `${bot.team_name} updated`, ok: true });
    } catch {
      setToast({ message: 'Failed to update bot', ok: false });
    }
  };

  const usedTeams = new Set(bots.map(b => b.team_name));
  const availableTeams = TEAMS.filter(t => !usedTeams.has(t));

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">Settings</h1>
        <p className="text-[13px] text-gray-500 mt-1">System configuration and manual operations</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Crawl controls */}
        <div className="bg-white rounded-[14px] border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-3.5">Manual Crawl</h3>
          <p className="text-xs text-gray-600 mb-4">
            Trigger a crawl job manually. Automated crawls run at 8 AM and 8 PM PHT.
          </p>
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => handleCrawl('reddit')}
              className="px-4 py-2 bg-[#FF4500] text-white rounded-lg text-sm font-semibold hover:opacity-90"
            >
              Crawl Reddit
            </button>
            <button
              onClick={() => handleCrawl('twitter')}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:opacity-90"
            >
              Crawl X/Twitter
            </button>
            <button
              onClick={() => handleCrawl('all')}
              className="px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-semibold hover:opacity-90"
            >
              Crawl All
            </button>
          </div>
          {crawlStatus && (
            <div className="text-xs text-gray-600 bg-gray-50 rounded p-2">{crawlStatus}</div>
          )}
        </div>

        {/* System info */}
        <div className="bg-white rounded-[14px] border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-3.5">System Info</h3>
          <div className="space-y-2 text-[13px]">
            <div className="flex justify-between py-1.5 border-b border-gray-100">
              <span className="text-gray-500">Brand</span>
              <span className="font-semibold">atome_ph</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-100">
              <span className="text-gray-500">Market</span>
              <span className="font-semibold">Philippines</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-100">
              <span className="text-gray-500">Platforms</span>
              <span className="font-semibold">X/Twitter + Reddit</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-100">
              <span className="text-gray-500">LLM Model</span>
              <span className="font-semibold">Claude Sonnet</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-100">
              <span className="text-gray-500">Crawl Schedule</span>
              <span className="font-semibold">8 AM, 8 PM PHT</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-gray-500">Digest Schedule</span>
              <span className="font-semibold">9 AM PHT</span>
            </div>
          </div>
        </div>
      </div>

      {/* Lark Bots — full width */}
      <div className="bg-white rounded-[14px] border border-gray-200 shadow-sm p-5 mt-4">
        <div className="flex items-center justify-between mb-3.5">
          <div>
            <h3 className="text-sm font-bold text-gray-900">Lark Bots</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Map each team to its own Lark group chat webhook for fan-out alerts
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowForm(true); setFormError(''); }}
              disabled={availableTeams.length === 0}
              className="px-3 py-1.5 bg-brand-500 text-white rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add Bot
            </button>
          </div>
        </div>

        {/* Add bot form */}
        {showForm && (
          <div className="border border-gray-200 rounded-lg p-4 mb-4 bg-gray-50">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Team</label>
                <select
                  value={formTeam}
                  onChange={e => setFormTeam(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                >
                  <option value="">Select team...</option>
                  {availableTeams.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Webhook URL</label>
                <input
                  type="url"
                  value={formUrl}
                  onChange={e => setFormUrl(e.target.value)}
                  placeholder="https://open.larksuite.com/open-apis/bot/v2/hook/..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Description (optional)</label>
                <input
                  type="text"
                  value={formDesc}
                  onChange={e => setFormDesc(e.target.value)}
                  placeholder="e.g. Product team Lark group"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
            </div>
            {formError && <p className="text-xs text-red-600 mt-2">{formError}</p>}
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleAddBot}
                className="px-4 py-1.5 bg-brand-500 text-white rounded-lg text-xs font-semibold hover:opacity-90"
              >
                Save
              </button>
              <button
                onClick={() => { setShowForm(false); setFormError(''); }}
                className="px-4 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Bots table */}
        {loadError ? (
          <div className="text-center py-8 text-sm text-red-500">
            Failed to load Lark bots. Is the backend running?
          </div>
        ) : bots.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-400">
            No Lark bots configured. Click &quot;Add Bot&quot; to connect a team.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">Team</th>
                  <th className="text-left px-4 py-2.5 font-medium">Webhook URL</th>
                  <th className="text-left px-4 py-2.5 font-medium">Description</th>
                  <th className="text-center px-4 py-2.5 font-medium">Status</th>
                  <th className="text-right px-4 py-2.5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {bots.map(bot => editingId === bot.id ? (
                  <tr key={bot.id} className="bg-gray-50">
                    <td className="px-4 py-3 font-semibold text-gray-900">{bot.team_name}</td>
                    <td className="px-4 py-2">
                      <input
                        type="url"
                        value={editUrl}
                        onChange={e => setEditUrl(e.target.value)}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={editDesc}
                        onChange={e => setEditDesc(e.target.value)}
                        placeholder="Description"
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleToggle(bot)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${bot.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${bot.is_active ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-1.5 justify-end">
                        <button
                          onClick={() => saveEdit(bot)}
                          className="px-2.5 py-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded hover:bg-green-100"
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={bot.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-semibold text-gray-900">{bot.team_name}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{maskUrl(bot.webhook_url)}</td>
                    <td className="px-4 py-3 text-gray-500">{bot.description || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleToggle(bot)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${bot.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${bot.is_active ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-1.5 justify-end">
                        <button
                          onClick={() => startEdit(bot)}
                          className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-gray-50 border border-gray-300 rounded hover:bg-gray-100"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleTest(bot)}
                          disabled={testingId === bot.id}
                          className="px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 disabled:opacity-50"
                        >
                          {testingId === bot.id ? 'Testing...' : 'Test'}
                        </button>
                        <button
                          onClick={() => handleDelete(bot)}
                          className="px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
