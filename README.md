# Aurora Tasks (React + Vite + Tailwind + Firestore)

A beautiful, interactive daily task tracker with **Kanban + Calendar**, **recurring tasks**, **reminders**, **Google + Email/Password sign-in**, and **JSON export/import**.

## Quickstart

1. Install Node.js LTS (v18+).
2. Copy `.env.local.example` to `.env.local` and paste your Firebase web config values.
3. In Firebase Console enable **Firestore**, **Anonymous**, **Google**, and **Email/Password** sign-in.
4. Install & run:

```bash
npm install
npm run dev
```

5. Allow notifications in your browser for reminders.

## Deploy to Vercel

- Push this project to a GitHub repo.
- Import the repo in **Vercel**.
- In Vercel → Project Settings → **Environment Variables**, add the same keys from `.env.local` (must start with `VITE_`).
- Deploy.

## Firestore security rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```
