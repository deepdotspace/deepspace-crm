# DeepSpace CRM

A lightweight CRM for tracking contacts, companies, and deals through a sales
pipeline — with email and calendar built in. Built on the
[DeepSpace SDK](https://deep.space).

**Live app:** https://deepspace-crm.app.space

## What it does
- Manage people, companies, deals, and a configurable pipeline of stages, with an activity log for every interaction.
- A dashboard that rolls up open deals, total pipeline value, a stage funnel, and upcoming meetings.
- Connect Google to read and compose Gmail, import Google Contacts, and schedule meetings on Google Calendar.
- Chat with an AI assistant that can read and update your CRM data directly.

## How it's built
Every account's records live in a per-user `RecordRoom` Durable Object, so
schema-level RBAC scopes each person's contacts, deals, and activities to
themselves. Google (Gmail, Contacts, Calendar) runs through the DeepSpace
integrations proxy as a user-billed OAuth connection, so each signed-in user
acts on their own Google account. The AI assistant is wired with the Vercel AI
SDK through the DeepSpace proxy and calls built-in record tools to query and
mutate collections on the user's behalf.

## Run your own

Deploy your own copy in three commands:

```sh
npm install
npx deepspace login     # one-time, opens a browser tab
npx deepspace deploy    # -> <name>.app.space
```

Auth, the database, real-time sync, and hosting all come from DeepSpace, so
there is nothing else to configure. Your subdomain is the `name` field in
`wrangler.toml`; change it for your own deployment.

Or build something new: apps like this are made by handing a prompt to a
coding agent — start at [deep.space/get-started](https://deep.space/get-started),
or scaffold from scratch: `npm create deepspace@latest my-app`.

---
*DeepSpace CRM was built end-to-end by an AI agent on the DeepSpace SDK.
DeepSpace is laying the foundation for rebuilding the Internet in an AI-native
way — [deep.space](https://deep.space) · [docs](https://docs.deep.space).*
