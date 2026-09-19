# Flow OS — Development & Deployment Rules

## 1. Production Safety

Flow OS is already deployed in production.

Never directly modify or deploy the production application.

All changes must first be made and tested locally.

Do not replace existing authentication, Supabase configuration, deployment configuration, or working functionality unless explicitly instructed.

---

## 2. Development Workflow

The standard workflow is:

```text
Local code
    ↓
Make changes
    ↓
Run locally
    ↓
Test
    ↓
Review git diff
    ↓
Commit
    ↓
Push to GitHub
    ↓
Vercel Preview/Production deployment
    ↓
Test deployed version
```

---

## 3. Before Making Changes

First inspect the existing implementation.

Do not assume that a feature needs to be created from scratch.

If the functionality already exists, modify the existing implementation rather than creating duplicate systems.

Before modifying files, identify:

* files that need modification
* files that need to be created
* files that may be deleted
* database changes
* environment variables
* API integrations
* security implications

---

## 4. File Changes

After completing a task, always report:

### Created

List every newly created file.

### Modified

List every existing file that was changed.

### Deleted

List every deleted file.

### Unchanged

Do not claim files were changed if they were not.

---

## 5. Environment Variables

Never commit secrets.

Never place secrets in:

```text
.env
.env.local
.env.production
```

unless they are already correctly gitignored.

Never expose:

* API secrets
* OAuth client secrets
* Supabase service-role keys
* access tokens
* refresh tokens

to client-side code.

Only variables intentionally designed for browser exposure may use `NEXT_PUBLIC_`.

When a new environment variable is required, report:

1. Variable name
2. Whether it is public or secret
3. Where it must be configured locally
4. Where it must be configured in Vercel

---

## 6. Database Changes

If a database change is required:

DO NOT manually modify the production database without explaining the migration first.

Create a migration file where appropriate.

Clearly explain:

* what changes
* why it is needed
* how to test it
* how it should be applied to production
* whether rollback is possible

---

## 7. Testing

Before saying a feature is complete, test it locally.

Report:

* commands run
* whether build succeeds
* whether TypeScript errors exist
* whether lint errors exist
* what functionality was manually tested
* known issues

At minimum, where applicable:

```bash
npm run build
```

and the local development server should be tested.

---

## 8. Git Workflow

Before committing:

```bash
git status
git diff
```

Review all changes.

Do not commit unrelated changes.

Use a focused commit message, for example:

```text
Add Google Calendar OAuth integration
```

or:

```text
Fix Todoist task synchronization
```

---

## 9. Deployment

Do not deploy directly from the AI assistant.

The developer will control GitHub and Vercel deployment.

Normal deployment:

```bash
git add <specific files>
git commit -m "Description of change"
git push
```

Vercel will then build and deploy according to the existing repository configuration.

---

## 10. Vercel Environment Variables

If a new environment variable is required, explicitly state:

```text
Vercel → Project → Settings → Environment Variables
```

and specify whether it is needed for:

* Production
* Preview
* Development

Do not assume that a variable configured locally automatically exists in Vercel.

---

## 11. OAuth Integrations

For integrations such as:

* Google Calendar
* Gmail
* Todoist

always distinguish between:

### Local development

Example:

```text
http://localhost:3000/...
```

### Vercel Preview

The preview URL.

### Production

The actual Flow OS production URL.

OAuth redirect URLs must be configured correctly for the environment being tested.

---

## 12. Integration Architecture

External integrations should be isolated into a dedicated integration/service layer where practical.

Avoid scattering provider-specific API calls throughout React components.

Prefer a structure such as:

```text
lib/
  integrations/
    google/
    gmail/
    todoist/
```

Use the existing project architecture if it already has an appropriate structure.

Do not create duplicate abstractions unnecessarily.

---

## 13. Important Rule

Never tell the developer:

> "It's deployed."

unless the developer has explicitly confirmed that the changes were pushed/deployed.

Instead say:

> "The changes are ready locally. Follow the deployment steps below."

---

## 14. Completion Report

At the end of every implementation task, provide:

### What changed

Short explanation.

### Files created

List.

### Files modified

List.

### Files deleted

List.

### Environment variables

List new variables and where they are required.

### Database changes

List migrations/schema changes.

### Testing

List tests performed and results.

### Deployment steps

Give exact commands.

### Post-deployment checks

Give a short checklist for verifying the live application.
