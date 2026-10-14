# Vercel front door

Teach.ai runs on Render (it needs Chromium for PDF export and a long-running server, which Vercel cannot host).
This folder is a tiny Vercel project whose only job is to forward every request to the Render service, so visitors
see a clean `*.vercel.app` address.

Deploy: Vercel dashboard > Add New > Project > import the GitHub repository > set **Root Directory** to `vercel-proxy`
> Framework Preset "Other" > set the project name (it becomes `<name>.vercel.app`) > Deploy.

If the Render address changes, edit the `destination` in `vercel.json` and push.
Then set `SITE_URL` on Render to the Vercel address.
