-- =============================================================================
-- Atome VoC Early Warning Agent — Database Initialization
-- =============================================================================
-- Generated from the running schema (Alembic revision 011). PostgreSQL 17.
--
-- Contents:
--   * Full schema: all 14 tables, indexes, constraints
--   * Reference/seed data ONLY:
--       - taxonomy_categories (13 categories)
--       - app_settings        (config singleton: thresholds, ownership,
--                              secondary/CC teams, display defaults, schedules)
--       - alembic_version     (stamped to 011, so `alembic upgrade head`
--                              recognizes the schema and applies only newer
--                              migrations later)
--   * NO runtime / PII data (posts, alerts, incidents, feedback, corrections,
--     alert_messages, users, lark_bots, alert_delivery_configs, routing_rules).
--
-- Usage:
--   createdb atome_voc            # or your DB name
--   psql -d atome_voc -f init_db.sql
--
-- After this, point the app's DATABASE_URL at the DB (already at rev 011).
-- NOTE: bare-metal deploys do NOT auto-migrate — run `alembic upgrade head`
-- after any future `git pull` that adds migrations. (The Docker image runs it
-- automatically on boot.)
--
-- Roles/ownership are stripped (--no-owner --no-privileges); objects are owned
-- by whoever runs this script.
-- =============================================================================

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.7 (Ubuntu 17.7-3.pgdg24.04+1)
-- Dumped by pg_dump version 17.7 (Ubuntu 17.7-3.pgdg24.04+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: alembic_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alembic_version (
    version_num character varying(32) NOT NULL
);


--
-- Name: alert_delivery_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alert_delivery_configs (
    id bigint NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    taxonomy character varying(50) NOT NULL,
    primary_owner_name character varying(100),
    primary_owner_lark_open_id character varying(100),
    lark_group_name character varying(200),
    lark_group_webhook text,
    delivery_channels character varying[],
    priority_threshold character varying(20) DEFAULT 'High'::character varying NOT NULL,
    cooldown_hours integer DEFAULT 24 NOT NULL,
    last_triggered_at timestamp with time zone,
    last_delivery_status character varying(20),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    email_address character varying(200)
);


--
-- Name: alert_delivery_configs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.alert_delivery_configs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: alert_delivery_configs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.alert_delivery_configs_id_seq OWNED BY public.alert_delivery_configs.id;


--
-- Name: alert_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alert_messages (
    id bigint NOT NULL,
    alert_type character varying(30) NOT NULL,
    title character varying(500),
    message_body text,
    taxonomy character varying(50),
    related_incident_ids integer[],
    related_post_ids integer[],
    delivery_channel character varying(30),
    target_name character varying(200),
    target_id character varying(500),
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    error_message text,
    generated_at timestamp with time zone,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: alert_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.alert_messages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: alert_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.alert_messages_id_seq OWNED BY public.alert_messages.id;


--
-- Name: alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alerts (
    id bigint NOT NULL,
    incident_id bigint,
    post_id bigint,
    alert_type character varying(30) NOT NULL,
    severity character varying(20) NOT NULL,
    channel character varying(30) NOT NULL,
    recipients character varying[],
    subject character varying(500),
    body text,
    payload jsonb,
    delivery_status character varying(30) DEFAULT 'pending'::character varying,
    acknowledged_at timestamp with time zone,
    acknowledged_by bigint,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: alerts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.alerts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: alerts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.alerts_id_seq OWNED BY public.alerts.id;


--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    id integer NOT NULL,
    engagement_thresholds jsonb NOT NULL,
    sensitive_keywords character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    ownership jsonb NOT NULL,
    default_market character varying(20) DEFAULT 'PH'::character varying NOT NULL,
    default_source character varying(50) DEFAULT 'X + Reddit'::character varying NOT NULL,
    default_time_window character varying(10) DEFAULT '7d'::character varying NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    daily_alert_enabled boolean DEFAULT true,
    daily_alert_time character varying(10) DEFAULT '09:00'::character varying,
    daily_alert_timezone character varying(50) DEFAULT 'Asia/Singapore'::character varying,
    weekly_summary_enabled boolean DEFAULT true,
    weekly_summary_day character varying(20) DEFAULT 'Monday'::character varying,
    weekly_summary_time character varying(10) DEFAULT '09:00'::character varying,
    weekly_summary_timezone character varying(50) DEFAULT 'Asia/Singapore'::character varying,
    secondary_ownership jsonb,
    CONSTRAINT ck_app_settings_singleton CHECK ((id = 1))
);


--
-- Name: app_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.app_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: app_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.app_settings_id_seq OWNED BY public.app_settings.id;


--
-- Name: corrections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.corrections (
    id bigint NOT NULL,
    mention_id bigint NOT NULL,
    correction_type character varying(30) NOT NULL,
    original_category character varying(50),
    corrected_category character varying(50),
    original_owner character varying(100),
    corrected_owner character varying(100),
    linked_cluster_id character varying(64),
    comment text,
    reviewer_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: corrections_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.corrections_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: corrections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.corrections_id_seq OWNED BY public.corrections.id;


--
-- Name: feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feedback (
    id bigint NOT NULL,
    object_type character varying(30) NOT NULL,
    object_id bigint NOT NULL,
    field_name character varying(50) NOT NULL,
    original_value text,
    corrected_value text,
    reason text,
    reviewer_id bigint,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: feedback_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.feedback_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: feedback_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.feedback_id_seq OWNED BY public.feedback.id;


--
-- Name: incidents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.incidents (
    id bigint NOT NULL,
    incident_code character varying(30) NOT NULL,
    title character varying(500) NOT NULL,
    summary text,
    category character varying(50),
    severity character varying(20) DEFAULT 'low'::character varying NOT NULL,
    platforms character varying[],
    post_count integer DEFAULT 0 NOT NULL,
    first_seen timestamp with time zone,
    last_seen timestamp with time zone,
    trend_pct double precision,
    status character varying(30) DEFAULT 'new'::character varying NOT NULL,
    assigned_to bigint,
    assigned_dept character varying(100),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: incidents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.incidents_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: incidents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.incidents_id_seq OWNED BY public.incidents.id;


--
-- Name: lark_bots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lark_bots (
    id bigint NOT NULL,
    team_name character varying(100) NOT NULL,
    webhook_url character varying(500) NOT NULL,
    description character varying(300) DEFAULT ''::character varying,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: lark_bots_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.lark_bots_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: lark_bots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.lark_bots_id_seq OWNED BY public.lark_bots.id;


--
-- Name: posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.posts (
    id bigint NOT NULL,
    platform character varying(20) NOT NULL,
    brand character varying(50) DEFAULT 'atome_ph'::character varying NOT NULL,
    post_id character varying(255) NOT NULL,
    url text,
    author_handle character varying(255),
    content_text text,
    created_at timestamp with time zone,
    collected_at timestamp with time zone DEFAULT now(),
    engagement_likes integer DEFAULT 0,
    engagement_replies integer DEFAULT 0,
    engagement_reposts integer DEFAULT 0,
    raw_json jsonb,
    is_negative boolean,
    category character varying(50),
    sub_issues character varying[],
    severity character varying(20),
    language character varying(5),
    summary text,
    ai_explanation text,
    annotated_at timestamp with time zone,
    incident_id bigint,
    is_reviewed boolean DEFAULT false,
    engagement_comments integer DEFAULT 0 NOT NULL,
    engagement_score integer DEFAULT 0 NOT NULL,
    engagement_level character varying(20),
    mention_status character varying(30) DEFAULT 'New'::character varying NOT NULL,
    cluster_topic text,
    cluster_id_str character varying(64),
    primary_owner character varying(100),
    alert_status character varying(30) DEFAULT 'Not triggered'::character varying,
    alert_triggered_at timestamp with time zone,
    content_hash character varying(64),
    ai_analysis text
);


--
-- Name: posts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.posts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: posts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.posts_id_seq OWNED BY public.posts.id;


--
-- Name: routing_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.routing_rules (
    id bigint NOT NULL,
    category character varying(50) NOT NULL,
    severity_min character varying(20) DEFAULT 'low'::character varying,
    departments character varying[] NOT NULL,
    escalate_to character varying[],
    channels character varying[] DEFAULT '{}'::character varying[],
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    primary_owner character varying(100) DEFAULT ''::character varying NOT NULL
);


--
-- Name: routing_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.routing_rules_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: routing_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.routing_rules_id_seq OWNED BY public.routing_rules.id;


--
-- Name: taxonomy_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.taxonomy_categories (
    id bigint NOT NULL,
    key character varying(50) NOT NULL,
    label character varying(100) NOT NULL,
    description text,
    color character varying(20),
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    primary_owner character varying(100),
    signals character varying[],
    default_action character varying(80),
    escalation_flag boolean DEFAULT false NOT NULL,
    escalation_note text
);


--
-- Name: taxonomy_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.taxonomy_categories_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: taxonomy_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.taxonomy_categories_id_seq OWNED BY public.taxonomy_categories.id;


--
-- Name: taxonomy_sub_issues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.taxonomy_sub_issues (
    id bigint NOT NULL,
    key character varying(50) NOT NULL,
    label character varying(100) NOT NULL,
    category_key character varying(50),
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: taxonomy_sub_issues_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.taxonomy_sub_issues_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: taxonomy_sub_issues_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.taxonomy_sub_issues_id_seq OWNED BY public.taxonomy_sub_issues.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id bigint NOT NULL,
    email character varying(255) NOT NULL,
    hashed_password character varying(255) NOT NULL,
    full_name character varying(255) NOT NULL,
    department character varying(100),
    role character varying(50) DEFAULT 'viewer'::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: alert_delivery_configs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_delivery_configs ALTER COLUMN id SET DEFAULT nextval('public.alert_delivery_configs_id_seq'::regclass);


--
-- Name: alert_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_messages ALTER COLUMN id SET DEFAULT nextval('public.alert_messages_id_seq'::regclass);


--
-- Name: alerts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts ALTER COLUMN id SET DEFAULT nextval('public.alerts_id_seq'::regclass);


--
-- Name: app_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings ALTER COLUMN id SET DEFAULT nextval('public.app_settings_id_seq'::regclass);


--
-- Name: corrections id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corrections ALTER COLUMN id SET DEFAULT nextval('public.corrections_id_seq'::regclass);


--
-- Name: feedback id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback ALTER COLUMN id SET DEFAULT nextval('public.feedback_id_seq'::regclass);


--
-- Name: incidents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidents ALTER COLUMN id SET DEFAULT nextval('public.incidents_id_seq'::regclass);


--
-- Name: lark_bots id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lark_bots ALTER COLUMN id SET DEFAULT nextval('public.lark_bots_id_seq'::regclass);


--
-- Name: posts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts ALTER COLUMN id SET DEFAULT nextval('public.posts_id_seq'::regclass);


--
-- Name: routing_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routing_rules ALTER COLUMN id SET DEFAULT nextval('public.routing_rules_id_seq'::regclass);


--
-- Name: taxonomy_categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taxonomy_categories ALTER COLUMN id SET DEFAULT nextval('public.taxonomy_categories_id_seq'::regclass);


--
-- Name: taxonomy_sub_issues id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taxonomy_sub_issues ALTER COLUMN id SET DEFAULT nextval('public.taxonomy_sub_issues_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: alembic_version alembic_version_pkc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alembic_version
    ADD CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num);


--
-- Name: alert_delivery_configs alert_delivery_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_delivery_configs
    ADD CONSTRAINT alert_delivery_configs_pkey PRIMARY KEY (id);


--
-- Name: alert_messages alert_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_messages
    ADD CONSTRAINT alert_messages_pkey PRIMARY KEY (id);


--
-- Name: alerts alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_pkey PRIMARY KEY (id);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (id);


--
-- Name: corrections corrections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corrections
    ADD CONSTRAINT corrections_pkey PRIMARY KEY (id);


--
-- Name: feedback feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_pkey PRIMARY KEY (id);


--
-- Name: incidents incidents_incident_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidents
    ADD CONSTRAINT incidents_incident_code_key UNIQUE (incident_code);


--
-- Name: incidents incidents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidents
    ADD CONSTRAINT incidents_pkey PRIMARY KEY (id);


--
-- Name: lark_bots lark_bots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lark_bots
    ADD CONSTRAINT lark_bots_pkey PRIMARY KEY (id);


--
-- Name: lark_bots lark_bots_team_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lark_bots
    ADD CONSTRAINT lark_bots_team_name_key UNIQUE (team_name);


--
-- Name: posts posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_pkey PRIMARY KEY (id);


--
-- Name: routing_rules routing_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routing_rules
    ADD CONSTRAINT routing_rules_pkey PRIMARY KEY (id);


--
-- Name: taxonomy_categories taxonomy_categories_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taxonomy_categories
    ADD CONSTRAINT taxonomy_categories_key_key UNIQUE (key);


--
-- Name: taxonomy_categories taxonomy_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taxonomy_categories
    ADD CONSTRAINT taxonomy_categories_pkey PRIMARY KEY (id);


--
-- Name: taxonomy_sub_issues taxonomy_sub_issues_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taxonomy_sub_issues
    ADD CONSTRAINT taxonomy_sub_issues_key_key UNIQUE (key);


--
-- Name: taxonomy_sub_issues taxonomy_sub_issues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taxonomy_sub_issues
    ADD CONSTRAINT taxonomy_sub_issues_pkey PRIMARY KEY (id);


--
-- Name: alert_delivery_configs uq_alert_delivery_taxonomy; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_delivery_configs
    ADD CONSTRAINT uq_alert_delivery_taxonomy UNIQUE (taxonomy);


--
-- Name: posts uq_platform_brand_post; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT uq_platform_brand_post UNIQUE (platform, brand, post_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: ix_alerts_incident_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_alerts_incident_id ON public.alerts USING btree (incident_id);


--
-- Name: ix_corrections_mention_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_corrections_mention_id ON public.corrections USING btree (mention_id);


--
-- Name: ix_incidents_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_incidents_severity ON public.incidents USING btree (severity);


--
-- Name: ix_incidents_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_incidents_status ON public.incidents USING btree (status);


--
-- Name: ix_posts_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_posts_category ON public.posts USING btree (category);


--
-- Name: ix_posts_cluster_id_str; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_posts_cluster_id_str ON public.posts USING btree (cluster_id_str);


--
-- Name: ix_posts_content_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_posts_content_hash ON public.posts USING btree (content_hash);


--
-- Name: ix_posts_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_posts_created_at ON public.posts USING btree (created_at);


--
-- Name: ix_posts_engagement_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_posts_engagement_level ON public.posts USING btree (engagement_level);


--
-- Name: ix_posts_incident_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_posts_incident_id ON public.posts USING btree (incident_id);


--
-- Name: ix_posts_mention_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_posts_mention_status ON public.posts USING btree (mention_status);


--
-- Name: ix_posts_platform_brand; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_posts_platform_brand ON public.posts USING btree (platform, brand);


--
-- Name: ix_posts_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_posts_severity ON public.posts USING btree (severity);


--
-- Name: alerts alerts_acknowledged_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_acknowledged_by_fkey FOREIGN KEY (acknowledged_by) REFERENCES public.users(id);


--
-- Name: alerts alerts_incident_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_incident_id_fkey FOREIGN KEY (incident_id) REFERENCES public.incidents(id);


--
-- Name: alerts alerts_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id);


--
-- Name: corrections corrections_mention_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corrections
    ADD CONSTRAINT corrections_mention_id_fkey FOREIGN KEY (mention_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: corrections corrections_reviewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corrections
    ADD CONSTRAINT corrections_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES public.users(id);


--
-- Name: feedback feedback_reviewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES public.users(id);


--
-- Name: incidents incidents_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidents
    ADD CONSTRAINT incidents_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users(id);


--
-- Name: posts posts_incident_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_incident_id_fkey FOREIGN KEY (incident_id) REFERENCES public.incidents(id);


--
-- PostgreSQL database dump complete
--



-- =============================================================================
-- SEED / REFERENCE DATA
-- =============================================================================

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.7 (Ubuntu 17.7-3.pgdg24.04+1)
-- Dumped by pg_dump version 17.7 (Ubuntu 17.7-3.pgdg24.04+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: alembic_version; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.alembic_version VALUES ('011');


--
-- Data for Name: app_settings; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.app_settings VALUES (1, '{"lowMax": 20, "mediumMax": 60}', '{fraud,unauthorized,scam,phishing,regulator,BSP}', '{"otp": "Marketing", "fees": "Product", "bayad": "Customer Services", "fraud": "Risk", "payment": "Customer Services", "collections": "Collection", "transaction": "Customer Services", "user_review": "Marketing", "card_binding": "Product", "card_delivery": "Customer Services", "limit_increase": "Risk", "card_application": "Product", "customer_service": "Customer Services"}', 'PH', 'X + Reddit + Facebook + TikTok', '7d', '2026-06-02 09:27:47.192266+00', true, '09:00', 'Asia/Singapore', true, 'Monday', '09:00', 'Asia/Singapore', '{"otp": ["Product"], "fees": ["Customer Services"], "bayad": ["Customer Services"], "fraud": ["Legal", "Collection"], "payment": ["Risk"], "collections": ["Risk"], "transaction": ["Risk"], "user_review": ["Customer Services"], "card_binding": ["Customer Services"], "card_delivery": ["Product"], "limit_increase": ["Product", "Customer Services"], "card_application": ["Customer Services"], "customer_service": ["Product"]}');


--
-- Data for Name: taxonomy_categories; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.taxonomy_categories VALUES (1, 'collections', 'Collections', 'Repayment chasing, SMS / call tone, agency conduct.', NULL, 0, true, '2026-05-17 17:25:13.612597+00', 'Collection', '{"aggressive SMS","threatening calls",harassment,"legal action threats"}', 'Collection Review', true, 'Collections conduct is always reviewed by Compliance.');
INSERT INTO public.taxonomy_categories VALUES (2, 'customer_service', 'Customer Service', 'Generic CS complaints — slow reply, unhelpful agent.', NULL, 1, true, '2026-05-17 17:25:13.612597+00', 'Customer Services', '{"long wait","no reply","rude agent","ticket ignored"}', 'Monitor / Review', false, 'Only when public agent-name callouts.');
INSERT INTO public.taxonomy_categories VALUES (3, 'bayad', 'Bayad', 'Issues paying via Bayad Center or partner outlets.', NULL, 2, true, '2026-05-17 17:25:13.612597+00', 'Customer Services', '{"Bayad declined","partner refused","receipt not posted"}', 'Monitor / Review', false, 'Only if a partner outage is suspected.');
INSERT INTO public.taxonomy_categories VALUES (4, 'transaction', 'Transaction', 'Failed, duplicate, or stuck transactions.', NULL, 3, true, '2026-05-17 17:25:13.612597+00', 'Customer Services', '{"payment declined","duplicate charge","GCash failed"}', 'Monitor / Review', false, 'Only when systemic.');
INSERT INTO public.taxonomy_categories VALUES (5, 'card_delivery', 'Card Delivery', 'Card not delivered, lost in transit, wrong address.', NULL, 4, true, '2026-05-17 17:25:13.612597+00', 'Customer Services', '{"not delivered","no card yet",courier,"wrong address"}', 'Monitor / Review', false, 'Only on >14d SLA breach.');
INSERT INTO public.taxonomy_categories VALUES (6, 'fees', 'Fees', 'Late fees, hidden fees, interest, fee transparency.', NULL, 5, true, '2026-05-17 17:25:13.612597+00', 'Product', '{"hidden fees",overcharged,"late fee","interest too high"}', 'Monitor / Review', false, 'Only at high engagement.');
INSERT INTO public.taxonomy_categories VALUES (7, 'payment', 'Payment', 'Refunds, repayment failures, posting delays.', NULL, 6, true, '2026-05-17 17:25:13.612597+00', 'Customer Services', '{"refund delayed","repayment failed","showing unpaid"}', 'Monitor / Review', false, 'Only on systemic posting delays.');
INSERT INTO public.taxonomy_categories VALUES (8, 'card_application', 'Card Application', 'Application stuck, KYC rejected, approval delays.', NULL, 7, true, '2026-05-17 17:25:13.612597+00', 'Product', '{"application stuck","KYC failed","no decision"}', 'Monitor / Review', false, 'Only when KYC policy is publicly cited.');
INSERT INTO public.taxonomy_categories VALUES (9, 'limit_increase', 'Limit Increase', 'Limit too low, denied increase, surprise reduction.', NULL, 8, true, '2026-05-17 17:25:13.612597+00', 'Risk', '{"limit too low","limit cut","increase denied"}', 'Monitor / Review', false, 'Only on viral limit-cut threads.');
INSERT INTO public.taxonomy_categories VALUES (10, 'card_binding', 'Card Binding', 'Linking the card to wallets / merchants / app.', NULL, 9, true, '2026-05-17 17:25:13.612597+00', 'Product', '{"can''t bind","won''t link","Apple Pay fail","wallet error"}', 'Monitor / Review', false, 'Only when partner-side is implicated.');
INSERT INTO public.taxonomy_categories VALUES (11, 'otp', 'OTP', 'OTP not arriving, delayed, or suspected-phish OTP messages.', NULL, 10, true, '2026-05-17 17:25:13.612597+00', 'Marketing', '{"OTP not received","OTP delayed","fake OTP"}', 'Monitor / Review', false, 'Only on suspected phishing pattern.');
INSERT INTO public.taxonomy_categories VALUES (12, 'user_review', 'User Review', 'Public ratings, reviews, influencer commentary.', NULL, 11, true, '2026-05-17 17:25:13.612597+00', 'Marketing', '{"1 star","would not recommend","influencer thread"}', 'Monitor / Review', false, 'Only on viral negative influencer post.');
INSERT INTO public.taxonomy_categories VALUES (13, 'fraud', 'Fraud / Unauthorized', 'Unauthorized transactions, account takeover, phishing claims.', NULL, 12, true, '2026-05-17 17:25:13.612597+00', 'Risk', '{unauthorized,fraud,scam,stolen,"account takeover",phishing}', 'Risk Review (always)', true, 'Fraud cases are always escalated for review.');


--
-- Name: app_settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.app_settings_id_seq', 1, false);


--
-- Name: taxonomy_categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.taxonomy_categories_id_seq', 13, true);


--
-- PostgreSQL database dump complete
--


