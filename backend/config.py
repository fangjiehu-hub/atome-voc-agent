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

    # Alerting
    slack_webhook_url: str = ""
    lark_webhook_url: str = ""
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    alert_email_from: str = ""
    alert_email_to: str = ""

    # Schedule
    crawl_schedule_hours: str = "8,20"
    digest_hour: int = 9
    tz: str = "Asia/Manila"

    # Auth
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
