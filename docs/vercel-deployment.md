# Vercel Deployment

## Project

- Scope: `tjs-projects-435187fd`
- Project: `xunfeng-v2-vercel-deploy`
- Production URL: `https://xunfeng-v2-vercel-deploy.vercel.app`
- Git repository: `https://github.com/JasonM568/mvp4z-`

## Commands

```bash
vercel --yes --scope tjs-projects-435187fd
vercel deploy --prod --scope tjs-projects-435187fd
vercel env ls --scope tjs-projects-435187fd
```

## Required Environment Variables

Production env has been populated from the local `.env.local` source, with site and ECPay callback URLs pointed at the Vercel production URL.

Required for runtime:

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `GEMINI_API_KEY`
- `DEEPSEEK_API_KEY`
- `ECPAY_ENV`
- `ECPAY_MERCHANT_ID`
- `ECPAY_HASH_KEY`
- `ECPAY_HASH_IV`
- `ECPAY_RETURN_URL`
- `ECPAY_NOTIFY_URL`
- `ECPAY_CLIENT_BACK_URL`
- `ADMIN_EMAILS`

Optional values currently rely on code defaults when absent:

- `GEMINI_MODEL`
- `DEEPSEEK_MODEL`
- `ENABLE_DEBATE_ROUND`
- `COUNCIL_CREDIT_COST`
- `ADMIN_KEY`
- persona prompt overrides

## ECPay URLs

Use these values for the production deployment:

```text
NEXT_PUBLIC_SITE_URL=https://xunfeng-v2-vercel-deploy.vercel.app
ECPAY_RETURN_URL=https://xunfeng-v2-vercel-deploy.vercel.app/api/payments/ecpay/return
ECPAY_NOTIFY_URL=https://xunfeng-v2-vercel-deploy.vercel.app/api/payments/ecpay/notify
ECPAY_CLIENT_BACK_URL=https://xunfeng-v2-vercel-deploy.vercel.app/member
```

## Current Caveats

- The first production deploy was created from the local CLI, then production env was added, then production was redeployed.
- Preview branch env could not be added yet because `feature/vercel-deploy` was not present on the connected GitHub repository at the time of setup.
- After pushing this branch to GitHub, add Preview env for that branch or configure preview variables in the Vercel dashboard.
- The Vercel project name currently reflects this worktree: `xunfeng-v2-vercel-deploy`.
