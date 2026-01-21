# Copilot instructions (go-rails-jumpstart)

## Quickstart + workflows

- Setup: `bin/setup` (runs `bundle install`, `bin/rails db:prepare`, then starts `bin/dev` unless `--skip-server`).
- Dev server: `bin/dev` (Foreman) runs `Procfile.dev`: Rails (`bin/rails server -p 3000`), Sidekiq worker, JS bundler, and CSS watch.
- `bin/dev` prerequisites: Postgres + Redis running locally (Sidekiq + Action Cable use Redis).
- JS bundling: `yarn build`/`yarn build --reload` runs `esbuild.config.mjs` (outputs to `app/assets/builds/`, reload watches `app/views/**/*.erb`).
- CSS bundling: `yarn build:css --watch` (see `package.json` scripts; output is `app/assets/builds/application.css`).

## Tooling notes

- Yarn is configured for `node_modules` installs (see `.yarnrc.yml`) to keep Sass/Bootstrap imports working with `cssbundling-rails`.

## Architecture (what lives where)

- Standard Rails MVC under `app/`; background jobs in `app/jobs/`, mailers in `app/mailers/`, policies in `app/policies/`.
- Authentication: Devise (`app/models/user.rb`, `config/initializers/devise.rb`) + OmniAuth callbacks in `app/controllers/users/omniauth_callbacks_controller.rb`.
  - OAuth connections are persisted as `Service` records (`app/models/service.rb`) and created/updated in the callbacks controller.
- Authorization: Pundit is enabled in `app/controllers/application_controller.rb`; base policy denies by default (`app/policies/application_policy.rb`).
- Notifications: Noticed notifications are associated to `User` as `recipient` (`app/models/user.rb`), rendered by `NotificationsController` and `app/views/notifications/index.html.erb`.
- Admin/ops UI: `Sidekiq::Web` and `madmin` routes are mounted behind `authenticate :user, ->(u) { u.admin? }` in `config/routes.rb`.
  - Impersonation uses Pretender (`impersonates :user`) in `ApplicationController` and `Madmin::ImpersonatesController`.

## Data stores / infrastructure conventions

- Primary DB is PostgreSQL (`config/database.yml`). Production also configures separate DBs for Solid Cache / Solid Queue / Solid Cable (see the `production:` section).
- Background jobs:
  - Development/test default to Sidekiq (`config/application.rb` and `Procfile.dev`).
  - Production overrides Active Job to Solid Queue and connects to the `:queue` database (`config/environments/production.rb`).
  - Puma can run a Solid Queue supervisor when `SOLID_QUEUE_IN_PUMA` is set (`config/puma.rb`).
- Redis:
  - Action Cable uses `REDIS_URL` with a default fallback (`config/cable.yml`).
  - Sidekiq uses Redis (set `REDIS_URL` via `.env` for local dev).

## Tests / CI

- Test framework is Minitest (`test/` + fixtures via `test/test_helper.rb`).
- Local CI entrypoint: `bin/ci` (runs `bin/setup --skip-server`, `bin/rubocop`, security scanners, `bin/rails test`, and `db:seed:replant` in test; see `config/ci.rb`).

## Editing conventions for agents

- Prefer wiring new routes/controllers/models using existing patterns (e.g., Devise controllers live under `app/controllers/users/`, admin features are behind the `admin?` route constraint).
- When adding background work, be explicit about whether it must run in Sidekiq (dev) vs Solid Queue (prod), and avoid assumptions about a single queue backend.
