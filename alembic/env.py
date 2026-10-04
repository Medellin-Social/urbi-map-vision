import os
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool
from alembic import context

# ponytail: partial metadata — only ORM models in api/models/ are tracked.
# Raw-SQL tables (the other 44 migrations) won't appear in autogenerate diffs.
from api.models.base import Base  # noqa: E402  (import after sys.path is set)
import api.models.realtors  # noqa: F401 — registers models onto Base.metadata
import api.models.listing       # noqa: F401
import api.models.sponsorship   # noqa: F401
import api.models.intake        # noqa: F401
import api.models.moderacion     # noqa: F401
import api.models.due_diligence  # noqa: F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Override URL from env — same var the app uses (asyncpg wants a bare scheme).
# Force psycopg2 for SQLAlchemy/alembic only: SQLAlchemy 2.1 resolves a bare
# postgresql:// to psycopg(v3), which we don't ship (image has psycopg2-binary).
# Transform here only — api/db.py keeps reading the plain var for asyncpg.
db_url = os.getenv("DATABASE_URL", "")
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)
if db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+psycopg2://", 1)
if db_url:
    config.set_main_option("sqlalchemy.url", db_url)

target_metadata = Base.metadata


def include_object(object, name, type_, reflected, compare_to):
    # Only manage tables explicitly mapped in the ORM; ignore raw-SQL tables.
    if type_ == "table" and name not in target_metadata.tables:
        return False
    return True


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            transaction_per_migration=True,
            include_object=include_object,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
