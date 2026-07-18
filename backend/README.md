# Backend Migration Workflow

Alembic is the only schema manager for this backend. `create_all` has been removed from startup so schema changes must go through migrations.

## Generate a new revision

```bash
alembic revision --autogenerate -m "description"
```

## Apply migrations

```bash
alembic upgrade head
```

## Roll back one step

```bash
alembic downgrade -1
```

## Notes

- The migration environment reads `DATABASE_URL` from the environment.
- The baseline migration in `backend/alembic/versions/` should reflect the current schema.