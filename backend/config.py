from urllib.parse import parse_qs, urlencode, urlsplit, urlunsplit

from pydantic import model_validator
from pydantic_settings import BaseSettings


def _strip_sslmode(url: str) -> str:
    """Remove sslmode query param — asyncpg does not accept it."""
    parts = urlsplit(url)
    qs = parse_qs(parts.query)
    qs.pop("sslmode", None)
    new_query = urlencode(qs, doseq=True)
    return urlunsplit(parts._replace(query=new_query))


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://atome:atome_secret@localhost:5432/atome_voc"
    database_url_sync: str = "postgresql://atome:atome_secret@localhost:5432/atome_voc"

    @model_validator(mode="after")
    def _fix_database_urls(self):
        """Normalise Fly.io / Heroku-style postgres:// URLs."""
        if self.database_url.startswith("postgres://"):
            self.database_url = self.database_url.replace(
                "postgres://", "postgresql+asyncpg://", 1
            )
        self.database_url = _strip_sslmode(self.database_url)
        if self.database_url_sync.startswith("postgres://"):
            self.database_url_sync = self.database_url_sync.replace(
                "postgres://", "postgresql://", 1
            )
        # If only DATABASE_URL is set (Fly), derive the sync variant
        if "asyncpg" in self.database_url and self.database_url_sync == "postgresql://atome:atome_secret@localhost:5432/atome_voc":
            self.database_url_sync = self.database_url.replace(
                "postgresql+asyncpg://", "postgresql://", 1
            )
        return self

    # API
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: str = "http://localhost:3000"

    # LLM
    anthropic_api_key: str = ""
    llm_model: str = "claude-sonnet-4-20250514"

    # Crawlers
    apify_api_token: str = ""
    brave_api_key: str = ""
    reddit_user_agent: str = "AtomeVoC/1.0"
    reddit_client_id: str = ""       # Free Reddit OAuth app — create at reddit.com/prefs/apps
    reddit_client_secret: str = ""
    twitter_bearer_token: str = ""   # Free Twitter API v2 — create at developer.twitter.com
    x_twitter_cookies: str = ""      # JSON array of x.com cookies for Apify authenticated scraping
    lark_app_id: str = ""            # Lark self-built app id (cli_xxxxx) for Bitable sync
    lark_app_secret: str = ""        # Lark self-built app secret
    # Bitable coordinates for the Octo Agent social-listening table (override via env)
    lark_bitable_base_token: str = "VwkKbbJFTa5aPGsHW11laln7gUd"
    lark_bitable_table_id: str = "tblx3Vofj10lFJiY"
    lark_bitable_view_id: str = "vew6JnS2Ra"

    # Alerting
    slack_webhook_url: str = ""
    lark_webhook_url: str = ""
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    alert_email_from: str = ""
    alert_email_to: str = ""

    # Schedule — daily data refresh at crawl_schedule_hours:crawl_schedule_minute
    # (Octo refreshes the Bitable ~09:00-10:00, so we sync at 10:30 after it).
    crawl_schedule_hours: str = "10"
    crawl_schedule_minute: int = 30
    digest_hour: int = 9
    tz: str = "Asia/Manila"
    # Octo/Bitable is the data source; the direct Apify crawlers are off by default.
    enable_apify_crawlers: bool = False

    # Auth
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440

    # Lark SSO ("Login with Lark")
    # Secure by default: the API requires a valid Lark SSO session. Set
    # AUTH_ENFORCED=false only for local development without SSO configured.
    auth_enforced: bool = True
    lark_oauth_redirect_uri: str = "https://atome-voc-v2-frontend.fly.dev/api/auth/lark/callback"
    lark_oauth_authorize_base: str = "https://accounts.larksuite.com/open-apis/authen/v1/authorize"
    # Only members whose email ends with one of these domains may log in
    # (comma-separated). Empty = allow any org member who can authorize the app.
    allowed_email_domains: str = "advancegroup.com"
    # Comma-separated emails that get the "admin" role; everyone else is "viewer".
    admin_emails: str = "fangjie.hu@advancegroup.com"
    # Optional machine/ops access: requests with header X-Service-Key == this value
    # are treated as admin (bypasses SSO). Empty = disabled. Use a strong random value.
    service_api_key: str = ""
    session_cookie_name: str = "voc_session"
    frontend_base_url: str = "https://atome-voc-v2-frontend.fly.dev"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
