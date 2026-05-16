'use client';

import { SEVERITY_MAP, CATEGORIES } from '@/lib/constants';

const severityLevels = [
  {
    key: 'none' as const,
    name: 'INFO',
    definition: 'Neutral or positive mention, no complaint detected.',
    actions: 'Monitor only.',
  },
  {
    key: 'low' as const,
    name: 'LOW',
    definition: 'Minor isolated issue from a single user.',
    actions: 'Monitor, no immediate action.',
  },
  {
    key: 'medium' as const,
    name: 'MEDIUM',
    definition: 'Actionable issue requiring team review within 24 h.',
    actions: 'E.g. payment failure after release.',
  },
  {
    key: 'high' as const,
    name: 'HIGH',
    definition: 'Serious or recurring complaint, urgent review needed.',
    actions: 'E.g. multiple similar reports, visible post.',
  },
  {
    key: 'critical' as const,
    name: 'CRITICAL',
    definition: 'Major reputational, compliance, viral, or systemic incident.',
    actions: 'E.g. regulatory accusations, viral post >1K engagement, mass outage.',
  },
];

const highRiskCategories = ['debt_collection', 'fraud', 'security'];
const mediumRiskCategories = ['interest_rate', 'refund'];

function categoryFor(key: string) {
  return CATEGORIES.find((c) => c.key === key);
}

function SeverityBadge({ sevKey }: { sevKey: keyof typeof SEVERITY_MAP }) {
  const sev = SEVERITY_MAP[sevKey];
  return (
    <span
      className="inline-block text-[11px] font-bold px-2 py-0.5 rounded whitespace-nowrap"
      style={{ backgroundColor: sev.bg, color: sev.text }}
    >
      {sev.label}
    </span>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-900 text-white text-[12px] font-bold flex items-center justify-center">
      {n}
    </span>
  );
}

function ExampleBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 bg-gray-50 border border-gray-100 rounded-lg p-3.5 text-[12.5px]">
      <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2">
        Example
      </div>
      {children}
    </div>
  );
}

function Arrow() {
  return <span className="text-gray-300 mx-1">&rarr;</span>;
}

export default function MethodologyPage() {
  return (
    <div>
      {/* Header */}
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">
            Severity Methodology
          </h1>
          <p className="text-[13px] text-gray-500 mt-1">
            How posts are scored and escalated — reference for all dashboard users
          </p>
        </div>
      </div>

      {/* Section A — Severity Levels */}
      <div className="bg-white rounded-[14px] border border-gray-200 shadow-sm p-5 mb-4">
        <h3 className="text-sm font-bold text-gray-900 mb-3.5">Severity Levels</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                <th className="pb-2 pr-3 font-semibold">Level</th>
                <th className="pb-2 pr-3 font-semibold">Name</th>
                <th className="pb-2 pr-3 font-semibold">Definition</th>
                <th className="pb-2 font-semibold">Example Actions</th>
              </tr>
            </thead>
            <tbody>
              {severityLevels.map((s) => (
                <tr key={s.key} className="border-b border-gray-50 last:border-0">
                  <td className="py-2.5 pr-3">
                    <SeverityBadge sevKey={s.key} />
                  </td>
                  <td className="py-2.5 pr-3 font-semibold text-gray-900">{s.name}</td>
                  <td className="py-2.5 pr-3 text-gray-700">{s.definition}</td>
                  <td className="py-2.5 text-gray-500">{s.actions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section B — How Scoring Works */}
      <div className="bg-white rounded-[14px] border border-gray-200 shadow-sm p-5 mb-4">
        <h3 className="text-sm font-bold text-gray-900 mb-1">How Scoring Works</h3>
        <p className="text-[13px] text-gray-500 mb-4">
          Every post goes through a 3-step pipeline. The initial severity comes from the LLM,
          then rules can only raise it — never lower it.
        </p>

        {/* Step 1 */}
        <div className="space-y-5">
          <div>
            <div className="flex items-start gap-3">
              <StepNumber n={1} />
              <div className="flex-1">
                <div className="text-[13px] font-semibold text-gray-900">LLM Classification</div>
                <p className="text-[13px] text-gray-600 mt-0.5">
                  Claude Sonnet reads the post and assigns a category, sub-issue, and initial
                  severity based on sentiment intensity, topic sensitivity, user impact claims,
                  evidence quality (e.g. screenshots), and regulatory exposure.
                </p>
                <ExampleBox>
                  <div className="text-gray-600 italic mb-2">
                    &ldquo;Atome charged me twice for my Shopee order, been 3 days no refund&rdquo;
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-gray-700">
                    <span>LLM output:</span>
                    <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-gray-200">transaction / duplicate_charge</span>
                    <Arrow />
                    <SeverityBadge sevKey="medium" />
                  </div>
                  <p className="text-gray-500 mt-1.5">
                    Duplicate charge + refund delay = clear user harm, so the LLM assigns S2 MEDIUM.
                  </p>
                </ExampleBox>
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div>
            <div className="flex items-start gap-3">
              <StepNumber n={2} />
              <div className="flex-1">
                <div className="text-[13px] font-semibold text-gray-900">Rule-Based Overrides</div>
                <p className="text-[13px] text-gray-600 mt-0.5">
                  After the LLM scores the post, deterministic rules check engagement metrics
                  (likes, reposts, replies) and category risk floors. If any rule triggers a
                  higher severity, it overrides the LLM score upward.
                </p>
                <ExampleBox>
                  <div className="text-gray-600 mb-2">
                    Same post, but now it has <span className="font-semibold text-gray-800">620 likes</span> and <span className="font-semibold text-gray-800">45 replies</span>:
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-gray-700">
                    <span>LLM said</span>
                    <SeverityBadge sevKey="medium" />
                    <Arrow />
                    <span>Likes &ge; 500 rule triggers</span>
                    <Arrow />
                    <span>Override to</span>
                    <SeverityBadge sevKey="high" />
                  </div>
                  <p className="text-gray-500 mt-1.5">
                    The 620 likes hit the &ldquo;&ge; 500 likes&rdquo; threshold, so the post is
                    escalated from S2 to S3 — the LLM&apos;s S2 is never used because rules only go up.
                  </p>
                </ExampleBox>
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div>
            <div className="flex items-start gap-3">
              <StepNumber n={3} />
              <div className="flex-1">
                <div className="text-[13px] font-semibold text-gray-900">Cluster Escalation</div>
                <p className="text-[13px] text-gray-600 mt-0.5">
                  Posts about the same issue are grouped into incidents. If a cluster grows
                  large enough, that alone can push severity higher — many people reporting the
                  same thing is a signal the problem is systemic.
                </p>
                <ExampleBox>
                  <div className="text-gray-600 mb-2">
                    14 different users all post about duplicate Shopee charges over 2 days:
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-gray-700">
                    <span>Individual posts at</span>
                    <SeverityBadge sevKey="medium" />
                    <Arrow />
                    <span>Cluster has 14 posts (&gt;10)</span>
                    <Arrow />
                    <span>Incident escalated to</span>
                    <SeverityBadge sevKey="high" />
                  </div>
                  <p className="text-gray-500 mt-1.5">
                    Even though no single post went viral, the cluster size signals a recurring problem.
                  </p>
                </ExampleBox>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section C — Escalation Rules */}
      <div className="bg-white rounded-[14px] border border-gray-200 shadow-sm p-5 mb-4">
        <h3 className="text-sm font-bold text-gray-900 mb-1">Escalation Rules</h3>
        <p className="text-[13px] text-gray-500 mb-5">
          These are all the deterministic rules that can raise a post&apos;s severity after the LLM scores it.
          All rules are evaluated — the highest resulting severity wins.
        </p>

        {/* C1 — Engagement Thresholds */}
        <div className="mb-6">
          <h4 className="text-[13px] font-bold text-gray-800 mb-3">Engagement Thresholds</h4>
          <table className="w-full text-[13px] mb-3">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                <th className="pb-2 pr-3 font-semibold">Condition</th>
                <th className="pb-2 pr-3 font-semibold">Escalation</th>
                <th className="pb-2 font-semibold">Why</th>
              </tr>
            </thead>
            <tbody className="text-[13px]">
              <tr className="border-b border-gray-50">
                <td className="py-2 pr-3 text-gray-700">Reposts &ge; 200</td>
                <td className="py-2 pr-3"><SeverityBadge sevKey="critical" /></td>
                <td className="py-2 text-gray-500">Active viral spread</td>
              </tr>
              <tr className="border-b border-gray-50">
                <td className="py-2 pr-3 text-gray-700">Likes &ge; 1,000</td>
                <td className="py-2 pr-3"><SeverityBadge sevKey="critical" /></td>
                <td className="py-2 text-gray-500">Viral reach</td>
              </tr>
              <tr className="border-b border-gray-50">
                <td className="py-2 pr-3 text-gray-700">Likes &ge; 500</td>
                <td className="py-2 pr-3"><SeverityBadge sevKey="high" /></td>
                <td className="py-2 text-gray-500">High visibility</td>
              </tr>
              <tr className="border-b border-gray-50">
                <td className="py-2 pr-3 text-gray-700">Replies &ge; 50</td>
                <td className="py-2 pr-3"><SeverityBadge sevKey="high" /></td>
                <td className="py-2 text-gray-500">Active discussion thread</td>
              </tr>
              <tr className="border-b border-gray-50 last:border-0">
                <td className="py-2 pr-3 text-gray-700">Likes &ge; 100</td>
                <td className="py-2 pr-3"><SeverityBadge sevKey="medium" /></td>
                <td className="py-2 text-gray-500">Moderate visibility</td>
              </tr>
            </tbody>
          </table>
          <ExampleBox>
            <div className="text-gray-600 mb-2">
              A post saying &ldquo;Atome app keeps crashing lol&rdquo; — the LLM scores it <SeverityBadge sevKey="low" /> (minor complaint, single user).
              But it gets <span className="font-semibold text-gray-800">1,200 likes</span> and <span className="font-semibold text-gray-800">230 reposts</span>.
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-gray-700">
              <SeverityBadge sevKey="low" />
              <Arrow />
              <span>Likes &ge; 1K rule</span>
              <Arrow />
              <SeverityBadge sevKey="critical" />
            </div>
            <p className="text-gray-500 mt-1.5">
              The complaint itself is minor, but the reach means thousands of people see it — that&apos;s a reputational event.
            </p>
          </ExampleBox>
        </div>

        {/* C2 — Category Risk Floors */}
        <div className="mb-6">
          <h4 className="text-[13px] font-bold text-gray-800 mb-3">Category Risk Floors</h4>
          <p className="text-[13px] text-gray-500 mb-3">
            Some categories are inherently higher-risk. Even if the LLM scores them low,
            these floors guarantee a minimum severity.
          </p>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="border border-gray-100 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <SeverityBadge sevKey="medium" />
                <span className="text-[12px] font-semibold text-gray-600">Floor: min S2</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {highRiskCategories.map((key) => {
                  const cat = categoryFor(key);
                  return (
                    <span
                      key={key}
                      className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-2 py-1 rounded-md bg-gray-50 text-gray-800"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                        style={{ backgroundColor: cat?.color ?? '#9CA3AF' }}
                      />
                      {cat?.label ?? key}
                    </span>
                  );
                })}
              </div>
            </div>
            <div className="border border-gray-100 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <SeverityBadge sevKey="low" />
                <span className="text-[12px] font-semibold text-gray-600">Floor: min S1</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {mediumRiskCategories.map((key) => {
                  const cat = categoryFor(key);
                  return (
                    <span
                      key={key}
                      className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-2 py-1 rounded-md bg-gray-50 text-gray-800"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                        style={{ backgroundColor: cat?.color ?? '#9CA3AF' }}
                      />
                      {cat?.label ?? key}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>

          <ExampleBox>
            <div className="text-gray-600 mb-2">
              A user tweets &ldquo;Someone used my Atome account to buy something, I didn&apos;t authorize this&rdquo; — neutral
              tone, no evidence attached. The LLM might score it <SeverityBadge sevKey="low" /> based on
              tone alone.
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-gray-700">
              <span>Category:</span>
              <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-gray-200">fraud</span>
              <Arrow />
              <span>Fraud floor = min S2</span>
              <Arrow />
              <SeverityBadge sevKey="low" />
              <span>overridden to</span>
              <SeverityBadge sevKey="medium" />
            </div>
            <p className="text-gray-500 mt-1.5">
              Fraud reports always get at least S2 regardless of tone, because the potential harm is high.
            </p>
          </ExampleBox>
        </div>

        {/* C3 — Cluster Escalation */}
        <div>
          <h4 className="text-[13px] font-bold text-gray-800 mb-3">Cluster Size Escalation</h4>
          <p className="text-[13px] text-gray-500 mb-3">
            When multiple posts are grouped into the same incident, the cluster size itself
            can trigger escalation — many people reporting the same problem is a strong signal.
          </p>

          <div className="space-y-2 mb-3">
            <div className="flex items-center gap-3 p-2.5 border border-gray-100 rounded-lg">
              <span className="text-[13px] text-gray-700 flex-1">
                <span className="font-semibold text-gray-900">&gt; 10 posts</span> in a cluster
              </span>
              <SeverityBadge sevKey="high" />
            </div>
            <div className="flex items-center gap-3 p-2.5 border border-gray-100 rounded-lg">
              <span className="text-[13px] text-gray-700 flex-1">
                <span className="font-semibold text-gray-900">&gt; 25 posts</span> in a cluster
              </span>
              <SeverityBadge sevKey="critical" />
            </div>
          </div>

          <ExampleBox>
            <div className="text-gray-600 mb-2">
              Over 3 days, 28 users post about GCash payments failing on Atome.
              Each individual post is <SeverityBadge sevKey="low" /> or <SeverityBadge sevKey="medium" /> — none go viral.
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-gray-700">
              <span>28 posts clustered (&gt; 25)</span>
              <Arrow />
              <span>Incident auto-escalated to</span>
              <SeverityBadge sevKey="critical" />
            </div>
            <p className="text-gray-500 mt-1.5">
              No single post looks alarming, but 28 people reporting the same payment failure means
              something is broken at the system level.
            </p>
          </ExampleBox>
        </div>
      </div>

      {/* Section D — Key Principles */}
      <div className="bg-white rounded-[14px] border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-bold text-gray-900 mb-3.5">Key Principles</h3>
        <ul className="space-y-2 text-[13px] text-gray-700 list-disc list-inside">
          <li>
            <span className="font-semibold text-gray-900">No downgrades</span> — overrides only
            escalate, never reduce severity.
          </li>
          <li>
            <span className="font-semibold text-gray-900">Highest wins</span> — all rules are
            evaluated; the highest resulting severity applies.
          </li>
          <li>
            <span className="font-semibold text-gray-900">Deterministic</span> — the rule-based
            layer ensures explainability regardless of LLM output.
          </li>
          <li>
            <span className="font-semibold text-gray-900">Hybrid model</span> — LLM + rules +
            clustering, not LLM-only.
          </li>
        </ul>
      </div>
    </div>
  );
}
