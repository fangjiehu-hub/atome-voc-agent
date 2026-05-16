# PRD: Social Media Risk Monitoring Agent for Atome

## 1. Background

Atome is a leading BNPL fintech company in Southeast Asia. Users discuss their experiences across social media platforms such as Facebook, X/Twitter, Reddit, app stores, forums, and possibly local channels. A meaningful portion of these discussions involve complaints or negative feedback related to:

- interest rates / fees / repayment terms
- debt collection discipline and tone
- app bugs / UX issues / onboarding friction
- payment failures / billing errors
- customer service quality
- credit decisioning / approval rejection
- refunds / merchant disputes
- fraud / scam concerns
- brand / PR / regulatory-sensitive issues

Today, customer service staff manually collect and summarize these complaints monthly. This causes three major problems:

1. Slow and labor-intensive collection across many channels
2. Inconsistent prioritization and categorization
3. Monitoring happens too late, after issues have already spread

The goal is to build an AI agent that continuously monitors social media, detects relevant negative signals early, classifies them, assigns severity, and routes alerts to the right stakeholders.

## 2. Product Vision

Build an internal “Voice of Customer Early Warning Agent” that acts like a real-time radar for Atome’s public reputation and product pain points.

It should:

- detect complaints and negative posts daily, ideally near real time
- organize them into issue categories automatically
- determine severity and urgency
- notify the right internal owners
- provide trend and root-cause visibility
- reduce manual review effort
- shorten issue detection-to-action time

## 3. Business Goals

### Primary goals
- Detect important customer complaints earlier than manual process
- Reduce manual monitoring workload by at least 70%
- Improve issue triage and response quality
- Help product / ops / collections fix issues faster
- Reduce reputational escalation risk

### Secondary goals
- Build structured intelligence on recurring customer pain points
- Provide leadership with daily / weekly risk summaries
- Improve cross-functional collaboration between CS, Product, Collections, Risk, and CEO office

## 4. Users / Stakeholders

### Primary users
- Customer Service Head
- Product Head
- Collection Head
- CEO / leadership team
- Brand / PR team
- Compliance / Risk team

### Secondary users
- CS operations analysts
- Product managers
- Engineering managers
- Collections operations team
- Data / BI team

## 5. Core Use Cases

### Use case 1: Early detection
A user posts on Reddit: “Atome charged me late fees even though I paid already.”
The agent detects the post, tags it under “billing/payment dispute,” assigns severity, and alerts product + CS if severe enough.

### Use case 2: Collection discipline issue
A Facebook thread complains that collection agents are using aggressive tone.
The agent detects multiple similar posts over two days, clusters them, labels “collections conduct,” raises severity, and notifies Collection Head + CEO if threshold exceeded.

### Use case 3: App UX breakdown
X/Twitter and app reviews show multiple posts saying the app crashes during checkout after a new release.
The agent groups similar complaints, identifies rising volume, and sends high-priority alert to Product + Engineering.

### Use case 4: Reputation / regulatory risk
A viral post accuses Atome of predatory practices or unfair fees.
The agent flags it as potential PR / regulatory issue, escalates immediately to CEO, PR, compliance, and relevant business heads.

## 6. Product Scope

## In scope for MVP
- Daily or near-real-time scan of selected platforms
- Capture public posts mentioning Atome and relevant aliases
- Detect negative or risky content
- Categorize into predefined topics
- Assign severity score
- Deduplicate / cluster similar posts
- Alert relevant PICs
- Dashboard for review and drill-down
- Daily digest and urgent alert workflow
- Human review / feedback loop

## Out of scope for MVP
- Automatic public replies to users
- DM / private message handling
- Full multilingual support across every SEA language at once
- Complete closed-loop customer support ticketing
- Regulatory filing automation
- Fake account investigation / legal evidence workflow

These can come in V2.

## 7. Platforms to Monitor

## MVP recommended platforms
- X / Twitter
- Reddit
- Facebook public pages / public groups where accessible
- Google Play reviews
- Apple App Store reviews
- Public forums / complaint boards
- News comments / community sites where accessible

## V2 candidates
- TikTok comments
- YouTube comments
- Instagram public comments
- Local forums by market
- Telegram public groups / channels
- Review websites and merchant review platforms

### Note
Access feasibility depends on platform API policy, scraping legality, authentication limits, and geography. The engineering design should keep platform connectors modular.

## 8. Geographic / Market Scope

Atome operates in multiple SEA markets. The agent should be designed as multi-market from day one.

### Required tagging dimensions
- country / market
- language
- platform
- date/time
- product line (if inferable)
- merchant / use context (if mentioned)

### MVP market suggestion
Start with 1–2 highest-priority markets first, for example:
- Singapore
- Indonesia

or

- Philippines / Malaysia depending on complaint volume

Then expand.

## 9. Functional Requirements

## FR1. Source ingestion
The system shall ingest public content from configured platforms at scheduled intervals.

### Requirements
- configurable connector per platform
- configurable keyword dictionary
- ability to collect:
  - post content
  - comments/replies where feasible
  - author handle
  - timestamp
  - URL / post ID
  - engagement metrics if available
  - market/language if inferable
- ability to backfill recent history for N days

### Keyword logic
Must monitor:
- “Atome”
- common misspellings
- local-language references
- product names / merchant flow references
- complaint phrases paired with brand mention

Should support:
- exact keywords
- fuzzy matching
- context-based detection

## FR2. Relevance filtering
The system shall determine whether a captured post is actually about Atome and not a false positive.

### Requirements
- binary relevance classifier: relevant / irrelevant
- confidence score
- human override
- false positive review queue

Examples:
- “Atome” in unrelated context → irrelevant
- “Atome app charged me twice” → relevant

## FR3. Sentiment and complaint detection
The system shall detect whether content is negative, neutral, or positive, with emphasis on negative/risk content.

### Requirements
- sentiment score
- complaint intent detection
- sarcasm / frustration heuristics where possible
- complaint vs question vs suggestion vs praise
- ability to flag:
  - negative complaint
  - reputational risk
  - regulatory-sensitive complaint
  - fraud allegation
  - harassment / collection abuse claim

## FR4. Topic categorization
The system shall categorize each relevant negative item into one or more issue buckets.

### Initial category taxonomy
1. Interest rate / fees / late charges
2. Billing / payment discrepancy
3. Collection discipline / harassment / tone
4. App bug / crash / performance
5. UI/UX confusion / onboarding friction
6. Credit approval / rejection / limit issue
7. Refund / cancellation / merchant dispute
8. Customer service responsiveness / resolution quality
9. Fraud / scam / account takeover
10. Account access / login / KYC issue
11. Repayment schedule / auto-debit issue
12. Compliance / fairness / consumer protection concern
13. General brand dissatisfaction
14. Other / uncategorized

### Requirements
- support multi-label tagging
- support taxonomy versioning
- allow business admin to edit categories without code deployment

## FR5. Severity scoring
The system shall assign severity to each item and each cluster.

### Severity levels
- **S0 Informational**: low-risk complaint, isolated, no action needed immediately
- **S1 Low**: minor issue, monitor only
- **S2 Medium**: actionable issue, team review within 24 hours
- **S3 High**: serious complaint or visible recurring issue, urgent review
- **S4 Critical**: major reputational / compliance / viral / systemic incident

### Severity scoring dimensions
Severity should not be based on sentiment alone. It should combine:

1. **Sentiment intensity**
2. **Topic sensitivity**
   - collection abuse > UI confusion
3. **User impact claim**
   - “I dislike the app” < “charged twice / threatened / cannot repay”
4. **Virality / reach**
   - followers, likes, reposts, comments
5. **Recurrence**
   - many similar posts in short period
6. **Market sensitivity**
   - complaints in critical market may weigh higher
7. **Regulatory / legal exposure**
   - accusations of unfair practices, harassment, privacy breach
8. **Executive sensitivity**
   - issue linked to press, influencers, activists, public figures
9. **Trend acceleration**
   - complaint volume spike day-over-day
10. **Credibility**
   - detailed post with screenshots / evidence > vague rant

### Example severity rule ideas
- Collection harassment allegation + multiple users + screenshots = S4
- Several payment failure complaints after release = S3
- Single negative UX comment with low engagement = S1
- Viral tweet alleging predatory rates = S4
- Repeated customer support delays across platforms = S2 or S3 depending on volume

## FR6. Clustering and deduplication
The system shall group similar posts into issue clusters.

### Requirements
- detect duplicate reposts / screenshots
- cluster similar complaints by semantic similarity
- create incident-level view:
  - title
  - summary
  - affected market
  - count of posts
  - trend over time
  - top representative examples
- update cluster severity dynamically as more posts arrive

This is critical because leadership should see “one growing issue” rather than 200 separate posts.

## FR7. Alerting and routing
The system shall send alerts to the right people based on category, severity, and market.

### Routing examples
- UI/UX / app bug → Product Head / Engineering lead
- Collection discipline → Collection Head / Risk / CEO if high severity
- Interest rate / fee transparency → Product / Compliance / CEO if severe
- CS dissatisfaction → Customer Service Head
- Fraud / scam / security → Risk / Security / CEO if severe
- PR / reputational crisis → CEO / PR / Compliance

### Alert channels
- Email
- Slack / Lark / Teams
- WhatsApp optional later
- dashboard notification

### Alert types
1. **Immediate alert**
   - for S3 / S4
2. **Daily digest**
   - summary by category / market / severity
3. **Weekly trend report**
   - recurring themes, spikes, unresolved clusters

### Alert payload
Each alert should include:
- severity
- category
- summary
- affected market
- why flagged
- trend vs previous period
- top example posts with links
- recommended owner
- recommended next step

## FR8. Dashboard and case management
The system shall provide an internal dashboard.

### Dashboard views
1. Executive overview
   - number of negative mentions
   - top issues
   - critical incidents
   - trend by market/platform
2. Operations triage view
   - queue of new incidents
   - severity
   - category
   - owner
   - status
3. Drill-down detail page
   - clustered posts
   - timeline
   - examples
   - reason for severity
   - notes / actions

### Workflow fields
- status: new / acknowledged / in review / actioned / resolved / ignored
- owner
- due date
- internal notes
- escalation history
- linked JIRA / ticket if any

## FR9. Human feedback loop
The system shall allow users to correct AI outputs.

### Requirements
Users can:
- mark false positive
- change category
- change severity
- merge or split clusters
- mark issue as resolved
- add root cause notes

These corrections should be logged for model improvement.

## FR10. Reporting and analytics
The system shall support recurring reporting.

### Required reports
- daily complaint summary
- weekly trend report
- monthly root-cause summary
- incident leaderboard by category
- market comparison
- platform comparison
- severity distribution
- time-to-detection
- time-to-acknowledgement
- time-to-resolution

## 10. Non-Functional Requirements

## Performance
- ingestion frequency: at least daily for MVP, preferably every 1–4 hours
- critical alert latency: under 30 minutes from ingestion for high-severity items
- dashboard load time: under 3 seconds for common queries

## Accuracy targets for MVP
- relevance precision > 85%
- negative complaint recall > 80%
- category accuracy > 75%
- critical severity recall > 90%

## Reliability
- retries for failed platform connector jobs
- ingestion logs and monitoring
- alert delivery audit trail

## Security
- internal access control
- role-based access
- encryption at rest and in transit
- audit logs for all manual overrides

## Compliance
- monitor only public data unless explicit permissions exist
- respect platform terms where required
- avoid storing unnecessary personal data
- data retention rules must be configurable
- legal/compliance review required before deployment

## Explainability
For each severity and category classification, the system should expose brief reasoning:
- detected keywords
- sentiment evidence
- similar historical issue
- engagement spike
- compliance-sensitive trigger

## 11. AI / Agent Capabilities

The agent should not be a single black box. It should be designed as a pipeline of smaller services/agents.

### Suggested agent architecture

#### A. Ingestion agent
Collects posts from sources

#### B. Relevance agent
Determines whether the content is truly about Atome

#### C. Sentiment + complaint agent
Determines negativity and complaint nature

#### D. Topic classification agent
Assigns categories

#### E. Severity agent
Calculates severity score using rules + model output

#### F. Clustering agent
Groups similar complaints into incidents

#### G. Alerting agent
Sends structured notifications

#### H. Summary agent
Creates daily/weekly readable summaries for executives

This modular approach is better than one single LLM call.

## 12. Data Model

### Entity: RawPost
- post_id
- source_platform
- url
- author_handle
- author_profile_metadata if available
- content_text
- media_presence
- created_at
- collected_at
- language
- market
- engagement_metrics
- raw_json

### Entity: EnrichedPost
- post_id
- is_relevant
- relevance_confidence
- sentiment_label
- sentiment_score
- complaint_type
- categories[]
- severity_score
- severity_level
- credibility_score
- virality_score
- regulatory_risk_flag
- evidence_flag
- pii_flag if needed
- explanation

### Entity: IncidentCluster
- cluster_id
- title
- summary
- categories[]
- primary_category
- severity_level
- severity_score
- markets[]
- sources[]
- first_seen
- last_seen
- volume
- trend_score
- top_posts[]
- assigned_owner
- status
- escalation_history

### Entity: Alert
- alert_id
- cluster_id or post_id
- alert_type
- recipients
- sent_time
- delivery_status
- acknowledgement_status

### Entity: Feedback
- feedback_id
- object_type
- object_id
- original_value
- corrected_value
- reviewer
- timestamp

## 13. Severity Framework Example

You can give your coding agent a weighted formula as a starting point.

### Example score formula
`severity_score = sentiment_weight + topic_risk_weight + virality_weight + recurrence_weight + regulatory_weight + evidence_weight + trend_weight`

### Example mapping
- 0–19 = S0
- 20–39 = S1
- 40–59 = S2
- 60–79 = S3
- 80–100 = S4

### Example topic risk weight
- collection harassment = +25
- fraud/security claim = +25
- predatory fee / legal accusation = +20
- payment dispute = +15
- app crash / checkout failure = +15
- poor UI = +8

### Example virality weight
- low engagement = +0 to +5
- moderate engagement = +10
- viral = +20

### Example recurrence weight
- isolated = +0
- 3–5 similar posts in 24h = +10
- >10 similar posts in 24h = +20

## 14. Workflow

## Normal flow
1. Platform connectors ingest new public posts
2. Relevance filter removes unrelated noise
3. Sentiment / complaint detector flags negative or risky items
4. Topic classifier tags issue category
5. Severity engine scores item
6. Clustering groups similar complaints
7. Routing engine maps cluster to owners
8. Alert engine sends notifications if thresholds met
9. Dashboard updates
10. Human reviewer adjusts if needed
11. Feedback stored for continuous improvement

## Escalation flow
- S1: dashboard only
- S2: include in daily digest, team review within 24h
- S3: immediate alert to owner + digest to leadership
- S4: immediate escalation to CEO + relevant heads + optional incident war room workflow

## 15. Alert Rules

### Immediate alert triggers
- any S4 incident
- S3 incident with rising volume
- same category spike > X% day-over-day
- multiple complaints about same merchant / release / workflow
- complaint includes harassment / legal / discrimination / privacy / threats
- influencer / media account posts negative content
- screenshot/evidence-backed accusations

### Digest rules
Daily digest should include:
- top 5 incidents
- top rising categories
- market heatmap
- new critical complaints
- unresolved incidents older than threshold
- trend versus yesterday / last 7 days

## 16. Suggested MVP Phases

## Phase 1: MVP
Goal: prove value with 1–2 platforms and 2 markets

### Deliverables
- ingest X/Twitter + Reddit + app reviews
- relevance filter
- 8–10 core categories
- severity scoring
- dashboard
- email / Slack / Lark alerts
- daily digest
- manual feedback loop

## Phase 2
- Facebook public content
- multilingual support expansion
- better clustering
- richer analytics
- role-based routing
- trend anomaly detection

## Phase 3
- TikTok / YouTube / Instagram where feasible
- prediction / early-warning models
- root-cause suggestions
- JIRA / Zendesk integration
- auto-generated remediation recommendations

## 17. Recommended Tech Design Principles

### Architecture
- modular connector-based architecture
- queue/event-driven processing
- LLM only where it adds value
- rules + ML + LLM hybrid
- human-in-the-loop for high-severity cases

### Why hybrid, not LLM-only
Because:
- severity needs deterministic rules
- high-volume ingestion needs cost control
- explainability matters
- compliance wants traceability
- platform noise is high

### Suggested processing pattern
- use rules / lightweight models first
- call LLM only for ambiguous classification, summarization, and incident explanation
- batch summarize clusters instead of summarizing every post individually

## 18. Integration Requirements

The system should integrate with:
- Slack / Lark / email
- JIRA / Linear for bug / issue creation
- Zendesk / CS platform optionally later
- BI / warehouse for reporting
- internal SSO for user access

## 19. Admin / Configuration Requirements

Admin users should be able to configure:
- monitored keywords
- market / language settings
- category taxonomy
- severity thresholds
- routing matrix
- recipient lists
- alert schedule
- ignored sources / spam rules
- retention period

No code deployment should be needed for most of these changes.

## 20. Success Metrics

### Operational
- manual collection time reduced by %
- alert latency
- number of relevant issues detected before monthly review
- false positive rate
- false negative review count

### Business
- reduction in repeated complaint volume for known issues
- faster response to severe incidents
- improved leadership visibility
- increased issue resolution speed
- fewer escalated PR incidents

### Product quality
- issue category precision
- severity accuracy
- cluster quality
- digest usefulness score from stakeholders

## 21. Risks and Mitigations

### Risk: platform API / scraping restrictions
Mitigation:
- modular connectors
- start with accessible sources
- legal review

### Risk: too many false positives
Mitigation:
- strong relevance filter
- human review loop
- whitelists / blacklists

### Risk: LLM hallucination or overreaction
Mitigation:
- rule-based thresholds for escalation
- evidence-based explainability
- confidence scoring

### Risk: multilingual nuance
Mitigation:
- start with limited language scope
- market-specific keyword dictionaries
- local reviewer feedback

### Risk: alert fatigue
Mitigation:
- incident clustering
- threshold tuning
- role-specific routing

### Risk: privacy / compliance concerns
Mitigation:
- public data only
- retention control
- legal sign-off

## 22. Open Questions for Internal Alignment

Your coding agent can proceed, but business should confirm these points:

1. Which markets are in MVP?
2. Which social channels are highest priority?
3. What alert channels do you use internally: email, Slack, Lark, WhatsApp?
4. Who are the exact PICs by category?
5. What issues must always be CEO-visible?
6. Do you want only negative content, or also feature requests and neutral questions?
7. Do you want near-real-time, or is 2–4 times per day enough for MVP?
8. Is app store review monitoring included?
9. Do you need local languages from day one?
10. Should the system create tickets automatically?

## 23. One-Page Implementation Brief for Coding Agent

Build an internal AI-powered monitoring platform that scans public social media and review channels for Atome-related negative content on a daily or near-real-time basis. The system must detect relevant complaints, classify them into categories such as interest rates, collections, UI/UX, billing, app bugs, customer service, fraud, and compliance-related issues, assign a severity level using a hybrid rules + AI framework, cluster similar posts into incidents, and route alerts to the relevant owners such as CEO, Product Head, Customer Service Head, and Collection Head. The system must provide a dashboard, immediate alerting for high-severity incidents, daily digest reports, a human review interface, and configurable routing/taxonomy settings. The architecture should be modular, connector-based, multi-market, and optimized for high precision, explainability, and low alert fatigue.

## 24. Recommended MVP Build Order

1. Define taxonomy, severity rubric, and routing matrix
2. Build ingestion connectors
3. Build relevance filter
4. Build sentiment + complaint detector
5. Build category classifier
6. Build severity scoring engine
7. Build clustering
8. Build alert engine
9. Build dashboard
10. Add human feedback loop
11. Tune thresholds with real data
12. Add weekly and monthly analytics

## 25. Nice-to-Have Features Later

- anomaly detection before complaint volume becomes obvious
- merchant-specific complaint tracking
- auto-draft internal action recommendations
- auto-draft customer service FAQ updates
- compare complaint trends before vs after release
- influencer / KOL watchlist
- competitor benchmark monitoring
- sentiment heatmap by city / region
- executive voice summary every morning
