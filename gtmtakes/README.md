# gtmtakes.here

A daily hot-or-not vote on GTM opinions from X. Ten takes a day, swipe Hot or Not, see the live split, and a weekly export of the most divisive takes for the newsletter.

```bash
cp .env.example .env      # set ADMIN_PASSWORD
npm install
npm run seed              # 72 real takes, 3 sample days (sample votes are generated)
npm run dev               # http://localhost:3000
```

See [DONE.md](./DONE.md) for the full run and deploy guide, what is real versus placeholder, and open items. Decisions are in [LOG.md](./LOG.md).
